import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { hexToRgba } from '@datacamp/waffles/helpers';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import type { IJsonRpcSession } from '../../jsonrpc/session';
import { getDynamicCompletions } from './dynamicIntrospection';
import {
  extractDocumentSymbols,
  getStaticCompletionCatalog,
  staticCatalogToCompletions,
  templateToCompletion,
} from './staticCatalogs';
import type { IntrospectionRequest } from './types';

const languagePrefixPatterns: Record<string, RegExp> = {
  python: /[\w.]*$/,
  r: /[\w.$]*$/,
  shell: /[\w./~-]*$/,
  sql: /[\w.]*$/,
};
const defaultPrefixPattern = /[\w]*$/;

const memberTriggerCharactersByLanguage: Record<string, string[]> = {
  python: ['.'],
  r: ['$', '.'],
  sql: ['.'],
};

interface MatchRange {
  from: number;
  text: string;
  triggerCharacter: string;
}

export function normalizeLanguage(language?: string): string {
  const normalized = (language || 'python').toLowerCase();
  if (normalized === 'bash' || normalized === 'sh' || normalized === 'zsh') return 'shell';
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
  if (!tokenMatch) return { from: context.pos, text: '', triggerCharacter: '' };
  let from = tokenMatch.from;
  if (language === 'shell') {
    const lastSlashIndex = tokenMatch.text.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      return {
        from: from + lastSlashIndex + 1,
        text: tokenMatch.text,
        triggerCharacter: '/',
      };
    }
    return { from, text: tokenMatch.text, triggerCharacter: '' };
  }
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
    return {
      from: from + lastTriggerIndex + 1,
      text: tokenMatch.text.slice(lastTriggerIndex + 1),
      triggerCharacter,
    };
  }
  return { from, text: tokenMatch.text, triggerCharacter: '' };
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
    const prefixPattern = languagePrefixPatterns[normalizedLanguage] || defaultPrefixPattern;
    const tokenMatch = context.matchBefore(prefixPattern);
    if (!tokenMatch && !context.explicit) return null;

    const matchRange = computeMatchRange(normalizedLanguage, context, tokenMatch);
    const lineObject = context.state.doc.lineAt(context.pos);
    const docCode = context.state.doc.toString();
    const documentStaticTemplates = extractDocumentSymbols(docCode, normalizedLanguage);
    const documentStaticCompletions = documentStaticTemplates.map(templateToCompletion);
    const baseOptions = mergeCompletionsByLabel(staticCompletions, documentStaticCompletions);

    const request: IntrospectionRequest = {
      language: normalizedLanguage,
      code: docCode,
      line: lineObject.number - 1,
      column: context.pos - lineObject.from,
      prefix: tokenMatch ? tokenMatch.text : '',
      triggerCharacter: matchRange.triggerCharacter,
    };

    if (!session) {
      if (baseOptions.length === 0) return null;
      return {
        from: matchRange.from,
        to: context.pos,
        options: baseOptions,
      };
    }

    const dynamicPromise = getDynamicCompletions(
      normalizedLanguage,
      session,
      request,
      createContextAbortSignal(context),
      debounceKey,
    );

    return dynamicPromise.then((dynamicTemplates) => {
      if (context.aborted) return null;
      const dynamicCompletions = dynamicTemplates.map(templateToCompletion);
      const mergedOptions = mergeCompletionsByLabel(baseOptions, dynamicCompletions);
      if (mergedOptions.length === 0) return null;
      return {
        from: matchRange.from,
        to: context.pos,
        options: mergedOptions,
      };
    });
  };
}

export function createAutocompleteExtension(
  language: string,
  session?: IJsonRpcSession | null,
): Extension {
  return [
    autocompletion({
      override: [createLanguageCompletionSource(language, session)],
      activateOnTyping: true,
      activateOnTypingDelay: 60,
      updateSyncTime: 80,
      defaultKeymap: false,
      maxRenderedOptions: 50,
      selectOnOpen: true,
      closeOnBlur: true,
      icons: false,
      tooltipClass: () => 'dcl-autocomplete-tooltip',
      optionClass: () => 'dcl-autocomplete-option',
      addToOptions: [
        {
          render: renderCompletionBadge,
          position: 10,
        },
      ],
    }),
    autocompleteTheme,
  ];
}

interface CompletionIconSpec {
  color: string;
  path: string;
}

const completionIconByCategory: Record<string, CompletionIconSpec> = {
  keyword: { color: theme.purple.text, path: 'M12 2l8 10-8 10-8-10z' },
  function: { color: theme.blue.text, path: 'M13 2L5 13h5l-3 9 11-12h-5l5-8z' },
  variable: { color: theme.text.main, path: 'M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0' },
  constant: { color: theme.text.main, path: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z' },
  class: { color: theme.green.text, path: 'M12 2l9 5v10l-9 5-9-5V7z' },
  type: { color: theme.purple.text, path: 'M12 2l8 20h-4l-4-10-4 10H4z' },
  property: { color: theme.blue.text, path: 'M4 10h16v4H4z' },
  text: { color: theme.text.main, path: 'M4 7h16v2H4zM4 12h10v2H4z' },
  table: { color: theme.orange.text, path: 'M4 4h16v16H4zM4 9h16M9 4v16' },
  column: { color: theme.green.text, path: 'M6 4h4v16H6z' },
  file: { color: theme.yellow.text, path: 'M7 2h6l6 6v14H7zM13 2v6h6' },
  directory: { color: theme.yellow.text, path: 'M3 6h7l2 2h9v10H3z' },
  module: { color: theme.blue.text, path: 'M4 4h16v14H4zM8 8h8v4H8z' },
};

function renderCompletionBadge(completion: Completion): HTMLElement | null {
  const iconSpec = completionIconByCategory[completion.type || ''];
  if (!iconSpec) return null;
  const badge = document.createElement('span');
  badge.className = 'dcl-completion-badge';
  badge.style.color = iconSpec.color;
  badge.innerHTML =
    `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="${iconSpec.path}" fill="currentColor"/></svg>`;
  return badge;
}

const autocompleteTheme = EditorView.theme({
  '.cm-tooltip-autocomplete': {
    backgroundColor: theme.background.secondary,
    border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
    borderRadius: tokens.borderRadius.medium,
    boxShadow: theme.boxShadow.xthick,
    fontFamily: tokens.fontFamilies.mono,
    fontSize: tokens.fontSizes.medium,
    maxHeight: '280px',
    minWidth: '220px',
    overflow: 'hidden',
    padding: `${tokens.spacingNew.tiny} ${tokens.spacingNew.tiny}`,
    zIndex: tokens.zIndex.dropdown,
  },
  '.cm-tooltip-autocomplete ul': {
    maxHeight: '260px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected="true"]': {
    backgroundColor: hexToRgba(theme.blue.main, 0.15),
  },
  '.cm-completionDetail': {
    color: theme.text.subtle,
    fontSize: tokens.fontSizes.xsmall,
    fontStyle: 'italic',
    marginLeft: tokens.spacingNew.small,
  },
  '.cm-completionMatchedText': {
    color: theme.blue.text,
    fontWeight: tokens.fontWeights.bold,
    textDecoration: 'none',
  },
  '.cm-completionInfo': {
    backgroundColor: theme.background.main,
    border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
    borderRadius: tokens.borderRadius.medium,
    boxShadow: theme.boxShadow.xthick,
    color: theme.text.main,
    fontSize: tokens.fontSizes.small,
    lineHeight: tokens.lineHeights.relaxed,
    maxWidth: '340px',
    padding: `${tokens.spacingNew.small} ${tokens.spacingNew.medium}`,
  },
  '.dcl-completion-badge': {
    display: 'inline-flex',
    marginRight: tokens.spacingNew.tiny,
    verticalAlign: 'middle',
  },
});
