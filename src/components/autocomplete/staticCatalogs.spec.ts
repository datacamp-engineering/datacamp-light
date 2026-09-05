import type { Completion } from '@codemirror/autocomplete';
import { describe, expect, it } from 'vitest';
import {
  getStaticCompletionCatalog,
  pythonCatalog,
  rCatalog,
  shellCatalog,
  sqlCatalog,
  staticCatalogToCompletions,
} from './staticCatalogs';
import type { CompletionSnippetTemplate, StaticCompletionCatalog } from './types';

const templateByLabel = (
  catalog: StaticCompletionCatalog,
  label: string,
): CompletionSnippetTemplate | undefined =>
  catalog.templates.find((template) => template.label === label);

describe('static completion catalogs', () => {
  it('exposes catalogs for all four supported languages', () => {
    expect(pythonCatalog.language).toBe('python');
    expect(rCatalog.language).toBe('r');
    expect(shellCatalog.language).toBe('shell');
    expect(sqlCatalog.language).toBe('sql');
    expect(getStaticCompletionCatalog('python').templates.length).toBeGreaterThan(0);
    expect(getStaticCompletionCatalog('r').templates.length).toBeGreaterThan(0);
    expect(getStaticCompletionCatalog('bash').language).toBe('shell');
    expect(getStaticCompletionCatalog('sh').language).toBe('shell');
    expect(getStaticCompletionCatalog('sql').templates.length).toBeGreaterThan(0);
  });

  it('ranks python keywords above builtins above library symbols', () => {
    const defTemplate = templateByLabel(pythonCatalog, 'def');
    const printTemplate = templateByLabel(pythonCatalog, 'print');
    const headTemplate = templateByLabel(pythonCatalog, 'head');
    expect(defTemplate?.boost).toBeGreaterThan(printTemplate?.boost ?? 0);
    expect(printTemplate?.boost).toBeGreaterThan(headTemplate?.boost ?? 0);
  });

  it('includes snippet templates with placeholders for python keywords', () => {
    const defTemplate = templateByLabel(pythonCatalog, 'def');
    expect(defTemplate).toBeDefined();
    expect(defTemplate?.category).toBe('keyword');
    expect(defTemplate?.snippet).toContain('${1:name}');
    expect(defTemplate?.documentation?.synopsis).toBeTruthy();
  });

  it('includes pipes, shell commands, and sql keywords', () => {
    expect(templateByLabel(rCatalog, '%>%')).toBeDefined();
    expect(templateByLabel(shellCatalog, 'grep')).toBeDefined();
    const selectTemplate = templateByLabel(sqlCatalog, 'SELECT');
    expect(selectTemplate).toBeDefined();
    expect(selectTemplate?.snippet).toContain('${1:');
  });

  it('converts catalog templates to CodeMirror completions with snippet apply', () => {
    const completions = staticCatalogToCompletions(getStaticCompletionCatalog('python'));
    const defCompletion = completions.find((completion) => completion.label === 'def') as Completion;
    expect(defCompletion).toBeDefined();
    expect(defCompletion.type).toBe('keyword');
    expect(typeof defCompletion.apply).toBe('function');
    expect(defCompletion.boost).toBeDefined();
    expect(defCompletion.detail).toContain('Function');
    expect(typeof defCompletion.info).toBe('function');
  });
});
