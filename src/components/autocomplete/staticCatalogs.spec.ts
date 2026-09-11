import type { Completion } from '@codemirror/autocomplete';
import { describe, expect, it } from 'vitest';
import {
  extractDocumentSymbols,
  getStaticCompletionCatalog,
  pythonCatalog,
  rCatalog,
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
  it('exposes catalogs for the supported editor languages', () => {
    expect(pythonCatalog.language).toBe('python');
    expect(rCatalog.language).toBe('r');
    expect(sqlCatalog.language).toBe('sql');
    expect(getStaticCompletionCatalog('python').templates.length).toBeGreaterThan(0);
    expect(getStaticCompletionCatalog('r').templates.length).toBeGreaterThan(0);
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

  it('includes pipes and sql keywords', () => {
    expect(templateByLabel(rCatalog, '%>%')).toBeDefined();
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

    // Simple keywords with no extra docs omit the redundant info panel
    const whileCompletion = completions.find((completion) => completion.label === 'while') as Completion;
    expect(whileCompletion).toBeDefined();
    expect(whileCompletion.info).toBeUndefined();
  });

  it('statically extracts variables and functions from document code without execution', () => {
    const pythonCode = `
total_sales = 1500
user_names = ['Alice', 'Bob']
def calculate_tax(subtotal, rate=0.2):
    pass
class CustomerAccount:
    pass
import math as m
from datetime import date, time as t
`;
    const symbols = extractDocumentSymbols(pythonCode, 'python');
    const labels = symbols.map((s) => s.label);
    expect(labels).toContain('total_sales');
    expect(labels).toContain('user_names');
    expect(labels).toContain('calculate_tax');
    expect(labels).toContain('CustomerAccount');
    expect(labels).toContain('m');
    expect(labels).toContain('date');
    expect(labels).toContain('t');

    const taxSymbol = symbols.find((s) => s.label === 'calculate_tax');
    expect(taxSymbol?.category).toBe('function');
    expect(taxSymbol?.detail).toBe('(subtotal, rate=0.2)');
  });

  it('statically extracts R and SQL symbols from document code', () => {
    const rCode = `
my_data <- data.frame(a = 1:5)
calculate_mean <- function(x) { mean(x) }
`;
    const rSymbols = extractDocumentSymbols(rCode, 'r');
    expect(rSymbols.map((s) => s.label)).toContain('my_data');
    expect(rSymbols.map((s) => s.label)).toContain('calculate_mean');

    const sqlCode = `
CREATE TABLE customers (id INT);
WITH quarterly_revenue AS (SELECT 1) SELECT * FROM quarterly_revenue;
`;
    const sqlSymbols = extractDocumentSymbols(sqlCode, 'sql');
    expect(sqlSymbols.map((s) => s.label)).toContain('customers');
    expect(sqlSymbols.map((s) => s.label)).toContain('quarterly_revenue');
  });
});
