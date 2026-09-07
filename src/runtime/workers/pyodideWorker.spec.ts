import { beforeAll, describe, expect, it } from 'vitest';
import type { JsonRpcMessage } from '../../jsonrpc/types';

let pyodideWorkerLoaded = false;

const pythonFiles: Record<string, string> = {};

const mockFileSystem = {
  mkdirTree: () => {},
  mkdir: () => {},
  chdir: () => {},
  cwd: () => '/home/repl',
  writeFile: (filePath: string, content: string) => {
    pythonFiles[filePath] = content;
  },
  readFile: (filePath: string) => pythonFiles[filePath] || '',
  unlink: (filePath: string) => {
    delete pythonFiles[filePath];
  },
  analyzePath: (target: string) => ({ exists: Boolean(pythonFiles[target]) }),
  stat: () => ({ mode: 33188 }),
  isDir: () => false,
  readdir: () => Object.keys(pythonFiles),
};

const globalsMap = new Map<string, any>();
globalsMap.set('dcl_transform_ipython', (code: string) => {
  return code
    .replace(/^!(\w+)/gm, '_dcl_ipython_shell("$1")')
    .replace(/^\?(\w+)/gm, '_dcl_ipython_help("$1")');
});
globalsMap.set('evaluate_shellwhat', (_sct: string, _studentCode: string, _studentResult: string, _pec: string, _solution: string) => {
  return JSON.stringify({
    correct: true,
    message: 'Your shell commands look great.',
  });
});

const mockPyodideInstance = {
  FS: mockFileSystem,
  runPythonAsync: async () => {},
  loadPackage: async () => {},
  loadPackagesFromImports: async () => {},
  pyimport: (moduleName: string) => {
    if (moduleName === 'micropip') {
      return { install: async () => {} };
    }
    if (moduleName === 'pyodide_backend') {
      return {
        PyodideExercise: (_pec: string, _solution: string, _sct: string) => ({
          run_init: () => JSON.stringify([{ type: 'output', payload: 'Initialized' }]),
          run_code: (code: string) =>
            JSON.stringify([{ type: 'output', payload: `Executed: ${code}` }]),
          run_submit: (code: string) =>
            JSON.stringify([
              { type: 'output', payload: `Submitted: ${code}` },
              { type: 'sct', payload: { correct: true, message: 'All tests passed' } },
            ]),
        }),
      };
    }
    return {};
  },
  globals: globalsMap,
};

async function ensurePyodideWorkerLoaded() {
  if (!pyodideWorkerLoaded) {
    (globalThis as any).loadPyodide = async () => mockPyodideInstance;
    await import('./pyodideWorker');
    pyodideWorkerLoaded = true;
  }
}

function createPyodideWorkerHarness() {
  const outbound: JsonRpcMessage[] = [];

  (self as any).postMessage = (message: any) => {
    outbound.push(message);
  };

  let nextId = 0;
  const call = async (
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> => {
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

  return { call, outbound, mockFileSystem, globalsMap };
}

describe('pyodideWorker System / FS and IPython Engine', () => {
  beforeAll(async () => {
    await ensurePyodideWorkerLoaded();
  });

  it('initializes session and returns ready status', async () => {
    const { call } = createPyodideWorkerHarness();
    const result = await call('initialize', {
      pec: '',
      solution: '',
      sct: '',
    });
    expect(result.status).toBe('ready');
  });

  it('transforms IPython shell escapes in runCode', async () => {
    const { call } = createPyodideWorkerHarness();
    await call('initialize', { pec: '', solution: '', sct: '' });
    const result = await call('runCode', {
      code: '!ls',
    });
    expect(result.output).toContain('_dcl_ipython_shell("ls")');
  });

  it('transforms IPython introspection queries in runCode', async () => {
    const { call } = createPyodideWorkerHarness();
    await call('initialize', { pec: '', solution: '', sct: '' });
    const result = await call('runCode', {
      code: '?sum',
    });
    expect(result.output).toContain('_dcl_ipython_help("sum")');
  });

  it('evaluates submitCode and returns SCT payload', async () => {
    const { call } = createPyodideWorkerHarness();
    await call('initialize', { pec: '', solution: '', sct: 'success_msg("Pass")' });
    const result = await call('submitCode', {
      code: 'x = 10\nprint(x)',
    });
    expect(result.correct).toBe(true);
    expect(result.message).toBe('All tests passed');
  });

  it('runs shell commands through the unified shell interpreter', async () => {
    const { call } = createPyodideWorkerHarness();
    const result = await call('runCommand', { command: 'touch shell_rpc.txt' });
    expect(result.output).toBe('');
    expect(result.cwd).toBe('/home/repl');
  });

  it('exposes writeFile and readFile over the virtual filesystem', async () => {
    const { call } = createPyodideWorkerHarness();
    await call('writeFile', { path: 'rpc_notes.txt', data: 'hello from rpc' });
    const readResult = await call('readFile', { path: 'rpc_notes.txt' });
    expect(readResult.content).toBe('hello from rpc');
    expect(readResult.cwd).toBe('/home/repl');
  });

  it('submits shell code through the polymorphic submitCode path', async () => {
    const { call } = createPyodideWorkerHarness();
    await call('initialize', { pec: '', solution: '', sct: '' });
    const matching = await call('submitCode', {
      code: 'cd projects',
      sct: "test_student_typed(r'cd projects')",
      language: 'shell',
    });
    expect(matching.correct).toBe(true);
    expect(matching.message).toBe('Great work! Your solution passed all tests.');

    const failing = await call('submitCode', {
      code: 'ls',
      sct: "test_student_typed(r'cd projects')",
      language: 'shell',
    });
    expect(failing.correct).toBe(false);
  });

  it('evaluates shellwhat SCTs through the polymorphic submitCode path', async () => {
    const { call } = createPyodideWorkerHarness();
    await call('initialize', { pec: '', solution: '', sct: '' });
    const result = await call('submitCode', {
      code: 'mkdir data',
      sct: "Ex().has_output()",
      studentResult: 'mkdir data\n',
      language: 'shell',
    });
    expect(result.correct).toBe(true);
    expect(result.message).toBe('Your shell commands look great.');
  });

  it('introspects shell commands when language is shell', async () => {
    const { call } = createPyodideWorkerHarness();
    const result = await call('introspect', {
      code: '',
      line: 0,
      column: 0,
      prefix: '',
      language: 'shell',
    });
    const labels = (result?.completions || []).map((item: any) => item.label);
    expect(labels).toContain('mkdir');
    expect(labels).toContain('pip');
  });

  it('rejects the deprecated evaluateShellwhat RPC method', async () => {
    const { call, outbound } = createPyodideWorkerHarness();
    await expect(call('evaluateShellwhat', {
      sct: 'Ex()',
      student_code: 'ls',
      student_result:'',
    })).rejects.toThrow();
    expect(outbound.some((message) => (message as any).method === 'evaluateShellwhat')).toBe(false);
  });
});
