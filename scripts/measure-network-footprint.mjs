#!/usr/bin/env node

/**
 * DataCamp Light Network Footprint & Compression Measurement Tool
 *
 * Measures the exact uncompressed (raw), Gzip (gz), and Brotli (br) transfer sizes
 * across all embedding scenarios and on-demand interactive features:
 *
 * Core & Language Runtimes:
 * - 1. DCL Core Initial Embed (Code-Split Library)
 * - 2a. Shell Exercise (JS AST + BusyBox WASM)
 * - 2b. Shell Exercise (Full mvdan/sh Go WASM + BusyBox)
 * - 3. Python (Single Editor, No SCT, No Extra Packages)
 * - 4. Python with pythonwhat SCT (Standard Course Exercise)
 * - 5. Python Data Science Stack (NumPy + Pandas + Matplotlib)
 * - 6. Python + Shell Unified Environment
 * - 7. R Exercise (webR WASM + testwhat SCT)
 * - 8. Multi-Editor Page (5 Isolated Python Exercises with Cache Storage)
 *
 * On-Demand Interactive UI Feature Bundles:
 * - 9a. CodeMirror Autocomplete & Catalogs Bundle (loaded on user typing)
 * - 9b. AI Explanation & Diff Viewer Bundle (loaded on "Explain Code")
 * - 9c. Plot Viewer & Pagination Canvas Bundle (loaded when plot is generated)
 * - 10. Fully Loaded Python Exercise with All Features (SCT + Autocomplete + AI + Plots)
 *
 * Usage:
 *   node scripts/measure-network-footprint.mjs [--refresh] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createCompressedServer } from './serve-compressed.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDirectory = path.resolve(__dirname, '..');
const distDirectory = path.join(rootDirectory, 'dist');
const cacheDirectory = path.join(rootDirectory, '.cache', 'network-audit');

if (!fs.existsSync(cacheDirectory)) {
  fs.mkdirSync(cacheDirectory, { recursive: true });
}

const forceRefresh = process.argv.includes('--refresh');

const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/';

// Dynamically locate chunk filenames in dist/
function findDistChunk(prefix) {
  if (!fs.existsSync(distDirectory)) return null;
  const files = fs.readdirSync(distDirectory);
  const match = files.find((f) => f.startsWith(prefix) && f.endsWith('.js') && !f.endsWith('.map'));
  return match ? path.join(distDirectory, match) : null;
}

const indexChunkPath = findDistChunk('index-') || path.join(distDirectory, 'dcl-react.es.js');
const wasmSessionChunkPath = findDistChunk('WasmSession-') || path.join(distDirectory, 'dcl-react.es.js');
const shellSessionChunkPath = findDistChunk('ShellSession-') || path.join(distDirectory, 'dcl-react.es.js');
const rSessionChunkPath = findDistChunk('RWebRSession-') || path.join(distDirectory, 'dcl-react.es.js');
const terminalChunkPath = findDistChunk('TerminalConsole-') || path.join(distDirectory, 'dcl-react.es.js');
const autocompleteChunkPath = findDistChunk('autocompleteExtension-') || path.join(distDirectory, 'dcl-react.es.js');
const aiExplanationChunkPath = findDistChunk('AiExplanationPanel-') || path.join(distDirectory, 'dcl-react.es.js');
const plotCanvasChunkPath = findDistChunk('PlotCanvas-') || path.join(distDirectory, 'dcl-react.es.js');

const CORE_ASSETS = {
  'dcl-react.es.js': {
    category: 'DCL Core',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/dcl-react.es.js',
    localPath: indexChunkPath,
  },
  'datacamp-light.css': {
    category: 'DCL Core',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/datacamp-light.css',
    localPath: path.join(distDirectory, 'datacamp-light.css'),
  },
  'WasmSession.js': {
    category: 'Python Bridge',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/chunks/WasmSession.js',
    localPath: wasmSessionChunkPath,
  },
  'ShellSession.js': {
    category: 'Shell Bridge',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/chunks/ShellSession.js',
    localPath: shellSessionChunkPath,
  },
  'TerminalConsole.js': {
    category: 'Shell Terminal',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/chunks/TerminalConsole.js',
    localPath: terminalChunkPath,
  },
  'RWebRSession.js': {
    category: 'R Bridge',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/chunks/RWebRSession.js',
    localPath: rSessionChunkPath,
  },
  'autocompleteExtension.js': {
    category: 'UI Feature',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/chunks/autocompleteExtension.js',
    localPath: autocompleteChunkPath,
  },
  'AiExplanationPanel.js': {
    category: 'UI Feature',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/chunks/AiExplanationPanel.js',
    localPath: aiExplanationChunkPath,
  },
  'PlotCanvas.js': {
    category: 'UI Feature',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/chunks/PlotCanvas.js',
    localPath: plotCanvasChunkPath,
  },
  'busybox.js': {
    category: 'Shell Engine',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/busybox.js',
    localPath: path.join(rootDirectory, 'public', 'busybox.js'),
  },
  'busybox.wasm': {
    category: 'Shell Engine',
    url: 'https://cdn.datacamp.com/dcl/v4/prod/busybox.wasm',
    localPath: path.join(rootDirectory, 'public', 'busybox.wasm'),
  },
  'sh-runner.wasm': {
    category: 'Shell Engine',
    url: 'https://cdn.jsdelivr.net/npm/sh-syntax@0.4.2/main.wasm',
    localPath: path.join(rootDirectory, 'public', 'sh-runner.wasm'),
  },
  'webr.mjs': {
    category: 'R Engine',
    url: 'https://webr.r-wasm.org/latest/webr.mjs',
  },
  'webr-worker.js': {
    category: 'R Engine',
    url: 'https://webr.r-wasm.org/latest/webr-worker.js',
  },
  'R.bin.wasm': {
    category: 'R Engine',
    url: 'https://webr.r-wasm.org/latest/R.bin.wasm',
  },
  'evaluate.bin.tar.gz': {
    category: 'R SCT',
    url: 'https://repo.r-wasm.org/bin/emscripten/contrib/4.3/evaluate_0.23.bin.tar.gz',
  },
  'R6.bin.tar.gz': {
    category: 'R SCT',
    url: 'https://repo.r-wasm.org/bin/emscripten/contrib/4.3/R6_2.5.1.bin.tar.gz',
  },
  'magrittr.bin.tar.gz': {
    category: 'R SCT',
    url: 'https://repo.r-wasm.org/bin/emscripten/contrib/4.3/magrittr_2.0.3.bin.tar.gz',
  },
  'stringdist.bin.tar.gz': {
    category: 'R SCT',
    url: 'https://repo.r-wasm.org/bin/emscripten/contrib/4.3/stringdist_0.9.12.bin.tar.gz',
  },
  'praise.bin.tar.gz': {
    category: 'R SCT',
    url: 'https://repo.r-wasm.org/bin/emscripten/contrib/4.3/praise_1.0.0.bin.tar.gz',
  },
  'pyodide.js': {
    category: 'Python Engine',
    url: PYODIDE_BASE_URL + 'pyodide.js',
  },
  'pyodide.asm.wasm': {
    category: 'Python Engine',
    url: PYODIDE_BASE_URL + 'pyodide.asm.wasm',
  },
  'python_stdlib.zip': {
    category: 'Python Engine',
    url: PYODIDE_BASE_URL + 'python_stdlib.zip',
  },
  'pyodide-lock.json': {
    category: 'Python Engine',
    url: PYODIDE_BASE_URL + 'pyodide-lock.json',
  },
};

const statsCache = new Map();

async function fetchOrGetCachedBuffer(url, cacheFileName, localPath) {
  if (localPath && fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }

  const cachedFilePath = path.join(cacheDirectory, cacheFileName);
  if (!forceRefresh && fs.existsSync(cachedFilePath)) {
    return fs.readFileSync(cachedFilePath);
  }

  if (url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(cachedFilePath, buffer);
        return buffer;
      }
    } catch {}
  }

  return null;
}

async function getStatsForAsset(assetKey, category = 'General', urlOverride = null, localPath = null) {
  if (statsCache.has(assetKey)) {
    return statsCache.get(assetKey);
  }

  let url = urlOverride;
  let fileLocalPath = localPath;

  if (CORE_ASSETS[assetKey]) {
    url = CORE_ASSETS[assetKey].url;
    fileLocalPath = CORE_ASSETS[assetKey].localPath;
    category = CORE_ASSETS[assetKey].category;
  }

  const safeFileName = assetKey.replace(/[^a-zA-Z0-9._-]/g, '_');
  const buffer = await fetchOrGetCachedBuffer(url, safeFileName, fileLocalPath);

  if (!buffer) {
    const emptyStats = { asset: assetKey, category, raw: 0, gzip: 0, brotli: 0 };
    statsCache.set(assetKey, emptyStats);
    return emptyStats;
  }

  const raw = buffer.length;
  const gzip = zlib.gzipSync(buffer, { level: 9 }).length;
  const brotli = zlib.brotliCompressSync(buffer, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
    },
  }).length;

  const result = {
    asset: assetKey,
    category,
    raw,
    gzip,
    brotli,
  };

  statsCache.set(assetKey, result);
  return result;
}

async function getPyodideLock() {
  const buffer = await fetchOrGetCachedBuffer(
    PYODIDE_BASE_URL + 'pyodide-lock.json',
    'pyodide-lock.json',
  );
  if (!buffer) return { packages: {} };
  return JSON.parse(buffer.toString('utf-8'));
}

function resolvePackageDependencies(packageNames, lockData) {
  const resolvedFiles = new Map();
  const queue = [...packageNames];

  while (queue.length > 0) {
    const pkgName = queue.shift();
    const pkgMeta = lockData.packages[pkgName];
    if (pkgMeta && !resolvedFiles.has(pkgMeta.file_name)) {
      resolvedFiles.set(pkgMeta.file_name, {
        name: pkgName,
        fileName: pkgMeta.file_name,
        url: PYODIDE_BASE_URL + pkgMeta.file_name,
      });

      if (Array.isArray(pkgMeta.depends)) {
        for (const dep of pkgMeta.depends) {
          if (!queue.includes(dep)) {
            queue.push(dep);
          }
        }
      }
    }
  }

  return Array.from(resolvedFiles.values());
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
  console.log(`\n========================================================================================`);
  console.log(` DataCamp Light v4 - WebAssembly Network Footprint & Compression Audit`);
  console.log(`========================================================================================\n`);

  const pyodideLock = await getPyodideLock();

  const pythonwhatPackages = resolvePackageDependencies(
    ['micropip', 'jinja2', 'asttokens', 'six', 'packaging', 'setuptools', 'markupsafe', 'click'],
    pyodideLock,
  );

  const dataSciencePackages = resolvePackageDependencies(
    ['numpy', 'pandas', 'matplotlib'],
    pyodideLock,
  );

  const SCENARIOS = [
    {
      id: 'core-only',
      name: '1. DCL Core Initial Embed (Code-Split Library)',
      description: 'Initial script and stylesheet loaded on host webpage before any exercise activates.',
      coreAssets: ['dcl-react.es.js', 'datacamp-light.css'],
      pyodidePackages: [],
    },
    {
      id: 'shell-standalone-ast',
      name: '2a. Shell Exercise (JS AST + BusyBox WASM)',
      description: 'POSIX shell script or terminal console exercise using lazy-loaded Shell worker and xterm.',
      coreAssets: ['dcl-react.es.js', 'datacamp-light.css', 'ShellSession.js', 'TerminalConsole.js', 'busybox.js', 'busybox.wasm'],
      pyodidePackages: [],
    },
    {
      id: 'shell-standalone-go-wasm',
      name: '2b. Shell Exercise (Full mvdan/sh Go WASM + BusyBox)',
      description: '100% Bash compliance with sh-runner.wasm (mvdan/sh) + BusyBox WASM.',
      coreAssets: ['dcl-react.es.js', 'datacamp-light.css', 'ShellSession.js', 'TerminalConsole.js', 'busybox.js', 'busybox.wasm', 'sh-runner.wasm'],
      pyodidePackages: [],
    },
    {
      id: 'python-basic-no-sct',
      name: '3. Python (Single Editor, No SCT, No Extra Packages)',
      description: 'Basic Python execution using lazy-loaded Pyodide runtime (no Shell or R chunks loaded).',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'WasmSession.js',
        'pyodide.js',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
      ],
      pyodidePackages: [],
    },
    {
      id: 'python-sct',
      name: '4. Python with pythonwhat SCT (Standard Course Exercise)',
      description: 'Standard DataCamp Python exercise including pythonwhat and all transitive wheels.',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'WasmSession.js',
        'pyodide.js',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
      ],
      pyodidePackages: pythonwhatPackages,
    },
    {
      id: 'python-data-science',
      name: '5. Python Data Science Stack (NumPy + Pandas + Matplotlib)',
      description: 'Full data science tutorial with NumPy, Pandas, Matplotlib, and all transitive dependencies (Pillow, FontTools, KiwiSolver, ContourPy, etc.).',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'WasmSession.js',
        'pyodide.js',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
      ],
      pyodidePackages: dataSciencePackages,
    },
    {
      id: 'python-shell-colocated',
      name: '6. Python + Shell Unified Environment',
      description: 'Co-located Python and Shell workflow on shared Virtual Filesystem.',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'WasmSession.js',
        'ShellSession.js',
        'pyodide.js',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
        'busybox.js',
        'busybox.wasm',
      ],
      pyodidePackages: [],
    },
    {
      id: 'r-basic-testwhat',
      name: '7a. R Exercise (webR WASM + testwhat SCT)',
      description: 'Interactive R exercise with base plotting and testwhat evaluation dependencies.',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'RWebRSession.js',
        'webr.mjs',
        'webr-worker.js',
        'R.bin.wasm',
        'evaluate.bin.tar.gz',
        'R6.bin.tar.gz',
        'magrittr.bin.tar.gz',
        'stringdist.bin.tar.gz',
        'praise.bin.tar.gz',
      ],
      pyodidePackages: [],
    },
    {
      id: 'r-plain-no-sct',
      name: '7b. Plain R (webR WASM Core only, Zero testwhat, Zero CRAN packages)',
      description: 'Plain R REPL or tutorial snippet executing directly in WebAssembly without test frameworks.',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'RWebRSession.js',
        'webr.mjs',
        'webr-worker.js',
        'R.bin.wasm',
      ],
      pyodidePackages: [],
    },
    {
      id: 'multi-editor-python-cold-vs-warm',
      name: '8a. Multi-Editor Page (5 Isolated Python Exercises)',
      description: 'Comparison of Cold Network Transfer vs Persistent Cache Storage Deduplication across 5 isolated Python widgets.',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'WasmSession.js',
        'pyodide.js',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
      ],
      pyodidePackages: pythonwhatPackages,
      isMultiInstanceComparison: true,
      instancesCount: 5,
    },
    {
      id: 'multi-editor-r-cold-vs-warm',
      name: '8b. Multi-Editor Page (5 Isolated R Exercises)',
      description: 'Comparison of Cold Network Transfer vs Persistent Cache Storage Deduplication across 5 isolated R widgets.',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'RWebRSession.js',
        'webr.mjs',
        'webr-worker.js',
        'R.bin.wasm',
        'evaluate.bin.tar.gz',
        'R6.bin.tar.gz',
        'magrittr.bin.tar.gz',
        'stringdist.bin.tar.gz',
        'praise.bin.tar.gz',
      ],
      pyodidePackages: [],
      isMultiInstanceComparison: true,
      instancesCount: 5,
    },
    {
      id: 'feature-autocomplete',
      name: '9a. On-Demand Feature: CodeMirror Autocomplete & Catalogs',
      description: 'Loaded on-demand only when user types or triggers autocompletion.',
      coreAssets: ['autocompleteExtension.js'],
      pyodidePackages: [],
    },
    {
      id: 'feature-ai-explanation',
      name: '9b. On-Demand Feature: AI Explanation & Diff Panel',
      description: 'Loaded on-demand only when user clicks "Explain Code" or "Fix & Explain".',
      coreAssets: ['AiExplanationPanel.js'],
      pyodidePackages: [],
    },
    {
      id: 'feature-plot-canvas',
      name: '9c. On-Demand Feature: Plot Pagination & Canvas Viewer',
      description: 'Loaded on-demand only when user generates matplotlib or R graphics.',
      coreAssets: ['PlotCanvas.js'],
      pyodidePackages: [],
    },
    {
      id: 'python-full-interactive',
      name: '10. Fully Loaded Interactive Python Exercise (All Features Active)',
      description: 'Complete Python exercise with SCT testing, autocomplete, AI explanation panel, and plot canvas rendered.',
      coreAssets: [
        'dcl-react.es.js',
        'datacamp-light.css',
        'WasmSession.js',
        'autocompleteExtension.js',
        'AiExplanationPanel.js',
        'PlotCanvas.js',
        'pyodide.js',
        'pyodide.asm.wasm',
        'python_stdlib.zip',
        'pyodide-lock.json',
      ],
      pyodidePackages: pythonwhatPackages,
    },
  ];

  const results = [];

  console.log(`[Server] Starting local compressed server for live over-the-wire HTTP transfer verification...`);
  const liveServer = createCompressedServer();
  const serverPort = await new Promise((resolve) => {
    liveServer.listen(0, '127.0.0.1', () => {
      resolve(liveServer.address().port);
    });
  });

  const liveServerUrl = `http://127.0.0.1:${serverPort}`;
  let liveVerifiedCount = 0;
  for (const [key, asset] of Object.entries(CORE_ASSETS)) {
    if (asset.localPath && fs.existsSync(asset.localPath)) {
      const fileName = path.basename(asset.localPath);
      try {
        const response = await fetch(`${liveServerUrl}/${fileName}`, {
          headers: { 'Accept-Encoding': 'gzip, br' },
        });
        if (response.status === 200) {
          liveVerifiedCount++;
        }
      } catch {}
    }
  }
  console.log(`[Server] Verified ${liveVerifiedCount} local distribution assets live over HTTP (Brotli/Gzip) with 200 OK.\n`);
  liveServer.close();

  for (const scenario of SCENARIOS) {
    let totalRaw = 0;
    let totalGzip = 0;
    let totalBrotli = 0;
    const assetBreakdown = [];

    for (const coreAsset of scenario.coreAssets) {
      const stats = await getStatsForAsset(coreAsset);
      totalRaw += stats.raw;
      totalGzip += stats.gzip;
      totalBrotli += stats.brotli;
      assetBreakdown.push(stats);
    }

    for (const pkg of scenario.pyodidePackages) {
      const stats = await getStatsForAsset(pkg.fileName, 'Python Package', pkg.url);
      totalRaw += stats.raw;
      totalGzip += stats.gzip;
      totalBrotli += stats.brotli;
      assetBreakdown.push(stats);
    }

    const warmTransferBrotli = scenario.isMultiInstanceComparison ? totalBrotli : 0;
    const unoptimizedColdWithoutCache = scenario.isMultiInstanceComparison
      ? totalBrotli * scenario.instancesCount
      : totalBrotli;

    results.push({
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      assetsCount: assetBreakdown.length,
      totalRaw,
      totalGzip,
      totalBrotli,
      isMultiInstanceComparison: scenario.isMultiInstanceComparison,
      instancesCount: scenario.instancesCount,
      warmTransferBrotli,
      unoptimizedColdWithoutCache,
      assetBreakdown,
    });
  }

  for (const res of results) {
    console.log(`----------------------------------------------------------------------------------------`);
    console.log(`📌 ${res.name}`);
    console.log(`   ${res.description}`);
    console.log(`   • Transfer Size (Brotli): ${formatBytes(res.totalBrotli)} | Gzip: ${formatBytes(res.totalGzip)} | Raw: ${formatBytes(res.totalRaw)}`);
    console.log(`   • Total Assets: ${res.assetsCount} files`);

    if (res.unoptimizedColdWithoutCache !== res.totalBrotli) {
      const savedBytes = res.unoptimizedColdWithoutCache - res.warmTransferBrotli;
      const reductionPercentage = ((savedBytes / res.unoptimizedColdWithoutCache) * 100).toFixed(1);
      console.log(`   • ${res.instancesCount || 5}x Multi-Widget Initial Transfer WITH Cache API:  ${formatBytes(res.warmTransferBrotli)} (Deduplicated)`);
      console.log(`   • ${res.instancesCount || 5}x Multi-Widget Initial Transfer WITHOUT Cache API: ${formatBytes(res.unoptimizedColdWithoutCache)}`);
      console.log(`   • Bandwidth Saved on Multi-Editor Page:             ${formatBytes(savedBytes)} (${reductionPercentage}% reduction)`);
    }

    console.log(`   • Heaviest Assets:`);
    res.assetBreakdown
      .sort((a, b) => b.brotli - a.brotli)
      .slice(0, 5)
      .forEach((item) => {
        console.log(`     - [${item.category}] ${item.asset}: ${formatBytes(item.brotli)} (br) / ${formatBytes(item.gzip)} (gz)`);
      });
  }

  console.log(`\n========================================================================================`);
  console.log(` Summary of Optimized Network Transfer Sizes (Brotli vs Gzip)`);
  console.log(`========================================================================================`);
  for (const res of results) {
    if (res.isMultiInstanceComparison) continue;
    console.log(` • ${res.name.padEnd(56)}: ${formatBytes(res.totalBrotli).padStart(9)} (br) / ${formatBytes(res.totalGzip).padStart(9)} (gz)`);
  }
  console.log(`========================================================================================\n`);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  }
}

main().catch((err) => {
  console.error('Error during network footprint measurement:', err);
  process.exit(1);
});
