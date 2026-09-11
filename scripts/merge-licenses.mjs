import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const tmpLicenseFile = path.join(distDir, 'third-party-licenses.tmp.txt');
const tmpWorkerLicenseFile = path.join(rootDir, '.temp', 'third-party-licenses-worker.txt');
const outputLicenseFile = path.join(distDir, 'THIRD_PARTY_LICENSES.txt');
const manifestFile = path.join(rootDir, 'scripts', 'vendor-manifest.json');
const vendorBusyboxDir = path.join(rootDir, 'vendor', 'busybox');
const goLicenseFile = path.join(rootDir, 'vendor', 'golang-go', 'LICENSE');
const mvdanShLicenseFile = path.join(rootDir, 'vendor', 'mvdan-sh', 'LICENSE');
const sourceBusyboxDir = path.join(distDir, 'source', 'busybox');
const cacheDir = path.join(rootDir, '.cache', 'busybox-source');

const BUSYBOX_SOURCE_URL =
  'https://github.com/vda-linux/busybox_mirror/archive/c8eb8614068a662271a5187d4876df1d8439a0ae.zip';
const BUSYBOX_SOURCE_ZIP = 'busybox_source_c8eb8614.zip';

// Files copied verbatim from vendor/busybox/ into dist/source/busybox/ as part
// of the GPL Corresponding Source offer (build recipe + upstream licenses).
const VENDOR_BUSYBOX_FILES = [
  'build.sh',
  'Makefile.wasm32',
  'emscripten_defconfig',
  'clang-flags.patch',
  'README.md',
  'LICENSE.APACHE-2.0',
  'LICENSE.GPL-2.0',
];

const SECTION_RULE = '-'.repeat(80);
const PAGE_RULE = '='.repeat(80);

const CORRESPONDING_SOURCE_SECTION = `${SECTION_RULE}
Corresponding Source (GPL-2.0 section 3)
${SECTION_RULE}

Corresponding Source for the GPLv2 busybox.js/busybox.wasm binaries served
from this CDN path, per GPL-2.0 §3.

This directory contains:

- ${BUSYBOX_SOURCE_ZIP}: the pinned upstream BusyBox source
  (commit c8eb8614068a662271a5187d4876df1d8439a0ae from
  https://github.com/vda-linux/busybox_mirror) that the binaries were built
  from.
- build.sh, Makefile.wasm32, emscripten_defconfig, clang-flags.patch: the
  build recipe (Emscripten build configuration and patches) used to produce
  the binaries.
- LICENSE.GPL-2.0 and LICENSE.APACHE-2.0: the upstream licenses (the BusyBox
  sources are GPL-2.0; the build recipe is Apache-2.0).

Rebuild with: docker build -f scripts/build-busybox/Dockerfile vendor/busybox
&& docker run ... — see scripts/build-busybox.sh.
`;

function readRequiredFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${description}: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function formatRuntimeAsset(asset) {
  return [
    `  * ${asset.artifact}`,
    `      Source:     ${asset.source}`,
    `      Upstream:   ${asset.upstream}`,
    `      Source ref: ${asset.sourceRef}`,
    `      License:    ${asset.license}`,
    `      Copyright:  ${asset.copyright}`,
  ].join('\n');
}

// Split a rollup-plugin-license report into per-dependency entries. Entries
// start with "Name: ..." followed by "Version: ..." (the plugin's default
// entry format); license texts may themselves contain "---" separator lines,
// so the entries are anchored on those header lines rather than on separators.
// If no entries can be recognized, the whole report is returned as one block so
// no content is ever dropped.
function parseLicenseEntries(reportContent) {
  const lines = reportContent.split('\n');
  const entryStartIndexes = [];
  lines.forEach((line, index) => {
    if (/^Name: .+/.test(line) && /^Version: /.test(lines[index + 1] || '')) {
      entryStartIndexes.push(index);
    }
  });
  if (entryStartIndexes.length === 0) {
    const trimmed = reportContent.trim();
    return trimmed ? [trimmed] : [];
  }
  return entryStartIndexes.map((start, index) => {
    const end = index + 1 < entryStartIndexes.length ? entryStartIndexes[index + 1] : lines.length;
    return lines.slice(start, end).join('\n').trimEnd();
  });
}

function licenseEntryKey(entry) {
  const name = entry.match(/^Name: (.+)$/m)?.[1] || '';
  const version = entry.match(/^Version: (.+)$/m)?.[1] || '';
  return `${name}@${version}`;
}

// The plugin analysis of the main bundle and the worker bundles overlap
// heavily; union the entries, preserving first-seen order (main report first).
function unionLicenseEntries(mainEntries, workerEntries) {
  const seen = new Set();
  const merged = [];
  for (const entry of [...mainEntries, ...workerEntries]) {
    const key = licenseEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

function assembleThirdPartyLicenses(bundledLicenseEntries, runtimeAssets, licenseTexts) {
  const parts = [];

  parts.push(`${PAGE_RULE}
DataCamp Light — Third-Party Software Licenses and Notices
${PAGE_RULE}

This file lists the third-party software distributed with DataCamp Light and
the full text of their licenses. It covers:

  1. "Separate runtime assets" — WebAssembly binaries and JavaScript runtime
     shims that are downloaded as separate files at runtime (not bundled into
     the dcl-react.js / dcl-react.es.js JavaScript bundles).
  2. "Bundled npm dependencies" — npm packages whose code is bundled into the
     shipped JavaScript bundles.
  3. "License texts" — the full license text for every license referenced
     above.
`);

  parts.push(`${SECTION_RULE}
1. Separate runtime assets
${SECTION_RULE}

The following runtime assets are served as separate files from the CDN. Their
provenance is tracked in scripts/vendor-manifest.json.

${runtimeAssets.map(formatRuntimeAsset).join('\n')}

Corresponding Source (GPL-2.0 section 3):

The busybox.js and busybox.wasm binaries are distributed under the GNU General
Public License, version 2 (GPL-2.0). Because we must assume this repository
itself may be private, the Corresponding Source for those binaries is shipped
alongside them: the dist/source/busybox/ directory is published on the same
CDN path as the binaries and contains the pinned upstream BusyBox source
archive plus the build recipe needed to regenerate the binaries.

The remaining assets are licensed under BSD-3-Clause (wasm_exec.js from the Go
toolchain, and sh-runner.wasm built from the mvdan/sh parser). For
BSD-3-Clause code, redistribution in binary form requires only that the
copyright notice and license text be preserved; both are included in this
file, which satisfies that requirement. No additional source offer is needed
for them.
`);

  parts.push(`${SECTION_RULE}
2. Bundled npm dependencies
${SECTION_RULE}

The following npm packages are bundled into the shipped JavaScript bundles
(dcl-react.js, dcl-react.es.js and their chunks, including the inline Web
Worker bundles). This section is generated by rollup-plugin-license from the
actual bundle contents (the union of the main bundle and Web Worker bundle
analyses, deduplicated) and reproduced here.

${bundledLicenseEntries.join('\n\n---\n\n')}
`);

  parts.push(`${SECTION_RULE}
3. License texts
${SECTION_RULE}

--- GNU General Public License, version 2 (GPL-2.0) ---------------------------
Applies to: busybox.js, busybox.wasm (BusyBox)

${licenseTexts.gpl.trimEnd()}

--- BSD-3-Clause — © The Go Authors --------------------------------------------
Applies to: wasm_exec.js (Go runtime shim for sh-runner.wasm)

${licenseTexts.goBsd3.trimEnd()}

--- BSD-3-Clause — mvdan-sh authors --------------------------------------------
Applies to: sh-runner.wasm (mvdan/sh parser)

${licenseTexts.mvdanShBsd3.trimEnd()}
`);

  return `${parts.join('\n')}\n`;
}

async function copyBusyBoxSourceZip() {
  const cachedZipPath = path.join(cacheDir, BUSYBOX_SOURCE_ZIP);

  if (!fs.existsSync(cachedZipPath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`- Downloading pinned BusyBox source from ${BUSYBOX_SOURCE_URL}...`);
    const response = await fetch(BUSYBOX_SOURCE_URL, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Failed to download ${BUSYBOX_SOURCE_URL}: ${response.status} ${response.statusText}`);
    }
    fs.writeFileSync(cachedZipPath, Buffer.from(await response.arrayBuffer()));
  } else {
    console.log('- Using cached BusyBox source archive from .cache/busybox-source/');
  }

  const targetZipPath = path.join(sourceBusyboxDir, BUSYBOX_SOURCE_ZIP);
  fs.copyFileSync(cachedZipPath, targetZipPath);
  return targetZipPath;
}

function assembleBusyBoxCorrespondingSource() {
  fs.rmSync(sourceBusyboxDir, { recursive: true, force: true });
  fs.mkdirSync(sourceBusyboxDir, { recursive: true });

  for (const fileName of VENDOR_BUSYBOX_FILES) {
    const sourcePath = path.join(vendorBusyboxDir, fileName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing vendor BusyBox file: ${sourcePath}`);
    }
    fs.copyFileSync(sourcePath, path.join(sourceBusyboxDir, fileName));
  }

  // The vendor README is kept verbatim; the GPL Corresponding Source offer is
  // appended so that a single README.md documents both the build recipe and
  // the source offer.
  fs.appendFileSync(
    path.join(sourceBusyboxDir, 'README.md'),
    `\n\n${CORRESPONDING_SOURCE_SECTION}`,
    'utf8',
  );
}

async function mergeLicenses() {
  const mainReport = readRequiredFile(
    tmpLicenseFile,
    'bundled dependency license report (run "vite build" first — "npm run build" wires this script after it)',
  );
  const workerReport = readRequiredFile(
    tmpWorkerLicenseFile,
    'Web Worker bundled dependency license report (rollup-plugin-license writes it during "vite build")',
  );
  const manifest = JSON.parse(readRequiredFile(manifestFile, 'vendor manifest'));
  const runtimeAssets = manifest.runtimeAssets || [];
  if (runtimeAssets.length === 0) {
    throw new Error(`No runtimeAssets found in ${manifestFile}`);
  }
  const licenseTexts = {
    gpl: readRequiredFile(
      path.join(vendorBusyboxDir, 'LICENSE.GPL-2.0'),
      'GPL-2.0 license text (run "node scripts/update-vendor.mjs" first)',
    ),
    goBsd3: readRequiredFile(
      goLicenseFile,
      'BSD-3-Clause license text for the Go runtime (run "node scripts/update-vendor.mjs" first)',
    ),
    mvdanShBsd3: readRequiredFile(
      mvdanShLicenseFile,
      'BSD-3-Clause license text for mvdan/sh (run "node scripts/update-vendor.mjs" first)',
    ),
  };

  // 1. Merge the runtime-asset manifest and the bundled npm dependency report
  //    into a single licenses file for the CDN.
  const bundledLicenseEntries = unionLicenseEntries(
    parseLicenseEntries(mainReport),
    parseLicenseEntries(workerReport),
  );
  const report = assembleThirdPartyLicenses(bundledLicenseEntries, runtimeAssets, licenseTexts);
  fs.writeFileSync(outputLicenseFile, report, 'utf8');

  // 2. The plugin outputs are only intermediate: remove them so the final
  //    dist/ contains exactly one licenses file.
  fs.rmSync(tmpLicenseFile);
  fs.rmSync(tmpWorkerLicenseFile);

  // 3. Assemble the GPL-2.0 Corresponding Source offer for BusyBox.
  assembleBusyBoxCorrespondingSource();
  const busyboxZipPath = await copyBusyBoxSourceZip();

  // 4. Summary.
  const reportLines = report.split('\n').length;
  console.log(`\nWrote ${path.relative(rootDir, outputLicenseFile)} (${reportLines} lines):`);
  console.log(`  - 1. Separate runtime assets: ${runtimeAssets.length} assets from vendor-manifest.json`);
  console.log(`  - 2. Bundled npm dependencies: ${bundledLicenseEntries.length} packages (main bundle + Web Worker bundles)`);
  console.log('  - 3. License texts read from /vendor: GPL-2.0 (vendor/busybox), BSD-3-Clause (vendor/golang-go), BSD-3-Clause (vendor/mvdan-sh)');
  console.log(`Removed ${path.relative(rootDir, tmpLicenseFile)} and ${path.relative(rootDir, tmpWorkerLicenseFile)}`);
  console.log(`\nAssembled ${path.relative(rootDir, sourceBusyboxDir)}/ (GPL-2.0 Corresponding Source):`);
  VENDOR_BUSYBOX_FILES.forEach((fileName) => console.log(`  - ${fileName} (copied from vendor/busybox/)`));
  console.log(`  - ${path.basename(busyboxZipPath)} (pinned BusyBox source, ${fs.statSync(busyboxZipPath).size} bytes)`);
  console.log('  - README.md (vendor README + Corresponding Source offer)');
}

mergeLicenses().catch((error) => {
  console.error('Error merging licenses:', error);
  process.exit(1);
});
