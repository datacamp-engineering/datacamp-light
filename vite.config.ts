import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-i18next', 'i18next'],
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
});
