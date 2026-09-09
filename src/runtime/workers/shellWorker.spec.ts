import { beforeAll, describe, expect, it } from 'vitest';
import type { JsonRpcMessage } from '../../jsonrpc/types';

let workerInitialized = false;

async function ensureWorkerLoaded() {
  if (!workerInitialized) {
    await import('./shellWorker');
    workerInitialized = true;
  }
}

function createWorkerHarness(options?: { mockWasmModule?: any }) {
  const outbound: JsonRpcMessage[] = [];

  (self as any).postMessage = (message: any) => {
    outbound.push(message);
  };

  if (options?.mockWasmModule) {
    (globalThis as any).EmscrJSR_busybox = options.mockWasmModule;
  }

  let nextId = 0;
  const call = async (method: string, params: Record<string, unknown>): Promise<any> => {
    nextId += 1;
    const id = nextId;
    const handler = (self as any).onmessage;
    if (typeof handler === 'function') {
      await handler({ data: { jsonrpc: '2.0', id, method, params } } as MessageEvent);
    }
    const response = outbound
      .filter((message) => (message as any).id === id)
      .pop() as any;
    if (response?.error) throw new Error(response.error.message);
    return response?.result;
  };

  return { call, outbound };
}

describe('shellWorker JSON-RPC contract', () => {
  beforeAll(async () => {
    await ensureWorkerLoaded();
  });

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

  it('correctly binds script-scoped var declarations to globalThis in Module Workers', () => {
    const scriptCode = 'var EmscrJSR_test_module = function() { return { initialized: true }; };';
    const evaluator = new Function(
      scriptCode +
        '\nif (typeof EmscrJSR_test_module !== "undefined") { globalThis.EmscrJSR_test_module = EmscrJSR_test_module; }',
    );
    evaluator.call(globalThis);
    expect(typeof (globalThis as any).EmscrJSR_test_module).toBe('function');
    expect((globalThis as any).EmscrJSR_test_module().initialized).toBe(true);
  });

  it('introspect suggests shell commands including mkdir and path completions', async () => {
    const { call } = createWorkerHarness();
    const commandResult = await call('introspect', { code: 'mk', line: 0, column: 2, prefix: 'mk' });
    const commandLabels = (commandResult?.completions || []).map((c: any) => c.label);
    expect(commandLabels).toContain('mkdir');

    await call('runCommand', { command: 'mkdir my_project' });
    await call('runCommand', { command: 'touch file1.txt' });

    // cd <space> should only return directories (not files like file1.txt)
    const cdSpaceResult = await call('introspect', { code: 'cd ', line: 0, column: 3, prefix: '' });
    const cdSpaceLabels = (cdSpaceResult?.completions || []).map((c: any) => c.label);
    expect(cdSpaceLabels).toContain('my_project/');
    expect(cdSpaceLabels).not.toContain('file1.txt');
    expect(cdSpaceLabels).not.toContain('cd');

    // ls <space> should return both files and directories
    const lsSpaceResult = await call('introspect', { code: 'ls ', line: 0, column: 3, prefix: '' });
    const lsSpaceLabels = (lsSpaceResult?.completions || []).map((c: any) => c.label);
    expect(lsSpaceLabels).toContain('my_project/');
    expect(lsSpaceLabels).toContain('file1.txt');
    expect(lsSpaceLabels).not.toContain('ls');

    const pathResult = await call('introspect', { code: 'cd my_', line: 0, column: 6, prefix: 'my_' });
    const pathLabels = (pathResult?.completions || []).map((c: any) => c.label);
    expect(pathLabels).toContain('my_project/');
  });

  it('writeFile and readFile expose the virtual filesystem via RPC', async () => {
    const { call } = createWorkerHarness();
    await call('runCommand', { command: 'cd /home/repl' });
    await call('writeFile', { path: 'rpc_notes.txt', data: 'hello from rpc' });
    const readResult = await call('readFile', { path: 'rpc_notes.txt' });
    expect(readResult.content).toBe('hello from rpc');
    expect(readResult.cwd).toBe('/home/repl');
  });

  it('readFile resolves relative paths againstthe current working directory', async () => {
    const { call } = createWorkerHarness();
    await call('runCommand', { command: 'cd /home/repl' });
    await call('runCommand', { command: 'mkdir projects' });
    await call('runCommand', { command: 'cd projects' });
    await call('writeFile', { path: 'uploaded.txt', data: 'relative' });
    const readResult = await call('readFile', { path: 'uploaded.txt' });
    expect(readResult.content).toBe('relative');
    expect(readResult.cwd).toBe('/home/repl/projects');
  });

  it('pip reports Python environment not available in standalone shell', async () => {
    const { call } = createWorkerHarness();
    await call('runCommand', { command: 'cd /home/repl' });
    const result = await call('runCommand', { command: 'pip install numpy' });
    expect(result.output).toBe('');
    expect(result.error).toContain('Python environment not available in standalone shell');
    expect(result.cwd).toBe('/home/repl');
  });

  it('grades shell exercise with regex test_student_typed SCT successfully', async () => {
    const { call } = createWorkerHarness();
    const result = await call('submitCode', {
      code: 'mkdir -p project/src',
      sct: "test_student_typed(r'mkdir\\s+-p\\s+project/src', msg='Please use mkdir with -p')",
    });
    expect(result.correct).toBe(true);
    expect(result.message).toBe('Great work! Your solution passed all tests.');
  });

  it('fails shell exercise with custom message when regex SCT is not satisfied', async () => {
    const { call } = createWorkerHarness();
    const result = await call('submitCode', {
      code: 'mkdir project',
      sct: "test_student_typed(r'mkdir\\s+-p', msg='Please create directories recursively with -p')",
    });
    expect(result.correct).toBe(false);
    expect(result.message).toBe('Please create directories recursively with -p');
  });
});
