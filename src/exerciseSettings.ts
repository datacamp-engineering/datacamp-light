/**
 * Pure exercise-settings parser: extracts the exercise definition (language,
 * code blocks, SCT, hint, options) from a `<div data-datacamp-exercise>`
 * element. Used by both the production boot flow (boot.tsx) and the audit
 * scripts, so the parsing logic lives in one place.
 *
 * No React or component imports — this module works in any environment that
 * provides a DOM (browser, happy-dom in tests/audits).
 */

export interface ExerciseSettings {
  id: string;
  language: string;
  hint: string;
  theme?: 'light' | 'dark';
  packages: string[];
  preExerciseCode: string;
  sampleCode: string;
  sct: string;
  solution: string;
  height: number | string;
  showRunButton: boolean;
  showAi: boolean;
  mockAi?: boolean | string;
  autocomplete: boolean;
  previewDropZone: boolean;
  sharedEnvironment?: boolean | string;
  noLazyLoad?: boolean;
  utmSource?: string;
  utmCampaign?: string;
  impactTrackingLink?: string;
}

const stripIndent = (sourceString: string): string => {
  if (!sourceString) return '';
  const normalized = sourceString.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = normalized.match(/^[ \t]*(?=\S)/gm);
  if (!match) return normalized;
  const indent = Math.min(...match.map((element) => element.length));
  const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm');
  return indent > 0 ? normalized.replace(regex, '') : normalized;
};

export function parseExerciseSettings(element: HTMLElement): ExerciseSettings {
  const id = element.id || `dcl-${Math.random().toString(36).substring(2, 9)}`;

  if (element.getAttribute('data-encoded')) {
    try {
      const decoded = atob(decodeURIComponent(element.textContent || ''));
      const exercise = JSON.parse(decoded);
      const encodedNoLazyLoad =
        typeof exercise.noLazyLoad === 'string'
          ? exercise.noLazyLoad.toLowerCase() !== 'false'
          : Boolean(exercise.noLazyLoad);
      return {
        id,
        hint: exercise.hint,
        language: exercise.language || 'python',
        noLazyLoad: encodedNoLazyLoad || undefined,
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
        height: 'auto',
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
        autocomplete: true,
        previewDropZone: false,
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