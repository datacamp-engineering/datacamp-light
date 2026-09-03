import type { IJsonRpcSession } from '../jsonrpc/session';
import dclConfig from '../config';
import { PYODIDE_WORKER_SCRIPT } from './pyodideWorkerSource';
import { createWorkerJsonRpcSession } from './workerSession';

export function createWasmSession(): IJsonRpcSession {
  const { client } = createWorkerJsonRpcSession(PYODIDE_WORKER_SCRIPT, {
    name: 'Pyodide Worker',
    preamble: `self.DCL_PYODIDE_URL = ${JSON.stringify(dclConfig.pyodideUrl)};`,
  });

  return client;
}
