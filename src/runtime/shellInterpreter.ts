/**
 * Unified in-memory Virtual File System (VFS) interface.
 * Implemented by both pure-JS dictionary and Emscripten MEMFS.
 */
export interface IShellVfs {
  cwd(): string;
  chdir(path: string): void;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  mkdir(path: string): void;
  rmdir(path: string): void;
  unlink(path: string): void;
  exists(path: string): boolean;
  isDir(path: string): boolean;
  readdir(path: string): string[];
}

export type WasmAppletRunner = (applet: string, args: string[], input?: string) => {
  output?: string;
  error?: string;
  exitCode: number;
};

/**
 * Default pure-JS in-memory VFS implementation.
 */
export function createMemoryVfs(): IShellVfs {
  let cwd = '/home/repl';
  const files: Record<string, { type: 'file' | 'dir'; content?: string }> = {
    '/home': { type: 'dir' },
    '/home/repl': { type: 'dir' },
  };

  function normalizePath(path: string): string {
    const parts = path.split('/').filter(Boolean);
    const stack: string[] = [];
    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return '/' + stack.join('/');
  }

  function resolvePath(path: string): string {
    if (!path) return cwd;
    if (path === '~' || path.startsWith('~/')) {
      return normalizePath(path.replace(/^~/, '/home/repl'));
    }
    if (path.startsWith('/')) return normalizePath(path);
    return normalizePath(cwd + '/' + path);
  }

  return {
    cwd: () => cwd,
    chdir: (path: string) => {
      const target = resolvePath(path);
      if (files[target] && files[target].type === 'dir') {
        cwd = target;
        return;
      }
      throw new Error(`no such file or directory: ${path}`);
    },
    readFile: (path: string) => {
      const target = resolvePath(path);
      const entry = files[target];
      if (!entry || entry.type !== 'file') {
        throw new Error(`${path}: No such file or directory`);
      }
      return entry.content || '';
    },
    writeFile: (path: string, content: string) => {
      const target = resolvePath(path);
      files[target] = { type: 'file', content: content || '' };
    },
    mkdir: (path: string) => {
      const target = resolvePath(path);
      files[target] = { type: 'dir' };
    },
    rmdir: (path: string) => {
      const target = resolvePath(path);
      if (!files[target] || files[target].type !== 'dir') {
        throw new Error(`${path}: No such file or directory`);
      }
      delete files[target];
    },
    unlink: (path: string) => {
      const target = resolvePath(path);
      if (!files[target]) {
        throw new Error(`${path}: No such file or directory`);
      }
      delete files[target];
    },
    exists: (path: string) => Boolean(files[resolvePath(path)]),
    isDir: (path: string) => files[resolvePath(path)]?.type === 'dir',
    readdir: (path: string) => {
      const target = resolvePath(path);
      const prefix = target === '/' ? '/' : target + '/';
      const entries = new Set<string>();
      for (const key of Object.keys(files)) {
        if (key === target) continue;
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const name = rest.split('/')[0];
          if (name) entries.add(name);
        }
      }
      return Array.from(entries).sort();
    },
  };
}

/**
 * Creates the unified shell interpreter.
 *
 * Can run with a pure-JS VFS (unit tests / fallback) or with an Emscripten MEMFS VFS +
 * BusyBox WASM runner (in real Web Workers).
 */
export function createShellInterpreter(options?: {
  vfs?: IShellVfs;
  wasmRunner?: WasmAppletRunner;
}) {
  const vfs = options?.vfs || createMemoryVfs();
  const wasmRunner = options?.wasmRunner;

  function tokenize(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < command.length; i++) {
      const ch = command[i];
      if (inQuotes) {
        if (ch === quoteChar) {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
      } else if (ch === ' ') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }

  function splitChains(line: string): Array<{ cmd: string; op: '&&' | '||' | ';' | null }> {
    const result: Array<{ cmd: string; op: '&&' | '||' | ';' | null }> = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === quoteChar) inQuotes = false;
        current += ch;
      } else if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
        current += ch;
      } else if (
        ch === ';' ||
        (ch === '&' && line[i + 1] === '&') ||
        (ch === '|' && line[i + 1] === '|')
      ) {
        const op = (ch === ';' ? ';' : line.slice(i, i + 2)) as '&&' | '||' | ';';
        result.push({ cmd: current.trim(), op });
        if (op.length === 2) i++;
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) result.push({ cmd: current.trim(), op: null });
    return result;
  }

  function splitPipes(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === quoteChar) inQuotes = false;
        current += ch;
      } else if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
        current += ch;
      } else if (ch === '|' && line[i + 1] !== '|') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }

  type CommandResult = { output?: string; error?: string; exitCode?: number };
  type Builtin = (args: string[], input?: string) => CommandResult;

  const builtins: Record<string, Builtin> = {
    pwd: () => ({ output: vfs.cwd(), exitCode: 0 }),
    cd: (args) => {
      const target = args[0] || '/home/repl';
      try {
        vfs.chdir(target);
        return { output: '', exitCode: 0 };
      } catch (err: any) {
        return { error: `cd: ${err.message || 'no such file or directory'}`, exitCode: 1 };
      }
    },
    ls: (args) => {
      const target = args.find((a) => !a.startsWith('-')) || vfs.cwd();
      try {
        if (!vfs.exists(target)) {
          return { error: `ls: cannot access '${target}': No such file or directory`, exitCode: 1 };
        }
        if (!vfs.isDir(target)) {
          return { output: target, exitCode: 0 };
        }
        return { output: vfs.readdir(target).join('  '), exitCode: 0 };
      } catch (err: any) {
        return { error: `ls: ${err.message}`, exitCode: 1 };
      }
    },
    mkdir: (args) => {
      const pFlag = args.includes('-p');
      const dirs = args.filter((a) => !a.startsWith('-'));
      if (dirs.length === 0) return { error: 'mkdir: missing operand', exitCode: 1 };
      for (const d of dirs) {
        try {
          if (pFlag) {
            const parts = d.startsWith('/')
              ? d.split('/').filter(Boolean).map((_part, idx, arr) => '/' + arr.slice(0, idx + 1).join('/'))
              : d.split('/').filter(Boolean).reduce((acc: string[], cur) => {
                  const prev = acc.length > 0 ? acc[acc.length - 1] + '/' : '';
                  acc.push(prev + cur);
                  return acc;
                }, []);
            for (const p of parts) {
              if (!vfs.exists(p)) vfs.mkdir(p);
            }
          } else {
            vfs.mkdir(d);
          }
        } catch (e: any) {
          return { error: `mkdir: cannot create directory '${d}': File exists`, exitCode: 1 };
        }
      }
      return { output: '', exitCode: 0 };
    },
    touch: (args) => {
      const targetFiles = args.filter((a) => !a.startsWith('-'));
      if (targetFiles.length === 0) return { error: 'touch: missing file operand', exitCode: 1 };
      for (const file of targetFiles) {
        if (!vfs.exists(file)) vfs.writeFile(file, '');
      }
      return { output: '', exitCode: 0 };
    },
    echo: (args) => ({ output: args.join(' '), exitCode: 0 }),
    printf: (args) => ({ output: args.join(' '), exitCode: 0 }),
    cat: (args, input = '') => {
      const fileArgs = args.filter((a) => !a.startsWith('-'));
      if (fileArgs.length === 0) return { output: input, exitCode: 0 };
      const contents: string[] = [];
      for (const path of fileArgs) {
        try {
          contents.push(vfs.readFile(path));
        } catch (e) {
          return { error: `cat: ${path}: No such file or directory`, exitCode: 1 };
        }
      }
      return { output: contents.join('\n'), exitCode: 0 };
    },
    rm: (args) => {
      const rFlag = args.includes('-r') || args.includes('-rf') || args.includes('-R');
      const targetFiles = args.filter((a) => !a.startsWith('-'));
      if (targetFiles.length === 0) return { error: 'rm: missing operand', exitCode: 1 };
      for (const path of targetFiles) {
        try {
          if (vfs.isDir(path) && rFlag) {
            vfs.rmdir(path);
          } else {
            vfs.unlink(path);
          }
        } catch (e) {
          return { error: `rm: cannot remove '${path}': No such file or directory`, exitCode: 1 };
        }
      }
      return { output: '', exitCode: 0 };
    },
    cp: (args) => {
      const nonFlags = args.filter((a) => !a.startsWith('-'));
      if (nonFlags.length < 2) return { error: 'cp: missing destination file operand', exitCode: 1 };
      try {
        const content = vfs.readFile(nonFlags[0]);
        vfs.writeFile(nonFlags[1], content);
        return { output: '', exitCode: 0 };
      } catch (e) {
        return { error: `cp: cannot stat '${nonFlags[0]}': No such file or directory`, exitCode: 1 };
      }
    },
    mv: (args) => {
      const nonFlags = args.filter((a) => !a.startsWith('-'));
      if (nonFlags.length < 2) return { error: 'mv: missing destination file operand', exitCode: 1 };
      try {
        const content = vfs.readFile(nonFlags[0]);
        vfs.unlink(nonFlags[0]);
        vfs.writeFile(nonFlags[1], content);
        return { output: '', exitCode: 0 };
      } catch (e) {
        return { error: `mv: cannot stat '${nonFlags[0]}': No such file or directory`, exitCode: 1 };
      }
    },
    wc: (args, input = '') => {
      const lFlag = args.includes('-l');
      const wFlag = args.includes('-w');
      const targetFiles = args.filter((a) => !a.startsWith('-'));
      let text = input;
      let label = '';
      if (targetFiles.length > 0) {
        label = ' ' + targetFiles[0];
        try {
          text = vfs.readFile(targetFiles[0]);
        } catch (e) {
          return { error: `wc: ${targetFiles[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      const lines = text ? text.split('\n').length : 0;
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      if (lFlag) return { output: `${lines}${label}`, exitCode: 0 };
      if (wFlag) return { output: `${words}${label}`, exitCode: 0 };
      return { output: `${lines} ${words} ${text.length}${label}`, exitCode: 0 };
    },
    grep: (args, input = '') => {
      const iFlag = args.includes('-i');
      const vFlag = args.includes('-v');
      const nonFlags = args.filter((a) => !a.startsWith('-'));
      if (nonFlags.length === 0) return { error: 'grep: missing pattern', exitCode: 1 };
      const pattern = nonFlags[0];
      const file = nonFlags[1];
      let sourceText = input;
      if (file) {
        try {
          sourceText = vfs.readFile(file);
        } catch (e) {
          return { error: `grep: ${file}: No such file or directory`, exitCode: 1 };
        }
      }
      const regex = new RegExp(pattern, iFlag ? 'i' : '');
      const lines = sourceText.split('\n');
      const matches = lines.filter((line) => (vFlag ? !regex.test(line) : regex.test(line)));
      return { output: matches.join('\n'), exitCode: matches.length > 0 ? 0 : 1 };
    },
    head: (args, input = '') => {
      const nIdx = args.indexOf('-n');
      const count = nIdx !== -1 && args[nIdx + 1] ? parseInt(args[nIdx + 1], 10) : 10;
      const nonFlags = args.filter((a, idx) => !a.startsWith('-') && (nIdx === -1 || idx !== nIdx + 1));
      let text = input;
      if (nonFlags.length > 0) {
        try {
          text = vfs.readFile(nonFlags[0]);
        } catch (e) {
          return { error: `head: ${nonFlags[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      return { output: text.split('\n').slice(0, count).join('\n'), exitCode: 0 };
    },
    tail: (args, input = '') => {
      const nIdx = args.indexOf('-n');
      const count = nIdx !== -1 && args[nIdx + 1] ? parseInt(args[nIdx + 1], 10) : 10;
      const nonFlags = args.filter((a, idx) => !a.startsWith('-') && (nIdx === -1 || idx !== nIdx + 1));
      let text = input;
      if (nonFlags.length > 0) {
        try {
          text = vfs.readFile(nonFlags[0]);
        } catch (e) {
          return { error: `tail: ${nonFlags[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      const lines = text.split('\n');
      return { output: lines.slice(Math.max(0, lines.length - count)).join('\n'), exitCode: 0 };
    },
    sort: (args, input = '') => {
      const rFlag = args.includes('-r');
      const uFlag = args.includes('-u');
      const nonFlags = args.filter((a) => !a.startsWith('-'));
      let text = input;
      if (nonFlags.length > 0) {
        try {
          text = vfs.readFile(nonFlags[0]);
        } catch (e) {
          return { error: `sort: ${nonFlags[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      let lines = text.split('\n').filter(Boolean).sort();
      if (uFlag) lines = Array.from(new Set(lines));
      if (rFlag) lines.reverse();
      return { output: lines.join('\n'), exitCode: 0 };
    },
    uniq: (args, input = '') => {
      const cFlag = args.includes('-c');
      const nonFlags = args.filter((a) => !a.startsWith('-'));
      let text = input;
      if (nonFlags.length > 0) {
        try {
          text = vfs.readFile(nonFlags[0]);
        } catch (e) {
          return { error: `uniq: ${nonFlags[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      const lines = text.split('\n');
      const result: string[] = [];
      let prev = '';
      let count = 0;
      for (const line of lines) {
        if (line === prev) {
          count++;
        } else {
          if (prev) result.push(cFlag ? `${count} ${prev}` : prev);
          prev = line;
          count = 1;
        }
      }
      if (prev) result.push(cFlag ? `${count} ${prev}` : prev);
      return { output: result.join('\n'), exitCode: 0 };
    },
    true: () => ({ output: '', exitCode: 0 }),
    false: () => ({ output: '', exitCode: 1 }),
    clear: () => ({ output: '\x1bc', exitCode: 0 }),
  };

  function executeStage(stageStr: string, input = ''): CommandResult {
    const tokens = tokenize(stageStr);
    if (tokens.length === 0) return { output: '', exitCode: 0 };

    const argv: string[] = [];
    let stdinFile: string | undefined;
    let stdoutFile: string | undefined;
    let stdoutAppend = false;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '<' && i + 1 < tokens.length) {
        stdinFile = tokens[++i];
      } else if (t === '>' && i + 1 < tokens.length) {
        stdoutFile = tokens[++i];
        stdoutAppend = false;
      } else if (t === '>>' && i + 1 < tokens.length) {
        stdoutFile = tokens[++i];
        stdoutAppend = true;
      } else {
        argv.push(t);
      }
    }

    if (argv.length === 0) return { output: '', exitCode: 0 };

    let currentInput = input;
    if (stdinFile) {
      try {
        currentInput = vfs.readFile(stdinFile);
      } catch (e: any) {
        return { error: `sh: ${stdinFile}: No such file or directory`, exitCode: 1 };
      }
    }

    const cmd = argv[0];
    const args = argv.slice(1);

    let res: CommandResult;
    if (builtins[cmd]) {
      res = builtins[cmd](args, currentInput);
    } else if (wasmRunner) {
      const wasmRes = wasmRunner(cmd, args, currentInput);
      res = {
        output: wasmRes.output,
        error: wasmRes.error,
        exitCode: wasmRes.exitCode,
      };
    } else {
      return { error: `${cmd}: command not found`, exitCode: 127 };
    }

    if (stdoutFile) {
      try {
        const existing = stdoutAppend && vfs.exists(stdoutFile) ? vfs.readFile(stdoutFile) : '';
        vfs.writeFile(stdoutFile, existing + (res.output || '') + '\n');
        return { output: '', error: res.error, exitCode: res.exitCode };
      } catch (e: any) {
        return { error: `sh: cannot write ${stdoutFile}: ${e.message}`, exitCode: 1 };
      }
    }

    return res;
  }

  function executePipeline(pipeStr: string, input = ''): CommandResult {
    const stages = splitPipes(pipeStr);
    let curInput = input;
    let finalRes: CommandResult = { output: '', exitCode: 0 };

    for (let i = 0; i < stages.length; i++) {
      finalRes = executeStage(stages[i], curInput);
      if (finalRes.exitCode !== 0 && finalRes.error) {
        return finalRes;
      }
      curInput = finalRes.output || '';
    }

    return finalRes;
  }

  function runCommand(commandLine: string): CommandResult {
    const trimmed = (commandLine || '').trim();
    if (!trimmed) return { output: '', exitCode: 0 };

    const chains = splitChains(trimmed);
    let lastResult: CommandResult = { output: '', exitCode: 0 };
    const outputs: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < chains.length; i++) {
      const { cmd, op } = chains[i];
      if (!cmd) continue;

      lastResult = executePipeline(cmd);
      if (lastResult.output) outputs.push(lastResult.output);
      if (lastResult.error) errors.push(lastResult.error);

      if (op === '&&' && (lastResult.exitCode ?? 0) !== 0) break;
      if (op === '||' && (lastResult.exitCode ?? 0) === 0) break;
    }

    const res: CommandResult = {
      output: outputs.join('\n'),
    };
    if (errors.length > 0) {
      res.error = errors.join('\n');
    }
    return res;
  }

  function runScript(script: string): { output: string; error?: string } {
    const lines = (script || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !l.startsWith('#'));
    const outputs: string[] = [];
    const errors: string[] = [];
    for (const line of lines) {
      const result = runCommand(line);
      if (result.output) outputs.push(result.output);
      if (result.error) errors.push(result.error);
    }
    return { output: outputs.join('\n'), error: errors.join('\n') || undefined };
  }

  return {
    runCommand,
    runScript,
    getCwd: () => vfs.cwd(),
    writeFile: (p: string, c: string) => vfs.writeFile(p, c),
    readFile: (p: string) => vfs.readFile(p),
  };
}
