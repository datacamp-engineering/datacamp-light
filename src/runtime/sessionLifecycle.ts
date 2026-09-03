import type {
  ISessionOutputNotification,
  ISessionStatus,
  SessionStatusCode,
} from '../jsonrpc/types';

export type StatusListener = (status: ISessionStatus) => void;
export type OutputListener = (output: ISessionOutputNotification) => void;

/**
 * Shared status and output event-broadcasting lifecycle manager.
 */
export class SessionLifecycle {
  private statusListeners = new Set<StatusListener>();
  private outputListeners = new Set<OutputListener>();
  private currentStatus: ISessionStatus = { status: 'none' };

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

  public setStatus(status: SessionStatusCode, message?: string): void {
    this.currentStatus = { status, message };
    this.statusListeners.forEach((listener) => listener(this.currentStatus));
  }

  public emitOutput(notification: ISessionOutputNotification): void {
    this.outputListeners.forEach((listener) => listener(notification));
  }

  public destroy(): void {
    this.statusListeners.clear();
    this.outputListeners.clear();
  }
}
