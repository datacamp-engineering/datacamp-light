import type { IJsonRpcSession, IRunCommandSession } from '../jsonrpc/session';
import { LazySessionProxy } from './lazySession';

export function createSessionForLanguage(language: 'shell'): IRunCommandSession;
export function createSessionForLanguage(language: string): IJsonRpcSession;
export function createSessionForLanguage(language: string): IJsonRpcSession {
  return new LazySessionProxy(language);
}
