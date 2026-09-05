import { JsonRpcSessionClient } from '../jsonrpc/session';

export interface CreateWorkerSessionOptions {
  preamble?: string;
  name?: string;
}

/**
 * Connects a Web Worker (instantiated directly, from a Worker constructor,
 * or from a script string via Blob URL) to a bidirectional JSON-RPC 2.0 session client.
 */
export function createWorkerJsonRpcSession(
  workerOrSource: Worker | { new (): Worker } | string,
  options?: CreateWorkerSessionOptions,
): { client: JsonRpcSessionClient; worker: Worker } {
  let worker: Worker;
  let blobUrlToRevoke: string | null = null;

  if (typeof workerOrSource === 'function') {
    worker = new workerOrSource();
  } else if (
    typeof workerOrSource === 'object' &&
    workerOrSource !== null &&
    typeof (workerOrSource as any).postMessage === 'function'
  ) {
    worker = workerOrSource as Worker;
  } else {
    const fullSource =
      (options?.preamble ? options.preamble + '\n' : '') + String(workerOrSource);
    const blob = new Blob([fullSource], {
      type: 'application/javascript',
    });
    blobUrlToRevoke = URL.createObjectURL(blob);
    worker = new Worker(blobUrlToRevoke);
  }

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
    if (blobUrlToRevoke) {
      URL.revokeObjectURL(blobUrlToRevoke);
    }
  };

  return { client, worker };
}
