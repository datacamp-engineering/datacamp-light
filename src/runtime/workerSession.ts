import { JsonRpcSessionClient } from '../jsonrpc/session';

export interface CreateWorkerSessionOptions {
  preamble?: string;
  name?: string;
}

/**
 * Creates an in-memory Web Worker from a script string via Blob URL
 * and connects it to a bidirectional JSON-RPC 2.0 session client.
 */
export function createWorkerJsonRpcSession(
  scriptSource: string,
  options?: CreateWorkerSessionOptions,
): { client: JsonRpcSessionClient; worker: Worker } {
  const fullSource = (options?.preamble ? options.preamble + '\n' : '') + scriptSource;
  const blob = new Blob([fullSource], {
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
    console.error(`DataCamp Light ${options?.name || 'Worker'} Error:`, error);
  };

  const originalDestroy = client.destroy.bind(client);
  client.destroy = () => {
    originalDestroy();
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  };

  return { client, worker };
}
