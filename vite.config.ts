import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test' || Boolean(process.env.VITEST);

  return {
    plugins: [react()],
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
