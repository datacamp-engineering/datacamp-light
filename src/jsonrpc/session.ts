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
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
  SessionStatusCode,
} from './types';

export type StatusListener = (status: ISessionStatus) => void;
export type OutputListener = (output: ISessionOutputNotification) => void;

/**
 * Interactive shell sessions additionally expose a single-command execution
 * path. Unlike runCode, runCommand executes exactly one line (never a
 * replayed script) so shared state such as the working directory persists
 * across keystrokes without side effects from re-running earlier lines.
 */
export interface IRunCommandSession extends IJsonRpcSession {
  runCommand(params: IRunCommandParams): Promise<IRunCommandResult>;
}

export interface IJsonRpcSession {
  initialize(params: IInitializeParams): Promise<void>;
  runCode(params: IRunCodeParams): Promise<IRunCodeResult>;
  submitCode(params: ISubmitCodeParams): Promise<ISubmitCodeResult>;
  request<TResult = unknown, TParams = Record<string, unknown>>(
    method: string,
    params?: TParams,
  ): Promise<TResult>;
  onStatusChange(listener: StatusListener): () => void;
  onOutput(listener: OutputListener): () => void;
  getStatus(): ISessionStatus;
  destroy(): void;
}

export class JsonRpcSessionClient implements IJsonRpcSession {
  private nextId = 1;
  private pendingRequests = new Map<
    JsonRpcId,
    {
      resolve: (value: any) => void;
      reject: (reason: any) => void;
    }
  >();
  private statusListeners = new Set<StatusListener>();
  private outputListeners = new Set<OutputListener>();
  private currentStatus: ISessionStatus = { status: 'none' };

  constructor(private postToWorker: (message: JsonRpcMessage) => void) {}

  public handleMessageFromWorker(message: JsonRpcMessage): void {
    if ('id' in message && message.id !== null) {
      // It's a response
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if ('error' in message && message.error) {
          pending.reject(new Error(message.error.message));
        } else if ('result' in message) {
          pending.resolve(message.result);
        }
      }
    } else if ('method' in message) {
      // It's a notification
      this.handleNotification(message as JsonRpcNotification<any>);
    }
  }

  private handleNotification(notification: JsonRpcNotification<any>): void {
    switch (notification.method) {
      case 'session_status': {
        const status = notification.params as unknown as ISessionStatus;
        if (status) {
          this.currentStatus = status;
          this.statusListeners.forEach((listener) => listener(status));
        }
        break;
      }
      case 'session_output': {
        const output = notification.params as unknown as ISessionOutputNotification;
        if (output) {
          this.outputListeners.forEach((listener) => listener(output));
        }
        break;
      }
      default:
        break;
    }
  }

  public request<TResult, TParams = unknown>(
    method: string,
    params?: TParams,
  ): Promise<TResult> {
    const id = this.nextId++;
    const request: JsonRpcRequest<any> = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.postToWorker(request as JsonRpcMessage);
    });
  }

  public async initialize(params: IInitializeParams): Promise<void> {
    this.setStatus('starting');
    try {
      await this.request('initialize', params);
      this.setStatus('ready');
    } catch (error: any) {
      this.setStatus('broken', error?.message || 'Failed to initialize session');
      throw error;
    }
  }

  public async runCode(params: IRunCodeParams): Promise<IRunCodeResult> {
    this.setStatus('busy');
    try {
      const result = await this.request<IRunCodeResult, IRunCodeParams>('runCode', params);
      this.setStatus('ready');
      return result;
    } catch (error: any) {
      this.setStatus('ready');
      throw error;
    }
  }

  public async runCommand(params: IRunCommandParams): Promise<IRunCommandResult> {
    this.setStatus('busy');
    try {
      const result = await this.request<IRunCommandResult, IRunCommandParams>(
        'runCommand',
        params,
      );
      this.setStatus('ready');
      return result;
    } catch (error: any) {
      this.setStatus('ready');
      throw error;
    }
  }

  public async submitCode(params: ISubmitCodeParams): Promise<ISubmitCodeResult> {
    this.setStatus('busy');
    try {
      const result = await this.request<ISubmitCodeResult, ISubmitCodeParams>('submitCode', params);
      this.setStatus('ready');
      return result;
    } catch (error: any) {
      this.setStatus('ready');
      throw error;
    }
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public onOutput(listener: OutputListener): () => void {
    this.outputListeners.add(listener);
    return () => {
      this.outputListeners.delete(listener);
    };
  }

  public getStatus(): ISessionStatus {
    return this.currentStatus;
  }

  private setStatus(status: SessionStatusCode, message?: string): void {
    this.currentStatus = { status, message };
    this.statusListeners.forEach((listener) => listener(this.currentStatus));
  }

  public destroy(): void {
    this.statusListeners.clear();
    this.outputListeners.clear();
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Session destroyed'));
    });
    this.pendingRequests.clear();
  }
}
