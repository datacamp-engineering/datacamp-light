# DataCamp Light: Shell & WebAssembly Architecture Decisions

## 1. Executive Summary

DataCamp Light requires in-browser Shell evaluation that supports interactive exercises (variables, pipelines, command substitution, loops, condition testing, and POSIX text utilities like `awk`, `sed`, `grep`, `sort`, `wc`, `bc`, `diff`, and `cut`).

This document records the architectural pathways explored, the technical limitations of POSIX shells in WebAssembly environments, and the canonical implementation strategy.

---

## 2. Core Constraints

1. **Zero Special Server Headers (No COOP/COEP / No SharedArrayBuffer requirement)**:
   - DataCamp Light embeds via `<script>` tags on third-party sites (`learnpython.org`, `learnshell.org`, partner documentation).
   - Any runtime requiring Cross-Origin Isolation (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`) is incompatible with third-party iframe/script embeds.
2. **Zero Fragile JS Emulation**:
   - Do not maintain custom regex/string parsing in JavaScript for shell semantics (variable expansion, subshell isolation, globbing, arithmetic).
3. **Reproducibility**:
   - All WebAssembly compilation steps must be fully scripted and reproducible via containerized Docker environments.

---

## 3. Explored Architecture Pathways & Limitations

### Pathway 1: Native BusyBox C Shells (`ash` / `hush`) in WebAssembly
- **Exploration**:
  Attempted to compile BusyBox with `ash` (`CONFIG_SH_IS_ASH=y`) and `hush` (`CONFIG_SH_IS_HUSH=y`) via Emscripten.
- **Encountered Limitations**:
  1. *`CONFIG_NOMMU=y` vs `ash`*: BusyBox's Kconfig automatically excludes `ash` when `NOMMU=y`. Disabling `NOMMU` causes the build system to include Linux-specific console headers (`<linux/kd.h>`, `<linux/capability.h>`) that do not exist in Emscripten's libc.
  2. *POSIX `vfork()` / `fork()` in WebAssembly*: In single-threaded WebAssembly, executing sub-commands, pipelines (`cmd1 | cmd2`), or command substitutions (`$(cmd)`) triggers `xvfork()`. This fails at runtime with:
     ```
     sh: vfork: Function not implemented
     ```
  3. *Process Isolation*: Open-source experiments attempting BusyBox shell in browsers (`tbfleming/em-shell`) required multiple Web Workers communicating synchronously over HTTP/XHR with a Service Worker backplane, and still could not support interactive pipelines or background jobs.

---

### Pathway 2: Prebuilt Shell WASM Packages (`@cowasm/dash`, `@ag-bash/bash`)
- **Exploration**:
  Investigated pre-existing NPM packages providing WebAssembly shells.
- **Encountered Limitations**:
  1. `@cowasm/dash`: Relies on `@cowasm/kernel`, which requires `SharedArrayBuffer` / Service Worker shared memory.
  2. `@ag-bash/bash`: 30 MB bundle footprint intended for Node.js AI agent sandboxes, unsuitable for lightweight web embedding.
  3. `sh-syntax`: Exports only AST parsing (`parse`) and formatting (`print`), without exposing the execution engine (`interp.Runner`).

---

### Pathway 3: Pure JS AST Visitor (`bash-parser`)
- **Exploration**:
  Built an AST visitor in JavaScript over `bash-parser` output, delegating commands to BusyBox WASM `callMain()`.
- **Encountered Limitations**:
  1. `bash-parser` is only a syntax parser, not an evaluator.
  2. Evaluating Bash-specific semantics (`${VAR/pat/repl}`, `${#arr[@]}`, array indexing, string slicing `${VAR:1:3}`) forced the visitor to grow into hundreds of lines of ad-hoc regex and string surgery.

---

## 4. Final Chosen Architecture: Two-Tier Evaluation Model

To achieve complete Bash compatibility with zero ad-hoc JS regex maintenance and a resilient fallback:

```
                                  runScript(script)
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
       [Primary: WASM Active]                         [Fallback: Pure JS]
       sh-runner.wasm (mvdan/sh)                    Clean ~200-Line Visitor
                 │                                               │
                 ▼ (ExecHandler)                                 ▼ (Builtins)
       BusyBox WASM (callMain)                         Pure JS in-memory VFS
       (sed, awk, grep, bc, etc.)                      (basic echo, ls, cd, pwd)
```

### 1. Primary Engine: `sh-runner.wasm` (`mvdan/sh` WASM Bridge)
- **Engine**: Standalone Go binary compiled from `mvdan.cc/sh/v3/interp` with `GOOS=js GOARCH=wasm` (~350 kB gzipped).
- **Execution**: Runs in-process without OS forks. Evaluates 100% of standard Bash syntax, parameter expansions, arithmetic, subshells, and loops.
- **Dispatcher**: When `interp.Runner` executes a command (`grep`, `sed`, `awk`, `sort`, `bc`, etc.), its `ExecHandler` invokes `busybox.callMain([cmd, ...args])` on the shared Virtual File System.
- **Pip Interceptor**: Intercepts `pip install` to install packages directly into Pyodide.

### 2. Fallback Engine: Clean ~200-Line AST Visitor
- **Engine**: Streamlined POSIX AST visitor for unit tests, offline environments, or non-WASM fallbacks.
- **Scope**: Evaluates basic command lists, pipelines, and standard `$VAR` substitution without hand-rolled regexes.
