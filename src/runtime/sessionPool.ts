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
  runtimeLanguage: string;
  referenceCount: number;
  activeScope: ScopedSession | null;
  unsubscribeOutput?: () => void;
  /**
   * The scope whose `initialize` was last successfully applied to the worker.
   * The worker's exercise singleton always belongs to this scope; the replay
   * rule (see ScopedSession.ensureScopeOwnExercise) keeps it aligned with the
   * interacting scope before any state-bearing RPC.
   */
  lastInitializedScope: ScopedSession | null;
  /**
   * Tail of the serialized execution chain for this environment. Every
   * state-bearing RPC (initialize/runCode/submitCode) is appended as one
   * segment so that (a) the worker never interleaves two state-bearing
   * requests at its internal await points and (b) the `activeScope` output
   * bracket is held for the full duration of replay + dispatch.
   */
  chain: Promise<void>;
  /**
   * True while an internal initialize replay is in flight. Output
   * notifications emitted during a replay (re-executed pec prints, plots,
   * pip chatter) are suppressed so learners do not see duplicate output on
   * every widget switch; error entries are still forwarded.
   */
  replaying: boolean;
}

const sharedPool = new Map<string, SharedPoolEntry>();

/**
 * Shared-state RPCs (initialize/runCode/submitCode) depend on the worker's
 * exercise singleton and emit scoped output, so they must flow through
 * ScopedSession (replay + bracket + chain). Shared-state RPCs that never
 * touch the exercise instance (runCommand/writeFile/readFile/introspect via
 * request) operate on worker-wide state (activeShell, Emscripten FS, main
 * interpreter globals) and emit no scoped output.
 */
type SharedSessionStatelessApi = Pick<
  IJsonRpcSession,
  'writeFile' | 'readFile' | 'onStatusChange' | 'onOutput' | 'getStatus'
>;

/**
 * Determines whether a scope's captured initialize should be replayed before a
 * state-bearing RPC in the given runtime. Python-runtime entries only: the
 * shell grading branch re-runs its own pec and never reads the exercise
 * singleton (replaying a shell initialize would reconstruct a bogus Python
 * exercise), and R has no per-instance exercise at all (run/grading state is
 * self-contained in the shared `.GlobalEnv`).
 */
export function isInitializeReplayEligible(
  params: IInitializeParams | null,
  runtimeLanguage: string,
): boolean {
  if (!params) {
    return false;
  }
  if (runtimeLanguage !== 'python') {
    return false;
  }
  if ((params.language ?? '').toLowerCase() === 'shell') {
    return false;
  }
  return true;
}

function enqueueOnChain<T>(entry: SharedPoolEntry, task: () => Promise<T>): Promise<T> {
  const result = entry.chain.then(task, task);
  entry.chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * A per-widget view over a shared pool entry. All state-bearing RPCs
 * (initialize/runCode/submitCode) MUST go through this wrapper: it is the
 * only component that (a) replays the scope's own initialize so the worker's
 * exercise singleton matches the interacting widget, (b) holds the
 * `activeScope` bracket that routes worker output to this widget's console,
 * and (c) participates in the entry's execution chain. Calling the
 * underlying session directly for state-bearing methods silently reintroduces
 * wrong-context grading and output misrouting.
 */
class ScopedSession implements IJsonRpcSession, IRunCommandSession {
  private outputListeners = new Set<OutputListener>();
  private statusListeners = new Set<StatusListener>();
  /**
   * Params from this scope's most recent initialize call, captured eagerly so
   * that a failed initialize can be retried by the next interaction, and a
   * scope switch can replay them. `entry.lastInitializedScope` is only
   * advanced on initialize success.
   */
  private initializeParams: IInitializeParams | null = null;

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

  /**
   * Exposes only the worker-wide (shared-state) surface of the underlying
   * session. State-bearing methods are deliberately omitted: they must go
   * through this ScopedSession so replay and output routing are applied.
   */
  public getUnderlyingSession(): SharedSessionStatelessApi {
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
    this.initializeParams = params;
    return enqueueOnChain(this.entry, () =>
      this.withActiveScope(async () => {
        await this.entry.session.initialize(params);
        this.entry.lastInitializedScope = this;
      }),
    );
  }

  public async runCode(params: IRunCodeParams): Promise<IRunCodeResult> {
    return enqueueOnChain(this.entry, () =>
      this.withActiveScope(async () => {
        await this.ensureScopeOwnExercise();
        return this.entry.session.runCode(params);
      }),
    );
  }

  public async submitCode(params: ISubmitCodeParams): Promise<ISubmitCodeResult> {
    return enqueueOnChain(this.entry, () =>
      this.withActiveScope(async () => {
        await this.ensureScopeOwnExercise();
        return this.entry.session.submitCode(params);
      }),
    );
  }

  public async runCommand(params: IRunCommandParams): Promise<IRunCommandResult> {
    if ('runCommand' in this.entry.session) {
      return this.withActiveScope(() =>
        (this.entry.session as IRunCommandSession).runCommand(params),
      );
    }
    throw new Error('runCommand is not supported for this session type');
  }

  public async writeFile(params: { path: string; data: string }): Promise<{ cwd?: string }> {
    return this.withActiveScope(() =>
      this.entry.session.request<{ cwd?: string }, { path: string; data: string }>('writeFile', params),
    );
  }

  public async readFile(params: { path: string }): Promise<{ content: string; cwd?: string }> {
    return this.withActiveScope(() =>
      this.entry.session.request<{ content: string; cwd?: string }, { path: string }>('readFile', params),
    );
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

  /**
   * Guarantees the worker's exercise singleton belongs to this scope before a
   * state-bearing RPC. Replays this scope's captured initialize when another
   * scope initialized last (python-language scopes only — the shell grading
   * path re-runs its own pec and R has no per-instance exercise), using the
   * raw request path so the shared lifecycle status does not flash
   * `starting` on every widget. A failed replay rejects the acting RPC and
   * leaves the cache untouched, so the next interaction retries.
   */
  private async ensureScopeOwnExercise(): Promise<void> {
    const entry = this.entry;
    if (entry.lastInitializedScope === this) {
      return;
    }

    const params = this.initializeParams;
    if (!params || !isInitializeReplayEligible(params, entry.runtimeLanguage)) {
      // Never-initialized scopes (e.g. the shared shellwhat evaluator, which
      // only submits shell exercises) and non-python runtimes dispatch
      // without replay; their code paths are self-contained.
      return;
    }

    entry.replaying = true;
    try {
      // Raw request instead of the lifecycle-managed initialize: an internal
      // replay must not broadcast `starting` to every widget in the
      // environment. Called directly on the entry session (not through
      // this.initialize) so it never re-enqueues on the chain.
      await entry.session.request<void, IInitializeParams>('initialize', params);
      entry.lastInitializedScope = this;
    } finally {
      entry.replaying = false;
    }
  }

  public destroy(): void {
    this.outputListeners.clear();
    this.statusListeners.clear();
    if (this.entry.lastInitializedScope === this) {
      // A released scope no longer owns the worker's exercise context; the
      // next interacting scope replays its own initialize.
      this.entry.lastInitializedScope = null;
    }
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
 * the same environment share the same runtime worker. Because the worker
 * keeps a single exercise singleton, the pool re-initializes each scope's
 * own context (captured initialize params) before that scope runs or
 * submits code, so every exercise always grades and runs against its own
 * pre-exercise code, solution, and SCT.
 *
 * Cross-language shared environments: once a shared environment is used,
 * Shell exercises are bound to the same unified Pyodide+BusyBox worker that Python
 * exercises in that environment use, so Python and Shell exercises share a
 * single virtual filesystem regardless of which language mounts first.
 * The lightweight standalone ShellSession is only used for non-shared environments.
 *
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

  // Shared environments bind shell to the unified Pyodide+BusyBox worker so
  // Python and Shell exercises with the same environment id share variables and a
  // single virtual filesystem. R stays partitioned since it uses the main-thread
  // webR runtime, and standalone (unshared) shells keep the lightweight worker.
  const runtimeLanguage =
    language.toLowerCase() === 'shell' ? 'python' : language.toLowerCase();
  const poolKey = `${runtimeLanguage}:${environmentId}`;

  let entry = sharedPool.get(poolKey);
  if (!entry) {
    const rootSession = createSessionForLanguage(runtimeLanguage);
    entry = {
      session: rootSession,
      runtimeLanguage,
      referenceCount: 0,
      activeScope: null,
      lastInitializedScope: null,
      chain: Promise.resolve(),
      replaying: false,
    };

    entry.unsubscribeOutput = rootSession.onOutput((notification) => {
      // Internal initialize replays re-execute the replaying scope's pec;
      // suppress the duplicate print/plot output so learners only see it
      // once (at the widget's own initialize). Errors still surface.
      if (entry !== undefined && entry.replaying && notification.type !== 'error' && notification.type !== 'sct') {
        return;
      }
      if (entry !== undefined && entry.activeScope) {
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