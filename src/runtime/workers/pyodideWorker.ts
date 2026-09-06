import dclConfig from '../../config';
import type { JsonRpcMessage, JsonRpcRequest } from '../../jsonrpc/types';
import dclIntrospectionSource from '../python/dcl_introspection.py?raw';
import dclIpythonSource from '../python/dcl_ipython.py?raw';
import dclPackageManagerSource from '../python/dcl_package_manager.py?raw';
import dclShellBridgeSource from '../python/dcl_shell_bridge.py?raw';
import dclShellwhatParserSource from '../python/dcl_shellwhat_parser.py?raw';
import {
  createBusyboxRunner,
  createEmscriptenVfs,
  createShellInterpreter,
} from '../shellInterpreter';
import type { IShellVfs, PipInstallResult, WasmAppletRunner } from '../shellInterpreter';
import { getShellVfsCompletions } from '../../components/autocomplete/dynamicIntrospection';
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

async function loadScriptInWorker(scriptUrl: string): Promise<void> {
  if (typeof importScripts === 'function') {
    try {
      importScripts(scriptUrl);
      return;
    } catch (error) {}
  }
  try {
    const response = await fetch(scriptUrl);
    if (!response.ok) return;
    const scriptCode = await response.text();
    const evaluator = new Function(
      scriptCode +
        '\nif (typeof EmscrJSR_busybox !== "undefined") { globalThis.EmscrJSR_busybox = EmscrJSR_busybox; }',
    );
    evaluator.call(globalThis);
  } catch (error) {}
}

async function loadPyodideRuntime(): Promise<any> {
  if (typeof (globalThis as any).loadPyodide === 'function') {
    return (globalThis as any).loadPyodide;
  }
  if (typeof importScripts === 'function') {
    try {
      importScripts(PYODIDE_INDEX_URL + 'pyodide.js');
      if (typeof (globalThis as any).loadPyodide === 'function') {
        return (globalThis as any).loadPyodide;
      }
    } catch (error) {}
  }

  // Module worker / ESM fallback: dynamic import of pyodide.mjs
  try {
    const pyodideModule = await import(/* @vite-ignore */ PYODIDE_INDEX_URL + 'pyodide.mjs');
    if (pyodideModule && typeof pyodideModule.loadPyodide === 'function') {
      return pyodideModule.loadPyodide;
    }
  } catch (esmError) {
    try {
      const response = await fetch(PYODIDE_INDEX_URL + 'pyodide.js');
      if (response.ok) {
        const scriptCode = await response.text();
        const evaluator = new Function(scriptCode);
        evaluator.call(globalThis);
        if (typeof (globalThis as any).loadPyodide === 'function') {
          return (globalThis as any).loadPyodide;
        }
      }
    } catch (fetchError) {}
  }

  throw new Error('Pyodide loader not available');
}

async function pipInstallInPyodide(packages: string[]): Promise<PipInstallResult> {
  const packagesToInstall: string[] = [];
  const alreadyLoaded: string[] = [];
  for (const requestedPackage of packages) {
    const normalizedPackageName = requestedPackage.split('==')[0].split('>=')[0].split('<=')[0].split('~=')[0].split('!=')[0].trim();
    if (loadedPackages.has(normalizedPackageName)) {
      alreadyLoaded.push(requestedPackage);
      continue;
    }
    loadedPackages.add(normalizedPackageName);
    packagesToInstall.push(requestedPackage);
  }

  try {
    const micropip = pyodide.pyimport('micropip');
    if (packagesToInstall.length > 0) {
      await micropip.install(packagesToInstall);
      self.postMessage({
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'output', payload: 'Installed ' + packagesToInstall.join(', ') },
      });
    } else if (alreadyLoaded.length > 0) {
      self.postMessage({
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'output', payload: alreadyLoaded.join(', ') + ' already installed' },
      });
    }
    return { output: 'Installed ' + packages.join(', '), exitCode: 0 };
  } catch (installError: any) {
    // Fall back to pyodide.loadPackage for packages bundled with the runtime
    let fallbackFailed = false;
    for (const requestedPackage of packagesToInstall) {
      try {
        await pyodide.loadPackage(requestedPackage.split('==')[0].trim());
        self.postMessage({
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'output', payload: 'Installed ' + requestedPackage },
        });
      } catch (loadPackageError) {
        fallbackFailed = true;
        const installErrorMessage = String(installError?.message || installError);
        self.postMessage({
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'error', payload: 'pip: failed to install ' + requestedPackage + ': ' + installErrorMessage },
        });
      }
    }
    if (fallbackFailed) {
      return {
        error: 'pip: failed to install ' + packages.join(', '),
        exitCode: 1,
        output: '',
      };
    }
    return { output: 'Installed ' + packages.join(', '), exitCode: 0 };
  }
}

async function initPyodide(): Promise<any> {
  if (pyodideReadyPromise) {
    return pyodideReadyPromise;
  }

  pyodideReadyPromise = (async () => {
    const loadPyodideFunction = await loadPyodideRuntime();

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
    activeShell = createShellInterpreter({
      vfs: wasmVirtualFileSystem,
      onPipInstall: pipInstallInPyodide,
    });

    (async () => {
      try {
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
        await loadScriptInWorker(scriptUrl);

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
            onPipInstall: pipInstallInPyodide,
          });
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

    // Load runtime introspection helpers for autocompletion
    await pyodide.runPythonAsync(dclIntrospectionSource);

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
      if (exercise && exercise.user_process && exercise.user_process.shell) {
        try {
          pyodide.globals.set('_dcl_active_locals', exercise.user_process.shell.locals);
        } catch (error) {}
      }
      const entries = JSON.parse(resultJson);
      const aggregated = emitOutputEntries(entries);

      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: aggregated,
      });
      return;
    }

    if (method === 'runCommand') {
      const { command } = (params as any) || {};
      const commandResult = activeShell.runCommand(command || '');
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: {
          output: commandResult.output || '',
          error: commandResult.error,
          cwd: activeShell.getCwd(),
        },
      });
      return;
    }

    if (method === 'writeFile') {
      const { path: filePath, data } = (params as any) || {};
      activeShell.writeFile(filePath || '', data || '');
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: { cwd: activeShell.getCwd() },
      });
      return;
    }

    if (method === 'readFile') {
      const { path: filePath } = (params as any) || {};
      const content = activeShell.readFile(filePath || '');
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: { content, cwd: activeShell.getCwd() },
      });
      return;
    }

    if (method === 'submitCode') {
      const { code, height, width, stdin, sct, pec, solution, language, studentResult } = (params as any) || {};

      // Shell submissions run through the shared BusyBox shell so Python and
      // Shell exercises in a shared environment see the same virtual filesystem.
      if (language === 'shell') {
        if (pec) activeShell.runScript(pec);

        let studentOutput = studentResult;
        if (typeof studentOutput !== 'string') {
          const executionResult = activeShell.runScript(code || '');
          studentOutput = executionResult.output || '';
          if (executionResult.error) {
            studentOutput += (studentOutput ? '\n' : '') + executionResult.error;
          }
        }

        const isShellwhatSct = /\b(Ex\s*\(\s*\)|has_code|has_output|has_cwd|check_node|has_equal_ast)\b/.test(
          sct || '',
        );

        if (isShellwhatSct) {
          const evaluateShellwhatPy = pyodide.globals.get('evaluate_shellwhat');
          if (!evaluateShellwhatPy) {

            throw new Error('shellwhat evaluation function not initialized in Pyodide');
          }
          const rawResult = evaluateShellwhatPy(
            sct || '',
            code || '',
            studentOutput || '',
            pec || '',
            solution || '',
          );
          const parsedResult = JSON.parse(rawResult);
          const correct = typeof parsedResult.correct === 'boolean' ? parsedResult.correct : false;
          const shellwhatMessage = parsedResult.message || 'Submission evaluated.';

          self.postMessage({
            jsonrpc: '2.0',
            method: 'session_output',
            params: { type: 'sct', payload: { correct, message: shellwhatMessage } },
          });

          self.postMessage({
            jsonrpc: '2.0',
            id,
            result: {
              correct,
              message: shellwhatMessage,
              output: studentOutput || '',
            },
          });
          return;
        }

        let correct = true;
        let feedbackMessage = 'Great work! Your solution passed all tests.';
        if (sct && sct.trim() && correct) {

          const sctMatch = sct.match(/test_student_typed\(\s*r?['"](.+?)['"]/);
          if (sctMatch) {
            const regex = new RegExp(sctMatch[1]);
            if (!regex.test(code || '')) {
              correct = false;
              const messageMatch = sct.match(/msg\s*=\s*['"](.+?)['"]/);
              feedbackMessage = messageMatch
                ? messageMatch[1]
                : 'Your command did not match the expected pattern.';
            }
          }
        }

        self.postMessage({
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'sct', payload: { correct, message: feedbackMessage } },
        });

        self.postMessage({
          jsonrpc: '2.0',
          id,
          result: { correct, message: feedbackMessage, output: studentOutput || '' },
        });
        return;
      }

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
        if (exercise && exercise.user_process && exercise.user_process.shell) {
          try {
            pyodide.globals.set('_dcl_active_locals', exercise.user_process.shell.locals);
          } catch (error) {}
        }
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

    if (method === 'introspect') {
      const { code, line, column, prefix, triggerCharacter, language } = (params as any) || {};
      await initPyodide();

      if (language === 'shell') {
        const availableCommands =
          typeof activeShell.getAvailableCommands === 'function'
            ? activeShell.getAvailableCommands()
            : undefined;
        const completions = getShellVfsCompletions(
          activeShell.getVfs(),
          activeShell.getCwd(),
          code || '',
          line || 0,
          column || 0,
          prefix || '',
          triggerCharacter || '',
          availableCommands,
        );
        self.postMessage({
          jsonrpc: '2.0',
          id,
          result: { completions },
        });
        return;
      }

      if (exercise && exercise.user_process && exercise.user_process.shell) {
        try {
          pyodide.globals.set('_dcl_active_locals', exercise.user_process.shell.locals);
        } catch (error) {}
      }
      const introspectFunction = pyodide.globals.get('dcl_introspect');
      if (typeof introspectFunction !== 'function') {
        throw new Error('Introspection function is not available in Pyodide');
      }
      const rawResult = introspectFunction(
        code || '',
        line || 0,
        column || 0,
        prefix || '',
        triggerCharacter || '',
      );
      const completions = JSON.parse(rawResult);
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: { completions },
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
