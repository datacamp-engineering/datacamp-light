import { acceptCompletion, completionKeymap } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { r } from '@codemirror/legacy-modes/mode/r';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, ViewUpdate, keymap } from '@codemirror/view';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import React, { useEffect, useRef } from 'react';
import type { IJsonRpcSession } from '../jsonrpc/session';
import { createLazyAutocompleteExtension } from './autocomplete/lazyAutocomplete';

const dcEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: theme.background.main,
    color: theme.text.main,
    fontFamily: tokens.fontFamilies.mono,
    fontSize: tokens.fontSizes.medium,
    height: '100%',
    minHeight: '100%',
    padding: 0,
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-activeLine': {
    backgroundColor: `${theme.background.hover} !important`,
  },
  '&.cm-focused .cm-activeLineGutter': {
    backgroundColor: 'transparent !important',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: theme.text.main,
    borderLeftWidth: tokens.borderWidth.medium,
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: theme.blue.transparent,
  },
  '.cm-activeLine': {
    backgroundColor: `${theme.background.hover} !important`,
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent !important',
  },
  '.cm-cursor': {
    borderLeftColor: theme.text.main,
    borderLeftWidth: tokens.borderWidth.medium,
  },
  '.cm-gutters': {
    backgroundColor: theme.background.main,
    borderRight: 'none',
    color: theme.text.inverseSubtle,
    fontFamily: tokens.fontFamilies.mono,
    fontSize: tokens.fontSizes.medium,
    paddingLeft: tokens.spacingNew.medium,
  },
  '.cm-gutterElement': {
    fontFamily: tokens.fontFamilies.mono,
    fontSize: tokens.fontSizes.medium,
    lineHeight: '1.5',
  },
  '.cm-scroller': {
    alignItems: 'stretch',
    display: 'flex',
    fontFamily: tokens.fontFamilies.mono,
    lineHeight: '1.5',
    overflow: 'auto',
  },
  '.cm-content': {
    flexGrow: 1,
    fontFamily: tokens.fontFamilies.mono,
    lineHeight: '1.5',
    minWidth: 0,
    padding: '12px 0 8px 0',
  },
  '.cm-line': {
    lineHeight: '1.5',
    paddingLeft: tokens.spacingNew.xsmall,
    paddingRight: tokens.spacingNew.medium,
  },
  '.cm-selectionBackground': {
    backgroundColor: theme.blue.transparent,
    maxWidth: 'none',
  },
  '.cm-panels': {
    backgroundColor: theme.background.secondary,
    borderBottom: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
    color: theme.text.main,
    zIndex: 1,
  },
  '.cm-panel.cm-search': {
    alignItems: 'center',
    backgroundColor: theme.background.secondary,
    color: theme.text.main,
    display: 'flex',
    flexWrap: 'wrap',
    fontFamily: tokens.fontFamilies.sansSerif,
    fontSize: tokens.fontSizes.xsmall,
    gap: tokens.spacingNew.tiny,
    lineHeight: 1.2,
    minHeight: '28px',
    padding: `2px ${tokens.spacingNew.small}`,
  },
  '.cm-search input.cm-textfield': {
    backgroundColor: theme.background.main,
    border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
    borderRadius: tokens.borderRadius.medium,
    color: theme.text.main,
    fontFamily: tokens.fontFamilies.mono,
    fontSize: tokens.fontSizes.xsmall,
    height: '22px',
    marginRight: '2px',
    outline: 'none',
    padding: `1px ${tokens.spacingNew.tiny}`,
    transition: 'border-color 0.15s ease',
    '&:focus': {
      borderColor: theme.blue.main,
      boxShadow: `0 0 0 1px ${theme.blue.main}`,
    },
  },
  '.cm-search button.cm-button': {
    backgroundColor: theme.background.main,
    backgroundImage: 'none',
    border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
    borderRadius: tokens.borderRadius.medium,
    color: theme.text.main,
    cursor: 'pointer',
    fontFamily: tokens.fontFamilies.sansSerif,
    fontSize: '11px',
    fontWeight: tokens.fontWeights.bold,
    height: '22px',
    marginRight: '2px',
    padding: `1px ${tokens.spacingNew.tiny}`,
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
    '&:hover': {
      backgroundColor: theme.background.secondary,
      borderColor: theme.border.strong,
    },
  },
  '.cm-search button[name="close"]': {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: tokens.borderRadius.medium,
    color: theme.text.subtle,
    cursor: 'pointer',
    fontSize: tokens.fontSizes.medium,
    height: '22px',
    lineHeight: '22px',
    padding: '0 4px',
    '&:hover': {
      backgroundColor: theme.red.transparent,
      color: theme.red.text,
    },
  },
  '.cm-search label': {
    alignItems: 'center',
    color: theme.text.secondary,
    cursor: 'pointer',
    display: 'inline-flex',
    fontSize: '11px',
    gap: '2px',
    marginRight: tokens.spacingNew.tiny,
  },
  '.cm-search input[type="checkbox"]': {
    accentColor: theme.blue.main,
    cursor: 'pointer',
  },
  '.cm-searchMatch': {
    backgroundColor: `${theme.yellow.transparent} !important`,
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: `${theme.orange.transparent} !important`,
    outline: `${tokens.borderWidth.thin} solid ${theme.orange.main}`,
  },
  '.cm-selectionMatch': {
    backgroundColor: `${theme.blue.transparent} !important`,
  },
});

const dcHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    {
      color: theme.blue.text,
      fontWeight: tokens.fontWeights.regular,
      tag: [t.keyword, t.bool, t.contentSeparator, t.labelName, t.definition(t.variableName), t.local(t.variableName)],
    },
    { color: theme.green.text, tag: [t.meta, t.labelName] },
    { color: theme.blue.text, tag: t.atom },
    { color: theme.yellow.text, tag: t.number },
    {
      color: theme.orange.text,
      tag: [t.definition(t.name), t.function(t.definition(t.variableName))],
    },
    { color: theme.blue.text, tag: t.function(t.variableName) },
    { color: theme.text.main, tag: t.variableName },
    { color: theme.text.main, tag: [t.special(t.variableName), t.self, t.macroName] },
    { color: theme.text.main, tag: t.punctuation },
    { color: theme.yellow.text, tag: t.propertyName },
    { color: theme.text.main, fontWeight: tokens.fontWeights.bold, tag: t.operator },
    { color: theme.text.inverseSubtle, fontStyle: 'italic', tag: t.comment },
    { color: theme.pink.text, tag: [t.string, t.deleted] },
    { color: theme.pink.text, tag: [t.special(t.string), t.regexp, t.escape] },
    { color: theme.text.main, fontWeight: tokens.fontWeights.bold, tag: t.heading },
    { color: theme.blue.text, tag: t.link },
    { color: theme.pink.text, textDecoration: 'underline', tag: t.url },
    { color: '', tag: [t.separator, t.derefOperator, t.paren] },
    { color: theme.green.text, tag: [t.literal, t.inserted] },
    { color: theme.purple.main, tag: [t.typeName, t.namespace] },
    { color: theme.green.text, tag: [t.className] },
    { color: theme.red.text, tag: [t.invalid] },
    { color: theme.blue.text, tag: [t.definition(t.propertyName)] },
  ]),
);

interface CodeEditorProps {
  code: string;
  onChange: (newCode: string) => void;
  height?: number | string;
  readOnly?: boolean;
  language?: string;
  session?: IJsonRpcSession | null;
  autocomplete?: boolean;
}

const getLanguageExtension = (language?: string) => {
  const normalized = (language || 'python').toLowerCase();
  if (normalized === 'r') {
    return StreamLanguage.define(r);
  }
  if (normalized === 'shell' || normalized === 'bash' || normalized === 'sh') {
    return StreamLanguage.define(shell);
  }
  return python();
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChange,
  height = 240,
  readOnly = false,
  language = 'python',
  session = null,
  autocomplete = true,
}) => {
  const containerReference = useRef<HTMLDivElement>(null);
  const viewReference = useRef<EditorView | null>(null);

  const onChangeReference = useRef(onChange);
  useEffect(() => {
    onChangeReference.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerReference.current) return;

    const editorExtensions = [
      basicSetup,
      getLanguageExtension(language),
      ...(autocomplete
        ? [
            createLazyAutocompleteExtension(language, session),
            Prec.highest(
              keymap.of([
                { key: 'Tab', run: acceptCompletion },
                ...completionKeymap,
              ]),
            ),
          ]
        : []),
      dcEditorTheme,
      dcHighlightStyle,
      EditorView.lineWrapping,
      keymap.of([indentWithTab]),
      EditorState.readOnly.of(readOnly),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          onChangeReference.current(update.state.doc.toString());
        }
      }),
    ];

    const startState = EditorState.create({
      doc: code,
      extensions: editorExtensions,
    });

    const view = new EditorView({
      state: startState,
      parent: containerReference.current,
    });

    viewReference.current = view;

    return () => {
      view.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewReference.current;
    if (view && view.state.doc.toString() !== code) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code },
      });
    }
  }, [code]);

  return (
    <div
      ref={containerReference}
      css={{
        height: typeof height === 'number' ? `${height}px` : height,
        overflow: 'hidden',
      }}
    />
  );
};
