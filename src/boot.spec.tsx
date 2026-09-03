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
    expect(settings.sct).toBe('');
    expect(settings.solution).toBe('');
    expect(settings.showRunButton).toBe(true);
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
});
