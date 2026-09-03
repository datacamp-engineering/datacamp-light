import { JsonRpcSessionClient } from '../jsonrpc/session';
import type { IJsonRpcSession } from '../jsonrpc/session';
import { PYODIDE_WORKER_SCRIPT } from './pyodideWorkerSource';

export function createWasmSession(): IJsonRpcSession {
  // Create an in-memory worker using Blob URL for maximum standalone portability
  const blob = new Blob([PYODIDE_WORKER_SCRIPT], {
    type: 'application/javascript',
  });
  const workerUrl = URL.createObjectURL(blob);
  const worker = new Worker(workerUrl);

  const client = new JsonRpcSessionClient((message) => {
    worker.postMessage(message);
  });

  worker.onmessage = (event: MessageEvent) => {
    client.handleMessageFromWorker(event.data);
  };

  worker.onerror = (error: ErrorEvent) => {
    console.error('DataCamp Light Worker Error:', error);
  };

  const originalDestroy = client.destroy.bind(client);
  client.destroy = () => {
    originalDestroy();
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  };

  return client;
}
