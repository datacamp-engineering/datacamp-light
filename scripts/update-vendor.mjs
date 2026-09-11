import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const VENDOR_DIR = path.join(rootDir, 'vendor');
const MANIFEST_PATH = path.join(rootDir, 'scripts', 'vendor-manifest.json');
const PROVENANCE_PATH = path.join(VENDOR_DIR, 'PROVENANCE.md');

// The BusyBox build-recipe repository is the only upstream that is re-pinned
// to its current master on every run; every other vendored file is fetched at
// the exact ref pinned in scripts/vendor-manifest.json.
const BUSYBOX_RECIPE_REPO = 'cryptool-org/busybox-wasm';
const USER_AGENT = 'datacamp-light-update-vendor-script';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function resolvePinnedRef() {
  const commit = await fetchJson(`https://api.github.com/repos/${BUSYBOX_RECIPE_REPO}/commits/master`);
  return commit.sha;
}

// URLs containing `{pinnedRef}` refer to the pinned ref of the build recipe
// that shares the same upstream repository and contains the target path
// (currently only the BusyBox build recipe, which is re-pinned on every run).
function findOwningBuildRecipe(entry, manifest) {
  const recipe = manifest.buildRecipes.find(
    (candidate) =>
      entry.upstream === candidate.upstream &&
      (entry.path === candidate.path || entry.path.startsWith(`${candidate.path}/`)),
  );
  if (!recipe) {
    throw new Error(
      `Cannot resolve {pinnedRef} for ${entry.path}: no buildRecipes entry matches upstream ${entry.upstream}`,
    );
  }
  return recipe;
}

function resolveManifestUrl(url, entry, manifest) {
  if (!url.includes('{pinnedRef}')) return url;
  const recipe = findOwningBuildRecipe(entry, manifest);
  return url.replaceAll('{pinnedRef}', recipe.pinnedRef);
}

function resolvedSourceRef(entry, manifest) {
  if (!entry.url.includes('{pinnedRef}')) return entry.sourceRef;
  return findOwningBuildRecipe(entry, manifest).pinnedRef;
}

async function syncBuildRecipes(manifest) {
  for (const recipe of manifest.buildRecipes) {
    if (!Array.isArray(recipe.files) || recipe.files.length === 0) {
      throw new Error(`buildRecipes entry ${recipe.path} has no files list`);
    }
    fs.mkdirSync(path.join(rootDir, recipe.path), { recursive: true });
    for (const fileName of recipe.files) {
      const url = resolveManifestUrl(recipe.url, { path: `${recipe.path}/${fileName}`, upstream: recipe.upstream }, manifest).replaceAll('{file}', fileName);
      console.log(`- Syncing ${recipe.path}/${fileName} from ${recipe.upstream} @ ${recipe.pinnedRef}...`);
      const content = await fetchText(url);
      fs.writeFileSync(path.join(rootDir, recipe.path, fileName), content, 'utf8');
    }
  }
}

async function syncVendoredLicenseFiles(manifest) {
  for (const entry of manifest.vendoredLicenseFiles || []) {
    const url = resolveManifestUrl(entry.url, entry, manifest);
    console.log(`- Syncing ${entry.path} from ${url}...`);
    const content = await fetchText(url);
    fs.mkdirSync(path.dirname(path.join(rootDir, entry.path)), { recursive: true });
    fs.writeFileSync(path.join(rootDir, entry.path), content, 'utf8');
  }
}

function updateManifestPinnedRefs(manifest, pinnedRef) {
  const recipe = manifest.buildRecipes.find((entry) => entry.path === 'vendor/busybox');
  if (!recipe) {
    throw new Error('vendor-manifest.json has no buildRecipes entry for vendor/busybox');
  }
  recipe.pinnedRef = pinnedRef;
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function sourceLabel(upstream) {
  return upstream.replace(/^https:\/\/github\.com\//, '');
}

function renderTable(headerCells, rows) {
  const columnWidths = headerCells.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const formatRow = (cells) =>
    `| ${cells.map((cell, index) => cell.padEnd(columnWidths[index])).join(' | ')} |`;
  const separator = `| ${columnWidths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return [formatRow(headerCells), separator, ...rows.map(formatRow)].join('\n');
}

function writeProvenance(manifest) {
  const runtimeRows = manifest.runtimeAssets.map((asset) => [
    `public/${asset.artifact}`,
    asset.source,
    asset.sourceRef,
    asset.license,
    `${asset.upstream} — copyright ${asset.copyright}`,
  ]);

  const vendorRows = [];
  for (const recipe of manifest.buildRecipes) {
    for (const fileName of recipe.files) {
      vendorRows.push([
        `${recipe.path}/${fileName}`,
        `${sourceLabel(recipe.upstream)} (verbatim copies)`,
        recipe.pinnedRef,
        recipe.license,
        `Synced by scripts/update-vendor.mjs — BusyBox build recipe, built via scripts/build-busybox.sh`,
      ]);
    }
  }
  for (const entry of manifest.vendoredLicenseFiles || []) {
    vendorRows.push([
      entry.path,
      sourceLabel(entry.upstream),
      resolvedSourceRef(entry, manifest),
      entry.license,
      `${entry.notes} — fetched verbatim from ${resolveManifestUrl(entry.url, entry, manifest)}`,
    ]);
  }

  const content = `# Vendor Provenance

This directory (\`/vendor\`) holds verbatim, byte-for-byte copies of third-party files from
external upstream sources. Never hand-edit anything in here: changes must land upstream
first, or ship as patch files that the build scripts under \`/scripts\` apply at build time.
Re-sync from the pinned upstream refs with:

    node scripts/update-vendor.mjs

## Runtime assets (served from public/)

${renderTable(['path', 'source', 'ref', 'license', 'notes'], runtimeRows)}

## Vendored files under /vendor

${renderTable(['path', 'source', 'ref', 'license', 'notes'], vendorRows)}

Generated from \`scripts/vendor-manifest.json\` — do not edit by hand.
`;

  fs.writeFileSync(PROVENANCE_PATH, content, 'utf8');
}

async function updateVendor() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  console.log(`Fetching current master commit of ${BUSYBOX_RECIPE_REPO}...`);
  const pinnedRef = await resolvePinnedRef();
  console.log(`Pinning vendor/busybox to upstream master @ ${pinnedRef}`);

  await syncBuildRecipes(updateManifestPinnedRefs(manifest, pinnedRef));
  await syncVendoredLicenseFiles(manifest);
  writeProvenance(manifest);

  const recipeFileCount = manifest.buildRecipes.reduce((total, recipe) => total + recipe.files.length, 0);
  const licenseFileCount = (manifest.vendoredLicenseFiles || []).length;
  console.log(`Successfully synced ${recipeFileCount} build-recipe files and ${licenseFileCount} license files under ${VENDOR_DIR}`);
  console.log(`Updated manifest at ${MANIFEST_PATH} (buildRecipes busybox pinnedRef = ${pinnedRef})`);
  console.log(`Wrote provenance at ${PROVENANCE_PATH}`);
}

updateVendor().catch((error) => {
  console.error('Error updating vendor files:', error);
  process.exit(1);
});