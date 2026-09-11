import type { IRunCommandSession } from '../jsonrpc/session';
import type { ISubmitCodeParams, ISubmitCodeResult } from '../jsonrpc/types';
import { acquireSession } from './sessionPool';
import ShellWorkerConstructor from './workers/shellWorker?worker&inline';
import { createWorkerJsonRpcSession } from './workerSession';

/**
 * Creates a WASM-equivalent shell session.
 *
 * Runs BusyBox compiled to WebAssembly inside a Web Worker. When a shellwhat
 * SCT (Ex().has_code(), Ex().has_output(), Ex().has_cwd()) is provided, it
 * routes grading through the shared in-browser Pyodide worker running shellwhat.
 */
export function createShellSession(): IRunCommandSession {
  const { client } = createWorkerJsonRpcSession(ShellWorkerConstructor, {
    name: 'Shell Worker',
  });

  const originalSubmitCode = client.submitCode.bind(client);
  client.submitCode = async (params: ISubmitCodeParams): Promise<ISubmitCodeResult> => {
    const sct = params.sct || '';
    const isShellwhatSct = /\b(Ex\s*\(\s*\)|has_code|has_output|has_cwd|check_node|has_equal_ast)\b/.test(
      sct,
    );

    if (isShellwhatSct) {
      // Execute the code in shell worker to capture output and environment
      const runRes = await client.runCode({ code: params.code });
      try {
        const pyodideSession = acquireSession('python', 'shared-shellwhat-evaluator');
        const evalRes = await pyodideSession.session.submitCode({
          sct,
          code: params.code,
          pec: params.pec || '',
          solution: params.solution || '',
          studentResult: runRes.output || '',
          language: 'shell',
        });
        return {
          correct: evalRes.correct,
          message: evalRes.message,
          output: runRes.output || '',
        };
      } catch (err: any) {
        console.warn('shellwhat evaluation fallback to worker grader:', err);
      }
    }

    return originalSubmitCode(params);
  };

  return client;
}
