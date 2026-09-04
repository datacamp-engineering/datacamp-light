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

  it('shares the same session when sharedEnvironment is true', () => {
    const firstAcquisition = acquireSession('python', true);
    const secondAcquisition = acquireSession('python', true);

    expect(firstAcquisition.isShared).toBe(true);
    expect(secondAcquisition.isShared).toBe(true);
    expect(firstAcquisition.session).toBe(secondAcquisition.session);
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

    expect(pythonDefault.session).not.toBe(pythonCohort.session);
    expect(pythonCohort.session).not.toBe(rCohort.session);
    expect(getSharedPoolSize()).toBe(3);

    pythonDefault.release();
    pythonCohort.release();
    rCohort.release();
    expect(getSharedPoolSize()).toBe(0);
  });
});
