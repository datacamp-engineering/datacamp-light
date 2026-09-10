# Shared Environment: Execution Model & Virtual Filesystem

## 1. Overview

DataCamp Light v4 supports multi-widget workflows where:
1. **Python and Shell share a single execution environment**: A Python script produces data files (`data.csv`, `model.pkl`) that a learner inspects, filters, and manipulates via bash utilities in a terminal (`grep`, `awk`, `cat`, `ls`), or vice-versa, sharing working directory and state.
2. **File Drag-and-Drop to Virtual Filesystem**: Learners or instructors can drag local files (`.csv`, `.tsv`, `.txt`, `.json`, `.py`, `.parquet`, `.png`) directly onto any DataCamp Light widget, storing them in the active runtime's virtual filesystem (`cwd`) so they are immediately accessible in code without server uploads.
3. **Shared graded exercises run in isolation**: widgets marked with the same `data-shared-environment` reuse one runtime (memory, packages, pythonwhat) and one filesystem, but every exercise's Run and Submit operate against its own pre-exercise code, solution, and SCT — matching the per-exercise isolation of the server-side backend.

```
┌──────────────────────────────────────────────┐     ┌────────────────────────────────────┐
│           Python Exercise Widget             │     │        Shell Exercise Widget       │
│    (CodeEditor, Plots, OutputConsole)        │     │     (Interactive TerminalConsole)  │
└──────────────────────┬───────────────────────┘     └──────────────┬─────────────────────┘
                       │                                            │
                       │   data-shared-environment="workspace-1"    │
                       └──────────────────────────┬─────────────────┘
                                                  │
                                                  ▼
                               ┌────────────────────────────────────┐
                               │        Shared Session Pool         │
                               │  (sessionPool.ts: "workspace-1")   │
                               │  • One worker per environment      │
                               │  • Scope context replay on switch  │
                               │  • Serialized execution chain      │
                               │  • Scoped output multiplexing      │
                               └──────────────────┬─────────────────┘
                                                  │
                                                  ▼
                               ┌────────────────────────────────────┐
                               │    Unified Pyodide Web Worker      │
                               ├────────────────────────────────────┤
                               │  • Pyodide Python Engine           │
                               │  • Embedded BusyBox WASM Runner    │
                               │  • Shared Emscripten POSIX MEMFS   │
                               │  • JSON-RPC: runCode & runCommand  │
                               └────────────────────────────────────┘
```

---

## 2. Virtual Filesystem Co-Location

Pyodide and BusyBox WASM both execute on top of Emscripten's in-memory POSIX Virtual Filesystem (`MEMFS`):
* Pyodide mounts `/home/repl` as its working directory.
* `activeShell` in `pyodideWorker.ts` uses `createEmscriptenVfs(pyodide)`, adapting `pyodide.FS` to `IShellVfs`.
* Both runtimes read and write the exact same memory buffers, so files produced by a Python exercise's Run or Submit are immediately visible to Shell widgets (and vice versa).

---

## 3. Session Pooling & Scopes (`src/runtime/sessionPool.ts`)

When `acquireSession(language, sharedEnvironmentId)` is called:

1. **Non-shared** widgets (no `data-shared-environment`) get a dedicated session and never enter the pool.
2. **Shared** environments are keyed by a pool key (`<runtime>:<environmentId>`). Shell exercises are bound to the unified Pyodide+BusyBox worker that Python exercises in that environment use, so cross-language widgets share a single virtual filesystem regardless of which language mounts first. R stays partitioned (main-thread webR runtime).
3. Every pooled acquisition returns a **`ScopedSession`**: a per-widget wrapper over the shared root session. All state-bearing RPCs (`initialize` / `runCode` / `submitCode`) must flow through the scoped wrapper — it owns the context replay (section 4), the `activeScope` output bracket, and the execution chain. `runCommand` / `writeFile` / `readFile` / `introspect` operate on worker-wide shared state (activeShell, Emscripten FS, `__main__` globals) and bypass the replay.

---

## 4. Exercise Context Ownership & the Replay Rule

The worker keeps a single `PyodideExercise` singleton (`pyodideWorker.ts`). The `pyodide_backend` package (v1.6.6) isolates each exercise's console state in its own interactive namespace, and grading is fully self-contained per submission (`run_submit` executes `[pec, learner code]` in a fresh process and compares against `[pec, solution]`). Consequently:

* **Grading never depends on other widgets' state** — it depends only on the `(pec, solution, sct)` of the *submitting* exercise.
* The singleton must therefore always hold **the interacting widget's own context**, or grading runs against the wrong exercise.

The pool enforces this with **context replay**:

1. Each scope captures its `initialize` params (recorded on initialize success).
2. Before a state-bearing RPC from scope X, if the worker's exercise belongs to a different scope, the pool replays `initialize` with X's captured params. The worker reconstructs the exercise with X's own pre-exercise code, solution, and SCT.
3. Replays are **python-runtime scopes only**: the shell grading branch re-runs its own pec and never reads the exercise singleton, and R has no per-instance exercise at all. Replaying a shell initialize would reconstruct a bogus Python exercise; replaying for R would only re-execute pec side effects.
4. Scopes that never initialized (e.g. the internal shared shellwhat evaluator, which only submits shell exercises) dispatch without replay; interactions queue behind an in-flight initialize rather than racing it.
5. A failed replay rejects the acting RPC and leaves the cache untouched — the next interaction retries the initialize, so transient failures (network hiccup during a package install) self-heal without a page reload.

---

## 5. Execution Flows by Scenario

### 5.1 Single graded widget (non-shared) — byte-identical to the pre-replay behavior

```
mount      → initialize(pec, solution, sct) → worker builds the exercise, runs pec
Run        → runCode(code) → exercise.run_code → output/plots to this widget's console
Submit     → submitCode(code, sct, pec, solution) → run_submit → grade against own solution
```

Non-shared sessions bypass the pool entirely; no replay bookkeeping exists on their path.

### 5.2 Shared environment, narrative widgets only

Narrative widgets carry no `{pec, solution, sct}` context: their `initialize` clears the worker's exercise, and their Run takes the plain runner, which executes into the worker-wide `__main__` globals.

```
initialize(N1) → exercise = null
run N1         → _dcl_run_plain_code → __main__ globals
initialize(N2) → exercise = null (replay or mount initialize)
run N2         → _dcl_run_plain_code → sees N1's variables (shared namespace)
```

This is the mechanism behind sequential tutorial blocks (e.g. learnpython.org chapters where later blocks use earlier blocks' variables).

### 5.3 Shared environment, graded widgets A and B

```
initialize(A) ──► exercise = Ex_A (run_init seeds pec_A into Ex_A's process)
initialize(B) ──► exercise = Ex_B (replaces Ex_A)
Run A          ──► pool replays initialize(A) → exercise = Ex_A → run_code → [pec_A, code_A]
Run B          ──► pool replays initialize(B) → exercise = Ex_B → run_code → [pec_B, code_B]
Submit A       ──► pool replays initialize(A) → run_submit → grades A against A's solution/sct
```

Without the replay rule, A's submission would grade against B's pec/solution/sct (the last-initialized widget). Run state is ephemeral per widget switch: re-initializing A gives A a fresh console process, so a widget's accumulated Run state is lost when the learner switches widgets — state flows through the filesystem (section 2) and narrative blocks (section 5.2), not through graded-exercise variables.

### 5.4 Mixed shared environment (narrative + graded)

Both directions are repaired by the replay rule:
* Narrative initialize after a graded initialize clears the exercise, restoring the plain-runner semantics for narrative code (today: narrative code would execute inside the graded exercise's isolated process).
* Graded Run after a narrative initialize replays the graded context, so the Run is seeded with the graded widget's own pec (today: the Run would execute without pec).

### 5.5 Cross-language shared environment (Python ↔ Shell)

Shell widgets in a shared environment are bound to the unified worker (`runtimeLanguage: 'python'`), sharing the single `pyodide.FS`:

```
Python widget Run → open('data.csv', 'w') → pyodide.FS
Shell terminal    → cat data.csv | grep ... → busybox over the same pyodide.FS
```

Shell scopes never replay initialize (the shell grading branch is self-contained); shell `runCommand`/`writeFile`/`readFile` operate on the shared filesystem by design.

### 5.6 R widgets (main-thread webR)

R exercises run on the main thread in a shared `.GlobalEnv` with self-contained per-submission grading (the testwhat harness builds fresh student/solution environments per submission). There is no per-instance exercise to reconstruct, so replay does not apply to `r:` pool entries; behavior is unchanged.

---

## 6. Trade-offs & Known Residuals

* **Run state is ephemeral per widget switch**: re-initializing a scope gives it a fresh console process. Consecutive interactions with the same widget persist normally.
* **Replayed initialize re-runs pec side effects** (prints, pip installs, file writes, plots): duplicate `print` output and re-appended plots are suppressed during internal replays (`output`/`graph` notifications are dropped), but error entries still surface.
* **Internal replays do not flash status**: replays issue the raw `initialize` request rather than the lifecycle-managed wrapper, so the shared `starting` status is never broadcast to every widget of the environment.
* **Autocompletion introspection reflects the last-replayed exercise** (cosmetic): completions may surface the previously-active widget's variables. This matches pre-replay behavior and is not worsened.
* **Session status transitions are environment-wide** (all widgets observe `busy`/`ready`), inherited from the shared worker lifecycle.

---

## 7. JSON-RPC Method Dispatch in `pyodideWorker.ts`

| Method | Initiator | Worker Execution Logic |
| :--- | :--- | :--- |
| `runCode` | Python Widget | Transformed via `dcl_transform_ipython`, executed via `exercise.run_code()`, streams outputs/plots. |
| `submitCode` (Python) | Python Widget | Evaluated via `exercise.run_submit()`, runs Python SCT (`pythonwhat`). |
| `runCommand` | Shell Widget | Executed directly via `activeShell.runCommand(command)`, returns `{ output, error, cwd }`. |
| `submitCode` (Shell) | Shell Widget | Evaluated via `evaluate_shellwhat` in Python, grading the typed shell command history. |
| `introspect` (Python) | Python Editor | Evaluates `dcl_introspect` on Python globals and static AST. |
| `introspect` (Shell) | Shell Terminal | Evaluates `getShellVfsCompletions` on `activeShell.getVfs()` and `/bin` binaries. |
| `writeFile` / `readFile` | Drag-and-drop | Read/write the shared Emscripten filesystem. |