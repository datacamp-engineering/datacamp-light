import { beforeAll, describe, expect, it } from 'vitest';
import type { JsonRpcMessage } from '../../jsonrpc/types';

let pyodideWorkerLoaded = false;

const pythonFiles: Record<string, string> = {};

const mockFileSystem = {
  mkdirTree: () => {},
  mkdir: () => {},
  chdir: () => {},
  cwd: () => '/home/pyodide',
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
});
