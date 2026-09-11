# Autocompletion Architecture: Static Catalogs & Dynamic Runtime Introspection

## 1. Overview & Objectives

DataCamp Light v4 provides layered autocompletion inside CodeMirror 6 (`@codemirror/autocomplete`) across all supported languages, styled with the `@datacamp/waffles` design system.

### Core Guarantees
1. **Zero Main-Thread Blocking**: Dynamic introspection runs in background Web Workers via JSON-RPC or asynchronous tasks. The editor UI remains responsive at 60 FPS under rapid typing.
2. **Layered Completion Model**: Instant (<5ms) synchronous static completions for keywords, builtins, and snippets, blended seamlessly with debounced (80ms) dynamic runtime introspection for live variables, data frame columns, and virtual filesystem paths.
3. **Resilient Fallback**: If a runtime worker is busy or uninitialized, the editor falls back gracefully to static linguistic completions without errors.
4. **Waffles Design System Fidelity**: Popovers and badges strictly use `@datacamp/waffles` tokens, supporting automatic dark/light theme switching.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CodeEditor.tsx (CM6)                                   │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              CompletionContext                                  │   │
│   │   • pos: number                                • explicit: boolean              │   │
│   │   • state: EditorState                         • aborted: boolean               │   │
│   │   • matchBefore(regex): {from, to, text}       • AbortSignal                    │   │
│   └────────────────────────────────────────┬────────────────────────────────────────┘   │
│                                            │                                            │
│                                            ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                       Layered Completion Orchestrator                           │   │
│   │                                                                                 │   │
│   │   ┌──────────────────────────────┐          ┌───────────────────────────────┐   │   │
│   │   │   Static Completion Engine   │          │  Dynamic Runtime Introspector │   │   │
│   │   │  (Instant keywords, builtins,│          │  (Async Worker JSON-RPC with  │   │   │
│   │   │   snippets, library symbols) │          │   debouncing & abort token)   │   │   │
│   │   └──────────────┬───────────────┘          └───────────────┬───────────────┘   │   │
│   │                  │                                          │                   │   │
│   │                  └────────────────────┬─────────────────────┘                   │   │
│   │                                       ▼                                         │   │
│   │                        Fuzzy Matcher & Rank Normalizer                          │   │
│   │                         (Deduplication + Boost Logic)                           │   │
│   └───────────────────────────────────────┬─────────────────────────────────────────┘   │
│                                           │                                             │
│                                           ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                           Waffles-Themed Popup UI                               │   │
│   │    • .cm-tooltip-autocomplete (Floating popover with dark/light theme tokens)   │   │
│   │    • .cm-completionList (Virtual scrolling list with type badges)               │   │
│   │    • .cm-completionInfo (Docstring & signature sidecar popover)                 │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Language Support Matrix

| Language | Static Catalog | Dynamic Introspection | Member / Trigger Characters |
| :--- | :--- | :--- | :--- |
| **Python** | Full keywords, builtins, and library snippets (`pandas`, `numpy`, `matplotlib`, `seaborn`) | Live `dir()` and `inspect` on `__main__` namespace via Pyodide Worker | `.` (e.g. `df.`, `np.`) |
| **R** | Core keywords, base functions, tidyverse pipes (`%>%`, `\|>`), and plotting | Live `.GlobalEnv` search and `.DollarNames` evaluation via webR | `$` and `.` (e.g. `df$`, `model.`) |
| **Shell** | POSIX coreutils commands (`ls`, `grep`, `awk`, `sed`, `sort`, `wc`, etc.) and control flow | Live in-memory VFS path resolution (`getShellVfsCompletions`) | `Tab` in the xterm console |
| **SQL** | ANSI SQL & PostgreSQL keywords (`SELECT`, `FROM`, `WHERE`, `GROUP BY`, `JOIN`, etc.) | Static document CTE/table extraction (runtime execution is planned for a future release) | `.` |

---

## 4. Implementation Structure (`src/components/autocomplete/`)

* **`autocompleteExtension.ts`**: Main entrypoint creating the CodeMirror 6 extension with word and prefix token extractors, language normalizer, and cancellation signals.
* **`staticCatalogs.ts`**: Pre-indexed static templates, snippet templates, document symbol extraction (functions, classes, assignments in open file), and documentation sidecar builders.
* **`dynamicIntrospection.ts`**: Debounces queries (80ms), wraps worker JSON-RPC requests with abort controllers and timeouts (1000ms), and normalizes returned items into completion snippets.
* **`completionPresentation.ts`**: Renders Waffles-styled completion info cards, signature banners, parameter listings, and example blocks.
* **`lazyAutocomplete.ts`**: Defers loading completion catalogs until the editor gains focus or autocompletion is triggered.

---

## 5. UI & UX Theming (`@datacamp/waffles`)

* **Popover Background**: Uses `theme.background.secondary` (dark: `#1f242e`) and `theme.background.main` (light: `#ffffff`).
* **Matched Query Text**: High-contrast highlight matching query input.
* **Type Badges**:
  * `keyword`: Purple
  * `function` / `method`: Blue
  * `variable` / `constant`: Primary text color
  * `class` / `type`: Green
  * `table` / `column`: Orange / Green
  * `file` / `dir`: Yellow
* **Keyboard Navigation**:
  * `Enter` / `Tab`: Apply selected completion.
  * `ArrowUp` / `ArrowDown`: Move selection.
  * `Escape`: Dismiss tooltip.
  * `Ctrl+Space` / `Cmd+Space`: Explicit trigger.
