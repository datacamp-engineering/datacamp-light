import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isCacheableAssetUrl,
  cachedAssetFetch,
  installGlobalFetchCache,
  DCL_ASSET_CACHE_NAME,
} from './assetCache';

describe('assetCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isCacheableAssetUrl', () => {
    it('identifies Pyodide core WASM and standard library files as cacheable', () => {
      expect(
        isCacheableAssetUrl('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm'),
      ).toBe(true);
      expect(
        isCacheableAssetUrl('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.js'),
      ).toBe(true);
      expect(
        isCacheableAssetUrl('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/python_stdlib.zip'),
      ).toBe(true);
      expect(
        isCacheableAssetUrl('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide-lock.json'),
      ).toBe(true);
    });

    it('identifies Python wheel packages as cacheable', () => {
      expect(
        isCacheableAssetUrl(
          'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/micropip-0.8.0-py3-none-any.whl',
        ),
      ).toBe(true);
      expect(
        isCacheableAssetUrl(
          'https://files.pythonhosted.org/packages/numpy-1.26.4-cp312-cp312-emscripten_wasm32.whl',
        ),
      ).toBe(true);
    });

    it('identifies webR WASM modules and CRAN binaries as cacheable', () => {
      expect(isCacheableAssetUrl('https://webr.r-wasm.org/latest/webr.mjs')).toBe(true);
      expect(isCacheableAssetUrl('https://webr.r-wasm.org/v0.4.2/R.bin.wasm')).toBe(true);
      expect(
        isCacheableAssetUrl(
          'https://repo.r-wasm.org/bin/emscripten/contrib/4.3/evaluate_0.23.bin.tar.gz',
        ),
      ).toBe(true);
    });

    it('identifies BusyBox and Shell WASM files as cacheable', () => {
      expect(isCacheableAssetUrl('/busybox.wasm')).toBe(true);
      expect(isCacheableAssetUrl('/busybox.js')).toBe(true);
      expect(isCacheableAssetUrl('https://cdn.datacamp.com/dcl/v4/sh-runner.wasm')).toBe(true);
    });

    it('ignores general API endpoints and random HTML requests', () => {
      expect(isCacheableAssetUrl('https://www.datacamp.com/api/users/signed_in.json')).toBe(false);
      expect(
        isCacheableAssetUrl(
          'https://ai-api.datacamp.com/learn/v1/prediction/generate/learn-by-example-explain-code',
        ),
      ).toBe(false);
      expect(isCacheableAssetUrl('https://example.com/index.html')).toBe(false);
      expect(isCacheableAssetUrl('')).toBe(false);
    });
  });

  describe('cachedAssetFetch', () => {
    it('returns cached response when available in Cache API', async () => {
      const mockCachedResponse = new Response('cached-wasm-binary', { status: 200 });
      const mockCache = {
        match: vi.fn().mockResolvedValue(mockCachedResponse),
        put: vi.fn().mockResolvedValue(undefined),
      };

      (globalThis as any).caches = {
        open: vi.fn().mockResolvedValue(mockCache),
      };

      const response = await cachedAssetFetch(
        'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm',
      );
      expect((globalThis as any).caches.open).toHaveBeenCalledWith(DCL_ASSET_CACHE_NAME);
      expect(mockCache.match).toHaveBeenCalledWith(
        'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm',
      );
      const text = await response.text();
      expect(text).toBe('cached-wasm-binary');
    });

    it('fetches from network and populates cache on cache miss', async () => {
      const mockNetworkResponse = new Response('network-wasm-binary', { status: 200 });
      const mockCache = {
        match: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };

      (globalThis as any).caches = {
        open: vi.fn().mockResolvedValue(mockCache),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(mockNetworkResponse);

      const response = await cachedAssetFetch(
        'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/python_stdlib.zip',
      );
      expect(mockCache.match).toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalled();
      expect(mockCache.put).toHaveBeenCalledWith(
        'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/python_stdlib.zip',
        expect.anything(),
      );

      const text = await response.text();
      expect(text).toBe('network-wasm-binary');

      globalThis.fetch = originalFetch;
    });

    it('coalesces concurrent requests for the same asset to a single network fetch', async () => {
      const mockNetworkResponse = new Response('single-flight-binary', { status: 200 });
      let fetchCount = 0;

      const mockCache = {
        match: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };

      (globalThis as any).caches = {
        open: vi.fn().mockResolvedValue(mockCache),
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return mockNetworkResponse.clone();
      });

      const [res1, res2, res3] = await Promise.all([
        cachedAssetFetch('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm'),
        cachedAssetFetch('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm'),
        cachedAssetFetch('https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm'),
      ]);

      expect(fetchCount).toBe(1);
      expect(await res1.text()).toBe('single-flight-binary');
      expect(await res2.text()).toBe('single-flight-binary');
      expect(await res3.text()).toBe('single-flight-binary');

      globalThis.fetch = originalFetch;
    });

    it('falls back gracefully to network fetch when caches API is unavailable', async () => {
      delete (globalThis as any).caches;

      const mockResponse = new Response('direct-fetch', { status: 200 });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const response = await cachedAssetFetch(
        'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm',
      );
      const text = await response.text();
      expect(text).toBe('direct-fetch');

      globalThis.fetch = originalFetch;
    });
  });

  describe('installGlobalFetchCache', () => {
    it('wraps global fetch and intercepts cacheable targets', async () => {
      const mockCachedResponse = new Response('intercepted-asset', { status: 200 });
      const mockCache = {
        match: vi.fn().mockResolvedValue(mockCachedResponse),
        put: vi.fn().mockResolvedValue(undefined),
      };

      (globalThis as any).caches = {
        open: vi.fn().mockResolvedValue(mockCache),
      };

      installGlobalFetchCache();

      const response = await fetch(
        'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.asm.wasm',
      );
      const text = await response.text();
      expect(text).toBe('intercepted-asset');
    });
  });
});
