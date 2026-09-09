/// <reference types="vite/client" />

const isDev = import.meta.env?.DEV ?? process.env.NODE_ENV === 'development';

export default {
  env: isDev ? 'development' : 'production',
  assetBaseUrl: 'https://cdn.datacamp.com/dcl/v4/prod',
  pyodideUrl: 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/',
  webrUrl: 'https://webr.r-wasm.org/latest/webr.mjs',
  webrBinWasmUrl: 'https://webr.r-wasm.org/latest/R.bin.wasm',
  webrWorkerUrl: 'https://webr.r-wasm.org/latest/webr-worker.js',
};