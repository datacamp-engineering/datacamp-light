import dclConfig from '../config';

/**
 * Automatically discovers the base URL from the current script tag in the main thread.
 * Supports staging, feature branches, and subfolder CDN deployments
 * (e.g., https://cdn.datacamp.com/dcl/v4/staging/dcl-react.js), while ensuring
 * all production entrypoint variations (/dcl-react.js.gz, /dcl-react-v4.js.gz,
 * /dcl/v4/dcl-react.js.gz) map secondary assets to /dcl/v4/prod.
 */
export function autoDetectScriptBaseUrl(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const findScriptSrc = (): string | null => {
    const currentScript = document.currentScript as HTMLScriptElement | null;
    if (currentScript?.src) return currentScript.src;

    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
    for (const script of scripts) {
      if (script.src && (script.src.includes('dcl-react') || script.src.includes('datacamp-light'))) {
        return script.src;
      }
    }
    return null;
  };

  const scriptSrc = findScriptSrc();
  if (!scriptSrc) return null;

  try {
    const scriptUrl = new URL(scriptSrc, window.location.href);
    const pathname = scriptUrl.pathname;

    // Staging or explicit subfolder under /dcl/v4/ (e.g. /dcl/v4/staging/dcl-react.js or /dcl/v4/pr-123/dcl-react.js)
    const dclV4SubfolderMatch = pathname.match(/\/dcl\/v4\/([a-zA-Z0-9_-]+)\/[^/]+$/);
    if (dclV4SubfolderMatch && dclV4SubfolderMatch[1]) {
      return `${scriptUrl.origin}/dcl/v4/${dclV4SubfolderMatch[1]}`;
    }

    if (pathname.includes('/staging') || pathname.includes('dcl-react-staging')) {
      return `${scriptUrl.origin}/dcl/v4/staging`;
    }

    // Any production cdn.datacamp.com entrypoint (/dcl-react.js.gz, /dcl-react-v4.js.gz, /dcl/v4/dcl-react.js.gz)
    // maps all secondary resources to /dcl/v4/prod
    if (scriptUrl.hostname === 'cdn.datacamp.com') {
      return `${scriptUrl.origin}/dcl/v4/prod`;
    }

    // Generic fallback for custom hosting
    return scriptUrl.origin + pathname.substring(0, pathname.lastIndexOf('/'));
  } catch {}

  return null;
}

// Auto-initialize global DCL_ASSET_BASE_URL if detected from script tag on main thread
if (typeof globalThis !== 'undefined') {
  const globalScope = globalThis as any;
  if (!globalScope.DCL_ASSET_BASE_URL) {
    const detectedBase = autoDetectScriptBaseUrl();
    if (detectedBase) {
      globalScope.DCL_ASSET_BASE_URL = detectedBase;
    }
  }
}

/**
 * Returns the resolved base URL for secondary runtime assets (BusyBox WASM, chunks).
 */
export function getAssetBaseUrl(): string {
  const globalScope = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
  if (globalScope.DCL_ASSET_BASE_URL !== undefined && globalScope.DCL_ASSET_BASE_URL !== '') {
    return String(globalScope.DCL_ASSET_BASE_URL).replace(/\/+$/, '');
  }

  let origin = '';
  if (typeof location !== 'undefined') {
    if (location.origin && location.origin !== 'null') {
      origin = location.origin;
    } else if (location.href && location.href.startsWith('blob:http')) {
      try {
        origin = new URL(location.href.slice(5)).origin;
      } catch {}
    }
  }

  const isLocal = Boolean(
    origin && /localhost|127\.0\.0\.1|0\.0\.0\.0|\.local|\.test/.test(origin),
  );

  if (isLocal && origin) {
    return `${origin}/dist`;
  }

  if (dclConfig.assetBaseUrl) {
    return dclConfig.assetBaseUrl.replace(/\/+$/, '');
  }

  return 'https://cdn.datacamp.com/dcl/v4/prod';
}

/**
 * Resolves a single asset filename to its absolute URL.
 */
export function resolveAssetUrl(fileName: string): string {
  return `${getAssetBaseUrl()}/${fileName}`;
}

/**
 * Returns prioritized asset candidates for fetch attempts.
 * When local, checks /dist/fileName then /fileName before remote CDNs.
 */
export function getAssetCandidates(fileName: string): string[] {
  const primaryUrl = resolveAssetUrl(fileName);
  const candidates: string[] = [primaryUrl];

  let origin = '';
  if (typeof location !== 'undefined') {
    if (location.origin && location.origin !== 'null') {
      origin = location.origin;
    } else if (location.href && location.href.startsWith('blob:http')) {
      try {
        origin = new URL(location.href.slice(5)).origin;
      } catch {}
    }
  }

  const isLocal = Boolean(
    origin && /localhost|127\.0\.0\.1|0\.0\.0\.0|\.local|\.test/.test(origin),
  );

  if (isLocal && origin) {
    candidates.push(`${origin}/${fileName}`);
    candidates.push(`${origin}/public/${fileName}`);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}
