/**
 * Unified Cache Storage helper for DataCamp Light WASM binaries and packages.
 *
 * Automatically intercepts and caches requests to heavy binary assets across
 * all execution environments (main thread, Pyodide worker, Shell worker) using
 * the browser's native Cache API and Web Locks API / BroadcastChannel for cross-worker
 * download deduplication.
 *
 * Cached asset categories:
 * - Pyodide WASM core: `pyodide.asm.wasm`, `pyodide.asm.js`, `python_stdlib.zip`
 * - Pyodide Python wheels: `*.whl`, `pyodide-lock.json`
 * - WebR binaries and CRAN packages: `webr.mjs`, `webr.wasm`, `*.tgz`, `*.bin.tar.gz`
 * - BusyBox and Shell WASM: `busybox.wasm`, `busybox.js`, `sh-runner.wasm`
 */

export const DCL_ASSET_CACHE_NAME = 'dcl-wasm-cache-v1';

/**
 * Match patterns for URLs that should be permanently cached by the asset cache.
 */
const CACHEABLE_URL_PATTERNS = [
  // Pyodide Core and Packages
  /pyodide\.asm\.(wasm|js)/i,
  /python_stdlib\.zip/i,
  /pyodide-lock\.json/i,
  /\.whl(\?.*)?$/i,
  /cdn\.jsdelivr\.net\/pyodide\//i,

  // WebR and CRAN WASM binaries
  /webr\.r-wasm\.org/i,
  /repo\.r-wasm\.org/i,
  /webr\.(mjs|wasm|js)/i,
  /R\.bin\.wasm/i,

  // BusyBox and Shell Runner WASM
  /busybox\.(wasm|js)/i,
  /sh-runner\.wasm/i,
];

/**
 * Map tracking currently in-flight network fetches in this specific JavaScript context.
 */
const inFlightFetches = new Map<string, Promise<Response>>();

/**
 * Determines whether a given URL should be stored in the persistent asset cache.
 */
export function isCacheableAssetUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  return CACHEABLE_URL_PATTERNS.some((pattern) => pattern.test(urlString));
}

/**
 * Resolves a request or URL target to its canonical string representation.
 */
function resolveUrlString(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof (input as Request)?.url === 'string') return (input as Request).url;
  return String(input);
}

/**
 * Resolves the underlying native fetch implementation safely to avoid recursion.
 */
function getNativeFetch(): typeof fetch {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__dcl_original_fetch__) {
    return (globalThis as any).__dcl_original_fetch__;
  }
  return fetch;
}

/**
 * Fetches an asset across concurrent worker threads with deduplication.
 * Uses navigator.locks (if available) so that only ONE worker executes the network
 * download while all others wait on the lock and then read the populated Cache.
 */
async function fetchWithCrossWorkerLock(
  urlString: string,
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const nativeFetch = getNativeFetch();

  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(`dcl-asset-lock:${urlString}`, async () => {
      // Once lock is acquired, check if an earlier worker has already populated the cache
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(DCL_ASSET_CACHE_NAME);
          const cachedResponse = await cache.match(urlString);
          if (cachedResponse) {
            return cachedResponse.clone();
          }

          const networkResponse = await nativeFetch(input, init);
          if (networkResponse.ok) {
            try {
              await cache.put(urlString, networkResponse.clone());
            } catch {
              // Ignore cache errors
            }
          }
          return networkResponse;
        } catch {
          return nativeFetch(input, init);
        }
      }
      return nativeFetch(input, init);
    });
  }

  // Fallback if navigator.locks is unavailable: standard Cache API lookup & fetch
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(DCL_ASSET_CACHE_NAME);
      const cachedResponse = await cache.match(urlString);
      if (cachedResponse) {
        return cachedResponse.clone();
      }

      const networkResponse = await nativeFetch(input, init);
      if (networkResponse.ok) {
        try {
          await cache.put(urlString, networkResponse.clone());
        } catch {
          // Ignore cache errors
        }
      }
      return networkResponse;
    } catch {
      return nativeFetch(input, init);
    }
  }

  return nativeFetch(input, init);
}

/**
 * Custom fetch implementation that queries Cache API first and coalesces in-flight
 * requests across both threads and identical calls in the same thread.
 */
export async function cachedAssetFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const urlString = resolveUrlString(input);
  const nativeFetch = getNativeFetch();

  // If not a cacheable asset, pass directly through to native fetch
  if (!isCacheableAssetUrl(urlString)) {
    return nativeFetch(input, init);
  }

  // 1. Check local in-flight promises in current context synchronously
  const existingFlight = inFlightFetches.get(urlString);
  if (existingFlight) {
    const response = await existingFlight;
    return response.clone();
  }

  // 2. Coalesce immediately by registering the in-flight promise before awaiting any async cache check
  const fetchPromise = (async () => {
    // Perform cache lookup
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(DCL_ASSET_CACHE_NAME);
        const cachedResponse = await cache.match(urlString);
        if (cachedResponse) {
          return cachedResponse.clone();
        }
      } catch {
        // Ignore cache open errors
      }
    }

    return fetchWithCrossWorkerLock(urlString, input, init);
  })();

  inFlightFetches.set(urlString, fetchPromise);

  try {
    const finalResponse = await fetchPromise;
    return finalResponse.clone();
  } finally {
    inFlightFetches.delete(urlString);
  }
}

/**
 * Installs the cached fetch interceptor onto a global scope (Window or WorkerGlobalScope).
 * Automatically wraps `globalThis.fetch` to intercept cacheable WASM/wheel assets.
 */
export function installGlobalFetchCache(): void {
  if (typeof globalThis === 'undefined' || typeof globalThis.fetch !== 'function') {
    return;
  }

  const existingFetch = globalThis.fetch;
  const originalFetchKey = '__dcl_original_fetch__';

  if ((globalThis as any)[originalFetchKey]) {
    return;
  }

  (globalThis as any)[originalFetchKey] = existingFetch;

  globalThis.fetch = async function (input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const urlString = resolveUrlString(input);
    if (isCacheableAssetUrl(urlString)) {
      return cachedAssetFetch(input, init);
    }
    return existingFetch.call(globalThis, input, init);
  };
}
