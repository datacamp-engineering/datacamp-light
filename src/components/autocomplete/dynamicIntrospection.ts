import type { IJsonRpcSession } from '../../jsonrpc/session';
import type { IIntrospectCompletion, IIntrospectResult } from '../../jsonrpc/types';
import { getShellVfsCompletions } from '../../runtime/shellCompletions';
import type { CompletionCategory, CompletionSnippetTemplate, IntrospectionRequest } from './types';

export { getShellVfsCompletions };

const DEBOUNCE_DELAY_MS = 80;
const INTROSPECTION_TIMEOUT_MS = 1000;

interface PendingDebounce {
  timer: ReturnType<typeof setTimeout>;
  controller: AbortController;
  resolveQuery: (value: readonly CompletionSnippetTemplate[]) => void;
}

const pendingDebounces = new Map<string, PendingDebounce>();

export function getDynamicCompletions(
  language: string,
  session: IJsonRpcSession | null,
  request: IntrospectionRequest,
  signal?: AbortSignal,
  debounceKey?: string,
): Promise<readonly CompletionSnippetTemplate[]> {
  if (!session || signal?.aborted) return Promise.resolve([]);
  return debouncedIntrospection(debounceKey || language, session, request, signal);
}

function debouncedIntrospection(
  key: string,
  session: IJsonRpcSession,
  request: IntrospectionRequest,
  signal?: AbortSignal,
): Promise<readonly CompletionSnippetTemplate[]> {

  const existing = pendingDebounces.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.resolveQuery([]);
    pendingDebounces.delete(key);
  }

  const controller = new AbortController();
  const controllerAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) return Promise.resolve([]);
    signal.addEventListener('abort', controllerAbort, { once: true });
  }

  return new Promise<readonly CompletionSnippetTemplate[]>((resolve) => {
    const timer = setTimeout(() => {
      const current = pendingDebounces.get(key);
      if (current && current.controller === controller) pendingDebounces.delete(key);
      void performIntrospectionRequest(session, request, controller.signal)
        .then((completions) => {
          if (controller.signal.aborted) resolve([]);
          else resolve(completions);
        })
        .catch(() => resolve([]));
    }, DEBOUNCE_DELAY_MS);

    pendingDebounces.set(key, { timer, controller, resolveQuery: resolve });

    if (signal) {
      const handleAbort = () => {
        clearTimeout(timer);
        controller.abort();
        const current = pendingDebounces.get(key);
        if (current && current.controller === controller) pendingDebounces.delete(key);
        resolve([]);
      };
      signal.addEventListener('abort', handleAbort, { once: true });
    }
  });
}

async function performIntrospectionRequest(
  session: IJsonRpcSession,
  request: IntrospectionRequest,
  signal?: AbortSignal,
): Promise<readonly CompletionSnippetTemplate[]> {

  const result = await withTimeout<IIntrospectResult>(
    session.request<IIntrospectResult>('introspect', {
      language: request.language,
      code: request.code,
      line: request.line,
      column: request.column,
      prefix: request.prefix,
      triggerCharacter: request.triggerCharacter,
    }),
    INTROSPECTION_TIMEOUT_MS,
    signal,
  );
  if (signal?.aborted) return [];
  return normalizeIntrospectedCompletions(result?.completions);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Introspection request timed out'));
      }
    }, timeoutMilliseconds);
    const handleAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Introspection request aborted'));
      }
    };
    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }
    promise.then(
      (result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', handleAbort);
          resolve(result);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', handleAbort);
          reject(error);
        }
      },
    );
  });
}

function normalizeIntrospectedCompletions(
  items?: IIntrospectCompletion[],
): CompletionSnippetTemplate[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item.label !== 'string' || !item.label) return [];
    const documentation = item.info ? { synopsis: item.info } : undefined;
    return [{
      label: item.label,
      detail: item.detail || '',
      category: toCompletionCategory(item.type),
      snippet: item.apply || item.label,
      ...(documentation ? { documentation } : {}),
      ...(typeof item.boost === 'number' ? { boost: item.boost } : {}),
    }];
  });
}

function toCompletionCategory(type: string | undefined): CompletionCategory {
  switch ((type || 'text').toLowerCase()) {
    case 'keyword': return 'keyword';
    case 'function':
    case 'method': return 'function';
    case 'variable':
    case 'constant': return 'constant';
    case 'class':
    case 'type': return 'class';
    case 'property': return 'property';
    case 'module': return 'module';
    case 'table': return 'table';
    case 'column': return 'column';
    case 'file': return 'file';
    case 'dir':
    case 'directory': return 'directory';
    case 'text':
    default: return 'text';
  }
}
