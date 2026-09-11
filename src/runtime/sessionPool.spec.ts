import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonRpcMessage } from '../jsonrpc/types';
import {
  acquireSession,
  clearSharedPool,
  getSharedPoolSize,
  isInitializeReplayEligible,
} from './sessionPool';

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
}

describe('sessionPool', () => {
  beforeEach(() => {
    clearSharedPool();

    vi.stubGlobal(
      'Worker',
      vi.fn().mockImplementation((url: string) => {
        return new MockWorker(url);
      }),
    );

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-worker-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    clearSharedPool();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates isolated sessions when sharedEnvironment is false or omitted', () => {
    const firstAcquisition = acquireSession('python');
    const secondAcquisition = acquireSession('python');

    expect(firstAcquisition.isShared).toBe(false);
    expect(secondAcquisition.isShared).toBe(false);
    expect(firstAcquisition.session).not.toBe(secondAcquisition.session);
    expect(getSharedPoolSize()).toBe(0);

    firstAcquisition.release();
    secondAcquisition.release();
  });

  it('shares the same underlying session when sharedEnvironment is true', () => {
    const firstAcquisition = acquireSession('python', true);
    const secondAcquisition = acquireSession('python', true);

    expect(firstAcquisition.isShared).toBe(true);
    expect(secondAcquisition.isShared).toBe(true);
    expect((firstAcquisition.session as any).getUnderlyingSession()).toBe(
      (secondAcquisition.session as any).getUnderlyingSession(),
    );
    expect(getSharedPoolSize()).toBe(1);

    firstAcquisition.release();
    expect(getSharedPoolSize()).toBe(1); // Still 1 active reference

    secondAcquisition.release();
    expect(getSharedPoolSize()).toBe(0); // Cleaned up
  });

  it('partitions shared sessions by language and custom environmentId', () => {
    const pythonDefault = acquireSession('python', 'default');
    const pythonCohort = acquireSession('python', 'cohort-a');
    const rCohort = acquireSession('r', 'cohort-a');

    expect((pythonDefault.session as any).getUnderlyingSession()).not.toBe(
      (pythonCohort.session as any).getUnderlyingSession(),
    );
    expect((pythonCohort.session as any).getUnderlyingSession()).not.toBe(
      (rCohort.session as any).getUnderlyingSession(),
    );
    expect(getSharedPoolSize()).toBe(3);

    pythonDefault.release();
    pythonCohort.release();
    rCohort.release();
    expect(getSharedPoolSize()).toBe(0);
  });

  it('routes output notifications to the actively executing widget scope', async () => {
    let mockWorkerInstance: MockWorker | null = null;
    vi.stubGlobal(
      'Worker',
      vi.fn().mockImplementation((url: string) => {
        mockWorkerInstance = new MockWorker(url);
        return mockWorkerInstance;
      }),
    );

    const firstAcquisition = acquireSession('python', 'shared-test');
    const secondAcquisition = acquireSession('python', 'shared-test');

    const firstOutputHandler = vi.fn();
    const secondOutputHandler = vi.fn();

    firstAcquisition.session.onOutput(firstOutputHandler);
    secondAcquisition.session.onOutput(secondOutputHandler);

    // Pre-initialize session so underlying worker is resolved before testing output routing
    const sharedEntrySession = (firstAcquisition.session as any).getUnderlyingSession();
    await sharedEntrySession.getUnderlyingSession();
    const activeWorker = mockWorkerInstance as MockWorker | null;

    // Simulate first widget running code
    const runPromise = firstAcquisition.session.runCode({ code: 'x = 42\nprint(x)' });

    // Yield macro-task queue so runCode request is posted to activeWorker
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Worker emits output during first run
    activeWorker?.onmessage?.({
      data: {
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'output', payload: '42\n' },
      },
    } as MessageEvent);

    // Worker responds with success
    const lastRequest = activeWorker?.posted.find(
      (msg: JsonRpcMessage) => 'method' in msg && msg.method === 'runCode',
    );
    if (lastRequest && 'id' in lastRequest) {
      activeWorker?.onmessage?.({
        data: {
          jsonrpc: '2.0',
          id: lastRequest.id,
          result: { output: '42\n' },
        },
      } as MessageEvent);
    }

    await runPromise;

    expect(firstOutputHandler).toHaveBeenCalledTimes(1);
    expect(firstOutputHandler).toHaveBeenCalledWith({ type: 'output', payload: '42\n' });
    expect(secondOutputHandler).not.toHaveBeenCalled();

    firstAcquisition.release();
    secondAcquisition.release();
  });

  it('binds shell and python to the same shared worker in a shared environment', () => {
    const shellAcquisition = acquireSession('shell', 'shared-vfs');
    const pythonAcquisition = acquireSession('python', 'shared-vfs');

    expect((shellAcquisition.session as any).getUnderlyingSession()).toBe(
      (pythonAcquisition.session as any).getUnderlyingSession(),
    );
    expect(getSharedPoolSize()).toBe(1);

    shellAcquisition.release();
    expect(getSharedPoolSize()).toBe(1); // Still 1 active reference

    pythonAcquisition.release();
    expect(getSharedPoolSize()).toBe(0); // Cleaned up
  });

  it('keeps shared shell environments separate from shared r environments', () => {
    const shellAcquisition = acquireSession('shell', 'cross-language-demo');
    const rAcquisition = acquireSession('r', 'cross-language-demo');

    expect((shellAcquisition.session as any).getUnderlyingSession()).not.toBe(
      (rAcquisition.session as any).getUnderlyingSession(),
    );
    expect(getSharedPoolSize()).toBe(2);

    shellAcquisition.release();
    rAcquisition.release();
    expect(getSharedPoolSize()).toBe(0);
  });

  it('keeps shared python and shell environments partitioned by environment id', () => {
    const firstEnvironment = acquireSession('shell', 'demo-a');
    const secondEnvironment = acquireSession('python', 'demo-b');

    expect((firstEnvironment.session as any).getUnderlyingSession()).not.toBe(
      (secondEnvironment.session as any).getUnderlyingSession(),
    );
    expect(getSharedPoolSize()).toBe(2);

    firstEnvironment.release();
    secondEnvironment.release();
    expect(getSharedPoolSize()).toBe(0);
  });

  it('keeps standalone shell sessions lightweight and isolated', () => {
    const firstAcquisition = acquireSession('shell');
    const secondAcquisition = acquireSession('shell');

    expect(firstAcquisition.isShared).toBe(false);
    expect(secondAcquisition.isShared).toBe(false);
    expect(firstAcquisition.session).not.toBe(secondAcquisition.session);
    expect(getSharedPoolSize()).toBe(0);

    firstAcquisition.release();
    secondAcquisition.release();
  });

  describe('context replay (shared graded environments)', () => {
    const drain = () => new Promise((resolve) => setTimeout(resolve, 0));

    function lastPostedRequest(
      worker: MockWorker | null,
      method: string,
    ): (JsonRpcMessage & { id: number }) | undefined {
      const posted = worker?.posted ?? [];
      for (let index = posted.length - 1; index >= 0; index--) {
        const message = posted[index] as JsonRpcMessage;
        if ('method' in message && message.method === method && 'id' in message) {
          return message as JsonRpcMessage & { id: number };
        }
      }
      return undefined;
    }

    function postedRequestCount(worker: MockWorker | null, method: string): number {
      return (worker?.posted ?? []).filter(
        (msg: JsonRpcMessage) => 'method' in msg && msg.method === method,
      ).length;
    }

    function respondToLast(worker: MockWorker | null, method: string, result: unknown) {
      const request = lastPostedRequest(worker, method);
      if (request) {
        worker?.onmessage?.({
          data: { jsonrpc: '2.0', id: request.id, result },
        } as MessageEvent);
      }
    }

    /** Waits for a request with the given method to be posted, then answers it. */
    async function respondWhenPosted(
      worker: MockWorker | null,
      method: string,
      result: unknown,
    ): Promise<void> {
      for (let attempt = 0; attempt < 200; attempt++) {
        const request = lastPostedRequest(worker, method);
        if (request) {
          worker?.onmessage?.({
            data: { jsonrpc: '2.0', id: request.id, result },
          } as MessageEvent);
          await drain();
          return;
        }
        await drain();
      }
      throw new Error(`No ${method} request was posted to the worker mock`);
    }

    function captureWorker(): () => MockWorker | null {
      let worker: MockWorker | null = null;
      vi.stubGlobal(
        'Worker',
        vi.fn().mockImplementation((url: string) => {
          worker = new MockWorker(url);
          return worker;
        }),
      );
      return () => worker;
    }

    async function initializeScope(
      getWorker: () => MockWorker | null,
      acquisition: { session: any },
      params: Record<string, unknown>,
    ) {
      const initializePromise = acquisition.session.initialize(params);
      await drain();
      respondToLast(getWorker(), 'initialize', { status: 'ready' });
      await initializePromise;
    }

    it('replays the acting scope initialize before runCode when another scope initialized last', async () => {
      const getWorker = captureWorker();
      const a = acquireSession('python', 'replay-env');
      const b = acquireSession('python', 'replay-env');

      await initializeScope(getWorker, a, { pec: 'pecA', solution: 'solA', sct: 'sctA', language: 'python' });
      await initializeScope(getWorker, b, { pec: 'pecB', solution: 'solB', sct: 'sctB', language: 'python' });

      const worker = getWorker();
      const initializeCountBefore = postedRequestCount(worker, 'initialize');

      const runPromise = a.session.runCode({ code: 'print("a")' });
      await drain();

      // The replayed initialize for scope A must be posted before the runCode
      const replayedInitialize = lastPostedRequest(worker, 'initialize');
      expect(replayedInitialize).toBeDefined();
      expect((replayedInitialize as any).params.pec).toBe('pecA');
      respondToLast(worker, 'initialize', { status: 'ready' });
      await drain();

      const runCodeIndex = worker!.posted.findIndex(
        (msg: JsonRpcMessage) => 'method' in msg && msg.method === 'runCode',
      );
      expect(runCodeIndex).toBeGreaterThan(-1);
      const replayIndex = worker!.posted.indexOf(replayedInitialize!);
      expect(replayIndex).toBeLessThan(runCodeIndex);

      respondToLast(worker, 'runCode', { output: 'a' });
      await runPromise;

      expect(postedRequestCount(worker, 'initialize')).toBe(initializeCountBefore + 1);

      a.release();
      b.release();
    });

    it('does not replay for a single scope interacting repeatedly', async () => {
      const getWorker = captureWorker();
      const acquisition = acquireSession('python', 'solo');
      await initializeScope(getWorker, acquisition, { pec: 'pecA', solution: 'solA', sct: 'sctA', language: 'python' });

      const worker = getWorker();
      const before = postedRequestCount(worker, 'initialize');

      const runPromise = acquisition.session.runCode({ code: 'print(1)' });
      await drain();
      respondToLast(worker, 'runCode', { output: '' });
      await runPromise;

      expect(postedRequestCount(worker, 'initialize')).toBe(before);

      acquisition.release();
    });

    it('replays narrative initialize (empty context) so the plain runner is restored', async () => {
      const getWorker = captureWorker();
      const graded = acquireSession('python', 'mixed-env');
      const narrative = acquireSession('python', 'mixed-env');

      await initializeScope(getWorker, narrative, { pec: '', solution: '', sct: '', packages: [], language: 'python' });
      await initializeScope(getWorker, graded, { pec: 'pecA', solution: 'solA', sct: 'sctA', language: 'python' });

      const runPromise = narrative.session.runCode({ code: 'x = 1' });
      await drain();
      const worker = getWorker();
      const replayedInitialize = lastPostedRequest(worker, 'initialize');
      expect((replayedInitialize as any).params.pec).toBe('');
      respondToLast(worker, 'initialize', { status: 'ready' });
      await drain();
      respondToLast(worker, 'runCode', { output: '' });
      await runPromise;

      graded.release();
      narrative.release();
    });

    it('does not replay initialize for shell-language scopes', async () => {
      const getWorker = captureWorker();
      const pythonScope = acquireSession('python', 'mixed-shell');
      const shellScope = acquireSession('shell', 'mixed-shell');

      await initializeScope(getWorker, pythonScope, { pec: 'pecPy', solution: 'solPy', sct: 'sctPy', language: 'python' });
      await initializeScope(getWorker, shellScope, { pec: 'pecSh', sct: 'sctSh', language: 'shell' });

      const worker = getWorker();
      const before = postedRequestCount(worker, 'initialize');

      const submitPromise = shellScope.session.submitCode({
        code: 'ls',
        sct: 'Ex()',
        pec: 'pecSh',
        solution: 'solSh',
        language: 'shell',
      });
      await drain();
      expect(postedRequestCount(worker, 'initialize')).toBe(before);
      respondToLast(worker, 'submitCode', { correct: true, message: 'ok', output: '' });
      await submitPromise;

      pythonScope.release();
      shellScope.release();
    });

    it('rejects the acting rpc when the replayed initialize fails', async () => {
      const getWorker = captureWorker();
      const a = acquireSession('python', 'replay-failure');
      const b = acquireSession('python', 'replay-failure');

      await initializeScope(getWorker, a, { pec: 'pecA', solution: 'solA', sct: 'sctA', language: 'python' });
      await initializeScope(getWorker, b, { pec: 'pecB', solution: 'solB', sct: 'sctB', language: 'python' });

      const worker = getWorker();
      const runPromise = a.session.runCode({ code: 'print("a")' });
      await drain();

      // The replayed initialize fails
      const replayedInitialize = lastPostedRequest(worker, 'initialize');
      expect(replayedInitialize).toBeDefined();
      worker?.onmessage?.({
        data: {
          jsonrpc: '2.0',
          id: replayedInitialize!.id,
          error: { code: -32000, message: 'Package install failed' },
        },
      } as MessageEvent);

      await expect(runPromise).rejects.toThrow('Package install failed');

      a.release();
      b.release();
    });

    it('suppresses duplicate output notifications during replay but forwards errors', async () => {
      const getWorker = captureWorker();
      const a = acquireSession('python', 'replay-suppression');
      const b = acquireSession('python', 'replay-suppression');

      const outputHandler = vi.fn();
      a.session.onOutput(outputHandler);

      await initializeScope(getWorker, a, { pec: 'pecA', solution: 'solA', sct: 'sctA', language: 'python' });
      await initializeScope(getWorker, b, { pec: 'pecB', solution: 'solB', sct: 'sctB', language: 'python' });

      const runPromise = a.session.runCode({ code: 'print("a")' });
      await drain();

      const worker = getWorker();
      // Worker emits duplicate pec output during the replayed initialize
      worker?.onmessage?.({
        data: {
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'output', payload: 'duplicate pec print' },
        },
      } as MessageEvent);
      // ...and a pec error, which must still be forwarded
      worker?.onmessage?.({
        data: {
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'error', payload: 'pec blew up' },
        },
      } as MessageEvent);

      const replayedInitialize = lastPostedRequest(worker, 'initialize');
      expect(replayedInitialize).toBeDefined();
      respondToLast(worker, 'initialize', { status: 'ready' });

      // Emit run output after replay completes
      await drain();
      worker?.onmessage?.({
        data: {
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'output', payload: 'a\n' },
        },
      } as MessageEvent);

      const runCodeRequest = lastPostedRequest(worker, 'runCode');
      if (runCodeRequest) {
        worker?.onmessage?.({
          data: { jsonrpc: '2.0', id: runCodeRequest.id, result: { output: 'a\n' } },
        } as MessageEvent);
      }

      await runPromise;

      expect(outputHandler).not.toHaveBeenCalledWith({ type: 'output', payload: 'duplicate pec print' });
      expect(outputHandler).toHaveBeenCalledWith({ type: 'error', payload: 'pec blew up' });
      expect(outputHandler).toHaveBeenCalledWith({ type: 'output', payload: 'a\n' });

      a.release();
      b.release();
    });

    it('clears the last-initialized scope when that scope is released', async () => {
      const getWorker = captureWorker();
      const a = acquireSession('python', 'release-hygiene');
      const b = acquireSession('python', 'release-hygiene');

      await initializeScope(getWorker, a, { pec: 'pecA', solution: 'solA', sct: 'sctA', language: 'python' });
      await initializeScope(getWorker, b, { pec: 'pecB', solution: 'solB', sct: 'sctB', language: 'python' });

      // Make A the last-initialized scope by running from A
      const runPromise = a.session.runCode({ code: 'print("a")' });
      await drain();
      const worker = getWorker();
      respondToLast(worker, 'initialize', { status: 'ready' });
      await respondWhenPosted(worker, 'runCode', { output: '' });
      await runPromise;

      // A is now last-initialized; releasing A must clear the cache so the
      // next interacting scope replays its own context.
      a.release();

      const submitPromise = b.session.submitCode({ code: 'print("b")', sct: 'sctB', pec: 'pecB', solution: 'solB' });
      await drain();
      const replayedInitialize = lastPostedRequest(worker, 'initialize');
      expect((replayedInitialize as any).params.pec).toBe('pecB');
      respondToLast(worker, 'initialize', { status: 'ready' });
      await respondWhenPosted(worker, 'submitCode', { correct: true, message: 'ok', output: '' });
      await submitPromise;

      b.release();
    });
  });
});

describe('isInitializeReplayEligible', () => {
  it('is eligible for python-runtime entries with python-language scopes', () => {
    expect(isInitializeReplayEligible({ pec: 'p', solution: 's', sct: 'c', language: 'python' }, 'python')).toBe(true);
  });

  it('is not eligible without captured initialize params', () => {
    expect(isInitializeReplayEligible(null, 'python')).toBe(false);
  });

  it('is not eligible for non-python runtime entries (r)', () => {
    expect(isInitializeReplayEligible({ pec: 'p', solution: 's', sct: 'c', language: 'r' }, 'r')).toBe(false);
  });

  it('is not eligible for shell-language scopes', () => {
    expect(isInitializeReplayEligible({ pec: 'p', sct: 'c', language: 'shell' }, 'python')).toBe(false);
  });
});
