import type { Completion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';

export interface CompletionIconSpec {
  color: string;
  path: string;
}

export const completionIconByCategory: Record<string, CompletionIconSpec> = {
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

export function renderCompletionBadge(completion: Completion): HTMLElement | null {
  const iconSpec = completionIconByCategory[completion.type || ''];
  if (!iconSpec) return null;
  const badge = document.createElement('span');
  badge.className = 'dcl-completion-badge';
  badge.style.color = iconSpec.color;
  badge.innerHTML =
    `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="${iconSpec.path}" fill="currentColor"/></svg>`;
  return badge;
}

export const autocompleteTheme = EditorView.theme({
  '.cm-tooltip-autocomplete': {
    backgroundColor: theme.background.secondary,
    border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
    borderRadius: tokens.borderRadius.medium,
    boxShadow: theme.boxShadow.xthick,
    fontFamily: tokens.fontFamilies.mono,
    fontSize: tokens.fontSizes.medium,
    maxHeight: '280px',
    minWidth: '220px',
    padding: `${tokens.spacingNew.tiny} ${tokens.spacingNew.tiny}`,
    zIndex: tokens.zIndex.dropdown,
  },
  '.cm-tooltip-autocomplete ul': {
    maxHeight: '260px',
    overflowY: 'auto',
  },
  '.cm-tooltip-autocomplete ul li': {
    color: `${theme.text.main} !important`,
  },
  '.cm-tooltip-autocomplete ul li[aria-selected="true"]': {
    backgroundColor: `${theme.blue.transparent} !important`,
    color: `${theme.text.main} !important`,
  },
  '.cm-tooltip-autocomplete ul li[aria-selected="true"] .cm-completionDetail': {
    color: `${theme.text.subtle} !important`,
  },
  '.cm-tooltip-autocomplete ul li[aria-selected="true"] .cm-completionMatchedText': {
    color: `${theme.blue.text} !important`,
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
  '.dcl-completion-badge': {
    alignItems: 'center',
    display: 'inline-flex',
    justifyContent: 'center',
    marginRight: tokens.spacingNew.small,
    verticalAlign: 'middle',
  },
  '.cm-completionInfo': {
    backgroundColor: theme.background.main,
    border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
    borderRadius: tokens.borderRadius.medium,
    boxShadow: theme.boxShadow.thick,
    color: theme.text.main,
    fontFamily: tokens.fontFamilies.sansSerif,
    fontSize: tokens.fontSizes.small,
    maxWidth: '380px',
    padding: `${tokens.spacingNew.small} ${tokens.spacingNew.medium}`,
  },
});
