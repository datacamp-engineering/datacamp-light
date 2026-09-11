import type { JsonRpcMessage, JsonRpcRequest } from '../jsonrpc/types';

/**
 * Standardized worker JSON-RPC helper utilities.
 */

export function isJsonRpcRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'jsonrpc' in message &&
    (message as JsonRpcMessage).jsonrpc === '2.0' &&
    'method' in message &&
    typeof (message as JsonRpcRequest).method === 'string'
  );
}

export function sendRpcSuccess(id: number | string, result: unknown): void {
  self.postMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

export function sendRpcError(
  id: number | string,
  code: number,
  message: string,
  data?: unknown,
): void {
  self.postMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  });
}

export function emitSessionOutput(
  type: 'output' | 'error' | 'plot',
  payload: string,
  extra?: Record<string, unknown>,
): void {
  self.postMessage({
    jsonrpc: '2.0',
    method: 'session_output',
    params: {
      type,
      payload,
      ...extra,
    },
  });
}
