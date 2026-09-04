import { describe, expect, it } from 'vitest';
import { computeLineDiff } from './lineDiff';

describe('computeLineDiff', () => {
  it('returns unchanged lines when contents are identical', () => {
    const code = 'x = 10\ny = 20\nprint(x + y)';
    const diff = computeLineDiff(code, code);
    expect(diff).toEqual([
      { value: 'x = 10' },
      { value: 'y = 20' },
      { value: 'print(x + y)' },
    ]);
  });

  it('detects added lines', () => {
    const original = 'x = 10\nprint(x)';
    const updated = 'x = 10\ny = 20\nprint(x)';
    const diff = computeLineDiff(original, updated);
    expect(diff).toEqual([
      { value: 'x = 10' },
      { added: true, value: 'y = 20' },
      { value: 'print(x)' },
    ]);
  });

  it('detects removed lines', () => {
    const original = 'x = 10\ny = 20\nprint(x)';
    const updated = 'x = 10\nprint(x)';
    const diff = computeLineDiff(original, updated);
    expect(diff).toEqual([
      { value: 'x = 10' },
      { removed: true, value: 'y = 20' },
      { value: 'print(x)' },
    ]);
  });

  it('detects replaced lines as deletion followed by addition', () => {
    const original = 'x = 10\nprint(y)';
    const updated = 'x = 10\nprint(x)';
    const diff = computeLineDiff(original, updated);
    expect(diff).toEqual([
      { value: 'x = 10' },
      { removed: true, value: 'print(y)' },
      { added: true, value: 'print(x)' },
    ]);
  });
});
