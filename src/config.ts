/// <reference types="vite/client" />

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV === 'development';

export default {
  env: isDev ? 'development' : 'production',
  assetBaseUrl: 'https://cdn.datacamp.com/dcl/v4/prod',
  pyodideUrl: 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/',
  // webR is pinned to a released tag (same discipline as the Pyodide pin):
  // `/latest/` tracks a nightly build that can silently break R embeds.
  // Since webR v0.5, the R runtime ships as `R.js` + `R.wasm` instead of the
  // historical `R.bin.wasm` layout.
  webrUrl: 'https://webr.r-wasm.org/v0.6.0/webr.mjs',
  webrRWasmUrl: 'https://webr.r-wasm.org/v0.6.0/R.wasm',
  webrWorkerUrl: 'https://webr.r-wasm.org/v0.6.0/webr-worker.js',
};