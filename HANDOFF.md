# DataCamp Light v4 (WebAssembly Edition) — Project Handoff

## Overview
DataCamp Light v4 modernizes the embedded exercise widget by replacing legacy server-side Docker containers with client-side WebAssembly runtimes speaking a unified JSON-RPC 2.0 protocol, styled with `@datacamp/waffles` design system with dynamic light/dark theming and AI assistance.

## Current Status
- **Verification**: `npm run typecheck` (clean) and `npm test` (84/84 tests passing across 17 test suites).
- **Build**: Vite bundle generation emitting UMD (`dist/dcl-react.js`), ESM (`dist/dcl-react.es.js`), and self-contained CSS (`dist/datacamp-light.css`) with inlined Studio-Feixen-Sans and JetBrains Mono fonts.
- **Legacy Preservation**: [`LEGACY_ASSETS_MANIFEST.md`](./LEGACY_ASSETS_MANIFEST.md) records all historical CDN asset hashes and rollback commands.
- **CI Pipeline**: `.circleci/config.yml` includes automated legacy CDN backups to `dcl/v3/` prior to deployment, Node 20 LTS runner, and fixture URL rewrites.

## Implemented Features
1. **Runtimes & Shared Environments (`src/runtime/sessionPool.ts`)**:
   - **Python**: Worker-based Pyodide runtime with `pythonwhat`/`protowhat` SCT evaluation, dynamic `micropip` imports, and matplotlib SVG plot extraction.
   - **R**: In-browser webR runtime with bundled `testwhat` sources and canvas PNG plotting.
   - **Shell**: Worker-based BusyBox WebAssembly runtime (`busybox.wasm`) with xterm.js terminal, ANSI color themes, in-memory filesystem, and `shellwhat` SCT evaluation.
   - **Shared Environments**: Ref-counted session pool allowing multiple exercises on a page to share a single in-memory runtime via `data-shared-environment="true|id"`.
2. **Theming & System OS Inheritance (`src/theme/themeManager.ts`)**:
   - Auto-inherits system OS theme via `window.matchMedia('(prefers-color-scheme: dark)')`.
   - Explicit initial theme support via `data-theme="light|dark"`.
   - Footer toggle button allowing learners to switch between dark and light modes, synchronized across all exercises on the page.
3. **AI Assistance & Explainers (`src/ai/`)**:
   - **"Explain Code" (✨)**: Live streamed Markdown-formatted code explanations parsed with `marked`.
   - **"Fix & Explain"**: Automated error diagnosis with visual line diffing (`src/ai/lineDiff.ts`) and Accept/Reject buttons.
   - **Domain & Auth Fallback**: First-party `ai-api` streaming for signed-in users on `*.datacamp.com`; automated "Open in DataLab" or free sign-up CTA on third-party blogs.
   - **HTML Configuration**: Toggleable via `data-show-ai="false"` / `data-has-ai="false"`.
4. **UI & Usability**:
   - Action bar only renders "Submit Answer" when `<code data-type="sct">` is present, promoting "Run Code" in open-ended sandbox exercises.
   - Sticky output console header with dynamic elevation drop-shadow (`tokens.boxShadow.medium`) when scrolling.
   - "Powered by DataLab" deep-linking passing editor code and language in query parameters with full descriptive title and crawlable backlink metadata.
   - CodeMirror 6 code editor, split panes with custom resize handles, feedback banner, action bar, and terminal/output consoles.
   - Complete backward compatibility with legacy `<div data-datacamp-exercise>` attributes and options.

## Asset Resolution
- `src/config.ts` is the single source of truth: `assetBaseUrl` is `''` in dev
  (resolved against the dev-server origin, Vite serves `public/busybox.*`) and
  `https://cdn.datacamp.com/dcl/v4` in production, baked in at build time.
- `ShellSession.ts` injects `self.DCL_ASSET_BASE_URL` into the blob worker
  source; `shellWorkerSource.ts` resolves `busybox.js`/`busybox.wasm` against
  it (falling back to `location.origin` when unset).
- Pyodide/webR keep their fixed public CDNs (`cdn.jsdelivr.net`,
  `webr.r-wasm.org`); only BusyBox depends on `assetBaseUrl`.
- `.circleci/config.yml` deploys the secondary assets next to the bundles
  under `/dcl/v4/` and never touches the root `/dcl-react.js.gz` entrypoint.

## Rollout & CI Release Strategy

See [`LEGACY_ASSETS_MANIFEST.md`](./LEGACY_ASSETS_MANIFEST.md) for the exact checksums, sizes, and restoration commands for all historical CDN files.

### Entrypoints & CDN Paths
- **Primary Legacy Target**: `https://cdn.datacamp.com/dcl-react.js.gz` (highest active traffic).
- **Phase 1 (Initial v4 Release — Non-Breaking)**:
  - Deploy the v4 WASM bundle to dedicated endpoints (`https://cdn.datacamp.com/dcl/v4/dcl-react.js.gz`, `https://cdn.datacamp.com/dcl-react-v4.js.gz`).
  - Do **not** overwrite the root `/dcl-react.js.gz` yet to avoid breaking active embeds during initial testing.
- **Phase 2 (Legacy Archival)**:
  - Copy and preserve the existing server-backed v2/v3 bundle under an explicit archival URL (e.g. `dcl/v3/prod/dcl-react.js.gz`).
- **Phase 3 (Primary Cutover)**:
  - Promote v4 WASM to the main `/dcl-react.js.gz` entrypoint.

## Remaining Items & Roadmap
- **Shared Worker Pool**: Reuse runtime workers across multiple exercises on a single page to reduce memory and download overhead.
