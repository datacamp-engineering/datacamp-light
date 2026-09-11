import { describe, expect, it } from 'vitest';
import { buildPrompt, formatTerminalResult } from './TerminalConsole';

describe('TerminalConsole rendering helpers', () => {
  it('buildPrompt reflects the cwd when known and falls back to the plain prompt', () => {
    expect(buildPrompt('/home/repl', '$ ')).toBe('/home/repl $ ');
    expect(buildPrompt('/home/repl/projects', '$ ')).toBe('/home/repl/projects $ ');
    expect(buildPrompt(null, '$ ')).toBe('$ ');
    expect(buildPrompt(undefined, '$ ')).toBe('$ ');
  });

  it('buildPrompt preserves arbitrary prompt symbols', () => {
    expect(buildPrompt('/home/repl', '❯ ')).toBe('/home/repl ❯ ');
  });

  it('formatTerminalResult surfaces output and error lines', () => {
    expect(formatTerminalResult({ output: '/home/repl' })).toEqual([
      { text: '/home/repl' },
    ]);
    expect(formatTerminalResult({ error: 'cd: no such file or directory: nope' })).toEqual([
      { text: 'cd: no such file or directory: nope', color: 'error' },
    ]);
  });

  it('formatTerminalResult does not swallow successful silent commands (cd, empty ls)', () => {
    expect(formatTerminalResult({ output: '' })).toEqual([{ text: '' }]);
    expect(formatTerminalResult({})).toEqual([{ text: '' }]);
  });
});
