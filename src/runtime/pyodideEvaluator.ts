import { createWasmSession } from './WasmSession';
import type { IJsonRpcSession } from '../jsonrpc/session';

let sharedPyodideSession: IJsonRpcSession | null = null;

export function getSharedPyodideSession(): IJsonRpcSession {
  if (!sharedPyodideSession) {
    sharedPyodideSession = createWasmSession();
    // Initialize session
    sharedPyodideSession.initialize({}).catch((err) => {
      console.warn('Pyodide session background initialization warning:', err);
    });
  }
  return sharedPyodideSession;
}
