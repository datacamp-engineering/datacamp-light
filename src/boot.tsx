import './i18n';
import { createRoot } from 'react-dom/client';
import { DataCampExercise } from './components/DataCampExercise';
import type { DataCampExerciseProps } from './components/DataCampExercise';

const stripIndent = (str: string): string => {
  const match = str.match(/^[ \t]*(?=\S)/gm);
  if (!match) return str;
  const indent = Math.min(...match.map((el) => el.length));
  const regex = new RegExp(`^[ \\t]{${indent}}`, 'gm');
  return indent > 0 ? str.replace(regex, '') : str;
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
        packages: exercise.packages ? exercise.packages.split(',').map((p: string) => p.trim()) : [],
        preExerciseCode: exercise.pre_exercise_code || '',
        sampleCode: exercise.sample || exercise.sample_code || '',
        sct: exercise.sct || '',
        solution: exercise.solution || '',
        showRunButton: exercise.showRunButton !== false,
      };
    } catch (e) {
      console.error('Failed to parse encoded DataCamp Light exercise:', e);
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
    .map((p) => p.trim())
    .filter(Boolean);

  const rawHeight = element.getAttribute('data-height');
  const height = rawHeight === 'auto' || !rawHeight ? 'auto' : parseInt(rawHeight, 10);

  return {
    id,
    hint: getHint(),
    language: element.getAttribute('data-lang') || 'python',
    packages,
    preExerciseCode: getText('pre-exercise-code'),
    sampleCode: getText('sample-code'),
    sct: getText('sct'),
    solution: getText('solution'),
    height,
    showRunButton,
    utmSource: element.getAttribute('data-utm-source') || undefined,
    utmCampaign: element.getAttribute('data-utm-campaign') || undefined,
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
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            obs.disconnect();
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
