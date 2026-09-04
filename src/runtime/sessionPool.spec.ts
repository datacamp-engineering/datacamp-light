import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonRpcMessage } from '../jsonrpc/types';
import {
  acquireSession,
  clearSharedPool,
  getSharedPoolSize,
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

    // Simulate first widget running code
    const runPromise = firstAcquisition.session.runCode({ code: 'x = 42\nprint(x)' });

    const activeWorker = mockWorkerInstance as MockWorker | null;

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
});
