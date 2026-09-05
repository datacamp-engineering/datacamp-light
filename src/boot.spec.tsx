import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings } from './boot';

describe('getSettings', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  it('should return default settings when no attributes are set', () => {
    element.id = 'test-id';
    const settings = getSettings(element);
    expect(settings.id).toBe('test-id');
    expect(settings.height).toBe('auto');
    expect(settings.language).toBe('python');
    expect(settings.theme).toBeUndefined();
    expect(settings.sct).toBe('');
    expect(settings.solution).toBe('');
    expect(settings.showRunButton).toBe(true);
  });

  it('should parse theme attribute correctly', () => {
    element.setAttribute('data-theme', 'light');
    const lightSettings = getSettings(element);
    expect(lightSettings.theme).toBe('light');

    element.setAttribute('data-theme', 'dark');
    const darkSettings = getSettings(element);
    expect(darkSettings.theme).toBe('dark');
  });

  it('should parse height attribute correctly', () => {
    element.setAttribute('data-height', '400');
    const settings = getSettings(element);
    expect(settings.height).toBe(400);
  });

  it('should parse packages attribute correctly', () => {
    element.setAttribute('data-packages', 'numpy, pandas, matplotlib');
    const settings = getSettings(element);
    expect(settings.packages).toEqual(['numpy', 'pandas', 'matplotlib']);
  });

  it('should parse encoded data correctly', () => {
    const data = {
      hint: 'Test hint',
      language: 'python',
      theme: 'light',
      pre_exercise_code: 'pre code',
      sample_code: 'sample code',
      sct: 'sct code',
      solution: 'solution code',
      showRunButton: true,
      packages: 'numpy,pandas',
    };
    const encodedData = btoa(JSON.stringify(data));
    element.setAttribute('data-encoded', 'true');
    element.textContent = encodeURIComponent(encodedData);
    const settings = getSettings(element);
    expect(settings.hint).toBe(data.hint);
    expect(settings.language).toBe(data.language);
    expect(settings.theme).toBe('light');
    expect(settings.preExerciseCode).toBe(data.pre_exercise_code);
    expect(settings.sampleCode).toBe(data.sample_code);
    expect(settings.sct).toBe(data.sct);
    expect(settings.solution).toBe(data.solution);
    expect(settings.showRunButton).toBe(true);
    expect(settings.packages).toEqual(['numpy', 'pandas']);
  });

  it('should parse non-encoded data correctly', () => {
    element.innerHTML = `
      <code data-type="pre-exercise-code">pre code</code>
      <code data-type="sample-code">sample code</code>
      <code data-type="sct">sct code</code>
      <code data-type="solution">solution code</code>
      <div data-type="hint">Test hint</div>
    `;
    const settings = getSettings(element);
    expect(settings.preExerciseCode).toBe('pre code');
    expect(settings.sampleCode).toBe('sample code');
    expect(settings.sct).toBe('sct code');
    expect(settings.solution).toBe('solution code');
    expect(settings.hint).toBe('Test hint');
  });

  it('should parse UTM attributes correctly', () => {
    element.setAttribute('data-utm-source', 'my_blog');
    element.setAttribute('data-utm-campaign', 'my_campaign');
    const settings = getSettings(element);
    expect(settings.utmSource).toBe('my_blog');
    expect(settings.utmCampaign).toBe('my_campaign');
  });

  it('should parse impact tracking link attribute correctly', () => {
    element.setAttribute('data-impact-tracking-link', '/c/67577/1012793/13294');
    const settings = getSettings(element);
    expect(settings.impactTrackingLink).toBe('/c/67577/1012793/13294');
  });

  it('should parse impact tracking link in encoded data correctly', () => {
    const data = {
      language: 'python',
      impact_tracking_link: '/c/67577/1012793/13294',
    };
    const encodedData = btoa(JSON.stringify(data));
    element.setAttribute('data-encoded', 'true');
    element.textContent = encodeURIComponent(encodedData);
    const settings = getSettings(element);
    expect(settings.impactTrackingLink).toBe('/c/67577/1012793/13294');
  });

  it('should parse showAi attribute correctly', () => {
    const defaultSettings = getSettings(element);
    expect(defaultSettings.showAi).toBe(true);

    element.setAttribute('data-show-ai', 'false');
    const disabledShowAiSettings = getSettings(element);
    expect(disabledShowAiSettings.showAi).toBe(false);

    element.removeAttribute('data-show-ai');
    element.setAttribute('data-has-ai', 'false');
    const disabledHasAiSettings = getSettings(element);
    expect(disabledHasAiSettings.showAi).toBe(false);
  });

  it('should parse sharedEnvironment attribute correctly', () => {
    const defaultSettings = getSettings(element);
    expect(defaultSettings.sharedEnvironment).toBeUndefined();

    element.setAttribute('data-shared-environment', 'true');
    expect(getSettings(element).sharedEnvironment).toBe(true);

    element.setAttribute('data-shared-environment', 'cohort-python-1');
    expect(getSettings(element).sharedEnvironment).toBe('cohort-python-1');

    element.removeAttribute('data-shared-environment');
    element.setAttribute('data-environment', 'custom-group');
    expect(getSettings(element).sharedEnvironment).toBe('custom-group');
  });

  it('should parse data-autocomplete attribute correctly', () => {
    element.setAttribute('data-autocomplete', 'false');
    const disabledSettings = getSettings(element);
    expect(disabledSettings.autocomplete).toBe(false);

    element.setAttribute('data-autocomplete', 'true');
    const enabledSettings = getSettings(element);
    expect(enabledSettings.autocomplete).toBe(true);
  });
});
