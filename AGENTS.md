# DataCamp Light v4

Client-side WebAssembly execution engine and embeddable interactive data science exercises for Python (Pyodide), R (webR), and Shell (BusyBox & Go WASM).

## Architecture

- `src/runtime/`: WebAssembly runtime engines, session pooling, and VFS adapters.
  - `workers/pyodideWorker.ts`: Dedicated worker running Pyodide with lazy-loaded pythonwhat, IPython magics, and Matplotlib SVG rendering.
  - `workers/shellWorker.ts`: Dedicated worker running BusyBox WASM applets + in-process Go sh-runner (`mvdan/sh`).
  - `RWebRSession.ts`: Client-side webR worker session with native `testwhat` evaluation harness.
  - `sessionPool.ts`: Order-independent multi-widget shared memory environment (`data-shared-environment="true"`).
  - `assetCache.ts`: Network request deduplication via native Cache API + Web Locks API (`dcl-wasm-cache-v1`).
  - `assetResolver.ts`: Multi-tier CDN asset candidate resolution for cross-origin embeds.
- `src/components/`: React exercise components themed with `@datacamp/waffles`.
  - `CodeEditor.tsx`: CodeMirror 6 editor with layered static/dynamic autocompletion.
  - `TerminalConsole.tsx`: xterm.js terminal emulation with custom Waffles color palette.
  - `DataCampExercise.tsx`: Main widget shell supporting code execution, SCT grading, AI explanation, and file drag-and-drop.
- `public/`: Pre-compiled WebAssembly binaries (`busybox.wasm`, `sh-runner.wasm`, `wasm_exec.js`).

## Commands

```bash
just setup          # Install dependencies (npm install)
just check          # Run typecheck and full production build
just fix            # Run typecheck auto-checks
just test           # Run unit tests, WASM integration tests, and external tutorial audits
just test-unit      # Run Vitest unit tests only (npm test)
just test-wasm      # Run WebAssembly & Python runtime integration tests
just test-external  # Run external tutorial audit (learnpython.org & learnshell.org)
just test-network   # Run live HTTP network footprint audit (Brotli/Gzip)
just dev            # Start local Vite development server
just serve          # Start local compressed static server (port 4173)
```

## Conventions

- **Main-Thread Isolation**: Zero global polyfill leakage (`window.process`, `window.fs`). Shims must be quarantined to worker scopes.
- **Zero Header Dependencies**: Runtimes must execute in single-threaded mode without `SharedArrayBuffer` or COOP/COEP header requirements.
- **Lazy Loading**: Unused language runtimes and test packages must remain deferred on demand.
