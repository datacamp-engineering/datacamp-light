# Architecture & Implementation Plan: Static and Dynamic Autocompletion for DataCamp Light v4 (CodeMirror 6)

## 1. Executive Summary & Objectives

DataCamp Light v4 provides client-side WebAssembly execution for interactive data science education across four primary language environments: **Python (Pyodide)**, **R (webR)**, **Shell (BusyBox WASM)**, and **SQL (DuckDB-wasm)**.

To deliver an IDE-grade learning experience inside compact embeddable widgets without requiring external LSP servers or remote language backends, this document specifies the complete architecture, UI design, runtime introspection protocol, and phased rollout for **Static and Dynamic Autocompletion**.

### Core Performance & Architectural Guarantees
1. **Zero Main-Thread Blocking**: All dynamic evaluation and introspection runs inside isolated Web Workers (Pyodide, webR, BusyBox, DuckDB) or asynchronous micro-tasks. The CodeMirror UI thread remains locked at 60 FPS under rapid typing.
2. **Layered Completion Model**: Instant (<5ms) synchronous static completion for keywords, builtins, and idioms, blended seamlessly with debounced (<80ms) dynamic runtime introspection for live memory namespaces, active variables, data frame columns, virtual filesystems, and relational tables.
3. **Waffles Design System Fidelity**: Full visual and ergonomic integration with `@datacamp/waffles` tokens, dark/light mode switches, responsive detail popovers, and keyboard navigation.
4. **Resilient Fallback**: If a runtime is uninitialized, executing a long-running computation, or encountering syntax errors, the editor falls back gracefully to static linguistic completions without throwing errors or breaking user flow.

---

## 2. CodeMirror 6 Autocomplete Architecture

CodeMirror 6 (`@codemirror/autocomplete`) provides an asynchronous, functional, and extension-driven autocompletion engine built on top of immutable state transactions and view plugins.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CodeEditor.tsx (CM6)                                   │
│                                                                                         │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                              CompletionContext                                  │   │
│   │   • pos: number                                • explicit: boolean              │   │
│   │   • state: EditorState                         • aborted: boolean               │   │
│   │   • matchBefore(regex): {from, to, text}       • addEventListener('abort', cb)  │   │
│   └────────────────────────────────────────┬────────────────────────────────────────┘   │
│                                            │                                            │
│                                            ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │                          Layered Completion Orchestrator                        │   │
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

### 2.1 Core CM6 Autocomplete Primitives

* **`Completion`**: The fundamental completion item object:
  ```typescript
  export interface Completion {
    label: string;
    type?: 'keyword' | 'function' | 'variable' | 'class' | 'constant' | 'property' | 'type' | 'text' | 'table' | 'column' | 'file';
    detail?: string;
    info?: string | ((completion: Completion) => Promise<HTMLElement | string> | HTMLElement | string);
    apply?: string | ((view: EditorView, completion: Completion, from: number, to: number) => void);
    boost?: number;
  }
  ```
* **`CompletionContext`**: Represents the editor state at the moment autocompletion is triggered:
  * `pos`: Cursor offset in UTF-16 code units.
  * `explicit`: True if triggered via explicit keyboard shortcut (`Ctrl+Space`, `Cmd+Space`, or `Tab`), false if triggered automatically on character keystrokes.
  * `aborted`: Boolean flag set to `true` if a newer keystroke or state update supersedes this query.
  * `matchBefore(regexp: RegExp)`: Matches the token immediately preceding the cursor to compute replacement bounds (`from`, `to`).
* **`CompletionResult`**: The response structure returned by a `CompletionSource`:
  * `from`: Starting position of the token to replace.
  * `to`: Ending position of the token (defaults to cursor `pos`).
  * `options`: Array of `Completion` items.
  * `validFor`: Regular expression or predicate specifying whether the result set can be filtered client-side during continuous typing without issuing new asynchronous queries.
  * `filter`: Boolean indicating whether CodeMirror should apply its built-in fuzzy filter to `options`.
* **`autocompletion(config)` Extension Configuration**:
  ```typescript
  import { autocompletion } from '@codemirror/autocomplete';

  export const createEditorAutocompleteExtension = (source: CompletionSource) =>
    autocompletion({
      override: [source],
      activateOnTyping: true,
      maxRenderedOptions: 50,
      defaultKeymap: false, // We bind custom Waffles keyboard bindings
      icons: true,
      tooltipClass: () => 'dcl-autocomplete-tooltip',
    });
  ```

### 2.2 Integration into `CodeEditor.tsx`

`CodeEditor.tsx` integrates the autocomplete subsystem via CodeMirror 6 `Compartment` instances or initialized extension arrays:

```typescript
// src/components/CodeEditor.tsx
import { Compartment } from '@codemirror/state';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { createLanguageCompletionSource } from '../autocomplete/completionSource';

const autocompleteCompartment = new Compartment();

// Inside CodeEditor initialization:
const startState = EditorState.create({
  doc: code,
  extensions: [
    basicSetup,
    getLanguageExtension(language),
    autocompleteCompartment.of(
      autocompletion({
        override: [createLanguageCompletionSource(language, sessionRef)],
        activateOnTyping: true,
      }),
    ),
    keymap.of([...completionKeymap, indentWithTab]),
    dcEditorTheme,
    dcHighlightStyle,
    // ...
  ],
});
```

---

## 3. Static Autocompletion Catalog per Language

Static completions are pre-indexed in memory and organized into lexicons with boost tiers:
* **Tier 1 (Boost 90–99)**: Language keywords and structural control flow (matching current prefix).
* **Tier 2 (Boost 70–89)**: Standard library builtins and core language utilities.
* **Tier 3 (Boost 50–69)**: Popular data science libraries, idiom snippets, and pipes.

### 3.1 Python Catalog (`src/autocomplete/static/python.ts`)

#### 1. Language Keywords (Snippetized)
| Keyword | Type | Completion Label | Snippet Template (`apply`) | Detail |
|---|---|---|---|---|
| `def` | `keyword` | `def` | `def ${1:name}(${2:params}):\n    ${3:pass}` | Function definition |
| `class` | `keyword` | `class` | `class ${1:ClassName}:\n    def __init__(self, ${2:args}):\n        ${3:pass}` | Class definition |
| `import` | `keyword` | `import` | `import ${1:module}` | Module import |
| `from` | `keyword` | `from ... import` | `from ${1:module} import ${2:symbol}` | Selective import |
| `return` | `keyword` | `return` | `return ${1:value}` | Return statement |
| `with` | `keyword` | `with` | `with ${1:expr} as ${2:var}:\n    ${3:pass}` | Context manager |
| `for` | `keyword` | `for ... in` | `for ${1:item} in ${2:iterable}:\n    ${3:pass}` | For loop |
| `if` | `keyword` | `if` | `if ${1:condition}:\n    ${2:pass}` | Conditional statement |
| `elif` | `keyword` | `elif` | `elif ${1:condition}:\n    ${2:pass}` | Else-if branch |
| `else` | `keyword` | `else` | `else:\n    ${1:pass}` | Else branch |
| `try` | `keyword` | `try ... except` | `try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:e}:\n    ${4:pass}` | Exception handler |
| `lambda` | `keyword` | `lambda` | `lambda ${1:x}: ${2:x}` | Anonymous function |
| `yield` | `keyword` | `yield` | `yield ${1:value}` | Generator yield |
| `async` / `await` | `keyword` | `async def` | `async def ${1:name}():\n    ${2:pass}` | Async coroutine |

#### 2. Builtins & Standard Functions
* `print(*values, sep=' ', end='\\n')`, `len(s)`, `range(stop) / range(start, stop, step)`, `enumerate(iterable, start=0)`, `zip(*iterables)`, `map(func, *iterables)`, `filter(func, iterable)`, `sum(iterable, /, start=0)`, `min(iterable)`, `max(iterable)`, `abs(x)`, `round(number, ndigits=None)`.
* Type constructors: `int()`, `float()`, `str()`, `bool()`, `list()`, `dict()`, `set()`, `tuple()`, `bytes()`.
* Introspection: `isinstance(obj, class_or_tuple)`, `issubclass(cls, class_or_tuple)`, `type(obj)`, `id(obj)`, `repr(obj)`, `getattr(obj, name)`, `setattr(obj, name, val)`, `hasattr(obj, name)`.

#### 3. Data Science Packages (NumPy, Pandas, Matplotlib, Seaborn)
* **NumPy (`np`)**:
  * `np.array(${1:object})`, `np.zeros(${1:shape})`, `np.ones(${1:shape})`, `np.arange(${1:start}, ${2:stop}, ${3:step})`, `np.linspace(${1:start}, ${2:stop}, ${3:num})`, `np.mean(${1:a})`, `np.std(${1:a})`, `np.median(${1:a})`, `np.dot(${1:a}, ${2:b})`, `np.where(${1:condition}, ${2:x}, ${3:y})`, `np.random.randn(${1:d0}, ${2:d1})`.
* **Pandas (`pd`)**:
  * `pd.DataFrame(${1:data})`, `pd.Series(${1:data})`, `pd.read_csv(${1:'filename.csv'})`, `pd.read_parquet(${1:'file.parquet'})`, `pd.concat([${1:dfs}])`, `pd.merge(${1:left}, ${2:right}, on='${3:key}')`.
  * DataFrame methods: `.head(${1:5})`, `.tail(${1:5})`, `.describe()`, `.info()`, `.groupby('${1:column}')`, `.dropna()`, `.fillna(${1:value})`, `.iloc[${1:rows}, ${2:cols}]`, `.loc[${1:rows}, ${2:cols}]`, `.apply(${1:func})`, `.value_counts()`.
* **Matplotlib / Seaborn (`plt`, `sns`)**:
  * `plt.plot(${1:x}, ${2:y})`, `plt.scatter(${1:x}, ${2:y})`, `plt.hist(${1:x}, bins=${2:10})`, `plt.xlabel('${1:label}')`, `plt.ylabel('${1:label}')`, `plt.title('${1:title}')`, `plt.legend()`, `plt.show()`, `plt.figure(figsize=(${1:8}, ${2:6}))`.
  * `sns.lineplot(data=${1:df}, x='${2:x}', y='${3:y}')`, `sns.barplot(...)`, `sns.heatmap(data=${1:df})`.

---

### 3.2 R Catalog (`src/autocomplete/static/r.ts`)

#### 1. Language Keywords & Control Flow
| Keyword | Type | Completion Label | Snippet Template | Detail |
|---|---|---|---|---|
| `function` | `keyword` | `function` | `function(${1:params}) {\n  ${2:body}\n}` | Function definition |
| `library` | `keyword` | `library` | `library(${1:package})` | Load package |
| `if` / `else` | `keyword` | `if (...)` | `if (${1:condition}) {\n  ${2:code}\n} else {\n  ${3:code}\n}` | Conditional branch |
| `for` | `keyword` | `for (...)` | `for (${1:i} in ${2:sequence}) {\n  ${3:body}\n}` | For loop |
| `while` | `keyword` | `while (...)` | `while (${1:condition}) {\n  ${2:body}\n}` | While loop |
| `return` | `keyword` | `return` | `return(${1:value})` | Return value |

#### 2. Base R Builtins & Statistics
* Structure & creation: `c(${1:args})`, `data.frame(${1:args})`, `matrix(${1:data}, nrow=${2:r}, ncol=${3:c})`, `list(${1:args})`, `factor(${1:x})`, `seq(${1:from}, ${2:to}, by=${3:1})`, `rep(${1:x}, times=${2:2})`.
* Statistical functions: `summary(${1:object})`, `mean(${1:x}, na.rm=TRUE)`, `sd(${1:x}, na.rm=TRUE)`, `median(${1:x})`, `var(${1:x})`, `sum(${1:x})`, `min(${1:x})`, `max(${1:x})`, `quantile(${1:x})`, `cor(${1:x}, ${2:y})`, `lm(${1:formula}, data=${2:df})`, `t.test(${1:x})`.
* Inspection: `head(${1:x})`, `tail(${1:x})`, `str(${1:object})`, `dim(${1:x})`, `nrow(${1:x})`, `ncol(${1:x})`, `names(${1:x})`, `colnames(${1:x})`, `rownames(${1:x})`, `class(${1:x})`, `is.na(${1:x})`.
* I/O & Transform: `read.csv('${1:file.csv}')`, `write.csv(${1:df}, '${2:file.csv}')`, `paste(${1:...}, sep=' ')`, `paste0(${1:...})`, `sprintf('${1:fmt}', ${2:val})`, `apply(${1:X}, ${2:MARGIN}, ${3:FUN})`, `lapply(${1:X}, ${2:FUN})`, `sapply(${1:X}, ${2:FUN})`.

#### 3. Tidyverse, ggplot2, & Pipe Operators
* **Pipes**: `%>%` (magrittr pipe), `|>` (native R 4.1+ pipe).
* **dplyr**: `select(${1:...})`, `filter(${1:condition})`, `mutate(${1:new_col} = ${2:expr})`, `group_by(${1:col})`, `summarize(${1:metric} = ${2:expr})`, `arrange(${1:col})`, `left_join(${1:y}, by = '${2:key}')`, `inner_join(${1:y}, by = '${2:key}')`, `distinct(${1:col})`, `count(${1:col})`.
* **ggplot2**:
  * `ggplot(data = ${1:df}, aes(x = ${2:x}, y = ${3:y})) +\n  geom_${4:point}()`
  * Geoms: `geom_point()`, `geom_line()`, `geom_bar(stat = 'identity')`, `geom_histogram(bins = ${1:30})`, `geom_boxplot()`, `geom_smooth(method = '${1:lm}')`.
  * Scales & Theme: `labs(title = '${1:title}', x = '${2:x}', y = '${3:y}')`, `theme_minimal()`, `theme_bw()`, `facet_wrap(~ ${1:var})`.

---

### 3.3 Shell Catalog (`src/autocomplete/static/shell.ts`)

#### 1. Core POSIX / Coreutils Binaries
| Command | Type | Completion Label | Snippet / Flag Options | Description |
|---|---|---|---|---|
| `ls` | `function` | `ls` | `ls -la`, `ls -lh`, `ls -R` | List directory contents |
| `cd` | `function` | `cd` | `cd ${1:directory}` | Change current directory |
| `pwd` | `function` | `pwd` | `pwd` | Print working directory |
| `cat` | `function` | `cat` | `cat ${1:file}` | Concatenate and print files |
| `grep` | `function` | `grep` | `grep -rn '${1:pattern}' ${2:path}`, `grep -i`, `grep -v` | Search text with regex |
| `mkdir` | `function` | `mkdir` | `mkdir -p ${1:directory}` | Create directory structure |
| `touch` | `function` | `touch` | `touch ${1:filename}` | Create empty file or update mtime |
| `rm` | `function` | `rm` | `rm -rf ${1:target}`, `rm -i` | Remove files or directories |
| `cp` | `function` | `cp` | `cp -r ${1:source} ${2:dest}` | Copy files and directories |
| `mv` | `function` | `mv` | `mv ${1:source} ${2:dest}` | Move or rename files |
| `head` / `tail` | `function` | `head` / `tail` | `head -n ${1:10} ${2:file}`, `tail -n ${1:10} -f` | Output beginning/end of files |
| `wc` | `function` | `wc` | `wc -l ${1:file}`, `wc -w` | Word, line, and byte count |
| `sort` | `function` | `sort` | `sort -n -r ${1:file}`, `sort -u` | Sort lines of text files |
| `uniq` | `function` | `uniq` | `uniq -c ${1:file}`, `uniq -d` | Report or omit repeated lines |
| `sed` | `function` | `sed` | `sed 's/${1:find}/${2:replace}/g' ${3:file}` | Stream editor for text transform |
| `awk` | `function` | `awk` | `awk '{print \$${1:1}}' ${2:file}` | Pattern scanning and processing |
| `find` | `function` | `find` | `find ${1:.} -name '${2:*.py}'` | Search for files in directory |
| `tar` | `function` | `tar` | `tar -czvf ${1:archive.tar.gz} ${2:path}`, `tar -xzvf` | Archive utility |
| `curl` / `wget` | `function` | `curl` | `curl -sSL ${1:url} -o ${2:output}` | Network transfer |

#### 2. Shell Control Flow & Idioms
* `if [ ${1:condition} ]; then\n    ${2:body}\nfi`
* `for ${1:var} in ${2:items}; do\n    ${3:body}\ndone`
* `while [ ${1:condition} ]; do\n    ${2:body}\ndone`
* Variable expressions: `export ${1:VAR}="${2:value}"`, `echo "$${1:VAR}"`, `$?` (previous exit status), `$#` (arg count).

---

### 3.4 SQL Catalog (`src/autocomplete/static/sql.ts`)

#### 1. ANSI SQL & PostgreSQL Keywords
* Query DQL: `SELECT`, `FROM`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY ASC|DESC`, `LIMIT`, `OFFSET`, `DISTINCT`, `AS`, `WITH ... AS (...)` (CTE).
* Joins: `JOIN`, `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN`, `FULL OUTER JOIN`, `CROSS JOIN`, `ON`, `USING (...)`, `NATURAL JOIN`.
* Set Operations: `UNION`, `UNION ALL`, `INTERSECT`, `EXCEPT`.
* Conditional & Logical: `CASE WHEN ${1:cond} THEN ${2:val} ELSE ${3:alt} END`, `AND`, `OR`, `NOT`, `IN (...)`, `BETWEEN ${1:a} AND ${2:b}`, `LIKE '${1:%pattern%}'`, `ILIKE '${1:%pattern%}'`, `IS NULL`, `IS NOT NULL`, `EXISTS (...)`.
* DDL / DML: `INSERT INTO ${1:table} (${2:cols}) VALUES (${3:vals})`, `UPDATE ${1:table} SET ${2:col} = ${3:val} WHERE ${4:cond}`, `DELETE FROM ${1:table} WHERE ${2:cond}`, `CREATE TABLE ${1:name} (...)`, `DROP TABLE IF EXISTS ${1:name}`.

#### 2. Aggregate & Window Functions
* Aggregates: `COUNT(${1:*})`, `SUM(${1:col})`, `AVG(${1:col})`, `MIN(${1:col})`, `MAX(${1:col})`, `COUNT(DISTINCT ${1:col})`, `STRING_AGG(${1:col}, '${2:,}')`.
* Window functions: `ROW_NUMBER() OVER (PARTITION BY ${1:col} ORDER BY ${2:col})`, `RANK() OVER (...)`, `DENSE_RANK() OVER (...)`, `LAG(${1:col}, 1) OVER (...)`, `LEAD(${1:col}, 1) OVER (...)`.
* Null Handling & Casting: `COALESCE(${1:val1}, ${2:val2})`, `NULLIF(${1:a}, ${2:b})`, `CAST(${1:expr} AS ${2:TYPE})`, `${1:expr}::${2:TYPE}`.

#### 3. DuckDB-Specific Analytical Functions
* Temporal: `strftime(${1:timestamp}, '${2:%Y-%m-%d}')`, `epoch(${1:timestamp})`, `epoch_ms(${1:ms})`, `date_trunc('${1:month}', ${2:date})`, `date_part('${1:year}', ${2:date})`, `current_date`, `current_timestamp`.
* Nested & Structs: `unnest(${1:list_col})`, `struct_pack(${1:key} := ${2:val})`, `list_transform(${1:list}, x -> ${2:expr})`, `list_filter(${1:list}, x -> ${2:cond})`.
* Table Readers: `read_csv_auto('${1:file.csv}')`, `read_parquet('${1:file.parquet}')`, `read_json_auto('${1:file.json}')`, `generate_series(${1:1}, ${2:100})`.

---

## 4. Dynamic Autocompletion via Runtime Introspection

Dynamic completion interrogates the live WebAssembly execution environment to retrieve active variables, module attributes, data frame columns, table schemas, and filesystem entries.

```
CodeMirror Event (Context)
         │
         │ Cursor at "df." or "np.lin" or "cd /var/"
         ▼
 ┌────────────────────────────────────────────────────────────┐
 │                  Scoped Introspection Client               │
 │  • Computes prefix, trigger token, and AST context        │
 │  • Attaches AbortController cancellation token            │
 │  • Debounces rapid keystrokes (80ms)                      │
 └────────────────────────────┬───────────────────────────────┘
                              │
                              ▼ JSON-RPC: request('introspect', params)
 ┌────────────────────────────────────────────────────────────┐
 │                 Worker Runtime Dispatcher                  │
 ├────────────────┬──────────────────────────┬────────────────┤
 │  Pyodide Worker│      webR Worker         │ BusyBox Worker │
 │  (Python AST & │    (.DollarNames &       │ (VFS Directory │
 │   dir() eval)  │     ls(.GlobalEnv))      │  Path Walking) │
 └────────────────┴──────────────────────────┴────────────────┘
                              │
                              ▼ JSON-RPC Result: { items: Completion[] }
 ┌────────────────────────────────────────────────────────────┐
 │              Deduplicate, Merge & Boost Rank               │
 └────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                Rendered Tooltip to User
```

### 4.1 JSON-RPC Introspection Protocol Extension

In `src/jsonrpc/types.ts`, we add the standardized `introspect` RPC definition:

```typescript
export interface IIntrospectParams {
  language: string;
  code: string;
  line: number;
  column: number;
  prefix: string;
  triggerCharacter?: '.' | '$' | '/' | ' ' | ':' | '[';
}

export interface IIntrospectResult {
  completions: Array<{
    label: string;
    type: 'variable' | 'function' | 'property' | 'class' | 'module' | 'table' | 'column' | 'file' | 'dir';
    detail?: string;
    info?: string;
    boost?: number;
    apply?: string;
  }>;
}
```

### 4.2 Python Runtime Introspection (Pyodide Worker)

Inside `src/runtime/python/dcl_introspection.py` (loaded into the Pyodide Web Worker during initialization):

```python
import sys
import inspect
import types

def dcl_introspect(code: str, line: int, column: int, prefix: str, trigger: str = ""):
    results = []
    global_env = sys.modules['__main__'].__dict__
    
    # Case 1: Member / Attribute Access (e.g., "np." or "df.he" or "data.")
    if trigger == "." or "." in prefix:
        parts = prefix.split(".")
        target_name = parts[0]
        attr_prefix = parts[1] if len(parts) > 1 else ""
        
        target = global_env.get(target_name)
        if target is not None:
            for attr in dir(target):
                if attr.startswith("_") and not attr_prefix.startswith("_"):
                    continue
                if attr.lower().startswith(attr_prefix.lower()):
                    try:
                        val = getattr(target, attr)
                        val_type = "function" if callable(val) else "property"
                        doc = inspect.getdoc(val) or ""
                        doc_summary = doc.split("\n\n")[0] if doc else ""
                        sig = str(inspect.signature(val)) if callable(val) else type(val).__name__
                        results.append({
                            "label": attr,
                            "type": val_type,
                            "detail": sig[:60],
                            "info": doc_summary[:300],
                            "boost": 85 if attr.startswith(attr_prefix) else 70
                        })
                    except Exception:
                        results.append({"label": attr, "type": "property", "boost": 60})
        return results

    # Case 2: Global Namespace & Active Variables
    for name, val in global_env.items():
        if name.startswith("_"):
            continue
        if name.lower().startswith(prefix.lower()):
            val_type = "function" if callable(val) else "variable"
            if isinstance(val, type):
                val_type = "class"
            elif isinstance(val, types.ModuleType):
                val_type = "module"
                
            doc = inspect.getdoc(val) or ""
            results.append({
                "label": name,
                "type": val_type,
                "detail": type(val).__name__,
                "info": doc.split("\n\n")[0][:300] if doc else "",
                "boost": 95 if name.startswith(prefix) else 80
            })
            
    return results
```

### 4.3 R Runtime Introspection (webR Session)

Inside `src/runtime/RWebRSession.ts`, dynamic introspection executes safely against `.GlobalEnv` and package environments:

```typescript
public async introspect(params: IIntrospectParams): Promise<IIntrospectResult> {
  const webR = await this.getWebR();
  const { prefix, triggerCharacter } = params;

  // Escape R strings safely
  const escapeStr = (s: string) => JSON.stringify(s);

  const introspectionCode = `
    local({
      prefix <- ${escapeStr(prefix)}
      trigger <- ${escapeStr(triggerCharacter || '')}
      results <- list()

      # Case 1: Dollar / Slot member access (e.g. df$ or model$)
      if (trigger == "$" || grepl("\\\\$", prefix)) {
        parts <- strsplit(prefix, "\\\\$")[[1]]
        obj_name <- parts[1]
        member_prefix <- ifelse(length(parts) > 1, parts[2], "")
        
        if (exists(obj_name, envir = .GlobalEnv)) {
          obj <- get(obj_name, envir = .GlobalEnv)
          m_names <- names(obj)
          if (is.null(m_names) && is.list(obj)) m_names <- names(obj)
          for (nm in m_names) {
            if (startsWith(tolower(nm), tolower(member_prefix))) {
              results[[length(results) + 1]] <- list(
                label = nm,
                type = "property",
                detail = paste0(class(obj[[nm]])[1], " (length ", length(obj[[nm]]), ")"),
                boost = 90
              )
            }
          }
        }
        return(results)
      }

      # Case 2: Global environment objects & user-defined functions
      globals <- ls(envir = .GlobalEnv)
      for (g in globals) {
        if (startsWith(tolower(g), tolower(prefix))) {
          obj <- get(g, envir = .GlobalEnv)
          obj_type <- if (is.function(obj)) "function" else "variable"
          detail_text <- if (is.function(obj)) {
            paste0(names(formals(obj)), collapse = ", ")
          } else {
            paste(class(obj), collapse = ", ")
          }
          results[[length(results) + 1]] <- list(
            label = g,
            type = obj_type,
            detail = detail_text,
            boost = 95
          )
        }
      }
      results
    })
  `;

  const raw = await webR.evalR(introspectionCode);
  const jsResults = await raw.toJs();
  return { completions: jsResults || [] };
}
```

### 4.4 Shell Virtual Filesystem Introspection (BusyBox WASM)

For Shell exercises and interactive terminals, dynamic autocompletion resolves file and directory names from the active Emscripten / JS VFS:

```typescript
// src/runtime/shellAutocomplete.ts
export function getShellDynamicCompletions(
  vfs: IShellVfs,
  cwd: string,
  input: string,
  cursorPos: number,
): Completion[] {
  const textBeforeCursor = input.slice(0, cursorPos);
  const words = textBeforeCursor.split(/\s+/);
  const isCommandPosition = words.length <= 1;
  const currentToken = words[words.length - 1] || '';

  // 1. If at command position, suggest binaries from PATH & builtins
  if (isCommandPosition && !currentToken.includes('/')) {
    const builtins = ['cd', 'pwd', 'export', 'source', 'alias', 'history', 'exit'];
    return builtins
      .filter((cmd) => cmd.startsWith(currentToken))
      .map((cmd) => ({
        label: cmd,
        type: 'function',
        detail: 'shell builtin',
        boost: 90,
      }));
  }

  // 2. Path resolution: parse directory portion vs partial filename
  const lastSlashIndex = currentToken.lastIndexOf('/');
  let targetDir = cwd;
  let partialName = currentToken;

  if (lastSlashIndex !== -1) {
    const rawDir = currentToken.slice(0, lastSlashIndex);
    partialName = currentToken.slice(lastSlashIndex + 1);
    targetDir = rawDir.startsWith('/') ? rawDir : `${cwd}/${rawDir}`.replace(/\/+/g, '/');
  }

  try {
    const entries = vfs.readdir(targetDir) || [];
    return entries
      .filter((entry) => entry !== '.' && entry !== '..' && entry.startsWith(partialName))
      .map((entry) => {
        const fullPath = `${targetDir}/${entry}`.replace(/\/+/g, '/');
        const isDir = vfs.isDir ? vfs.isDir(fullPath) : false;
        return {
          label: isDir ? `${entry}/` : entry,
          type: isDir ? 'dir' : 'file',
          detail: isDir ? 'directory' : 'file',
          apply: isDir ? `${entry}/` : entry,
          boost: isDir ? 85 : 75,
        };
      });
  } catch (err) {
    return [];
  }
}
```

### 4.5 SQL Relational Schema Introspection (DuckDB WASM)

DuckDB-wasm dynamically updates its schema catalog in memory upon table creation, view creation, and CSV/Parquet file ingestion:

```typescript
// src/runtime/sql/sqlSchemaIntrospector.ts
export async function getDuckDbSchemaCompletions(
  duckDbSession: IJsonRpcSession,
  code: string,
  prefix: string,
): Promise<Completion[]> {
  try {
    // 1. Fetch tables from information_schema
    const tablesResult = await duckDbSession.request<{ output: string }>('runCode', {
      code: `SELECT table_name, column_name, data_type 
             FROM information_schema.columns 
             WHERE table_schema = 'main' 
             ORDER BY table_name, ordinal_position;`,
    });

    const parsedRows = parseDuckDbJsonOutput(tablesResult.output);
    const completions: Completion[] = [];

    // Distinct tables
    const tableSet = new Set<string>();
    for (const row of parsedRows) {
      if (!tableSet.has(row.table_name)) {
        tableSet.add(row.table_name);
        completions.push({
          label: row.table_name,
          type: 'table',
          detail: 'DuckDB table',
          boost: 90,
        });
      }

      // Column completion
      completions.push({
        label: row.column_name,
        type: 'column',
        detail: `${row.data_type} (${row.table_name})`,
        boost: 80,
      });
    }

    return completions;
  } catch (err) {
    return [];
  }
}
```

---

## 5. UI & UX Design with `@datacamp/waffles`

### 5.1 Design Tokens & Theming Matrix

The autocompletion popover strictly uses tokens from `@datacamp/waffles/tokens` and `@datacamp/waffles/theme` to guarantee 100% brand consistency and dark/light switching:

| UI Element | Dark Mode Token / Value | Light Mode Token / Value | Waffles Token Reference |
|---|---|---|---|
| Popover Background | `theme.background.secondary` (`#1f242e`) | `theme.background.main` (`#ffffff`) | `theme.background` |
| Popover Border | `theme.border.main` (`#384047`) | `theme.border.main` (`#e4e7eb`) | `tokens.borderWidth.thin` |
| Item Text | `theme.text.main` (`#ffffff`) | `theme.text.main` (`#05192d`) | `theme.text.main` |
| Selected Item Background | `hexToRgba(theme.blue.main, 0.15)` | `hexToRgba(theme.blue.main, 0.10)` | `theme.blue` |
| Matched Query Text | `theme.yellow.text` (`#ffd15c`) | `theme.blue.text` (`#0065ff`) | `tokens.fontWeights.bold` |
| Detail / Type Subtext | `theme.text.subtle` (`#a1a8b3`) | `theme.text.secondary` (`#5b6975`) | `tokens.fontSizes.xsmall` |
| Docstring Sidecar BG | `theme.background.main` (`#141820`) | `theme.background.secondary` (`#f7f9fa`) | `tokens.boxShadow.overlay` |
| Border Radius | `tokens.borderRadius.medium` (`6px`) | `tokens.borderRadius.medium` (`6px`) | `tokens.borderRadius.medium` |

### 5.2 Type Badges & SVG Icons

Each completion item is labeled with a distinct, color-coded Waffles badge:
* **`keyword`** -> Purple (`tokens.colors.purple.text`)
* **`function`** / **`method`** -> Blue (`tokens.colors.blue.text`)
* **`variable`** / **`constant`** -> White/Black primary text
* **`class`** / **`type`** -> Green (`tokens.colors.green.text`)
* **`table`** -> Orange (`tokens.colors.orange.text`)
* **`column`** -> Green (`tokens.colors.green.text`)
* **`file`** / **`dir`** -> Yellow (`tokens.colors.yellow.text`)

```css
/* Custom CodeMirror 6 Autocomplete Stylesheet */
.cm-tooltip-autocomplete {
  background-color: var(--dcl-bg-panel) !important;
  border: 1px solid var(--dcl-border-color) !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25) !important;
  font-family: JetBrains Mono, monospace !important;
  font-size: 13px !important;
  padding: 4px !important;
  min-width: 220px !important;
  max-height: 280px !important;
  z-index: 1000 !important;
}

.cm-tooltip-autocomplete ul {
  max-height: 260px;
  overflow-y: auto;
}

.cm-tooltip-autocomplete ul li {
  padding: 4px 8px !important;
  border-radius: 4px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}

.cm-tooltip-autocomplete ul li[aria-selected="true"] {
  background-color: rgba(5, 120, 242, 0.15) !important;
}

.cm-completionMatchedText {
  color: #ffd15c !important;
  font-weight: 700 !important;
  text-decoration: none !important;
}

.cm-completionDetail {
  font-size: 11px !important;
  opacity: 0.7 !important;
  margin-left: 12px !important;
  font-style: italic !important;
}

/* Documentation Sidecar Panel */
.cm-completionInfo {
  background-color: var(--dcl-bg-panel-info) !important;
  border: 1px solid var(--dcl-border-color) !important;
  border-radius: 6px !important;
  padding: 8px 12px !important;
  max-width: 340px !important;
  font-size: 12px !important;
  line-height: 1.4 !important;
  color: var(--dcl-text-color) !important;
}
```

### 5.3 Interaction & Triggering Semantics

1. **Keystroke Triggers**:
   * Character triggers: Automatic popup when typing member triggers: `.` (Python/R/SQL), `$` (R), `::` (R/SQL), `/` (Shell paths).
   * Alphanumeric threshold: Automatic popup after typing 2 or more consecutive alphanumeric characters (`[a-zA-Z0-9_]{2,}`).
2. **Cancellation & Debounce**:
   * Static completions filter synchronously with **0ms debounce**.
   * Dynamic introspection requests are debounced at **80ms**. If the user continues typing before the 80ms elapsed, previous requests are aborted using `AbortController` and `CompletionContext.aborted`.
3. **Keyboard Controls**:
   * `Enter` / `Tab`: Apply currently selected completion item.
   * `ArrowDown` / `ArrowUp`: Move highlight cursor through completion list.
   * `PageDown` / `PageUp`: Fast scroll by 10 items.
   * `Escape`: Dismiss completion popup immediately.
   * `Ctrl+Space` / `Cmd+Space`: Explicitly open completion popup even on empty line.

---

## 6. Phased Implementation Roadmap

```
                                IMPLEMENTATION TIMELINE
  Phase 1: Foundation ──────► Phase 2: Static Packs ──────► Phase 3: UI & Theming
  • @codemirror/autocomplete  • Python static catalog       • Waffles CSS & variables
  • CodeEditor compartment    • R static catalog            • Icons & type badges
  • Types & context helpers   • Shell static catalog        • Keyboard binding matrix
                              • SQL static catalog
                                      │
                                      ▼
  Phase 5: Verification ◄───── Phase 4: Dynamic Engine
  • Unit & integration tests  • JSON-RPC 'introspect'
  • Zero-lockup stress tests  • Pyodide AST & dir() worker
  • External tutorial audit   • webR .DollarNames worker
                              • BusyBox VFS path crawler
                              • DuckDB schema inspector
```

### Phase 1: Core Static Engine & CodeMirror 6 Autocomplete Setup
* Add `@codemirror/autocomplete` to `package.json` dependencies.
* Define `IIntrospectParams` and `IIntrospectResult` in `src/jsonrpc/types.ts`.
* Create `src/autocomplete/completionContext.ts` with token matching algorithms (`matchBefore`, prefix extractors).
* Update `src/components/CodeEditor.tsx` with dynamic `autocompleteCompartment`.

### Phase 2: Static Lexicons & Snippet Packs
* Implement `src/autocomplete/static/python.ts` (keywords, builtins, NumPy, Pandas, Matplotlib, Seaborn).
* Implement `src/autocomplete/static/r.ts` (keywords, base R, tidyverse pipes, dplyr verbs, ggplot2 geoms).
* Implement `src/autocomplete/static/shell.ts` (POSIX binaries, common flag snippets, shell grammar).
* Implement `src/autocomplete/static/sql.ts` (ANSI keywords, window functions, DuckDB analytic extensions).
* Create registry dispatcher in `src/autocomplete/static/index.ts`.

### Phase 3: Waffles UI/UX Theming & Accessibility
* Author `src/styles/autocomplete.css` with Waffles design token bindings and theme variables.
* Implement custom icons / badges for completion types (`keyword`, `function`, `variable`, `table`, `column`, `dir`, `file`).
* Wire dark/light mode synchronization in `src/theme/themeManager.ts` to trigger tooltip theme updates.
* Ensure ARIA compliance (`aria-autocomplete="list"`, `aria-activedescendant`, `aria-selected`).

### Phase 4: Dynamic Introspection Engine across Runtime Workers
* **Python**: Add `dcl_introspection.py` to `src/runtime/python/` and wire `pyodideWorker.ts` onmessage handler for `'introspect'`.
* **R**: Implement `introspect` method in `src/runtime/RWebRSession.ts` using `.GlobalEnv` and `.DollarNames`.
* **Shell**: Implement `src/runtime/shellAutocomplete.ts` for live VFS directory path traversal.
* **SQL**: Implement `src/runtime/sql/sqlSchemaIntrospector.ts` for DuckDB table and column reflections.
* Create unifying async aggregator in `src/autocomplete/dynamicCompletionSource.ts`.

### Phase 5: Verification, Benchmarking & Audit
* Unit test coverage:
  * `src/autocomplete/static.spec.ts`: Tests prefix filtering and snippet expansions for all 4 languages.
  * `src/autocomplete/dynamic.spec.ts`: Tests worker message round-trips and cancellation behavior.
  * `src/components/CodeEditor.spec.tsx`: Verifies completion popup mounting, keyboard shortcuts, and theme changes.
* Performance validation: Benchmark main-thread frame times during active typing with 100+ variable completions.
* Update documentation and manual test examples in `docs/example.html` and `index.html`.

---

## 7. File Structure & Modifications

| File Path | Purpose / Description | Action |
|---|---|---|
| `package.json` | Add `@codemirror/autocomplete: ^6.18.4` dependency | Modify |
| `src/jsonrpc/types.ts` | Add `IIntrospectParams` and `IIntrospectResult` interfaces | Modify |
| `src/jsonrpc/session.ts` | Add `introspect(params)` signature to `IJsonRpcSession` | Modify |
| `src/components/CodeEditor.tsx` | Wire `autocompletion()` extension, theme classes, and keymaps | Modify |
| `src/components/CodeEditor.spec.tsx` | Add unit tests for autocompletion popup rendering & key events | Modify |
| `src/styles/autocomplete.css` | Waffles-themed CSS rules for `.cm-tooltip-autocomplete` & `.cm-completionInfo` | Create |
| `src/autocomplete/types.ts` | Internal types for Static & Dynamic Completion models | Create |
| `src/autocomplete/completionSource.ts` | Unified completion source blending static + dynamic completions | Create |
| `src/autocomplete/static/python.ts` | Python keywords, builtins, and data science symbol catalog | Create |
| `src/autocomplete/static/r.ts` | R keywords, base functions, dplyr verbs, and ggplot2 snippets | Create |
| `src/autocomplete/static/shell.ts` | Coreutils commands, common flag combinations, and shell idioms | Create |
| `src/autocomplete/static/sql.ts` | ANSI SQL keywords, aggregate/window functions, and DuckDB extensions | Create |
| `src/autocomplete/static/index.ts` | Static catalog dispatcher keyed by language | Create |
| `src/runtime/python/dcl_introspection.py` | Python introspection script running inside Pyodide Worker | Create |
| `src/runtime/workers/pyodideWorker.ts` | Handle `introspect` JSON-RPC method | Modify |
| `src/runtime/RWebRSession.ts` | Implement `introspect` using webR evaluation | Modify |
| `src/runtime/shellAutocomplete.ts` | Shell VFS path and binary completion generator | Create |
| `src/runtime/workers/shellWorker.ts` | Handle `introspect` JSON-RPC method for shell | Modify |
| `src/runtime/sql/sqlSchemaIntrospector.ts` | DuckDB schema query helper | Create |

---

## 8. Verification & Quality Gates

Before declaring autocompletion ready for release, the following gates must be verified:

1. **Typecheck Gate**:
   ```bash
   npm run typecheck # (tsc --noEmit)
   ```
   * Must pass with zero TypeScript errors across all new autocomplete modules and updated session types.

2. **Unit & Spec Tests**:
   ```bash
   npm test # (vitest run)
   ```
   * Full coverage of static catalog matching, snippet replacement ranges, debouncing logic, and dynamic JSON-RPC fallback handlers.

3. **Performance & Frame Rate Gate**:
   * Measure browser main thread during continuous keystrokes (20 chars/sec).
   * Frame rate must not drop below **58 FPS**.
   * Dynamic introspection response latency must average **< 60ms** and never exceed **150ms**.

4. **Integration Gate**:
   ```bash
   npm run build # (tsc -b && vite build)
   ```
   * Bundle size impact must be **< 35 KB gzipped** for the static autocomplete engine.

---

*Authored for DataCamp Light v4 Engineering Platform.*
