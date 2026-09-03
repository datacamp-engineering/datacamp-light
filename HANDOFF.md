# DataCamp Light v4 (WebAssembly Edition) — Project Handoff

## Overview
DataCamp Light v4 modernizes the embedded exercise widget by replacing legacy server-side Docker containers with client-side WebAssembly runtimes speaking a unified JSON-RPC 2.0 protocol, styled with `@datacamp/waffles` dark theme.

## Current Status
- **Verification**: `npm run typecheck` (clean) and `npm test` (51/51 tests passing across 11 test suites).
- **Build**: Vite bundle generation emitting UMD (`dist/dcl-react.js`), ESM (`dist/dcl-react.es.js`), and self-contained CSS (`dist/datacamp-light.css`) with inlined Studio-Feixen-Sans and JetBrains Mono fonts.
- **Legacy Preservation**: [`LEGACY_ASSETS_MANIFEST.md`](./LEGACY_ASSETS_MANIFEST.md) records all historical CDN asset hashes and rollback commands.
- **CI Pipeline**: `.circleci/config.yml` includes automated legacy CDN backups to `dcl/v3/` prior to deployment, Node 20 LTS runner, and fixture URL rewrites.

## Implemented Features
1. **Runtimes (JSON-RPC 2.0 Client)**:
   - **Python**: Worker-based Pyodide runtime with `pythonwhat`/`protowhat` SCT evaluation, dynamic `micropip` imports, and matplotlib SVG plot extraction.
   - **R**: In-browser webR runtime with bundled `testwhat` sources and SVG plotting.
   - **Shell**: Worker-based BusyBox WebAssembly runtime (`busybox.wasm`) with xterm.js terminal, in-memory filesystem, and `shellwhat` SCT evaluation.
2. **UI & Components**:
   - CodeMirror 6 code editor, split panes with custom resize handles, feedback banner, action bar, and output consoles.
   - Complete backward compatibility with legacy `<div data-datacamp-exercise>` attributes and options.

## Asset Resolution (implemented)
- `src/config.ts` is the single source of truth: `assetBaseUrl` is `''` in dev
  (resolved against the dev-server origin, Vite serves `public/busybox.*`) and
  `https://cdn.datacamp.com/dcl/v4` in production, baked in at build time.
- `ShellSession.ts` injects `self.DCL_ASSET_BASE_URL` into the blob worker
  source; `shellWorkerSource.ts` resolves `busybox.js`/`busybox.wasm` against
  it (falling back to `location.origin` when unset).
- Pyodide/webR keep their fixed public CDNs (`cdn.jsdelivr.net`,
  `webr.r-wasm.org`); only BusyBox depends on `assetBaseUrl`.
- `.circleci/config.yml` deploys the secondary assets next to the bundles
  under `/dcl/v4/` and never touches the root `/dcl-react.js.gz` entrypoint
  (see Rollout below). busybox.wasm is uploaded raw with
  `application/wasm` + CDN CORS required.

## Rollout & CI Release Strategy

See [`LEGACY_ASSETS_MANIFEST.md`](./LEGACY_ASSETS_MANIFEST.md) for the exact checksums, sizes, and restoration commands for all historical CDN files.

### Entrypoints & CDN Paths
- **Primary Legacy Target**: `https://cdn.datacamp.com/dcl-react.js.gz` (highest active traffic).
- **Phase 1 (Initial v4 Release — Non-Breaking)**:
  - Deploy the v4 WASM bundle to dedicated endpoints (e.g. `https://cdn.datacamp.com/dcl/v4/dcl-react.js.gz`, `https://cdn.datacamp.com/dcl-react-v4.js.gz`).
  - Do **not** overwrite the root `/dcl-react.js.gz` yet to avoid breaking active embeds during initial testing.
- **Phase 2 (Legacy Archival)**:
  - Copy and preserve the existing server-backed v2/v3 bundle under an explicit archival URL (e.g. `/dcl-react-v2.js.gz` / `/dcl-legacy/dcl-react.js.gz`).
- **Phase 3 (Primary Cutover with Automated Fallback)**:
  - Promote v4 WASM to the main `/dcl-react.js.gz` entrypoint.
  - Include automated client-side fallback to the legacy container backend if WebAssembly, Pyodide, or webR cannot initialize in the visitor's browser.

## CI & Release Tasks Required
1. **Modernize `.circleci/config.yml`**:
   - Upgrade container image from `node:8.9.1` to `cimg/node:20.18` (LTS).
   - Replace Webpack scripts with `npm run build` (`tsc -b && vite build`), `npm run typecheck`, and `npm test`.
2. **S3 & CDN Artifact Uploads**:
   - Upload modern bundles to `s3://cdn.datacamp.com/`: `dist/dcl-react.js`, `dist/dcl-react.es.js`, `dist/datacamp-light.css`, and WASM binaries (`vendor/busybox/busybox.wasm`).
   - Configure correct MIME types (`application/javascript`, `text/css`, `application/wasm`) and `gzip` content-encoding headers.
   - Target versioned `/dcl/v4/` and `dcl-react-v4.js.gz` paths in the initial release.
   - Trigger CloudFront cache invalidations for updated assets.

## Remaining Items & Roadmap
- **Shared Worker Pool**: Reuse runtime workers across multiple exercises on a single page to reduce memory and download overhead.
- **CodeMirror Syntax Modes**: Add dedicated R and Shell syntax highlighting extensions for CodeMirror 6.
