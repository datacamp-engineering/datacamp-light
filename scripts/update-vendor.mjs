import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const VENDOR_DIR = path.join(rootDir, 'vendor');
const VENDOR_BUSYBOX_DIR = path.join(VENDOR_DIR, 'busybox');
const MANIFEST_PATH = path.join(rootDir, 'scripts', 'vendor-manifest.json');
const PROVENANCE_PATH = path.join(VENDOR_DIR, 'PROVENANCE.md');

const REPO = 'cryptool-org/busybox-wasm';
const PINNED_FILES = [
  'README.md',
  'build.sh',
  'Makefile.wasm32',
  'emscripten_defconfig',
  'clang-flags.patch',
  'LICENSE.APACHE-2.0',
  'LICENSE.GPL-2.0',
];
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
  const commit = await fetchJson(`https://api.github.com/repos/${REPO}/commits/master`);
  return commit.sha;
}

async function syncVendorBusybox(pinnedRef) {
  fs.mkdirSync(VENDOR_BUSYBOX_DIR, { recursive: true });
  for (const fileName of PINNED_FILES) {
    const url = `https://raw.githubusercontent.com/${REPO}/${pinnedRef}/${fileName}`;
    console.log(`- Syncing vendor/busybox/${fileName} from ${REPO} @ ${pinnedRef}...`);
    const content = await fetchText(url);
    fs.writeFileSync(path.join(VENDOR_BUSYBOX_DIR, fileName), content, 'utf8');
  }
}

function updateManifest(pinnedRef) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const recipe = manifest.buildRecipes.find((entry) => entry.path === 'vendor/busybox');
  if (!recipe) {
    throw new Error('vendor-manifest.json has no buildRecipes entry for vendor/busybox');
  }
  recipe.pinnedRef = pinnedRef;
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function writeProvenance(manifest, pinnedRef) {
  const rows = [];
  for (const asset of manifest.runtimeAssets) {
    rows.push([
      `public/${asset.artifact}`,
      asset.source,
      asset.sourceRef,
      asset.license,
      `${asset.upstream} — copyright ${asset.copyright}`,
    ]);
  }
  for (const recipe of manifest.buildRecipes) {
    rows.push([
      recipe.path,
      `${REPO} (verbatim copies)`,
      recipe.pinnedRef,
      recipe.license,
      `${recipe.upstream} — synced by scripts/update-vendor.mjs, built via scripts/build-busybox.sh`,
    ]);
  }

  const columnWidths = [0, 1, 2, 3, 4].map((index) =>
    Math.max('path source ref license notes'.split(' ')[index].length, ...rows.map((row) => row[index].length)),
  );
  const formatRow = (cells) =>
    `| ${cells.map((cell, index) => cell.padEnd(columnWidths[index])).join(' | ')} |`;
  const separator = `| ${columnWidths.map((width) => '-'.repeat(width)).join(' | ')} |`;

  const content = `# Vendor Provenance

This directory (\`/vendor\`) holds verbatim, byte-for-byte copies of third-party files from
external upstream sources. Never hand-edit anything in here: changes must land upstream
first, or ship as patch files that the build scripts under \`/scripts\` apply at build time.
Re-sync from the pinned upstream refs with:

    node scripts/update-vendor.mjs

Generated from \`scripts/vendor-manifest.json\` — do not edit by hand.

${formatRow(['path', 'source', 'ref', 'license', 'notes'])}
${separator}
${rows.map((row) => formatRow(row)).join('\n')}
`;

  fs.writeFileSync(PROVENANCE_PATH, content, 'utf8');
}

async function updateVendor() {
  console.log(`Fetching current master commit of ${REPO}...`);
  const pinnedRef = await resolvePinnedRef();
  console.log(`Pinning vendor/busybox to upstream master @ ${pinnedRef}`);

  await syncVendorBusybox(pinnedRef);
  const manifest = updateManifest(pinnedRef);
  writeProvenance(manifest, pinnedRef);

  console.log(`Successfully synced ${PINNED_FILES.length} vendored files to ${VENDOR_BUSYBOX_DIR}`);
  console.log(`Updated manifest at ${MANIFEST_PATH} (buildRecipes[0].pinnedRef = ${pinnedRef})`);
  console.log(`Wrote provenance at ${PROVENANCE_PATH}`);
}

updateVendor().catch((error) => {
  console.error('Error updating vendor files:', error);
  process.exit(1);
});