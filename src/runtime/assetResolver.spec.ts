import { afterEach, describe, expect, it } from 'vitest';
import { autoDetectScriptBaseUrl, getAssetBaseUrl, resolveAssetUrl, getAssetCandidates } from './assetResolver';

describe('assetResolver', () => {
  afterEach(() => {
    delete (globalThis as any).DCL_ASSET_BASE_URL;
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
    document.querySelectorAll('script').forEach((el) => el.remove());
  });

  it('resolves production root entrypoint to /dcl/v4/prod', () => {
    Object.defineProperty(document, 'currentScript', {
      value: { src: 'https://cdn.datacamp.com/dcl-react.js.gz' },
      configurable: true,
    });
    expect(autoDetectScriptBaseUrl()).toBe('https://cdn.datacamp.com/dcl/v4/prod');
  });

  it('resolves production legacy v4 entrypoint to /dcl/v4/prod', () => {
    Object.defineProperty(document, 'currentScript', {
      value: { src: 'https://cdn.datacamp.com/dcl/v4/dcl-react.js.gz' },
      configurable: true,
    });
    expect(autoDetectScriptBaseUrl()).toBe('https://cdn.datacamp.com/dcl/v4/prod');
  });

  it('resolves legacy production folder entrypoint /dcl-react-prod/dcl-react.js.gz to /dcl/v4/prod', () => {
    Object.defineProperty(document, 'currentScript', {
      value: { src: 'https://cdn.datacamp.com/dcl-react-prod/dcl-react.js.gz' },
      configurable: true,
    });
    expect(autoDetectScriptBaseUrl()).toBe('https://cdn.datacamp.com/dcl/v4/prod');
  });

  it('resolves production v4 alias /dcl-react-v4.js.gz to /dcl/v4/prod', () => {
    Object.defineProperty(document, 'currentScript', {
      value: { src: 'https://cdn.datacamp.com/dcl-react-v4.js.gz' },
      configurable: true,
    });
    expect(autoDetectScriptBaseUrl()).toBe('https://cdn.datacamp.com/dcl/v4/prod');
  });

  it('resolves staging entrypoint to /dcl/v4/staging', () => {
    Object.defineProperty(document, 'currentScript', {
      value: { src: 'https://cdn.datacamp.com/dcl/v4/staging/dcl-react.js' },
      configurable: true,
    });
    expect(autoDetectScriptBaseUrl()).toBe('https://cdn.datacamp.com/dcl/v4/staging');
  });

  it('resolves custom branch subfolder entrypoint under /dcl/v4/<subfolder>', () => {
    Object.defineProperty(document, 'currentScript', {
      value: { src: 'https://cdn.datacamp.com/dcl/v4/preview-pr-123/dcl-react.es.js' },
      configurable: true,
    });
    expect(autoDetectScriptBaseUrl()).toBe('https://cdn.datacamp.com/dcl/v4/preview-pr-123');
  });

  it('resolves asset URLs for busybox.wasm and chunks against the discovered base', () => {
    (globalThis as any).DCL_ASSET_BASE_URL = 'https://cdn.datacamp.com/dcl/v4/prod';
    expect(resolveAssetUrl('busybox.wasm')).toBe('https://cdn.datacamp.com/dcl/v4/prod/busybox.wasm');
  });

  it('respects explicit DCL_ASSET_BASE_URL override', () => {
    (globalThis as any).DCL_ASSET_BASE_URL = 'https://my-custom-cdn.com/assets';
    expect(getAssetBaseUrl()).toBe('https://my-custom-cdn.com/assets');
    expect(resolveAssetUrl('busybox.js')).toBe('https://my-custom-cdn.com/assets/busybox.js');
  });

  it('generates asset candidates prioritizing primary resolved asset URL', () => {
    (globalThis as any).DCL_ASSET_BASE_URL = 'https://cdn.datacamp.com/dcl/v4/prod';
    const candidates = getAssetCandidates('busybox.js');
    expect(candidates).toContain('https://cdn.datacamp.com/dcl/v4/prod/busybox.js');
  });
});
