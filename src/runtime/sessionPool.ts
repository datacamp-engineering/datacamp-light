import type { IJsonRpcSession, IRunCommandSession, OutputListener, StatusListener } from '../jsonrpc/session';
import type {
  IInitializeParams,
  IRunCodeParams,
  IRunCodeResult,
  IRunCommandParams,
  IRunCommandResult,
  ISessionOutputNotification,
  ISessionStatus,
  ISubmitCodeParams,
  ISubmitCodeResult,
} from '../jsonrpc/types';
import { createSessionForLanguage } from './createSessionForLanguage';

interface SharedPoolEntry {
  session: IJsonRpcSession;
  referenceCount: number;
  activeScope: ScopedSession | null;
  unsubscribeOutput?: () => void;
}

const sharedPool = new Map<string, SharedPoolEntry>();

class ScopedSession implements IJsonRpcSession, IRunCommandSession {
  private outputListeners = new Set<OutputListener>();
  private statusListeners = new Set<StatusListener>();

  constructor(
    private entry: SharedPoolEntry,
    public readonly isShared: boolean,
  ) {}

  public onOutput(listener: OutputListener): () => void {
    this.outputListeners.add(listener);
    return () => {
      this.outputListeners.delete(listener);
    };
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return this.entry.session.onStatusChange(listener);
  }

  public getStatus(): ISessionStatus {
    return this.entry.session.getStatus();
  }

  public getUnderlyingSession(): IJsonRpcSession {
    return this.entry.session;
  }

  public emitScopedOutput(notification: ISessionOutputNotification): void {
    this.outputListeners.forEach((listener) => {
      try {
        listener(notification);
      } catch (listenerError) {
        console.warn('Scoped session output listener error:', listenerError);
      }
    });
  }

  public async initialize(params: IInitializeParams): Promise<void> {
    return this.withActiveScope(() => this.entry.session.initialize(params));
  }

  public async runCode(params: IRunCodeParams): Promise<IRunCodeResult> {
    return this.withActiveScope(() => this.entry.session.runCode(params));
  }

  public async submitCode(params: ISubmitCodeParams): Promise<ISubmitCodeResult> {
    return this.withActiveScope(() => this.entry.session.submitCode(params));
  }

  public async runCommand(params: IRunCommandParams): Promise<IRunCommandResult> {
    if ('runCommand' in this.entry.session) {
      return this.withActiveScope(() =>
        (this.entry.session as IRunCommandSession).runCommand(params),
      );
    }
    throw new Error('runCommand is not supported for this session type');
  }

  public async request<TResult = unknown, TParams = Record<string, unknown>>(
    method: string,
    params?: TParams,
  ): Promise<TResult> {
    return this.withActiveScope(() =>
      this.entry.session.request<TResult, TParams>(method, params),
    );
  }

  private async withActiveScope<T>(execute: () => Promise<T>): Promise<T> {
    const previousScope = this.entry.activeScope;
    this.entry.activeScope = this;
    try {
      return await execute();
    } finally {
      this.entry.activeScope = previousScope;
    }
  }

  public destroy(): void {
    this.outputListeners.clear();
    this.statusListeners.clear();
  }
}

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
 * imports, and functions persist across multiple exercises on the page, while output
 * streams are cleanly scoped to the calling widget.
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
    const rootSession = createSessionForLanguage(language);
    entry = {
      session: rootSession,
      referenceCount: 0,
      activeScope: null,
    };

    entry.unsubscribeOutput = rootSession.onOutput((notification) => {
      if (entry?.activeScope) {
        entry.activeScope.emitScopedOutput(notification);
      }
    });

    sharedPool.set(poolKey, entry);
  }

  entry.referenceCount++;

  const scopedSession = new ScopedSession(entry, true);
  let hasReleased = false;

  return {
    session: scopedSession,
    isShared: true,
    environmentId,
    release: () => {
      if (hasReleased) {
        return;
      }
      hasReleased = true;
      scopedSession.destroy();

      const currentEntry = sharedPool.get(poolKey);
      if (!currentEntry) {
        return;
      }

      currentEntry.referenceCount--;
      if (currentEntry.referenceCount <= 0) {
        currentEntry.unsubscribeOutput?.();
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
      entry.unsubscribeOutput?.();
      entry.session.destroy();
    } catch {
      // Ignore errors during test cleanup
    }
  }
  sharedPool.clear();
}
