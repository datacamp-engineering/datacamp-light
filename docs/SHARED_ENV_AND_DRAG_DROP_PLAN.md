# Technical Architecture & Implementation Plan: Unified Python + Shell Shared Environment & File Drag-and-Drop

## 1. Executive Summary & Goals

DataCamp Light interactive courses and embedding sites frequently require workflows where:
1. **Python and Shell share a single execution environment**: A Python script produces data files (`data.csv`, `model.pkl`) that a learner inspects, filters, and manipulates via bash utilities in a terminal (`grep`, `awk`, `cat`, `ls`), or vice-versa, sharing working directory and state.
2. **File Drag-and-Drop to Virtual Filesystem**: Learners or instructors can drag local files (`.csv`, `.tsv`, `.txt`, `.json`, `.py`, `.parquet`, `.png`) directly onto any DataCamp Light widget, storing them in the active runtime's virtual filesystem (`cwd`) so they are immediately accessible in code without server uploads.

This plan details the technical architecture, JSON-RPC protocols, session pool coordination, and UI components to implement both capabilities.

---

## 2. Unified Python + Shell Shared Environment Architecture

```
┌──────────────────────────────────────────────┐     ┌──────────────────────────────────────────────┐
│           Python Exercise Widget             │     │            Shell Exercise Widget             │
│    (CodeEditor, Plots, OutputConsole)        │     │         (Interactive TerminalConsole)        │
└──────────────────────┬───────────────────────┘     └──────────────────────┬───────────────────────┘
                       │                                                    │
                       │   data-shared-environment="workspace-1"            │
                       └──────────────────────────┬─────────────────────────┘
                                                  │
                                                  ▼
                               ┌────────────────────────────────────┐
                               │        Shared Session Pool         │
                               │ (`sessionPool.ts:workspace-1`)     │
                               │  • Order-Independent Resolution   │
                               │  • Scoped Output Multiplexing      │
                               └──────────────────┬─────────────────┘
                                                  │
                                                  ▼
                               ┌────────────────────────────────────┐
                               │   Unified Pyodide Web Worker       │
                               ├────────────────────────────────────┤
                               │  • Pyodide Python Engine           │
                               │  • Embedded BusyBox WASM Runner    │
                               │  • Shared Emscripten POSIX MEMFS   │
                               │  • JSON-RPC: runCode & runCommand  │
                               └────────────────────────────────────┘
```

### 2.1 Virtual Filesystem Co-Location
In WebAssembly environments, Pyodide and BusyBox WASM both execute on top of Emscripten's in-memory POSIX Virtual Filesystem (`MEMFS`):
* Pyodide mounts `/home/pyodide` as its working directory.
* `activeShell` in `pyodideWorker.ts` uses `createEmscriptenVfs(pyodide)`, adapting `pyodide.FS` to `IShellVfs`.
* Both runtimes read and write the exact same memory buffers at `/home/pyodide`.

### 2.2 Order-Independent Session Pool Resolution (`sessionPool.ts`)
When `acquireSession(language, sharedEnvironmentId)` is called:
1. **DOM Pre-Scan**: `sessionPool` scans the document (`document.querySelectorAll('[data-datacamp-exercise]')`) to see if any exercise sharing `environmentId` requires Python.
2. **Worker Selection**:
   * If any exercise in the group is `python`, the shared pool instantiates the **Unified Pyodide Worker** (`createWasmSession()`).
   * If all exercises in the group are `shell`, the shared pool instantiates the lightweight **BusyBox Shell Worker** (`createShellSession()`, ~350 kB).
3. **Scroll & Lazy Load Independent**: Regardless of which widget mounts first or is scrolled into view first, the shared environment boots the unified engine seamlessly.

### 2.3 JSON-RPC Method Handling in `pyodideWorker.ts`

| Method | Initiator | Worker Execution Logic |
| :--- | :--- | :--- |
| `runCode` | Python Widget | Transformed via `dcl_transform_ipython`, executed via `exercise.run_code()`, streams outputs/plots. |
| `submitCode` (Python) | Python Widget | Evaluated via `exercise.run_submit()`, runs Python SCT (`pythonwhat`). |
| `runCommand` | Shell Widget | Executed directly via `activeShell.runCommand(command)`, returns `{ output, error, cwd }`. |
| `submitCode` (Shell) | Shell Widget | Evaluated via `evaluate_shellwhat` in Python, grading the typed shell command history. |
| `introspect` (Python) | Python Editor | Evaluates `dcl_introspect` on Python globals and static AST. |
| `introspect` (Shell) | Shell Terminal | Evaluates `getShellVfsCompletions` on `activeShell.getVfs()` and `/bin` binaries. |

---

## 3. Virtual Filesystem File Drag-and-Drop Architecture

```
                                  USER DRAGS LOCAL FILE(S)
                                 (e.g., sales.csv, model.pkl)
                                              │
                                              ▼
                               ┌─────────────────────────────┐
                               │   DCLWidgetShell DropZone   │
                               │  (dragover / dragleave /    │
                               │   drop event handling)      │
                               └──────────────┬──────────────┘
                                              │
                                              ▼
                               ┌─────────────────────────────┐
                               │      FileReader Engine      │
                               │ • Reads Binary (ArrayBuffer)│
                               │ • Reads Text (UTF-8 string) │
                               └──────────────┬──────────────┘
                                              │
                                              ▼
                               ┌─────────────────────────────┐
                               │  `session.writeFile()` RPC  │
                               │   { path: "sales.csv",      │
                               │     data: Uint8Array }      │
                               └──────────────┬──────────────┘
                                              │
                   ┌──────────────────────────┴──────────────────────────┐
                   ▼                                                     ▼
        ┌─────────────────────┐                               ┌─────────────────────┐
        │    Pyodide MEMFS    │                               │     webR MEMFS      │
        │ `pyodide.FS.write`  │                               │ `webR.FS.writeFile` │
        └─────────────────────┘                               └─────────────────────┘
```

### 3.1 JSON-RPC File Protocol (`src/jsonrpc/types.ts`)
```typescript
export interface IWriteFileParams {
  path: string;
  data: string | ArrayBuffer | Uint8Array;
}

export interface IWriteFileResult {
  path: string;
  bytesWritten: number;
}
```

### 3.2 Runtime VFS Adaptors
* **Pyodide (`pyodideWorker.ts`)**:
  ```typescript
  if (method === 'writeFile') {
    const { path, data } = params;
    const resolvedPath = path.startsWith('/') ? path : `/home/pyodide/${path}`;
    const uint8Array = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    pyodide.FS.writeFile(resolvedPath, uint8Array);
    self.postMessage({ jsonrpc: '2.0', id, result: { path: resolvedPath, bytesWritten: uint8Array.length } });
  }
  ```
* **Shell (`shellWorker.ts` / `shellInterpreter.ts`)**:
  Writes directly to `activeShell.getVfs().writeFile(path, content)`.
* **R (`RWebRSession.ts`)**:
  Writes to `webR.FS.writeFile(path, new Uint8Array(data))`.
* **SQL (`DuckDbSession.ts`)**:
  Registers with `db.registerFileBuffer(path, new Uint8Array(data))`.

### 3.3 DropZone Component & UI Feedback (`src/components/DropZoneOverlay.tsx`)
* **Visual Styling**:
  * Semi-transparent overlay (`theme.blue.transparent` / `theme.background.overlay`) using Waffles tokens.
  * Dashed border (`2px dashed theme.blue.main`) with centered cloud upload icon and text: *"Drop files here to upload to current working directory"*.
* **Status Feedback**:
  * Emits notification to the active console: `[VFS] Uploaded sales.csv (42.5 kB) to /home/pyodide/`.
  * Triggers immediate `<tab>` path autocompletion update in both editor and terminal.

---

## 4. Phased Implementation Roadmap

### Phase 1: Virtual Filesystem File RPC Bridge
1. Add `writeFile` and `readFile` interfaces to `src/jsonrpc/types.ts` and `src/jsonrpc/session.ts`.
2. Implement `writeFile` handlers in `pyodideWorker.ts`, `shellWorker.ts`, and `RWebRSession.ts`.
3. Unit test file writing and reading across worker harnesses.

### Phase 2: Unified Python + Shell Session Pool
1. Add `runCommand` message handler and shell introspection routing to `pyodideWorker.ts`.
2. Update `sessionPool.ts` to detect cross-language shared environments and bind both to the unified Pyodide worker.
3. Verify that shell command execution and Python AST execution run against the same VFS in Node runtime tests.

### Phase 3: Drag-and-Drop UI Integration
1. Create `src/components/DropZoneOverlay.tsx` with light and dark theme adaptation.
2. Integrate drag-and-drop listener into `DCLWidgetShell.tsx` and `CodeEditor.tsx`.
3. Wire `file.arrayBuffer()` conversion and `session.writeFile()` call with console feedback messages.

### Phase 4: Integration Testing & Verification
1. Add unit tests for `sessionPool` with cross-language shared environments (`python` + `shell`).
2. Add end-to-end integration test in `scripts/test-wasm-runtime.mjs` verifying:
   * Python creates file $\rightarrow$ Shell terminal reads/edits file.
   * Shell terminal creates file $\rightarrow$ Python pandas reads file.
   * Drag-and-drop file upload loads into VFS and becomes available in both.

---

## 5. Verification Gates

1. **Typecheck**: `npm run typecheck` (`tsc --noEmit`)
2. **Unit Tests**: `npm test` (all 25+ Vitest suites)
3. **WASM Runtime Integration**: `npm run test:runtime` (`scripts/test-wasm-runtime.mjs`)
4. **External Tutorial Compatibility**: `npm run test:external` (`scripts/audit-external-tutorials.mjs`)
5. **Production Build**: `npm run build` (Vite UMD + ESM + CSS)
