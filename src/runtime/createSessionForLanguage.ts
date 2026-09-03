import type { IJsonRpcSession, IRunCommandSession } from '../jsonrpc/session';
import { createShellSession } from './ShellSession';
import { createWasmSession } from './WasmSession';
import { RWebRSession } from './RWebRSession';

export function createSessionForLanguage(language: 'shell'): IRunCommandSession;
export function createSessionForLanguage(language: string): IJsonRpcSession;
export function createSessionForLanguage(language: string): IJsonRpcSession {
  switch (language) {
    case 'shell':
      return createShellSession();
    case 'r':
      return new RWebRSession();
    case 'python':
    default:
      return createWasmSession();
  }
}
