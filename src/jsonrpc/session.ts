import { SessionLifecycle } from '../runtime/sessionLifecycle';
import type { StatusListener, OutputListener } from '../runtime/sessionLifecycle';
import type {
  IInitializeParams,
  IRunCodeParams,
  IRunCodeResult,
  IRunCommandParams,
  IRunCommandResult,
  IReadFileParams,
  IReadFileResult,
  ISessionOutputNotification,
  ISessionStatus,
  ISubmitCodeParams,
  ISubmitCodeResult,
  IWriteFileParams,
  IWriteFileResult,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
} from './types';

export type { StatusListener, OutputListener };

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
  writeFile(params: IWriteFileParams): Promise<IWriteFileResult>;
  readFile(params: IReadFileParams): Promise<IReadFileResult>;
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
  private lifecycle = new SessionLifecycle();

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
          this.lifecycle.setStatus(status.status, status.message);
        }
        break;
      }
      case 'session_output': {
        const output = notification.params as unknown as ISessionOutputNotification;
        if (output) {
          this.lifecycle.emitOutput(output);
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
    this.lifecycle.setStatus('starting');
    try {
      await this.request('initialize', params);
      this.lifecycle.setStatus('ready');
    } catch (error: any) {
      this.lifecycle.setStatus('broken', error?.message || 'Failed to initialize session');
      throw error;
    }
  }

  public async runCode(params: IRunCodeParams): Promise<IRunCodeResult> {
    this.lifecycle.setStatus('busy');
    try {
      const result = await this.request<IRunCodeResult, IRunCodeParams>('runCode', params);
      this.lifecycle.setStatus('ready');
      return result;
    } catch (error: any) {
      this.lifecycle.setStatus('ready');
      throw error;
    }
  }

  public async runCommand(params: IRunCommandParams): Promise<IRunCommandResult> {
    this.lifecycle.setStatus('busy');
    try {
      const result = await this.request<IRunCommandResult, IRunCommandParams>(
        'runCommand',
        params,
      );
      this.lifecycle.setStatus('ready');
      return result;
    } catch (error: any) {
      this.lifecycle.setStatus('ready');
      throw error;
    }
  }

  public async submitCode(params: ISubmitCodeParams): Promise<ISubmitCodeResult> {
    this.lifecycle.setStatus('busy');
    try {
      const result = await this.request<ISubmitCodeResult, ISubmitCodeParams>('submitCode', params);
      this.lifecycle.setStatus('ready');
      return result;
    } catch (error: any) {
      this.lifecycle.setStatus('ready');
      throw error;
    }
  }

  public async writeFile(params: IWriteFileParams): Promise<IWriteFileResult> {
    const result = await this.request<IWriteFileResult, IWriteFileParams>('writeFile', params);
    return result || {};
  }

  public async readFile(params: IReadFileParams): Promise<IReadFileResult> {
    const result = await this.request<IReadFileResult, IReadFileParams>('readFile', params);
    return result || { content: '' };
  }

  public onStatusChange(listener: StatusListener): () => void {
    return this.lifecycle.onStatusChange(listener);
  }

  public onOutput(listener: OutputListener): () => void {
    return this.lifecycle.onOutput(listener);
  }

  public getStatus(): ISessionStatus {
    return this.lifecycle.getStatus();
  }

  public destroy(): void {
    this.lifecycle.destroy();
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Session destroyed'));
    });
    this.pendingRequests.clear();
  }
}
