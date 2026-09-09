# DataCamp Light Documentation & Architecture

This folder contains architecture decision records (ADRs), system documentation, operational runbooks, proposals, and static demonstration pages for **DataCamp Light v4**.

## Architecture & Design Documents

* **[`architecture/shell-wasm.md`](./architecture/shell-wasm.md)**: Architecture decision record on POSIX shell emulation in WebAssembly (`sh-runner.wasm` Go parser + `busybox.wasm` execution engine).
* **[`architecture/shared-environment.md`](./architecture/shared-environment.md)**: Co-located Python & Shell shared environment, POSIX virtual filesystem, and drag-and-drop file ingestion.
* **[`architecture/autocompletion.md`](./architecture/autocompletion.md)**: CodeMirror 6 layered autocompletion engine (synchronous static catalogs + debounced dynamic worker introspection).

## Operations & Runbooks

* **[`LEGACY_ASSETS_MANIFEST.md`](./LEGACY_ASSETS_MANIFEST.md)**: Complete checksum inventory and emergency restoration commands for historical pre-v4 CDN assets.

## Roadmap & Proposals

* **[`proposals/duckdb-wasm-sql.md`](./proposals/duckdb-wasm-sql.md)**: Technical design proposal for client-side DuckDB-wasm SQL execution runtime (proposed / future work).

---

## Interactive Playground & Demonstration Pages

* **`index.html`**: Standalone interactive showcase with course-like multi-language exercises and Waffles theming.
* **`example.html`**: Minimal HTML fixture demonstrating basic `<div data-datacamp-exercise>` embeds.
* **`notebook.html`**: WebAssembly interactive Jupyter Notebook player demo.

### Testing Demo Pages Locally

Serve the repository statically or use the compressed preview server:

```bash
# Build the production bundle
npm run build

# Start the preview server
just serve    # or: node scripts/serve-compressed.mjs --port=4173
# Open http://localhost:4173/docs/index.html
```
