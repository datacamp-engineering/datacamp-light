# DataCamp Light Documentation & Standalone Playground

This folder contains static demonstration pages and documentation for DataCamp Light (v3 WebAssembly Edition).

## Files in this directory

* **`index.html`**: Standalone, interactive playground that loads the pre-built distribution bundle (`../dist/datacamp-light.css` and `../dist/dcl-react.es.js`).
* **`example.html`**: Minimal standalone HTML fixture demonstrating basic `<div data-datacamp-exercise>` embedding on a plain static web page.

## How it differs from the root `index.html`

| File | Purpose | Bundle Loading |
| :--- | :--- | :--- |
| **`index.html` (root)** | Development entry point for Vite (`npm run dev`) | Imports `/src/index.ts` directly with TypeScript hot-module reloading. |
| **`docs/index.html`** | Standalone static deployment (e.g. GitHub Pages) | Imports the built production bundle (`../dist/dcl-react.es.js` and `../dist/datacamp-light.css`). |

## Testing the standalone playground locally

After running a build (`npm run build`), you can serve the `docs/` directory with any static file server:

```bash
# Build the production bundle
npm run build

# Serve the repository statically
npx serve .
# Open http://localhost:3000/docs/index.html
```
