import dclConfig from '../../config';
import type { JsonRpcMessage, JsonRpcRequest } from '../../jsonrpc/types';
import dclIpythonSource from '../python/dcl_ipython.py?raw';
import dclPackageManagerSource from '../python/dcl_package_manager.py?raw';
import dclShellBridgeSource from '../python/dcl_shell_bridge.py?raw';
import dclShellwhatParserSource from '../python/dcl_shellwhat_parser.py?raw';
import {
  createBusyboxRunner,
  createEmscriptenVfs,
  createShellInterpreter,
} from '../shellInterpreter';
import type { IShellVfs, WasmAppletRunner } from '../shellInterpreter';
import { SHELLWHAT_PY_SOURCES } from '../shellwhatSources';

declare const loadPyodide: (options?: any) => Promise<any>;
declare const importScripts: (...urls: string[]) => void;

let pyodide: any = null;
let pyodideReadyPromise: Promise<any> | null = null;
let exercise: any = null;
let activeShell: any = null;
const loadedPackages = new Set<string>();

const PYODIDE_INDEX_URL =
  typeof (self as any).DCL_PYODIDE_URL !== 'undefined' && (self as any).DCL_PYODIDE_URL
    ? (self as any).DCL_PYODIDE_URL
    : dclConfig.pyodideUrl || 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/';

const PYTHONWHAT_BUILTIN_DEPENDENCIES = [
  'jinja2',
  'markupsafe',
  'asttokens',
  'six',
  'click',
  'packaging',
  'setuptools',
];

const PYTHONWHAT_MICROPIP_DEPENDENCIES = ['pyodide_backend', 'bashlex'];

async function initPyodide(): Promise<any> {
  if (pyodideReadyPromise) {
    return pyodideReadyPromise;
  }

  pyodideReadyPromise = (async () => {
    if (typeof importScripts === 'function') {
      try {
        importScripts(PYODIDE_INDEX_URL + 'pyodide.js');
      } catch (error) {}
    }
    const loadPyodideFunction =
      typeof (globalThis as any).loadPyodide === 'function'
        ? (globalThis as any).loadPyodide
        : typeof loadPyodide === 'function'
        ? loadPyodide
        : null;

    if (!loadPyodideFunction) {
      throw new Error('Pyodide loader not available');
    }

    pyodide = await loadPyodideFunction({
      indexURL: PYODIDE_INDEX_URL,
      packages: ['micropip'],
    });

    // Install dcl_package_manager shim
    await pyodide.runPythonAsync(dclPackageManagerSource);

    await pyodide.loadPackage(PYTHONWHAT_BUILTIN_DEPENDENCIES);

    const micropip = pyodide.pyimport('micropip');
    await micropip.install(PYTHONWHAT_MICROPIP_DEPENDENCIES);

    // Mount real shellwhat package sources into Pyodide virtual filesystem
    try {
      pyodide.FS.mkdirTree('/lib/python3.12/site-packages/shellwhat/checks');
    } catch (error) {}

    for (const [filePath, content] of Object.entries(SHELLWHAT_PY_SOURCES)) {
      pyodide.FS.writeFile('/lib/python3.12/site-packages/shellwhat/' + filePath, content);
    }

    try { pyodide.FS.mkdir('/home'); } catch (error) {}
    try { pyodide.FS.mkdir('/home/pyodide'); } catch (error) {}
    try { pyodide.FS.mkdir('/tmp'); } catch (error) {}
    try { pyodide.FS.chdir('/home/pyodide'); } catch (error) {}

    const wasmVirtualFileSystem: IShellVfs = createEmscriptenVfs(pyodide);
    activeShell = createShellInterpreter({ vfs: wasmVirtualFileSystem });

    (async () => {
      try {
        if (typeof importScripts === 'function') {
          const resolveAssetUrl = (fileName: string) => {
            const globalScope = self as any;
            if (globalScope.DCL_ASSET_BASE_URL) {
              return String(globalScope.DCL_ASSET_BASE_URL).replace(/\/+$/, '') + '/' + fileName;
            }
            if (dclConfig.assetBaseUrl) {
              return dclConfig.assetBaseUrl.replace(/\/+$/, '') + '/' + fileName;
            }
            const origin = typeof location !== 'undefined' && location.origin ? location.origin : '';
            return (origin ? origin + '/' : '/') + fileName;
          };

          const scriptUrl = resolveAssetUrl('busybox.js');
          try {
            importScripts(scriptUrl);
          } catch (error) {}

          const globalScope = globalThis as any;
          if (typeof globalScope.EmscrJSR_busybox === 'function') {
            let stdoutBuffer = '';
            let stderrBuffer = '';

            const emscriptenModule = await globalScope.EmscrJSR_busybox({
              locateFile: (path: string) => resolveAssetUrl(path),
              thisProgram: 'busybox',
              noInitialRun: true,
              noExitRuntime: true,
              print: (text: string) => {
                stdoutBuffer += (stdoutBuffer ? '\n' : '') + text;
              },
              printErr: (text: string) => {
                stderrBuffer += (stderrBuffer ? '\n' : '') + text;
              },
            });

            emscriptenModule.__resetBuffers = () => {
              stdoutBuffer = '';
              stderrBuffer = '';
            };
            emscriptenModule.__getStdout = () => stdoutBuffer;
            emscriptenModule.__getStderr = () => stderrBuffer;

            const wasmRunner: WasmAppletRunner = createBusyboxRunner(
              emscriptenModule,
              wasmVirtualFileSystem,
            );
            activeShell = createShellInterpreter({
              vfs: wasmVirtualFileSystem,
              wasmRunner,
              preferWasmOverBuiltins: true,
            });
          }
        }
      } catch (error) {}
    })();

    (globalThis as any).dcl_execute_shell = (commandString: string) => {
      if (!activeShell) {
        return JSON.stringify({ output: '', error: 'Shell not initialized', exitCode: 1 });
      }
      const commandResult = activeShell.runCommand(commandString || '');
      return JSON.stringify(commandResult);
    };

    // Load ShellWhat parser and shims
    await pyodide.runPythonAsync(dclShellwhatParserSource);

    // Load POSIX Shell bridge hooking os.system and subprocess
    await pyodide.runPythonAsync(dclShellBridgeSource);

    // Load IPython transformer and magics
    await pyodide.runPythonAsync(dclIpythonSource);

    return pyodide;
  })();

  return pyodideReadyPromise;
}

function transformCode(code: string): string {
  if (!pyodide || !code) return code || '';
  try {
    const transformPythonFunction = pyodide.globals.get('dcl_transform_ipython');
    if (transformPythonFunction) {
      return transformPythonFunction(code);
    }
  } catch (error) {
    console.warn('IPython transform warning:', error);
  }
  return code || '';
}

async function loadPackagesForCode(code: string): Promise<void> {
  if (!pyodide || !code) return;
  try {
    const transformed = transformCode(code);
    await pyodide.loadPackagesFromImports(transformed);
  } catch (error) {
    console.warn('Could not auto-load packages from imports:', error);
  }
}

async function loadExplicitPackages(packages: string[]): Promise<void> {
  if (!pyodide || !packages || packages.length === 0) return;
  const packagesToLoad: string[] = [];
  for (const packageName of packages) {
    const normalizedPackageName = packageName.split('==')[0].trim();
    if (normalizedPackageName && !loadedPackages.has(normalizedPackageName)) {
      packagesToLoad.push(normalizedPackageName);
      loadedPackages.add(normalizedPackageName);
    }
  }
  if (packagesToLoad.length > 0) {
    try {
      await pyodide.loadPackage(packagesToLoad);
    } catch (error) {
      console.warn('Falling back to micropip for packages:', packagesToLoad, error);
      try {
        const micropip = pyodide.pyimport('micropip');
        for (const packageName of packagesToLoad) {
          await micropip.install(packageName);
        }
      } catch (micropipError) {
        console.error('Failed to install package via micropip:', micropipError);
      }
    }
  }
}

function graphPayloadToDataUrl(base64Svg: string): string {
  return 'data:image/svg+xml;base64,' + base64Svg;
}

function emitOutputEntries(entries: Array<{ type: string; payload: any }>): {
  output: string;
  error?: string;
  graph?: string;
} {
  const outputs: string[] = [];
  const errors: string[] = [];
  const graphs: string[] = [];

  for (const entry of entries) {
    if (entry.type === 'graph') {
      const dataUrl = graphPayloadToDataUrl(entry.payload);
      graphs.push(dataUrl);
      self.postMessage({
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'graph', payload: dataUrl },
      });
    } else if (entry.type === 'error') {
      errors.push(entry.payload);
      self.postMessage({
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'error', payload: entry.payload },
      });
    } else if (entry.type === 'output' || entry.type === 'result') {
      outputs.push(String(entry.payload));
      self.postMessage({
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'output', payload: String(entry.payload) },
      });
    } else if (entry.type === 'script-output') {
      const text = entry.payload && entry.payload.output;
      if (text) {
        outputs.push(text);
        self.postMessage({
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'output', payload: text },
        });
      }
    }
  }

  return {
    output: outputs.join('\n'),
    error: errors.length > 0 ? errors.join('\n') : undefined,
    graph: graphs.length > 0 ? graphs[graphs.length - 1] : undefined,
  };
}

self.onmessage = async (event: MessageEvent<JsonRpcMessage>) => {
  const message = event.data;
  if (!message || !('method' in message) || message.jsonrpc !== '2.0') return;

  const request = message as JsonRpcRequest;
  const { id, method, params } = request;

  try {
    await initPyodide();

    if (method === 'initialize') {
      const { pec, solution, sct, packages } = (params as any) || {};
      if (packages && Array.isArray(packages)) {
        await loadExplicitPackages(packages);
      }
      const combinedForImportScan = [pec, solution].filter(Boolean).join('\n');
      await loadPackagesForCode(combinedForImportScan);

      const PyodideExercise = pyodide.pyimport('pyodide_backend').PyodideExercise;
      exercise = PyodideExercise(pec || '', solution || '', sct || '');

      const initResultJson = exercise.run_init();
      const initEntries = JSON.parse(initResultJson);
      emitOutputEntries(initEntries);

      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: { status: 'ready' },
      });
      return;
    }

    if (method === 'runCode') {
      const { code, height, width, stdin } = (params as any) || {};
      const transformedCode = transformCode(code);
      await loadPackagesForCode(transformedCode);

      try {
        const setStandardInputPythonFunction = pyodide.globals.get('_dcl_set_stdin');
        if (setStandardInputPythonFunction) setStandardInputPythonFunction(stdin || null);
      } catch (error) {}

      if (!exercise) {
        const PyodideExercise = pyodide.pyimport('pyodide_backend').PyodideExercise;
        exercise = PyodideExercise('', '', '');
      }

      const resultJson = exercise.run_code(transformedCode || '', height || 320, width || 320);
      const entries = JSON.parse(resultJson);
      const aggregated = emitOutputEntries(entries);

      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: aggregated,
      });
      return;
    }

    if (method === 'submitCode') {
      const { code, height, width, stdin } = (params as any) || {};
      const transformedCode = transformCode(code);
      await loadPackagesForCode(transformedCode);

      try {
        const setStandardInputPythonFunction = pyodide.globals.get('_dcl_set_stdin');
        if (setStandardInputPythonFunction) setStandardInputPythonFunction(stdin || null);
      } catch (error) {}

      if (!exercise) {
        self.postMessage({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: 'Session was not initialized before submitCode' },
        });
        return;
      }

      let resultJson: string;
      try {
        resultJson = exercise.run_submit(transformedCode || '', height || 320, width || 320);
      } catch (submitError: any) {
        console.error('[DataCamp Light SCT Exception]', submitError);
        const rawErrorString = String(
          submitError && submitError.message ? submitError.message : submitError,
        );
        let sanitizedErrorMessage = rawErrorString;

        if (rawErrorString.indexOf('InstructorError:') !== -1) {
          const parts = rawErrorString.split('InstructorError:')[1];
          const description = parts.split('Debug on error:')[0].split('\n')[0].trim();
          sanitizedErrorMessage = 'SCT Error: ' + description;
        } else if (rawErrorString.indexOf('SyntaxError:') !== -1) {
          const parts = rawErrorString.split('SyntaxError:')[1];
          sanitizedErrorMessage = 'SCT SyntaxError: ' + parts.split('\n')[0].trim();
        } else if (rawErrorString.indexOf('NameError:') !== -1) {
          const parts = rawErrorString.split('NameError:')[1];
          sanitizedErrorMessage = 'SCT NameError: ' + parts.split('\n')[0].trim();
        } else {
          const lines = rawErrorString.split('\n').map((line) => line.trim()).filter(Boolean);
          sanitizedErrorMessage = lines[lines.length - 1] || 'Error during SCT evaluation.';
        }

        self.postMessage({
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'sct', payload: { correct: false, message: sanitizedErrorMessage } },
        });

        self.postMessage({
          jsonrpc: '2.0',
          id,
          result: {
            correct: false,
            message: sanitizedErrorMessage,
            output: '',
          },
        });
        return;
      }

      const entries = JSON.parse(resultJson);
      const sctEntry = entries.find((entry: any) => entry.type === 'sct');
      const outputEntries = entries.filter((entry: any) => entry.type !== 'sct');
      const aggregated = emitOutputEntries(outputEntries);

      const correct = sctEntry ? Boolean(sctEntry.payload.correct) : false;
      const sctMessage = sctEntry ? sctEntry.payload.message : 'No SCT was evaluated.';

      self.postMessage({
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'sct', payload: { correct, message: sctMessage } },
      });

      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: {
          correct,
          message: sctMessage,
          output: aggregated.output,
          graph: aggregated.graph,
        },
      });
      return;
    }

    if (method === 'evaluateShellwhat') {
      const { sct, student_code, student_result, pec, solution } = (params as any) || {};
      await initPyodide();
      const evaluateShellwhatPy = pyodide.globals.get('evaluate_shellwhat');
      if (!evaluateShellwhatPy) {
        throw new Error('shellwhat evaluation function not initialized in Pyodide');
      }
      const rawResult = evaluateShellwhatPy(
        sct || '',
        student_code || '',
        student_result || '',
        pec || '',
        solution || '',
      );
      const parsedResult = JSON.parse(rawResult);
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: parsedResult,
      });
      return;
    }

    self.postMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found: ' + method },
    });
  } catch (error: any) {
    self.postMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: (error && error.message) || String(error) },
    });
  }
};
