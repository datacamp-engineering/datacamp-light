export type JsonRpcId = number | string;

export interface JsonRpcRequest<TParams = Record<string, unknown>> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: TParams;
}

export interface JsonRpcNotification<TParams = Record<string, unknown>> {
  jsonrpc: '2.0';
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccessResponse<TResult = unknown> {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: TResult;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

export type SessionStatusCode =
  | 'none'
  | 'starting'
  | 'ready'
  | 'busy'
  | 'broken'
  | 'stopped';

export interface ISessionStatus {
  status: SessionStatusCode;
  message?: string;
}

export interface IRunCodeParams {
  code: string;
  width?: number;
  height?: number;
}

export interface IRunCodeResult {
  output: string;
  error?: string;
  graph?: string;
}

export interface IRunCommandParams {
  command: string;
}

export interface IRunCommandResult {
  output: string;
  error?: string;
  cwd: string;
}

export interface IWriteFileParams {
  path: string;
  data: string;
}

export interface IWriteFileResult {
  cwd?: string;
}

export interface IReadFileParams {
  path: string;
}

export interface IReadFileResult {
  content: string;
  cwd?: string;
}

export interface ISubmitCodeParams {
  code: string;
  sct?: string;
  pec?: string;
  solution?: string;
  width?: number;
  height?: number;
  language?: string;
  studentResult?: string;
}

export interface ISubmitCodeResult {
  correct: boolean;
  message: string;
  output: string;
  graph?: string;
}

export interface IInitializeParams {
  pec?: string;
  solution?: string;
  sct?: string;
  packages?: string[];
  language?: string;
}

export interface ISessionOutputNotification {
  type: 'output' | 'graph' | 'error' | 'sct';
  payload: unknown;
}

export interface IIntrospectParams {
  language: string;
  code: string;
  line: number;
  column: number;
  prefix: string;
  triggerCharacter?: string;
}

export interface IIntrospectCompletion {
  label: string;
  type: string;
  detail?: string;
  info?: string;
  boost?: number;
  apply?: string;
}

export interface IIntrospectResult {
  completions: IIntrospectCompletion[];
}
