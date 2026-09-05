import dclConfig from '../../config';
import type { JsonRpcMessage, JsonRpcRequest } from '../../jsonrpc/types';
import {
  createBusyboxRunner,
  createEmscriptenVfs,
  createShellInterpreter,
} from '../shellInterpreter';
import type { IShellVfs, WasmAppletRunner } from '../shellInterpreter';

let activeShell = createShellInterpreter();
let wasmReadyPromise: Promise<any> | null = null;

function resolveAssetUrl(fileName: string): string {
  const globalScope = self as any;
  if (globalScope.DCL_ASSET_BASE_URL !== undefined && globalScope.DCL_ASSET_BASE_URL !== '') {
    return String(globalScope.DCL_ASSET_BASE_URL).replace(/\/+$/, '') + '/' + fileName;
  }
  if (dclConfig.assetBaseUrl) {
    return dclConfig.assetBaseUrl.replace(/\/+$/, '') + '/' + fileName;
  }
  const origin = typeof location !== 'undefined' && location.origin ? location.origin : '';
  return (origin ? origin + '/' : '/') + fileName;
}

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
    const evaluator = new Function(scriptCode);
    evaluator.call(globalThis);
  } catch (error) {}
}

async function getWasmModule(): Promise<any> {
  if (wasmReadyPromise) return wasmReadyPromise;

  wasmReadyPromise = (async () => {
    try {
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

        try { emscriptenModule.FS.mkdir('/home'); } catch (error) {}
        try { emscriptenModule.FS.mkdir('/home/repl'); } catch (error) {}
        try { emscriptenModule.FS.mkdir('/tmp'); } catch (error) {}
        emscriptenModule.FS.chdir('/home/repl');

        const wasmVirtualFileSystem: IShellVfs = createEmscriptenVfs(emscriptenModule);
        const wasmRunner: WasmAppletRunner = createBusyboxRunner(emscriptenModule, wasmVirtualFileSystem);
        activeShell = createShellInterpreter({
          vfs: wasmVirtualFileSystem,
          wasmRunner,
          preferWasmOverBuiltins: true,
        });
        return emscriptenModule;
      }
    } catch (error) {
      console.warn('BusyBox WASM initialization warning (using fallback):', error);
    }
    return null;
  })();

  return wasmReadyPromise;
}

self.onmessage = async (event: MessageEvent<JsonRpcMessage>) => {
  const message = event.data;
  if (!message || !('method' in message) || message.jsonrpc !== '2.0') return;
  const request = message as JsonRpcRequest;
  const { id, method, params } = request;

  try {
    if (method === 'initialize') {
      const { pec } = (params as any) || {};
      const moduleInstance = await getWasmModule();
      console.log(
        '[DataCamp Light] Shell engine active:',
        moduleInstance ? 'BusyBox WebAssembly (wasm)' : 'JS fallback interpreter',
      );
      if (pec) activeShell.runScript(pec);
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: { status: 'ready', engine: moduleInstance ? 'wasm' : 'fallback' },
      });
      return;
    }

    if (method === 'runCommand') {
      const { command } = (params as any) || {};
      await getWasmModule();
      const result = activeShell.runCommand(command || '');
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: {
          output: result.output || '',
          error: result.error,
          cwd: activeShell.getCwd(),
        },
      });
      return;
    }

    if (method === 'runCode') {
      const { code } = (params as any) || {};
      await getWasmModule();
      const executionResult = activeShell.runScript(code || '');
      if (executionResult.output) {
        self.postMessage({
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'output', payload: executionResult.output },
        });
      }
      if (executionResult.error) {
        self.postMessage({
          jsonrpc: '2.0',
          method: 'session_output',
          params: { type: 'error', payload: executionResult.error },
        });
      }
      self.postMessage({
        jsonrpc: '2.0',
        id,
        result: { output: executionResult.output, error: executionResult.error || undefined },
      });
      return;
    }

    if (method === 'submitCode') {
      const { code, sct, pec } = (params as any) || {};
      await getWasmModule();
      if (pec) activeShell.runScript(pec);
      const executionResult = activeShell.runScript(code || '');

      let correct = !executionResult.error;
      let feedbackMessage = correct
        ? 'Great work! Your solution passed all tests.'
        : executionResult.error || 'Incorrect command. Please review your input.';

      if (sct && sct.trim() && correct) {
        const sctMatch = sct.match(/test_student_typed\(\s*r?['"](.+?)['"]/);
        if (sctMatch) {
          const regex = new RegExp(sctMatch[1]);
          if (!regex.test(code)) {
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
        result: { correct, message: feedbackMessage, output: executionResult.output },
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
