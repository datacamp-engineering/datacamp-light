import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkIsUserSignedIn,
  clearCachedSignedInStatus,
  explainCode,
  fixAndExplainCode,
  parseFixAndExplainResponse,
} from './aiClient';
import { FIX_AND_EXPLAIN_DELIMITER, isFirstPartyDomain } from './aiConfig';

describe('aiConfig', () => {
  it('detects localhost and datacamp domains as first party', () => {
    expect(isFirstPartyDomain()).toBe(true);
  });
});

describe('aiClient', () => {
  beforeEach(() => {
    clearCachedSignedInStatus();
    vi.restoreAllMocks();
  });

  it('parseFixAndExplainResponse splits code and explanation around delimiter', () => {
    const raw = `x = 10\nprint(x)${FIX_AND_EXPLAIN_DELIMITER}Fixed undefined variable error.`;
    const parsed = parseFixAndExplainResponse(raw);
    expect(parsed.updatedCode).toBe('x = 10\nprint(x)');
    expect(parsed.explanation).toBe('Fixed undefined variable error.');
  });

  it('parseFixAndExplainResponse falls back gracefully when delimiter is missing', () => {
    const raw = 'Just an explanation without delimiter.';
    const parsed = parseFixAndExplainResponse(raw);
    expect(parsed.updatedCode).toBe('');
    expect(parsed.explanation).toBe('Just an explanation without delimiter.');
  });

  it('checkIsUserSignedIn returns true on HTTP 200 and caches the result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
    } as any);

    const firstResult = await checkIsUserSignedIn();
    expect(firstResult).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const secondResult = await checkIsUserSignedIn();
    expect(secondResult).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // Cached
  });

  it('checkIsUserSignedIn returns false on non-200 status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 401,
    } as any);

    const result = await checkIsUserSignedIn();
    expect(result).toBe(false);
  });

  it('explainCode reads streaming response and invokes onChunk', async () => {
    const streamChunks = [
      JSON.stringify({ type: 'gpt-partial-answer', choices: [{ text: 'This ' }] }) + '\n',
      JSON.stringify({ type: 'gpt-partial-answer', choices: [{ text: 'is Python.' }] }) + '\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < streamChunks.length) {
          const chunkValue = new TextEncoder().encode(streamChunks[chunkIndex++]);
          return Promise.resolve({ done: false, value: chunkValue });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader,
      },
    } as any);

    const chunksReceived: string[] = [];
    const fullResult = await explainCode({
      code: 'print(42)',
      language: 'python',
      onChunk: (chunk) => chunksReceived.push(chunk),
    });

    expect(fullResult).toBe('This is Python.');
    expect(chunksReceived).toEqual(['This ', 'This is Python.']);
  });

  it('fixAndExplainCode streams response and parses code diff and explanation', async () => {
    const rawPayload = `x = 10\nprint(x)${FIX_AND_EXPLAIN_DELIMITER}Fixed typo in variable name.`;
    const streamChunks = [
      JSON.stringify({ type: 'gpt-partial-answer', choices: [{ text: rawPayload }] }) + '\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (chunkIndex < streamChunks.length) {
          const chunkValue = new TextEncoder().encode(streamChunks[chunkIndex++]);
          return Promise.resolve({ done: false, value: chunkValue });
        }
        return Promise.resolve({ done: true, value: undefined });
      }),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader,
      },
    } as any);

    const result = await fixAndExplainCode({
      code: 'print(x)',
      error: 'NameError: name x is not defined',
      language: 'python',
      onChunk: vi.fn(),
    });

    expect(result.updatedCode).toBe('x = 10\nprint(x)');
    expect(result.explanation).toBe('Fixed typo in variable name.');
  });

  it('explainCode and fixAndExplainCode support mockAi mode without fetch', async () => {
    const receivedChunks: string[] = [];
    const explanation = await explainCode({
      code: 'radius = 5\narea = 3.14 * (radius ** 2)',
      language: 'python',
      mockAi: true,
      onChunk: (chunk) => receivedChunks.push(chunk),
    });

    expect(explanation).toContain('Python');
    expect(receivedChunks.length).toBeGreaterThan(1);

    const fixResult = await fixAndExplainCode({
      code: 'area = pi * (rad ** 2)',
      error: 'NameError: name rad is not defined',
      language: 'python',
      mockAi: true,
      onChunk: vi.fn(),
    });

    expect(fixResult.updatedCode).toContain('radius');
    expect(fixResult.explanation).toContain('Corrected');
  });
});
