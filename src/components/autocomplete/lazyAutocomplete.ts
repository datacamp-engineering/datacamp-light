import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { IJsonRpcSession } from '../../jsonrpc/session';
import { autocompleteTheme, renderCompletionBadge } from './completionPresentation';

let autocompleteExtensionPromise: Promise<typeof import('./autocompleteExtension')> | null = null;

/**
 * Lazy autocomplete completion source that defers importing static completion catalogs,
 * symbol extractors, and dynamic introspection until the first user completion query.
 */
export async function lazyCompletionSource(
  context: CompletionContext,
  language: string,
  session: IJsonRpcSession | null,
): Promise<CompletionResult | null> {
  if (!autocompleteExtensionPromise) {
    autocompleteExtensionPromise = import('./autocompleteExtension');
  }

  const { createLanguageCompletionSource } = await autocompleteExtensionPromise;
  const source: CompletionSource = createLanguageCompletionSource(language, session);
  return source(context);
}

/**
 * Creates the branded DataCamp autocomplete extension with lazy catalog evaluation.
 */
export function createLazyAutocompleteExtension(
  language: string,
  session?: IJsonRpcSession | null,
): Extension {
  return [
    autocompletion({
      override: [(ctx) => lazyCompletionSource(ctx, language, session || null)],
      activateOnTyping: true,
      activateOnTypingDelay: 60,
      updateSyncTime: 80,
      defaultKeymap: true,
      maxRenderedOptions: 50,
      selectOnOpen: false,
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
