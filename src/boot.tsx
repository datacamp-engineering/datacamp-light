if (typeof globalThis !== 'undefined' && !(globalThis as any).process) {
  (globalThis as any).process = { env: { NODE_ENV: 'production', NODE_NEV: 'production' } };
}

import './i18n';
import './runtime/assetResolver';
import { installGlobalFetchCache } from './runtime/assetCache';

// Automatically install persistent fetch cache when DataCamp Light boots
installGlobalFetchCache();

import { createRoot } from 'react-dom/client';
import { DataCampExercise } from './components/DataCampExercise';
import type { DataCampExerciseProps } from './components/DataCampExercise';

const stripIndent = (sourceString: string): string => {
  const match = sourceString.match(/^[ \t]*(?=\S)/gm);
  if (!match) return sourceString;
  const indent = Math.min(...match.map((element) => element.length));
  const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm');
  return indent > 0 ? sourceString.replace(regex, '') : sourceString;
};

export function getSettings(element: HTMLElement): DataCampExerciseProps {
  const id = element.id || `dcl-${Math.random().toString(36).substring(2, 9)}`;

  if (element.getAttribute('data-encoded')) {
    try {
      const decoded = atob(decodeURIComponent(element.textContent || ''));
      const exercise = JSON.parse(decoded);
      return {
        id,
        hint: exercise.hint,
        language: exercise.language || 'python',
        theme:
          exercise.theme === 'light' || exercise.theme === 'dark'
            ? exercise.theme
            : undefined,
        packages: exercise.packages
          ? exercise.packages.split(',').map((packageItem: string) => packageItem.trim())
          : [],
        preExerciseCode: exercise.pre_exercise_code || '',
        sampleCode: exercise.sample || exercise.sample_code || '',
        sct: exercise.sct || '',
        solution: exercise.solution || '',
        showRunButton: exercise.showRunButton !== false,
        showAi: exercise.showAi !== false && exercise.show_ai !== false,
        sharedEnvironment:
          exercise.sharedEnvironment ??
          exercise.shared_environment ??
          exercise.environment,
        impactTrackingLink:
          exercise.impact_tracking_link ||
          exercise.impactTrackingLink ||
          element.getAttribute('data-impact-tracking-link') ||
          undefined,
      };
    } catch (parseError) {
      console.error('Failed to parse encoded DataCamp Light exercise:', parseError);
    }
  }

  const getText = (type: string): string => {
    const textElement = element.querySelector(`code[data-type="${type}"]`);
    if (!textElement) return '';
    return stripIndent(textElement.textContent || '').trim();
  };

  const getHint = (): string => {
    const hintElement = element.querySelector('[data-type="hint"]');
    return hintElement ? hintElement.innerHTML : '';
  };

  const showRunButton =
    !element.hasAttribute('data-show-run-button') ||
    element.getAttribute('data-show-run-button')?.toLowerCase() !== 'false';

  const rawPackages = element.getAttribute('data-packages') || '';
  const packages = rawPackages
    .split(',')
    .map((packageItem) => packageItem.trim())
    .filter(Boolean);

  const rawHeight = element.getAttribute('data-height');
  const height = rawHeight === 'auto' || !rawHeight ? 'auto' : parseInt(rawHeight, 10);

  const rawTheme = element.getAttribute('data-theme')?.toLowerCase();
  const theme: 'light' | 'dark' | undefined =
    rawTheme === 'light' || rawTheme === 'dark' ? rawTheme : undefined;

  const showAi =
    !element.hasAttribute('data-show-ai') &&
    !element.hasAttribute('data-has-ai')
      ? true
      : element.getAttribute('data-show-ai')?.toLowerCase() !== 'false' &&
        element.getAttribute('data-has-ai')?.toLowerCase() !== 'false';

  const rawMockAi = element.getAttribute('data-mock-ai');
  const mockAi =
    rawMockAi === null
      ? undefined
      : rawMockAi.toLowerCase() === 'false'
      ? false
      : rawMockAi.toLowerCase() === 'true'
      ? true
      : rawMockAi;

  const rawSharedEnv =
    element.getAttribute('data-shared-environment') ??
    element.getAttribute('data-environment');
  const sharedEnvironment =
    rawSharedEnv === null
      ? undefined
      : rawSharedEnv === '' || rawSharedEnv.toLowerCase() === 'true'
      ? true
      : rawSharedEnv.toLowerCase() === 'false'
      ? false
      : rawSharedEnv;

const rawAutocomplete = element.getAttribute('data-autocomplete');
  const autocomplete =
    rawAutocomplete === null
      ? true
      : rawAutocomplete.toLowerCase() !== 'false';

  const rawPreviewDropZone = element.getAttribute('data-preview-drop-zone');
  const previewDropZone =
    rawPreviewDropZone === null
      ? false
      : rawPreviewDropZone.toLowerCase() !== 'false';

  return {
    id,
    hint: getHint(),
    language: element.getAttribute('data-lang') || 'python',
    theme,
    packages,
    preExerciseCode: getText('pre-exercise-code'),
    sampleCode: getText('sample-code'),
    sct: getText('sct'),
    solution: getText('solution'),
    height,
    showRunButton,
    showAi,
mockAi,
    autocomplete,
    previewDropZone,
    sharedEnvironment,
    utmSource: element.getAttribute('data-utm-source') || undefined,
    utmCampaign: element.getAttribute('data-utm-campaign') || undefined,
    impactTrackingLink:
      element.getAttribute('data-impact-tracking-link') || undefined,
  };
}

export function bootElement(element: HTMLElement): void {
  if (element.classList.contains('datacamp-exercise-initialized')) {
    return;
  }

  const noLazyLoad =
    element.hasAttribute('data-no-lazy-load') &&
    element.getAttribute('data-no-lazy-load')?.toLowerCase() !== 'false';

  const mount = () => {
    if (element.classList.contains('datacamp-exercise-initialized')) {
      return;
    }
    const settings = getSettings(element);
    element.innerHTML = '';
    element.classList.add('datacamp-exercise-initialized');
    element.removeAttribute('data-datacamp-exercise');

    const root = createRoot(element);
    root.render(<DataCampExercise {...settings} />);
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
