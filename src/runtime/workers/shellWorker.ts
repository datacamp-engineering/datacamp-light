import type { JsonRpcMessage } from '../../jsonrpc/types';
import { installGlobalFetchCache } from '../assetCache';
import { initializeBusyboxRuntime, loadShRunner } from '../busyboxLoader';
import { createShellInterpreter } from '../shellInterpreter';
import { getShellVfsCompletions } from '../shellCompletions';
import { evaluateShellSubmission } from '../shell/shellSct';
import {
  emitSessionOutput,
  isJsonRpcRequest,
  sendRpcError,
  sendRpcSuccess,
} from '../workerRpc';

// Install persistent cache interceptor in Shell Web Worker scope
installGlobalFetchCache();

let activeShell = createShellInterpreter();
let wasmReadyPromise: Promise<any> | null = null;

async function getWasmModule(): Promise<any> {
  if (wasmReadyPromise) return wasmReadyPromise;

  wasmReadyPromise = (async () => {
    try {
      const [busyboxContext] = await Promise.all([
        initializeBusyboxRuntime(),
        loadShRunner().catch(() => false),
      ]);

      if (busyboxContext) {
        activeShell = createShellInterpreter({
          vfs: busyboxContext.virtualFileSystem,
          wasmRunner: busyboxContext.runner,
          preferWasmOverBuiltins: true,
        });
        return busyboxContext.module;
      }
    } catch (error) {
      console.warn('WASM execution unavailable (using js):', error);
    }
    return null;
  })();

  return wasmReadyPromise;
}

self.onmessage = async (event: MessageEvent<JsonRpcMessage>) => {
  const message = event.data;
  if (!isJsonRpcRequest(message)) return;
  const { id, method, params } = message;

  try {
    if (method === 'initialize') {
      const { pec } = (params as any) || {};
      const moduleInstance = await getWasmModule();
      const hasWasmParser = typeof (globalThis as any).dcl_run_sh_wasm === 'function';
      const parser = hasWasmParser ? 'wasm' : 'js';
      const exec = moduleInstance ? 'wasm' : 'js';
      console.log(`[DataCamp Light] Shell engine active - parser: ${parser}, execution: ${exec}`);
      if (pec) activeShell.runScript(pec);
      sendRpcSuccess(id, {
        status: 'ready',
        parser,
        exec,
        engine: exec,
      });
      return;
    }

    if (method === 'writeFile') {
      const { path: filePath, data } = (params as any) || {};
      activeShell.writeFile(filePath || '', data || '');
      sendRpcSuccess(id, { cwd: activeShell.getCwd() });
      return;
    }

    if (method === 'readFile') {
      const { path: filePath } = (params as any) || {};
      const content = activeShell.readFile(filePath || '');
      sendRpcSuccess(id, { content, cwd: activeShell.getCwd() });
      return;
    }

    if (method === 'runCommand') {
      const { command } = (params as any) || {};
      await getWasmModule();
      const result = activeShell.runCommand(command || '');
      sendRpcSuccess(id, {
        output: result.output || '',
        error: result.error,
        cwd: activeShell.getCwd(),
      });
      return;
    }

    if (method === 'runCode') {
      const { code } = (params as any) || {};
      await getWasmModule();
      const executionResult = activeShell.runScript(code || '');
      if (executionResult.output) {
        emitSessionOutput('output', executionResult.output);
      }
      if (executionResult.error) {
        emitSessionOutput('error', executionResult.error);
      }
      sendRpcSuccess(id, {
        output: executionResult.output,
        error: executionResult.error || undefined,
      });
      return;
    }

    if (method === 'introspect') {
      const { code, line, column, prefix, triggerCharacter } = (params as any) || {};
      await getWasmModule();
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
      sendRpcSuccess(id, { completions });
      return;
    }

    if (method === 'submitCode') {
      const { code, sct, pec } = (params as any) || {};
      await getWasmModule();
      if (pec) activeShell.runScript(pec);
      const executionResult = activeShell.runScript(code || '');

      const sctResult = evaluateShellSubmission(code || '', sct, executionResult.error);

      emitSessionOutput('plot', '', { type: 'sct', payload: sctResult });
      // Emit SCT result
      self.postMessage({
        jsonrpc: '2.0',
        method: 'session_output',
        params: { type: 'sct', payload: sctResult },
      });

      sendRpcSuccess(id, {
        correct: sctResult.correct,
        message: sctResult.message,
        output: executionResult.output,
      });
      return;
    }

    sendRpcError(id, -32601, 'Method not found: ' + method);
  } catch (error: any) {
    sendRpcError(id, -32603, (error && error.message) || String(error));
  }
};
