// Some bundled dependencies (notably bash-parser's tokenizer, used by the
// shell interpreter) read `process.env.NODE_NEV` — an upstream typo of
// NODE_ENV — unconditionally at module scope, which throws when `process`
// is undefined in the browser. The misspelled key mirrors that reference
// on purpose; do not "fix" it.
if (typeof globalThis !== 'undefined' && !(globalThis as any).process) {
  (globalThis as any).process = { env: { NODE_ENV: 'production', NODE_NEV: 'production' } };
}

import './i18n';
import './runtime/assetResolver';
import { createRoot } from 'react-dom/client';
import { DataCampExercise } from './components/DataCampExercise';
import { DCLWidgetShell } from './components/DCLWidgetShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useResolvedTheme } from './theme/themeManager';
import { parseExerciseSettings as getSettings } from './exerciseSettings';

export { parseExerciseSettings as getSettings } from './exerciseSettings';

export function bootElement(element: HTMLElement): void {
  if (element.classList.contains('datacamp-exercise-initialized')) {
    return;
  }

  const settingsForLazyLoad = getSettings(element);
  const noLazyLoad =
    settingsForLazyLoad.noLazyLoad === true ||
    (element.hasAttribute('data-no-lazy-load') &&
      element.getAttribute('data-no-lazy-load')?.toLowerCase() !== 'false');

const mount = () => {
    if (element.classList.contains('datacamp-exercise-initialized')) {
      return;
    }
    element.innerHTML = '';
    element.classList.add('datacamp-exercise-initialized');
    element.removeAttribute('data-datacamp-exercise');

    const crashDemo = import.meta.env.DEV ? element.getAttribute('data-crash-demo') : null;
    const root = createRoot(element);
    root.render(
      <ErrorBoundary label="widget" variant="widget">
        {crashDemo ? (
          <CrashDemo
            mode={crashDemo === 'component' ? 'component' : 'widget'}
            theme={settingsForLazyLoad.theme}
          />
        ) : (
          <DataCampExercise {...settingsForLazyLoad} />
        )}
      </ErrorBoundary>,
    );
  };

  if (noLazyLoad || typeof IntersectionObserver === 'undefined') {
    mount();
  } else {
    const observer = new IntersectionObserver(
      (entries, intersectionObserver) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            intersectionObserver.disconnect();
            mount();
          }
        });
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
  }
}

export function initAddedDCLightExercises(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-datacamp-exercise]');
  elements.forEach((element) => {
    bootElement(element);
  });
}

export const initDataCampLight = initAddedDCLightExercises;

/**
 * Playground-only (stripped from production builds): `data-crash-demo` makes a
 * widget throw during render so the error boundaries and their reload flows
 * can be exercised from the demo pages.
 * - `data-crash-demo="true"` crashes the whole widget (top-level boundary).
 * - `data-crash-demo="component"` crashes a single subcomponent inside a real
 *   widget shell (inline boundary), showing the compact section fallback.
 *
 * The `import.meta.env.DEV` gate in bootElement makes the attribute a no-op
 * and lets Vite dead-code-eliminate the components from production bundles.
 */
function CrashDemo({
  mode,
  theme,
}: {
  mode: 'widget' | 'component';
  theme?: 'light' | 'dark';
}): never | React.ReactElement {
  if (mode === 'component') {
    return <ComponentCrashDemo theme={theme} />;
  }
  throw new Error(
    'This widget was asked to crash for the error-boundary demo (data-crash-demo="true").',
  );
}

function ComponentCrashDemo({ theme }: { theme?: 'light' | 'dark' }): React.ReactElement {
  const { theme: resolvedTheme } = useResolvedTheme(theme);
  return (
    <DCLWidgetShell theme={resolvedTheme}>
      <ErrorBoundary label="code-editor" variant="inline">
        <CrashingSubcomponent />
      </ErrorBoundary>
    </DCLWidgetShell>
  );
}

function CrashingSubcomponent(): never {
  throw new Error(
    'This section was asked to crash for the component error-boundary demo (data-crash-demo="component").',
  );
}
