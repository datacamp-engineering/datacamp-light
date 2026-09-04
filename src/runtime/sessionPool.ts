import type { IJsonRpcSession, IRunCommandSession } from '../jsonrpc/session';
import { createSessionForLanguage } from './createSessionForLanguage';

interface SharedPoolEntry {
  session: IJsonRpcSession;
  referenceCount: number;
}

const sharedPool = new Map<string, SharedPoolEntry>();

export interface AcquiredSession<T extends IJsonRpcSession = IJsonRpcSession> {
  session: T;
  release: () => void;
  isShared: boolean;
  environmentId?: string;
}

/**
 * Acquires an execution session for a given language.
 *
 * If `sharedEnvironment` is provided (`true` or a string ID), sessions with
 * the same `(language, environmentId)` share the same runtime worker so variables,
 * imports, and functions persist across multiple exercises on the page.
 */
export function acquireSession(
  language: 'shell',
  sharedEnvironment?: boolean | string,
): AcquiredSession<IRunCommandSession>;
export function acquireSession(
  language: string,
  sharedEnvironment?: boolean | string,
): AcquiredSession<IJsonRpcSession>;
export function acquireSession(
  language: string,
  sharedEnvironment?: boolean | string,
): AcquiredSession<any> {
  const isShared = Boolean(
    sharedEnvironment === true ||
      (typeof sharedEnvironment === 'string' &&
        sharedEnvironment.toLowerCase() !== 'false'),
  );

  if (!isShared) {
    const session = createSessionForLanguage(language);
    return {
      session,
      release: () => {
        session.destroy();
      },
      isShared: false,
    };
  }

  const environmentId =
    sharedEnvironment === true || sharedEnvironment === ''
      ? 'default'
      : String(sharedEnvironment).trim() || 'default';

  const poolKey = `${language.toLowerCase()}:${environmentId}`;

  let entry = sharedPool.get(poolKey);
  if (!entry) {
    entry = {
      session: createSessionForLanguage(language),
      referenceCount: 0,
    };
    sharedPool.set(poolKey, entry);
  }

  entry.referenceCount++;

  let hasReleased = false;

  return {
    session: entry.session,
    isShared: true,
    environmentId,
    release: () => {
      if (hasReleased) {
        return;
      }
      hasReleased = true;

      const currentEntry = sharedPool.get(poolKey);
      if (!currentEntry) {
        return;
      }

      currentEntry.referenceCount--;
      if (currentEntry.referenceCount <= 0) {
        currentEntry.session.destroy();
        sharedPool.delete(poolKey);
      }
    },
  };
}

export function getSharedPoolSize(): number {
  return sharedPool.size;
}

export function clearSharedPool(): void {
  for (const entry of sharedPool.values()) {
    try {
      entry.session.destroy();
    } catch {
      // Ignore errors during test cleanup
    }
  }
  sharedPool.clear();
}
