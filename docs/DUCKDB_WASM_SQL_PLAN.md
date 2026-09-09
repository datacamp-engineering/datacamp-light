# Technical Architecture & Implementation Plan: DuckDB-wasm SQL Runtime, UI & Filesystem Integration

## 1. Executive Summary & Goals

DataCamp interactive courses, external interactive tutorials (`learnsqlonline.org`), and enterprise documentation frequently incorporate SQL queries, relational database challenges, and analytical aggregations.

Historically, SQL exercises required heavy server-side container infrastructure (PostgreSQL or MySQL container instances managed by backend orchestrators).

**Objective**: Deliver a **100% client-side, zero-infrastructure SQL execution engine** in DataCamp Light v4 powered by **DuckDB-wasm**, styled with `@datacamp/waffles`, supporting live schema autocompletion, interactive tabular result viewing with pagination, and in-memory virtual filesystem ingestion (CSV, Parquet, JSON).

---

## 2. Architecture Overview

```
                                    USER SQL QUERY / EXERCISE
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │    CodeEditor (SQL)   │
                                    │  (@codemirror/lang-sql│
                                    │  + Schema Completion) │
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │    DuckDbSession      │
                                    │(Implements IJsonRpc)  │
                                    └───────────┬───────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     │                                                     │
                     ▼                                                     ▼
        ┌─────────────────────────┐                           ┌─────────────────────────┐
        │  AsyncDuckDB Web Worker │                           │ Ingestion & VFS Engine  │
        │  (duckdb-eh.wasm)       │                           │ (CSV, Parquet, JSON,    │
        │  Zero main-thread lag   │                           │  HTTP Range Queries)    │
        └────────────┬────────────┘                           └────────────┬────────────┘
                     │                                                     │
                     └──────────────────────────┬──────────────────────────┘
                                                │ Arrow Tables
                                                ▼
                               ┌─────────────────────────────────┐
                               │       Output & Evaluation       │
                               ├────────────────┬────────────────┤
                               │                │                │
                               ▼                ▼                ▼
                     ┌──────────────────┐ ┌───────────┐ ┌──────────────────┐
                     │ SqlResultGrid UI │ │ TS Result │ │  Pyodide sqlwhat │
                     │(Waffles / Dark & │ │  Matcher  │ │     Bridge       │
                     │ Light / Export)  │ │ (SCT Run) │ │  (Course Parity) │
                     └──────────────────┘ └───────────┘ └──────────────────┘
```

---

## 3. Core Capabilities & Technical Specifications

### Component A: AsyncDuckDB Web Worker Runtime (`src/runtime/sql/`)

#### 1. On-Demand Lazy Loading from CDN
To keep the primary DataCamp Light UMD/ESM bundle compact (~520 KB gzipped), DuckDB WASM binaries (~8.5 MB gzipped) are loaded dynamically on-demand only when a SQL exercise is present on the page.

* **Module**: `src/runtime/sql/duckdbLoader.ts`
* **Bundle Selection**:
  * Modern browsers with WebAssembly Exception Handling (WASM EH): `duckdb-eh.wasm` + `duckdb-browser-eh.worker.js`.
  * Fallback MVP build: `duckdb-mvp.wasm` + `duckdb-browser-mvp.worker.js`.
* **CDN Resolution**:
  * Production CDN: `${assetBaseUrl}/duckdb/` with fallback to `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/`.

#### 2. Session Lifecycle & Environment Sharing (`src/runtime/DuckDbSession.ts`)
* Implements `IJsonRpcSession` (`initialize`, `runCode`, `submitCode`, `onOutput`, `onStatusChange`, `getStatus`, `destroy`).
* Registered in `src/runtime/createSessionForLanguage.ts` under `'sql'`, `'pgsql'`, `'duckdb'`.
* Multi-exercise environment sharing: Supports `data-shared-environment="true|id"` via `sessionPool.ts`, allowing multiple queries across a page to operate against the same in-memory database tables.

---

### Component B: CodeMirror 6 SQL Editor (`src/components/CodeEditor.tsx`)

* **Dialect**: `@codemirror/lang-sql` configured with the `PostgreSQL` dialect (matching DuckDB's native syntax).
* **Live Schema Autocompletion**:
  * Extracts schema from `information_schema.columns` or `PRAGMA table_info` after DDL / file ingestion.
  * Injects table and column suggestions into CodeMirror's autocompletion engine.

---

### Component C: Tabular Result Viewer (`src/components/SqlResultGrid.tsx`)

A full-featured data grid styled with `@datacamp/waffles`:
* **Theming**: Automatic Dark and Light theme inheritance via `useResolvedTheme()`.
* **Pagination & Virtualization**: 10, 25, 50, 100 rows per page with page navigation controls.
* **Column Data Types**: Displays typed badges in column headers (`INTEGER`, `VARCHAR`, `DOUBLE`, `TIMESTAMP`, `BOOLEAN`).
* **Zebra Striping & Typography**: Monospace font for numeric/date columns, Sans for string labels.
* **Metadata Status Bar**: Execution duration ("Query executed in 3.4ms") and row counts ("Showing 1–10 of 42 rows").
* **Non-SELECT Queries**: Renders DDL/DML execution status ("Query OK, 5 rows affected").
* **Export Utilities**: "Export CSV" and "Copy Markdown Table" buttons.

---

### Component D: Filesystem & Data Ingestion

1. **In-Memory File Registration**:
   * Registers raw CSV, JSON, and Parquet data buffers directly into DuckDB's virtual filesystem using `db.registerFileText()` / `db.registerFileBuffer()`.
2. **Declarative Pre-Exercise Code (`-- @file`)**:
   ```sql
   -- @file:customers.csv
   id,name,spend
   1,Alpha Corp,12000
   2,Beta Logistics,8500

   -- @sql
   CREATE TABLE customers AS SELECT * FROM 'customers.csv';
   ```
3. **HTTP Range Queries**:
   * Queries remote Parquet and CSV files directly over HTTP range requests:
     `SELECT * FROM 'https://datasets.datacamp.com/ecommerce/orders.parquet' WHERE status = 'delivered';`

---

### Component E: Submission Correctness Test (SCT) Engine

1. **Native TypeScript Result Matcher (`src/runtime/sql/sqlEvaluator.ts`)**:
   * **Column Validation**: Case-insensitive column matching, optional projection order enforcement.
   * **Row Comparison**: Strict ordered comparison or multiset (unordered) comparison.
   * **Epsilon Tolerance**: Float/double comparisons with configurable precision delta (`1e-6`).
2. **Pyodide `sqlwhat` Bridge**:
   * For legacy DataCamp course SCTs (`Ex().check_column('name').has_equal_value()`), DuckDB Arrow result sets are converted to Python dictionary structures and evaluated via `sqlwhat` in the Pyodide Web Worker.

---

## 4. Phased Implementation Roadmap

### Phase 1: Dependencies & DuckDB Session Core
- Add `@duckdb/duckdb-wasm` and `@codemirror/lang-sql`.
- Create `src/runtime/sql/duckdbLoader.ts` and `src/runtime/DuckDbSession.ts`.
- Register SQL handler in `src/runtime/createSessionForLanguage.ts`.
- Unit tests: `DuckDbSession.spec.ts`.

### Phase 2: CodeMirror 6 SQL & Autocompletion
- Configure SQL mode with PostgreSQL dialect in `src/components/CodeEditor.tsx`.
- Add dynamic schema inspection and autocompletion wiring.

### Phase 3: Tabular Grid UI & File Ingestion
- Implement `src/components/SqlResultGrid.tsx`.
- Wire table output into `src/components/DataCampExercise.tsx` and JSON-RPC output streams.
- Implement `-- @file` declarative file parsing.

### Phase 4: SCT Engine & External Tutorial Audit
- Implement `src/runtime/sql/sqlEvaluator.ts`.
- Add `learnsqlonline.org` audit target in `scripts/audit-external-tutorials.mjs`.
- Add interactive playground demo card in `index.html` and `docs/index.html`.

---

## 5. Verification Gates

1. **Typecheck**: `npm run typecheck` (`tsc --noEmit`).
2. **Unit Tests**: `npm test` (`vitest run`).
3. **Runtime Integration**: `npm run test:runtime`.
4. **External Audit**: `npm run test:external -- --site=learnsqlonline.org`.
5. **Build**: `npm run build` (`tsc -b && vite build`).
