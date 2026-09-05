import type { IJsonRpcSession } from '../jsonrpc/session';
import PyodideWorkerConstructor from './workers/pyodideWorker?worker&inline';
import { createWorkerJsonRpcSession } from './workerSession';

export function createWasmSession(): IJsonRpcSession {
  const { client } = createWorkerJsonRpcSession(PyodideWorkerConstructor, {
    name: 'Pyodide Worker',
  });

  return client;
}
