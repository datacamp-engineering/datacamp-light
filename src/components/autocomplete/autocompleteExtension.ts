import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { IJsonRpcSession } from '../../jsonrpc/session';
import { getDynamicCompletions } from './dynamicIntrospection';
import { createLazyAutocompleteExtension } from './lazyAutocomplete';
import {
  extractDocumentSymbols,
  getStaticCompletionCatalog,
  getStaticMemberCompletions,
  staticCatalogToCompletions,
  templateToCompletion,
} from './staticCatalogs';
import type { IntrospectionRequest } from './types';

export function createAutocompleteExtension(
  language: string,
  session?: IJsonRpcSession | null,
): Extension {
  return createLazyAutocompleteExtension(language, session);
}

/**
 * Languages whose completion is suppressed inside string literals: identifier
 * completions (keywords, builtins, variables) are never valid inside a string,
 * and accepting one inserts code syntax into the quoted text. Python uses the
 * Lezer grammar (node type `String`); R uses a StreamLanguage whose tokens are
 * named `string`.
 */
const STRING_AWARE_LANGUAGES = new Set(['python', 'r']);

/**
 * True when the completion cursor sits inside a string literal (per the
 * language's syntax tree). Used to suppress identifier completions inside
 * strings; file-path completion would be the future replacement here.
 */
export function isInsideStringLiteral(context: CompletionContext, language: string): boolean {
  if (!STRING_AWARE_LANGUAGES.has(language)) {
    return false;
  }
  let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(context.pos, -1);
  while (node) {
    if (node.name === 'String' || node.name === 'string') {
      return true;
    }
    node = node.parent;
  }
  return false;
}

const languagePrefixPatterns: Record<string, RegExp> = {
  python: /[\w.]*$/,
  r: /[\w.$]*$/,
  sql: /[\w.]*$/,
};
const defaultPrefixPattern = /[\w]*$/;

const languageWordPatterns: Record<string, RegExp> = {
  python: /^\w*$/,
  r: /^\w*$/,
  sql: /^\w*$/,
};
const defaultWordPattern = /^\w*$/;

const memberTriggerCharactersByLanguage: Record<string, string[]> = {
  python: ['.'],
  r: ['$', '.'],
  sql: ['.'],
};

interface MatchRange {
  from: number;
  text: string;
  triggerCharacter: string;
  targetObject: string;
}

export function normalizeLanguage(language?: string): string {
  const normalized = (language || 'python').toLowerCase();
  if (normalized === 'r' || normalized === 'sql' || normalized === 'python') return normalized;
  return 'python';
}

function createContextAbortSignal(context: CompletionContext): AbortSignal | undefined {
  const controller = new AbortController();
  context.addEventListener(
    'abort',
    () => controller.abort(),
    { onDocChange: true },
  );
  return controller.signal;
}

function computeMatchRange(
  language: string,
  context: CompletionContext,
  tokenMatch: { from: number; to: number; text: string } | null,
): MatchRange {
  if (!tokenMatch) return { from: context.pos, text: '', triggerCharacter: '', targetObject: '' };
  let from = tokenMatch.from;
  const triggers = memberTriggerCharactersByLanguage[language] || [];
  let lastTriggerIndex = -1;
  let triggerCharacter = '';
  for (const trigger of triggers) {
    const triggerIndex = tokenMatch.text.lastIndexOf(trigger);
    if (triggerIndex > lastTriggerIndex) {
      lastTriggerIndex = triggerIndex;
      triggerCharacter = trigger;
    }
  }
  if (lastTriggerIndex !== -1) {
    const targetObject = tokenMatch.text.slice(0, lastTriggerIndex).split('.').pop() || '';
    return {
      from: from + lastTriggerIndex + 1,
      text: tokenMatch.text.slice(lastTriggerIndex + 1),
      triggerCharacter,
      targetObject,
    };
  }
  return { from, text: tokenMatch.text, triggerCharacter: '', targetObject: '' };
}

function mergeCompletionsByLabel(
  staticOptions: readonly Completion[],
  dynamicOptions: readonly Completion[],
): Completion[] {
  const optionsByLabel = new Map<string, Completion>();
  const orderedOptions = [...staticOptions, ...dynamicOptions];
  for (const option of orderedOptions) {
    const existing = optionsByLabel.get(option.label);
    if (existing && (existing.boost ?? 0) >= (option.boost ?? 0)) continue;
    optionsByLabel.set(option.label, option);
  }
  return Array.from(optionsByLabel.values());
}

let sourceCounter = 0;

export function createLanguageCompletionSource(
  language: string,
  session?: IJsonRpcSession | null,
): CompletionSource {
  const normalizedLanguage = normalizeLanguage(language);
  const staticCatalog = getStaticCompletionCatalog(normalizedLanguage);
  const staticCompletions = staticCatalogToCompletions(staticCatalog);
  const debounceKey = `language-introspection-${normalizedLanguage}-${++sourceCounter}`;

  return (context: CompletionContext): CompletionResult | null | Promise<CompletionResult | null> => {
    if (isInsideStringLiteral(context, normalizedLanguage)) {
      return null;
    }
    const prefixPattern = languagePrefixPatterns[normalizedLanguage] || defaultPrefixPattern;
    const tokenMatch = context.matchBefore(prefixPattern);
    const matchRange = computeMatchRange(normalizedLanguage, context, tokenMatch);
    const hasTokenText = Boolean(tokenMatch && tokenMatch.text.length > 0);
    const isExplicitTrigger = Boolean(matchRange.triggerCharacter);

    if ((!tokenMatch || (!hasTokenText && !isExplicitTrigger)) && !context.explicit) {
      return null;
    }
    const lineObject = context.state.doc.lineAt(context.pos);
    const docCode = context.state.doc.toString();
    const isMemberAccess = Boolean(matchRange.triggerCharacter);

    let baseOptions: Completion[] = [];
    if (isMemberAccess) {
      const memberTemplates = getStaticMemberCompletions(normalizedLanguage, matchRange.targetObject);
      baseOptions = memberTemplates.map(templateToCompletion);
    } else {
      const documentStaticTemplates = extractDocumentSymbols(docCode, normalizedLanguage);
      const documentStaticCompletions = documentStaticTemplates.map(templateToCompletion);
      baseOptions = mergeCompletionsByLabel(staticCompletions, documentStaticCompletions);
    }

    const request: IntrospectionRequest = {
      language: normalizedLanguage,
      code: docCode,
      line: lineObject.number - 1,
      column: context.pos - lineObject.from,
      prefix: tokenMatch ? tokenMatch.text : '',
      triggerCharacter: matchRange.triggerCharacter,
    };

    const isSessionReady =
      typeof session?.getStatus === 'function'
        ? session.getStatus().status === 'ready'
        : true;

    const wordPattern = languageWordPatterns[normalizedLanguage] || defaultWordPattern;

    if (!session || (!isSessionReady && !isMemberAccess && baseOptions.length > 0)) {
      if (baseOptions.length === 0) return null;
      return {
        from: matchRange.from,
        to: context.pos,
        options: baseOptions,
        validFor: wordPattern,
      };
    }

    const dynamicPromise = getDynamicCompletions(
      normalizedLanguage,
      session,
      request,
      createContextAbortSignal(context),
      debounceKey,
    );

    return dynamicPromise
      .then((dynamicTemplates) => {
        if (context.aborted) return null;
        const dynamicCompletions = dynamicTemplates.map(templateToCompletion);
        const mergedOptions = mergeCompletionsByLabel(baseOptions, dynamicCompletions);
        if (mergedOptions.length === 0) return null;
        return {
          from: matchRange.from,
          to: context.pos,
          options: mergedOptions,
          validFor: wordPattern,
        };
      })
      .catch(() => {
        if (baseOptions.length === 0) return null;
        return {
          from: matchRange.from,
          to: context.pos,
          options: baseOptions,
          validFor: wordPattern,
        };
      });
  };
}
