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

export type WasmAppletRunner = (
  applet: string,
  args: string[],
  input?: string,
) => {
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
    '/tmp': { type: 'dir' },
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
 * Emscripten MEMFS VFS adapter implementing IShellVfs.
 */
export function createEmscriptenVfs(mod: any): IShellVfs {
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
    if (!path) return mod.FS.cwd();
    if (path === '~' || path.startsWith('~/')) {
      return normalizePath(path.replace(/^~/, '/home/repl'));
    }
    if (path.startsWith('/')) return normalizePath(path);
    const currentDirectory = mod.FS.cwd();
    return normalizePath((currentDirectory === '/' ? '' : currentDirectory) + '/' + path);
  }

  return {
    cwd: () => mod.FS.cwd(),
    chdir: (path: string) => {
      const target = resolvePath(path);
      mod.FS.chdir(target);
    },
    readFile: (path: string) => {
      const target = resolvePath(path);
      return mod.FS.readFile(target, { encoding: 'utf8' });
    },
    writeFile: (path: string, content: string) => {
      const target = resolvePath(path);
      mod.FS.writeFile(target, content || '');
    },
    mkdir: (path: string) => {
      const target = resolvePath(path);
      mod.FS.mkdir(target);
    },
    rmdir: (path: string) => {
      const target = resolvePath(path);
      mod.FS.rmdir(target);
    },
    unlink: (path: string) => {
      const target = resolvePath(path);
      mod.FS.unlink(target);
    },
    exists: (path: string) => {
      try {
        const target = resolvePath(path);
        return mod.FS.analyzePath(target).exists;
      } catch (e) {
        return false;
      }
    },
    isDir: (path: string) => {
      try {
        const target = resolvePath(path);
        const stat = mod.FS.stat(target);
        return mod.FS.isDir(stat.mode);
      } catch (e) {
        return false;
      }
    },
    readdir: (path: string) => {
      const target = resolvePath(path);
      const entries = mod.FS.readdir(target);
      return entries.filter((e: string) => e !== '.' && e !== '..').sort();
    },
  };
}

/**
 * Runner that invokes compiled BusyBox C applets via callMain().
 */
export function createBusyboxRunner(mod: any, vfs: IShellVfs): WasmAppletRunner {
  let pipeCounter = 0;
  return (applet: string, args: string[], input?: string) => {
    let outputBuffer = '';
    let errorBuffer = '';
    const originalPrint = mod.print;
    const originalPrintErr = mod.printErr;
    mod.print = (text: string) => {
      outputBuffer += (outputBuffer ? '\n' : '') + text;
    };
    mod.printErr = (text: string) => {
      errorBuffer += (errorBuffer ? '\n' : '') + text;
    };

    let temporaryInputFile: string | null = null;
    const effectiveArgs = [...args];
    if (input !== undefined && input !== '') {
      temporaryInputFile = `/tmp/.dcl_input_${++pipeCounter}`;
      try {
        vfs.writeFile(temporaryInputFile, input);
        effectiveArgs.push(temporaryInputFile);
      } catch (e) {
        // Fallback
      }
    }

    let exitCode = 0;
    try {
      mod.callMain([applet, ...effectiveArgs]);
    } catch (e: any) {
      if (typeof e === 'number') exitCode = e;
      else if (e && typeof e.status === 'number') exitCode = e.status;
    } finally {
      mod.print = originalPrint;
      mod.printErr = originalPrintErr;
      if (temporaryInputFile) {
        try {
          vfs.unlink(temporaryInputFile);
        } catch (e) {}
      }
    }

    return {
      output: outputBuffer || undefined,
      error: errorBuffer || undefined,
      exitCode,
    };
  };
}

export interface CreateShellInterpreterOptions {
  vfs?: IShellVfs;
  wasmRunner?: WasmAppletRunner;
  preferWasmOverBuiltins?: boolean;
}

/**
 * Creates the unified shell interpreter.
 *
 * Can run with a pure-JS VFS (unit tests / fallback) or with an Emscripten MEMFS VFS +
 * BusyBox WASM runner (in real Web Workers).
 */
export function createShellInterpreter(options?: CreateShellInterpreterOptions) {
  const vfs = options?.vfs || createMemoryVfs();
  const wasmRunner = options?.wasmRunner;
  const preferWasm = options?.preferWasmOverBuiltins ?? Boolean(wasmRunner);

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

  const filesystemBuiltins = new Set([
    'cd',
    'pwd',
    'ls',
    'touch',
    'mkdir',
    'rm',
    'cp',
    'mv',
    'clear',
  ]);

  const builtins: Record<string, Builtin> = {
    pwd: () => ({ output: vfs.cwd(), exitCode: 0 }),
    cd: (args) => {
      const target = args[0] || '/home/repl';
      try {
        vfs.chdir(target);
        return { output: '', exitCode: 0 };
      } catch (err: any) {
        return { error: `cd: ${args[0] || ''}: no such file or directory`, exitCode: 1 };
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
        const entries = vfs.readdir(target);
        return { output: entries.join('  '), exitCode: 0 };
      } catch (err: any) {
        return { error: `ls: ${err.message}`, exitCode: 1 };
      }
    },
    mkdir: (args) => {
      const shouldCreateParents = args.includes('-p');
      const targetDirectories = args.filter((arg) => !arg.startsWith('-'));
      if (targetDirectories.length === 0) return { error: 'mkdir: missing operand', exitCode: 1 };
      for (const directoryPath of targetDirectories) {
        try {
          if (shouldCreateParents) {
            const parts = directoryPath.startsWith('/')
              ? directoryPath.split('/').filter(Boolean).map((_part, index, array) => '/' + array.slice(0, index + 1).join('/'))
              : directoryPath.split('/').filter(Boolean).reduce((accumulator: string[], current) => {
                  const previous = accumulator.length > 0 ? accumulator[accumulator.length - 1] + '/' : '';
                  accumulator.push(previous + current);
                  return accumulator;
                }, []);
            for (const part of parts) {
              if (!vfs.exists(part)) vfs.mkdir(part);
            }
          } else {
            vfs.mkdir(directoryPath);
          }
        } catch (directoryError: any) {
          return { error: `mkdir: cannot create directory '${directoryPath}': File exists`, exitCode: 1 };
        }
      }
      return { output: '', exitCode: 0 };
    },
    touch: (args) => {
      const targetFiles = args.filter((arg) => !arg.startsWith('-'));
      if (targetFiles.length === 0) return { error: 'touch: missing file operand', exitCode: 1 };
      for (const file of targetFiles) {
        if (!vfs.exists(file)) vfs.writeFile(file, '');
      }
      return { output: '', exitCode: 0 };
    },
    echo: (args) => ({ output: args.join(' '), exitCode: 0 }),
    printf: (args) => ({ output: args.join(' '), exitCode: 0 }),
    cat: (args, input = '') => {
      const fileArguments = args.filter((arg) => !arg.startsWith('-'));
      if (fileArguments.length === 0) return { output: input, exitCode: 0 };
      const contents: string[] = [];
      for (const path of fileArguments) {
        try {
          contents.push(vfs.readFile(path));
        } catch (readError) {
          return { error: `cat: ${path}: No such file or directory`, exitCode: 1 };
        }
      }
      return { output: contents.join('\n'), exitCode: 0 };
    },
    rm: (args) => {
      const isRecursive = args.includes('-r') || args.includes('-rf') || args.includes('-R');
      const targetFiles = args.filter((arg) => !arg.startsWith('-'));
      if (targetFiles.length === 0) return { error: 'rm: missing operand', exitCode: 1 };
      for (const path of targetFiles) {
        try {
          if (vfs.isDir(path) && isRecursive) {
            vfs.rmdir(path);
          } else {
            vfs.unlink(path);
          }
        } catch (removeError) {
          return { error: `rm: cannot remove '${path}': No such file or directory`, exitCode: 1 };
        }
      }
      return { output: '', exitCode: 0 };
    },
    cp: (args) => {
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      if (positionalArguments.length < 2) return { error: 'cp: missing destination file operand', exitCode: 1 };
      try {
        const content = vfs.readFile(positionalArguments[0]);
        vfs.writeFile(positionalArguments[1], content);
        return { output: '', exitCode: 0 };
      } catch (copyError) {
        return { error: `cp: cannot stat '${positionalArguments[0]}': No such file or directory`, exitCode: 1 };
      }
    },
    mv: (args) => {
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      if (positionalArguments.length < 2) return { error: 'mv: missing destination file operand', exitCode: 1 };
      try {
        const content = vfs.readFile(positionalArguments[0]);
        vfs.unlink(positionalArguments[0]);
        vfs.writeFile(positionalArguments[1], content);
        return { output: '', exitCode: 0 };
      } catch (moveError) {
        return { error: `mv: cannot stat '${positionalArguments[0]}': No such file or directory`, exitCode: 1 };
      }
    },
    wc: (args, input = '') => {
      const countLinesOnly = args.includes('-l');
      const countWordsOnly = args.includes('-w');
      const targetFiles = args.filter((arg) => !arg.startsWith('-'));
      let text = input;
      let label = '';
      if (targetFiles.length > 0) {
        label = ' ' + targetFiles[0];
        try {
          text = vfs.readFile(targetFiles[0]);
        } catch (readError) {
          return { error: `wc: ${targetFiles[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      const lines = text ? text.split('\n').length : 0;
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      if (countLinesOnly) return { output: `${lines}${label}`, exitCode: 0 };
      if (countWordsOnly) return { output: `${words}${label}`, exitCode: 0 };
      return { output: `${lines} ${words} ${text.length}${label}`, exitCode: 0 };
    },
    grep: (args, input = '') => {
      const caseInsensitive = args.includes('-i');
      const invertMatch = args.includes('-v');
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      if (positionalArguments.length === 0) return { error: 'grep: missing pattern', exitCode: 1 };
      const pattern = positionalArguments[0];
      const file = positionalArguments[1];
      let sourceText = input;
      if (file) {
        try {
          sourceText = vfs.readFile(file);
        } catch (readError) {
          return { error: `grep: ${file}: No such file or directory`, exitCode: 1 };
        }
      }
      const regex = new RegExp(pattern, caseInsensitive ? 'i' : '');
      const lines = sourceText.split('\n');
      const matches = lines.filter((line) => (invertMatch ? !regex.test(line) : regex.test(line)));
      return { output: matches.join('\n'), exitCode: matches.length > 0 ? 0 : 1 };
    },
    head: (args, input = '') => {
      const linesArgumentIndex = args.indexOf('-n');
      const count = linesArgumentIndex !== -1 && args[linesArgumentIndex + 1] ? parseInt(args[linesArgumentIndex + 1], 10) : 10;
      const positionalArguments = args.filter((arg, index) => !arg.startsWith('-') && (linesArgumentIndex === -1 || index !== linesArgumentIndex + 1));
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch (readError) {
          return { error: `head: ${positionalArguments[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      return { output: text.split('\n').slice(0, count).join('\n'), exitCode: 0 };
    },
    tail: (args, input = '') => {
      const linesArgumentIndex = args.indexOf('-n');
      const count = linesArgumentIndex !== -1 && args[linesArgumentIndex + 1] ? parseInt(args[linesArgumentIndex + 1], 10) : 10;
      const positionalArguments = args.filter((arg, index) => !arg.startsWith('-') && (linesArgumentIndex === -1 || index !== linesArgumentIndex + 1));
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch (readError) {
          return { error: `tail: ${positionalArguments[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      const lines = text.split('\n');
      return { output: lines.slice(Math.max(0, lines.length - count)).join('\n'), exitCode: 0 };
    },
    sort: (args, input = '') => {
      const reverseOrder = args.includes('-r');
      const uniqueOnly = args.includes('-u');
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch (readError) {
          return { error: `sort: ${positionalArguments[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      let lines = text.split('\n').filter(Boolean).sort();
      if (uniqueOnly) lines = Array.from(new Set(lines));
      if (reverseOrder) lines.reverse();
      return { output: lines.join('\n'), exitCode: 0 };
    },
    uniq: (args, input = '') => {
      const countPrefix = args.includes('-c');
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch (readError) {
          return { error: `uniq: ${positionalArguments[0]}: No such file or directory`, exitCode: 1 };
        }
      }
      const lines = text.split('\n');
      const result: string[] = [];
      let previousLine = '';
      let count = 0;
      for (const line of lines) {
        if (line === previousLine) {
          count++;
        } else {
          if (previousLine) result.push(countPrefix ? `${count} ${previousLine}` : previousLine);
          previousLine = line;
          count = 1;
        }
      }
      if (previousLine) result.push(countPrefix ? `${count} ${previousLine}` : previousLine);
      return { output: result.join('\n'), exitCode: 0 };
    },
    true: () => ({ output: '', exitCode: 0 }),
    false: () => ({ output: '', exitCode: 1 }),
    clear: () => ({ output: '\x1bc', exitCode: 0 }),
  };

  function executeStage(stageString: string, input = ''): CommandResult {
    const tokens = tokenize(stageString);
    if (tokens.length === 0) return { output: '', exitCode: 0 };

    const argumentVector: string[] = [];
    let stdinFile: string | undefined;
    let stdoutFile: string | undefined;
    let stdoutAppend = false;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === '<' && i + 1 < tokens.length) {
        stdinFile = tokens[++i];
      } else if (token === '>' && i + 1 < tokens.length) {
        stdoutFile = tokens[++i];
        stdoutAppend = false;
      } else if (token === '>>' && i + 1 < tokens.length) {
        stdoutFile = tokens[++i];
        stdoutAppend = true;
      } else {
        argumentVector.push(token);
      }
    }

    if (argumentVector.length === 0) return { output: '', exitCode: 0 };

    let currentInput = input;
    if (stdinFile) {
      try {
        currentInput = vfs.readFile(stdinFile);
      } catch (readError: any) {
        return { error: `sh: ${stdinFile}: No such file or directory`, exitCode: 1 };
      }
    }

    const command = argumentVector[0];
    const args = argumentVector.slice(1);

    let commandResult: CommandResult;
    if (preferWasm && wasmRunner && !filesystemBuiltins.has(command)) {
      const wasmResult = wasmRunner(command, args, currentInput);
      const isNotFound =
        wasmResult.exitCode === 127 ||
        (wasmResult.error && wasmResult.error.includes('applet not found'));
      if (!isNotFound) {
        commandResult = {
          output: wasmResult.output,
          error: wasmResult.error,
          exitCode: wasmResult.exitCode,
        };
      } else if (builtins[command]) {
        commandResult = builtins[command](args, currentInput);
      } else {
        return { error: `${command}: command not found`, exitCode: 127 };
      }
    } else if (builtins[command]) {
      commandResult = builtins[command](args, currentInput);
    } else if (wasmRunner) {
      const wasmResult = wasmRunner(command, args, currentInput);
      commandResult = {
        output: wasmResult.output,
        error: wasmResult.error,
        exitCode: wasmResult.exitCode,
      };
    } else {
      return { error: `${command}: command not found`, exitCode: 127 };
    }

    if (stdoutFile) {
      try {
        const existing = stdoutAppend && vfs.exists(stdoutFile) ? vfs.readFile(stdoutFile) : '';
        vfs.writeFile(stdoutFile, existing + (commandResult.output || '') + '\n');
        return { output: '', error: commandResult.error, exitCode: commandResult.exitCode };
      } catch (writeError: any) {
        return { error: `sh: cannot write ${stdoutFile}: ${writeError.message}`, exitCode: 1 };
      }
    }

    return commandResult;
  }

  function executePipeline(pipelineString: string, input = ''): CommandResult {
    const stages = splitPipes(pipelineString);
    let currentStageInput = input;
    let finalResult: CommandResult = { output: '', exitCode: 0 };

    for (let i = 0; i < stages.length; i++) {
      finalResult = executeStage(stages[i], currentStageInput);
      if (finalResult.exitCode !== 0 && finalResult.error) {
        return finalResult;
      }
      currentStageInput = finalResult.output || '';
    }

    return finalResult;
  }

  function runCommand(commandLine: string): CommandResult {
    const trimmed = (commandLine || '').trim();
    if (!trimmed) return { output: '', exitCode: 0 };

    const chains = splitChains(trimmed);
    let lastResult: CommandResult = { output: '', exitCode: 0 };
    const outputs: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < chains.length; i++) {
      const { cmd: chainedCommand, op: operator } = chains[i];
      if (!chainedCommand) continue;

      lastResult = executePipeline(chainedCommand);
      if (lastResult.output) outputs.push(lastResult.output);
      if (lastResult.error) errors.push(lastResult.error);

      if (operator === '&&' && (lastResult.exitCode ?? 0) !== 0) break;
      if (operator === '||' && (lastResult.exitCode ?? 0) === 0) break;
    }

    const commandResult: CommandResult = {
      output: outputs.join('\n'),
    };
    if (errors.length > 0) {
      commandResult.error = errors.join('\n');
    }
    return commandResult;
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
