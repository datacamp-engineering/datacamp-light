/// <reference types="vite/client" />

// Runtime asset resolution for DataCamp Light v4.
//
// The main bundle can be served from several entrypoint URLs (for example
// /dcl-react.js.gz, /dcl-react-v4.js.gz and /dcl/v4/dcl-react.js.gz), but all
// secondary assets load from exactly one place:
//
// - Python (Pyodide) and R (webR) WASM runtimes come from their fixed public
//   CDNs (cdn.jsdelivr.net / webr.r-wasm.org), independent of this base.
// - The BusyBox shell runtime (busybox.js + busybox.wasm) loads from
//   `assetBaseUrl`:
//     * development: '' -> resolved against the dev-server origin, where Vite
//       serves the local copies from public/.
//     * production: the fixed CDN base below, baked in at build time. The
//       worker never trusts the embedding page's origin, because the widget is
//       usually embedded on third-party sites that do not host these files.
//       The CDN must serve busybox.wasm with CORS headers and the
//       application/wasm content type.
const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV === 'development';

export default {
  env: isDev ? 'development' : 'production',
  assetBaseUrl: isDev ? '' : 'https://cdn.datacamp.com/dcl/v4',
  pyodideUrl: 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/',
};