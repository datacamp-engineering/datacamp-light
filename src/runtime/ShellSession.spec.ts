import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonRpcMessage } from '../jsonrpc/types';
import { createShellSession } from './ShellSession';

class MockWorker {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public posted: JsonRpcMessage[] = [];
  public terminated = false;

  constructor(public url: string) {}

  postMessage(message: JsonRpcMessage) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  // Test helper to simulate a message coming back from the worker
  emit(message: JsonRpcMessage) {
    this.onmessage?.({ data: message } as MessageEvent);
  }
}

describe('createShellSession', () => {
  let createdWorkers: MockWorker[] = [];
  let revokedUrls: string[] = [];

  beforeEach(() => {
    createdWorkers = [];
    revokedUrls = [];

    vi.stubGlobal(
      'Worker',
      vi.fn().mockImplementation((url: string) => {
        const worker = new MockWorker(url);
        createdWorkers.push(worker);
        return worker;
      }),
    );

    vi.stubGlobal('Blob', vi.fn().mockImplementation((parts: unknown[], opts: unknown) => ({ parts, opts })));

    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn().mockImplementation((url: string) => {
        revokedUrls.push(url);
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create a worker from a constructor and wire message passing', () => {
    const session = createShellSession();

    expect(createdWorkers).toHaveLength(1);
    expect(createdWorkers[0].url).toContain('shellWorker.ts');

    session.runCode({ code: 'pwd' });

    expect(createdWorkers[0].posted).toEqual([
      { jsonrpc: '2.0', id: 1, method: 'runCode', params: { code: 'pwd' } },
    ]);
  });

  it('should route worker responses back through the JSON-RPC client', async () => {
    const session = createShellSession();
    const worker = createdWorkers[0];

    const runPromise = session.runCode({ code: 'pwd' });

    worker.emit({ jsonrpc: '2.0', id: 1, result: { output: '/home/repl' } });

    const result = await runPromise;
    expect(result).toEqual({ output: '/home/repl' });
  });

  it('should terminate the worker on destroy', () => {
    const session = createShellSession();
    const worker = createdWorkers[0];

    session.destroy();

    expect(worker.terminated).toBe(true);
  });

  it('should evaluate regex and basic SCTs directly via worker submitCode', async () => {
    const session = createShellSession();
    const worker = createdWorkers[0];

    const submitPromise = session.submitCode({
      code: 'cd ..',
      sct: "test_student_typed(r'cd')",
    });

    worker.emit({
      jsonrpc: '2.0',
      id: 1,
      result: { correct: true, message: 'Great work! Your solution passed all tests.' },
    });

    const result = await submitPromise;
    expect(result.correct).toBe(true);
    expect(result.message).toBe('Great work! Your solution passed all tests.');
  });
});
