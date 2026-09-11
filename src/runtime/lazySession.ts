import type {
  IJsonRpcSession,
  IRunCommandSession,
  OutputListener,
  StatusListener,
} from '../jsonrpc/session';
import type {
  IInitializeParams,
  IReadFileParams,
  IReadFileResult,
  IRunCodeParams,
  IRunCodeResult,
  IRunCommandParams,
  IRunCommandResult,
  ISessionOutputNotification,
  ISessionStatus,
  ISubmitCodeParams,
  ISubmitCodeResult,
  IWriteFileParams,
  IWriteFileResult,
} from '../jsonrpc/types';
import { SessionLifecycle } from './sessionLifecycle';

/**
 * A lightweight proxy session that fulfills `IJsonRpcSession` and `IRunCommandSession`
 * immediately, deferring the dynamic import of heavy inlined worker scripts until the
 * first RPC method is called or status is subscribed.
 */
export class LazySessionProxy implements IJsonRpcSession, IRunCommandSession {
  private lifecycle = new SessionLifecycle();
  private underlyingSessionPromise: Promise<IJsonRpcSession | IRunCommandSession> | null = null;
  private underlyingSession: (IJsonRpcSession | IRunCommandSession) | null = null;
  private pendingOutputListeners = new Set<OutputListener>();
  private pendingStatusListeners = new Set<StatusListener>();
  private unsubscribers: Array<() => void> = [];

  constructor(private readonly language: string) {}

  public async getUnderlyingSession(): Promise<IJsonRpcSession | IRunCommandSession> {
    if (this.underlyingSession) {
      return this.underlyingSession;
    }

    if (!this.underlyingSessionPromise) {
      this.underlyingSessionPromise = (async () => {
        const lang = this.language.toLowerCase();
        let session: IJsonRpcSession | IRunCommandSession;

        switch (lang) {
          case 'shell': {
            const { createShellSession } = await import('./ShellSession');
            session = createShellSession();
            break;
          }
          case 'r': {
            const { RWebRSession } = await import('./RWebRSession');
            session = new RWebRSession();
            break;
          }
          case 'python':
          default: {
            const { createWasmSession } = await import('./WasmSession');
            session = createWasmSession();
            break;
          }
        }

        this.underlyingSession = session;

        // Forward output notifications from the underlying session
        const unsubOutput = session.onOutput((notification: ISessionOutputNotification) => {
          for (const listener of this.pendingOutputListeners) {
            listener(notification);
          }
        });
        this.unsubscribers.push(unsubOutput);

        // Forward status changes from the underlying session
        const unsubStatus = session.onStatusChange((status: ISessionStatus) => {
          this.lifecycle.setStatus(status.status, status.message);
          for (const listener of this.pendingStatusListeners) {
            listener(status);
          }
        });
        this.unsubscribers.push(unsubStatus);

        return session;
      })();
    }

    return this.underlyingSessionPromise;
  }

  public async request<TResult = unknown, TParams = Record<string, unknown>>(
    method: string,
    params?: TParams,
  ): Promise<TResult> {
    const session = await this.getUnderlyingSession();
    return session.request<TResult, TParams>(method, params);
  }

  public async initialize(params: IInitializeParams): Promise<void> {
    this.lifecycle.setStatus('starting');
    const session = await this.getUnderlyingSession();
    return session.initialize(params);
  }

  public async runCode(params: IRunCodeParams): Promise<IRunCodeResult> {
    const session = await this.getUnderlyingSession();
    return session.runCode(params);
  }

  public async submitCode(params: ISubmitCodeParams): Promise<ISubmitCodeResult> {
    const session = await this.getUnderlyingSession();
    return session.submitCode(params);
  }

  public async writeFile(params: IWriteFileParams): Promise<IWriteFileResult> {
    const session = await this.getUnderlyingSession();
    return session.writeFile(params);
  }

  public async readFile(params: IReadFileParams): Promise<IReadFileResult> {
    const session = await this.getUnderlyingSession();
    return session.readFile(params);
  }

  public async runCommand(params: IRunCommandParams): Promise<IRunCommandResult> {
    const session = await this.getUnderlyingSession();
    if ('runCommand' in session && typeof session.runCommand === 'function') {
      return session.runCommand(params);
    }
    throw new Error(`runCommand is not supported by session language: ${this.language}`);
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.pendingStatusListeners.add(listener);
    if (this.underlyingSession) {
      const unsub = this.underlyingSession.onStatusChange(listener);
      return () => {
        this.pendingStatusListeners.delete(listener);
        unsub();
      };
    }
    return () => {
      this.pendingStatusListeners.delete(listener);
    };
  }

  public onOutput(listener: OutputListener): () => void {
    this.pendingOutputListeners.add(listener);
    let underlyingUnsub: (() => void) | null = null;
    if (this.underlyingSession) {
      underlyingUnsub = this.underlyingSession.onOutput(listener);
    }
    return () => {
      this.pendingOutputListeners.delete(listener);
      underlyingUnsub?.();
    };
  }

  public getStatus(): ISessionStatus {
    if (this.underlyingSession) {
      return this.underlyingSession.getStatus();
    }
    return this.lifecycle.getStatus();
  }

  public destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.pendingOutputListeners.clear();
    this.pendingStatusListeners.clear();
    if (this.underlyingSession) {
      this.underlyingSession.destroy();
    }
    this.lifecycle.destroy();
  }
}
