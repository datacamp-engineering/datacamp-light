// See the comment on the identical shim in boot.tsx: bash-parser reads
// `process.env.NODE_NEV` (upstream typo of NODE_ENV) at module scope, so the
// misspelled key must stay as-is.
if (typeof globalThis !== 'undefined' && !(globalThis as any).process) {
  (globalThis as any).process = { env: { NODE_ENV: 'production', NODE_NEV: 'production' } };
}

import './i18n';
import { parseExerciseSettings as getSettings } from './exerciseSettings';
import { initAddedDCLightExercises, initDataCampLight, bootElement } from './boot';
import { DataCampExercise } from './components/DataCampExercise';
import { createSessionForLanguage as createWasmSession } from './runtime/createSessionForLanguage';
// Inline the fonts stylesheet so the bundle is self-contained: consumers only
// need the script tag, no separate datacamp-light.css link. The woff2 fonts are
// data-URI inlined in the CSS, so injecting it at boot carries no extra
// requests. Vite's `?inline` import keeps the CSS out of the extracted
// stylesheet and into the JS bundle.
import fontsCss from './styles/fonts.css?inline';

// Inject the fonts stylesheet before any widget renders so the self-hosted
// fonts are available immediately. Idempotent: a single style element.
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.setAttribute('data-datacamp-light-fonts', '');
  styleElement.textContent = fontsCss;
  document.head.appendChild(styleElement);
}

// Expose on window for browser embeds and global usage
if (typeof window !== 'undefined') {
  (window as any).initAddedDCLightExercises = initAddedDCLightExercises;
  (window as any).initDataCampLight = initDataCampLight;
  (window as any).dcl = {
    bootElement,
    getSettings,
    init: initAddedDCLightExercises,
  };

  // Auto-boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAddedDCLightExercises();
    });
  } else {
    initAddedDCLightExercises();
  }
}

export {
  DataCampExercise,
  bootElement,
  createWasmSession,
  getSettings,
  initAddedDCLightExercises,
  initDataCampLight,
};

export default initAddedDCLightExercises;
