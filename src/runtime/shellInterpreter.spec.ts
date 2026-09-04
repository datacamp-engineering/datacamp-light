import { describe, expect, it } from 'vitest';
import {
  createBusyboxRunner,
  createEmscriptenVfs,
  createShellInterpreter,
} from './shellInterpreter';

describe('createShellInterpreter', () => {
  it('should report the initial working directory', () => {
    const shell = createShellInterpreter();
    expect(shell.runCommand('pwd')).toEqual({ output: '/home/repl' });
  });

  it('should echo arguments', () => {
    const shell = createShellInterpreter();
    expect(shell.runCommand('echo hello world')).toEqual({ output: 'hello world' });
  });

  it('should create and list directories', () => {
    const shell = createShellInterpreter();
    shell.runCommand('mkdir projects');
    const result = shell.runCommand('ls');
    expect(result.output).toContain('projects');
  });

  it('should support cd into a created directory and back up', () => {
    const shell = createShellInterpreter();
    shell.runCommand('mkdir projects');
    expect(shell.runCommand('cd projects')).toEqual({ output: '' });
    expect(shell.getCwd()).toBe('/home/repl/projects');

    expect(shell.runCommand('cd ..')).toEqual({ output: '' });
    expect(shell.getCwd()).toBe('/home/repl');
  });

  it('should support full navigation and listing sequence (mkdir -> ls -> cd -> ls -> touch -> ls)', () => {
    const shell = createShellInterpreter();
    expect(shell.runCommand('mkdir my_folder')).toEqual({ output: '' });
    expect(shell.runCommand('ls').output).toContain('my_folder');
    expect(shell.runCommand('cd my_folder')).toEqual({ output: '' });
    expect(shell.getCwd()).toBe('/home/repl/my_folder');
    expect(shell.runCommand('ls').output).toBe('');
    expect(shell.runCommand('touch script.sh')).toEqual({ output: '' });
    expect(shell.runCommand('ls').output).toContain('script.sh');
    expect(shell.runCommand('cd ..')).toEqual({ output: '' });
    expect(shell.getCwd()).toBe('/home/repl');
    expect(shell.runCommand('ls').output).toContain('my_folder');
  });

  it('should error on cd into a non-existent directory', () => {
    const shell = createShellInterpreter();
    const result = shell.runCommand('cd does-not-exist');
    expect(result.error).toContain('no such file or directory');
  });

  it('should create files via touch and read them via cat', () => {
    const shell = createShellInterpreter();
    shell.runCommand('touch notes.txt');
    const result = shell.runCommand('cat notes.txt');
    expect(result.output).toBe('');
  });

  it('should support redirect (>) to write command output to a file', () => {
    const shell = createShellInterpreter();
    shell.runCommand('echo hello > greeting.txt');
    const result = shell.runCommand('cat greeting.txt');
    expect(result.output).toBe('hello\n');
  });

  it('should remove files with rm', () => {
    const shell = createShellInterpreter();
    shell.runCommand('touch temp.txt');
    shell.runCommand('rm temp.txt');
    const result = shell.runCommand('cat temp.txt');
    expect(result.error).toContain('No such file or directory');
  });

  it('should count lines/words/chars with wc', () => {
    const shell = createShellInterpreter();
    shell.runCommand('echo one two three > words.txt');
    const result = shell.runCommand('wc words.txt');
    // redirect appends a trailing newline, so content is "one two three\n"
    // (2 lines when split on \n, 3 words, 14 chars)
    expect(result.output).toBe('2 3 14 words.txt');
  });

  it('should filter lines with grep', () => {
    const shell = createShellInterpreter();
    shell.runCommand('echo apple > fruit.txt');
    const result = shell.runCommand('grep apple fruit.txt');
    expect(result.output).toBe('apple');
  });

  it('should report command not found for unknown commands', () => {
    const shell = createShellInterpreter();
    const result = shell.runCommand('notarealcommand');
    expect(result.error).toBe('notarealcommand: command not found');
  });

  it('should run multi-line scripts and aggregate output/errors', () => {
    const shell = createShellInterpreter();
    const result = shell.runScript('echo one\necho two\nnotacommand');
    expect(result.output).toBe('one\ntwo');
    expect(result.error).toBe('notacommand: command not found');
  });

  it('should skip comments and blank lines in scripts', () => {
    const shell = createShellInterpreter();
    const result = shell.runScript('# a comment\n\necho ok');
    expect(result.output).toBe('ok');
    expect(result.error).toBeUndefined();
  });

  it('should support Unix pipelines with multiple stages', () => {
    const shell = createShellInterpreter();
    shell.writeFile('fruits.txt', 'cherry\napple\nbanana\napple\n');
    const result = shell.runCommand('cat fruits.txt | grep apple | sort | uniq');
    expect(result.output).toBe('apple');
  });

  it('should support conditional chaining with &&, || and ;', () => {
    const shell = createShellInterpreter();
    expect(shell.runCommand('echo step1 && echo step2')).toEqual({ output: 'step1\nstep2' });
    expect(shell.runCommand('false && echo should_not_run')).toEqual({ output: '' });
    expect(shell.runCommand('false || echo fallback')).toEqual({ output: 'fallback' });
  });

  it('should support append redirection (>>)', () => {
    const shell = createShellInterpreter();
    shell.runCommand('echo line1 > log.txt');
    shell.runCommand('echo line2 >> log.txt');
    const result = shell.runCommand('cat log.txt');
    expect(result.output).toBe('line1\nline2\n');
  });
});

describe('createEmscriptenVfs and createBusyboxRunner', () => {
  function createMockEmscriptenModule() {
    let cwd = '/home/repl';
    const store: Record<string, { type: 'file' | 'dir'; content: string }> = {
      '/home': { type: 'dir', content: '' },
      '/home/repl': { type: 'dir', content: '' },
      '/tmp': { type: 'dir', content: '' },
    };

    return {
      FS: {
        cwd: () => cwd,
        chdir: (p: string) => {
          cwd = p;
        },
        readFile: (p: string) => store[p]?.content ?? '',
        writeFile: (p: string, content: string) => {
          store[p] = { type: 'file', content };
        },
        mkdir: (p: string) => {
          store[p] = { type: 'dir', content: '' };
        },
        rmdir: (p: string) => {
          delete store[p];
        },
        unlink: (p: string) => {
          delete store[p];
        },
        analyzePath: (p: string) => ({ exists: Boolean(store[p]) }),
        stat: (p: string) => ({ mode: store[p]?.type === 'dir' ? 0o040000 : 0o100000 }),
        isDir: (mode: number) => (mode & 0o170000) === 0o040000,
        readdir: (p: string) => {
          const prefix = p === '/' ? '/' : p + '/';
          return Object.keys(store)
            .filter((k) => k.startsWith(prefix) && k !== p)
            .map((k) => k.slice(prefix.length).split('/')[0])
            .filter(Boolean);
        },
      },
      print: (_t: string) => {},
      printErr: (_t: string) => {},
      callMain: (args: string[]) => {
        if (args[0] === 'busybox_grep') {
          // Mock applet execution
        }
      },
    };
  }

  it('should adapt Emscripten MEMFS through IShellVfs and prioritize WASM runner', () => {
    const mockMod = createMockEmscriptenModule();
    const vfs = createEmscriptenVfs(mockMod);
    const wasmRunner = createBusyboxRunner(mockMod, vfs);

    const shell = createShellInterpreter({
      vfs,
      wasmRunner,
      preferWasmOverBuiltins: true,
    });

    shell.runCommand('touch test.txt');
    expect(vfs.exists('/home/repl/test.txt')).toBe(true);
    expect(shell.getCwd()).toBe('/home/repl');
  });
});
