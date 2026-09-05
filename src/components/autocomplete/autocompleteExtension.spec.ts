import {
  CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import type { IJsonRpcSession } from '../../jsonrpc/session';
import { createAutocompleteExtension, createLanguageCompletionSource } from './autocompleteExtension';

const createState = (documentText: string): EditorState => EditorState.create({ doc: documentText });

const resolveSource = async (
  source: CompletionSource,
  state: EditorState,
  position: number,
  explicit = false,
): Promise<CompletionResult | null> => {
  const context = new CompletionContext(state, position, explicit);
  const result = await source(context);
  return result;
};

describe('autocomplete extension', () => {
  it('returns static python completions without a session', async () => {
    const source = createLanguageCompletionSource('python');
    const state = createState('pri');
    const result = await resolveSource(source, state, 3);
    expect(result).not.toBeNull();
    const labels = result?.options.map((option) => option.label) ?? [];
    expect(labels).toContain('print');
  });

  it('starts member completions after the dot trigger', async () => {
    const source = createLanguageCompletionSource('python');
    const state = createState('pd.');
    const result = await resolveSource(source, state, 3);
    expect(result?.from).toBe(3);
    const labels = result?.options.map((option) => option.label) ?? [];
    expect(labels).toContain('head');
  });

  it('returns static variables defined in document before or without execution', async () => {
    const source = createLanguageCompletionSource('python');
    const docText = 'custom_order_id = 9999\ncust';
    const state = createState(docText);
    const result = await resolveSource(source, state, docText.length);
    expect(result).not.toBeNull();
    const labels = result?.options.map((option) => option.label) ?? [];
    expect(labels).toContain('custom_order_id');
  });

  it('merges deduplicated dynamic completions into static options', async () => {
    const session = {
      request: vi.fn().mockResolvedValue({
        completions: [{ label: 'print', type: 'function', detail: 'dynamic print', boost: 90 }],
      }),
    } as unknown as IJsonRpcSession;
    const source = createLanguageCompletionSource('python', session);
    const state = createState('print');
    const result = await resolveSource(source, state, 5);
    const printOption = result?.options.find((option) => option.label === 'print');
    expect(printOption?.boost).toBe(90);
    expect(session.request).toHaveBeenCalledWith(
      'introspect',
      expect.objectContaining({ language: 'python' }),
    );
  });

  it('keeps static completions when dynamic introspection fails', async () => {
    const session = {
      request: vi.fn().mockRejectedValue(new Error('worker error')),
    } as unknown as IJsonRpcSession;
    const source = createLanguageCompletionSource('python', session);
    const state = createState('pri');
    const result = await resolveSource(source, state, 3);
    const labels = result?.options.map((option) => option.label) ?? [];
    expect(labels).toContain('print');
  });

  it('applies snippet completions through the editor view', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const state = createState('bre');
    const view = new EditorView({ state, parent: container });
    try {
      const source = createLanguageCompletionSource('python');
      const result = source(new CompletionContext(state, 3, false)) as unknown as CompletionResult | null;
      const breakCompletion = result?.options.find((option) => option.label === 'break');
      expect(breakCompletion).toBeDefined();
      if (typeof breakCompletion?.apply === 'function') {
        breakCompletion.apply(view, breakCompletion, 0, 3);
      }
      expect(view.state.doc.toString()).toBe('break');
    } finally {
      view.destroy();
      container.remove();
    }
  });

  it('creates a valid extension with theme and configuration', () => {
    const extension = createAutocompleteExtension('python');
    expect(Array.isArray(extension)).toBe(true);
  });
});
