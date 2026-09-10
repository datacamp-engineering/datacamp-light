// See the comment on the identical shim in boot.tsx: bash-parser reads
// `process.env.NODE_NEV` (upstream typo of NODE_ENV) at module scope, so the
// misspelled key must stay as-is.
if (typeof globalThis !== 'undefined' && !(globalThis as any).process) {
  (globalThis as any).process = { env: { NODE_ENV: 'production', NODE_NEV: 'production' } };
}

import './i18n';
import {
  bootElement,
  getSettings,
  initAddedDCLightExercises,
  initDataCampLight,
} from './boot';
import { DataCampExercise } from './components/DataCampExercise';
import { createSessionForLanguage as createWasmSession } from './runtime/createSessionForLanguage';
import './styles/fonts.css';

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
