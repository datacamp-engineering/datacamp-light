import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode, command }) => {
  const isTest = mode === 'test' || Boolean(process.env.VITEST);

  // rollup-plugin-license is build-only: during `vite build` it scans every
  // module that ends up in the shipped bundles (both umd and es outputs) and
  // writes the aggregated third-party license report that
  // scripts/merge-licenses.mjs then merges into dist/THIRD_PARTY_LICENSES.txt.
  // The output path must stay in sync with the merge script. Only bundled
  // dependencies are reported (devDependencies are never scanned, and the
  // pyodide package is loaded from a CDN URL at runtime, never bundled).
  const isBuild = command === 'build' && !isTest;
  const plugins = [react()];
  if (isBuild) {
    plugins.push(
      license({
        thirdParty: {
          // Report every distinct bundled dependency version, and include
          // private packages too, so the compliance report cannot under-report.
          multipleVersions: true,
          includePrivate: true,
          // NOTE: the plugin's option is `thirdParty.output` (a file path);
          // there is no `outputFilename` option.
          output: resolve(__dirname, 'dist/third-party-licenses.tmp.txt'),
        },
      }),
    );
  }

  return {
    plugins,
    // Vite compiles `?worker&inline` bundles (shellWorker, pyodideWorker) in
    // separate worker builds where the top-level `plugins` do not run, so npm
    // packages used only inside workers (e.g. bash-parser and its transitive
    // dependencies) would otherwise be missing from the license report. The
    // factory form is required so each worker build gets fresh plugin
    // instances. The worker report is written outside dist/ because worker
    // builds finish during bundle generation, before Vite empties outDir, so
    // anything they write into dist/ would be deleted; the merge script unions
    // it with the main report afterwards.
    worker: {
      plugins: () => [
        license({
          thirdParty: {
            multipleVersions: true,
            includePrivate: true,
            output: resolve(__dirname, '.temp/third-party-licenses-worker.txt'),
          },
        }),
      ],
    },
    define: {
      'process.env.NODE_NEV': JSON.stringify('production'),
      ...(isTest
        ? {}
        : {
            'process.env.NODE_ENV': JSON.stringify('production'),
            'process.env.LOG': JSON.stringify(''),
          }),
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'react-i18next', 'i18next'],
      alias: {
        'iterable-transform-replace': resolve(__dirname, 'node_modules/iterable-transform-replace/index.js'),
        'transform-spread-iterable': resolve(__dirname, 'node_modules/transform-spread-iterable/index.js'),
        'map-iterable': resolve(__dirname, 'node_modules/map-iterable/index.js'),
        'iterable-lookahead': resolve(__dirname, 'node_modules/iterable-lookahead/index.js'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react-i18next', 'i18next'],
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'DataCampLight',
        formats: ['umd', 'es'],
        fileName: (format) => (format === 'umd' ? 'dcl-react.js' : 'dcl-react.es.js'),
      },
      rollupOptions: {
        output: {
          exports: 'named',
        },
      },
      sourcemap: true,
    },
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
