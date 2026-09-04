import { describe, expect, it } from 'vitest';
import type { JsonRpcMessage } from '../jsonrpc/types';
import { SHELL_WORKER_SCRIPT } from './shellWorkerSource';

function createWorkerHarness(options?: { mockWasmModule?: any }) {
  const outbound: JsonRpcMessage[] = [];
  const shim: {
    postMessage: (message: JsonRpcMessage) => void;
    onmessage: ((event: { data: JsonRpcMessage }) => Promise<void> | void) | null;
  } = {
    postMessage: (message) => {
      outbound.push(message);
    },
    onmessage: null,
  };

  if (options?.mockWasmModule) {
    (globalThis as any).EmscrJSR_busybox = options.mockWasmModule;
  }

  const workerFactory = new Function('self', SHELL_WORKER_SCRIPT) as (
    self: unknown,
  ) => void;
  workerFactory(shim);

  let nextId = 0;
  const call = async (method: string, params: Record<string, unknown>): Promise<any> => {
    nextId += 1;
    const id = nextId;
    await shim.onmessage?.({ data: { jsonrpc: '2.0', id, method, params } });
    const response = outbound
      .filter((message) => (message as any).id === id)
      .pop() as any;
    if (response?.error) throw new Error(response.error.message);
    return response?.result;
  };

  return { call, outbound };
}

describe('SHELL_WORKER_SCRIPT shell JSON-RPC contract', () => {
  it('runCommand executes a single command and always reports the cwd', async () => {
    const { call } = createWorkerHarness();
    expect(await call('runCommand', { command: 'pwd' })).toEqual({
      output: '/home/repl',
      cwd: '/home/repl',
    });
  });

  it('cd persists the working directory across runCommand calls and surfaces it', async () => {
    const { call } = createWorkerHarness();
    await call('runCommand', { command: 'mkdir projects' });
    const cdResult = await call('runCommand', { command: 'cd projects' });
    expect(cdResult.output).toBe('');
    expect(cdResult.cwd).toBe('/home/repl/projects');
    expect((await call('runCommand', { command: 'pwd' })).output).toBe('/home/repl/projects');
  });

  it('ls keeps empty output instead of losing it, and lists created files', async () => {
    const { call } = createWorkerHarness();
    const emptyLs = await call('runCommand', { command: 'ls' });
    expect(emptyLs).toMatchObject({ output: '' });
    await call('runCommand', { command: 'touch notes.txt' });
    expect((await call('runCommand', { command: 'ls' })).output).toBe('notes.txt');
  });

  it('submitCode still grades the accumulated history without losing stdout', async () => {
    const { call } = createWorkerHarness();
    const history = ['mkdir projects', 'echo hi > projects/greeting.txt'];
    await call('runCommand', { command: history[0] });
    await call('runCommand', { command: history[1] });
    const submit = await call('submitCode', { code: history.join('\n') });
    expect(submit.correct).toBe(true);
    expect((await call('runCommand', { command: 'cat projects/greeting.txt' })).output).toBe('hi\n');
  });

  it('runCode script path remains intact for multi-line chunks', async () => {
    const { call, outbound } = createWorkerHarness();
    const result = await call('runCode', { code: 'echo one\necho two' });
    expect(result.output).toBe('one\ntwo');
    expect(outbound.some((message) => (message as any).method === 'session_output')).toBe(true);
  });
});
