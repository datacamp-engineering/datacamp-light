import type { IJsonRpcSession } from '../../jsonrpc/session';
import type { IIntrospectParams } from '../../jsonrpc/types';

export type CompletionCategory =
  | 'keyword'
  | 'function'
  | 'variable'
  | 'class'
  | 'constant'
  | 'property'
  | 'type'
  | 'text'
  | 'table'
  | 'column'
  | 'file'
  | 'directory'
  | 'module';

export interface CompletionDocumentation {
  synopsis: string;
  signature?: string;
  parameters?: string[];
  returns?: string;
  example?: string;
}

export interface CompletionSnippetTemplate {
  label: string;
  detail: string;
  category: CompletionCategory;
  snippet: string;
  documentation?: CompletionDocumentation;
  boost?: number;
}

export interface StaticCompletionCatalog {
  language: string;
  templates: readonly CompletionSnippetTemplate[];
}

export type IntrospectionRequest = IIntrospectParams;

export type DynamicCompletionHandler = (
  session: IJsonRpcSession,
  request: IntrospectionRequest,
  signal?: AbortSignal,
) => Promise<readonly CompletionSnippetTemplate[]>;