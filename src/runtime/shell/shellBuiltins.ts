import type { IShellVfs } from './virtualFileSystem.ts';

export interface CommandExecutionResult {
  output?: string;
  error?: string;
  exitCode: number;
}

export interface PipInstallResult {
  output?: string;
  error?: string;
  exitCode?: number;
}

export type PipInstallHandler = (
  packages: string[],
) => Promise<PipInstallResult | void>;

export function parsePipInstallArguments(
  args: string[],
  virtualFileSystem: IShellVfs,
): { packages?: string[]; error?: string } {
  const packages: string[] = [];
  let requirementsFile: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === 'install') {
      // Skip the pip subcommand itself
    } else if (argument === '-r' || argument === '--requirement') {
      requirementsFile = args[++index];
    } else if (
      argument === '-q' ||
      argument === '--quiet' ||
      argument === '--upgrade' ||
      argument === '-U' ||
      argument === '--no-deps' ||
      argument === '--user'
    ) {
      // Ignore common flags
    } else if (!argument.startsWith('-')) {
      packages.push(argument);
    }
  }
  if (requirementsFile) {
    try {
      const requirementsContent = virtualFileSystem.readFile(requirementsFile);
      for (const rawLine of requirementsContent.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        packages.push(line.split(/\s+/)[0].trim());
      }
    } catch {
      return { error: 'pip: could not open requirements file: ' + requirementsFile };
    }
  }
  return { packages };
}

export function removeRecursive(virtualFileSystem: IShellVfs, targetPath: string): void {
  if (virtualFileSystem.isDir(targetPath)) {
    const children = virtualFileSystem.readdir(targetPath);
    for (const child of children) {
      removeRecursive(virtualFileSystem, targetPath.replace(/\/+$/, '') + '/' + child);
    }
    virtualFileSystem.rmdir(targetPath);
  } else if (virtualFileSystem.exists(targetPath)) {
    virtualFileSystem.unlink(targetPath);
  }
}

export function copyRecursive(
  virtualFileSystem: IShellVfs,
  sourcePath: string,
  destinationPath: string,
): void {
  if (virtualFileSystem.isDir(sourcePath)) {
    if (!virtualFileSystem.exists(destinationPath)) {
      virtualFileSystem.mkdir(destinationPath);
    }
    const children = virtualFileSystem.readdir(sourcePath);
    for (const child of children) {
      copyRecursive(
        virtualFileSystem,
        sourcePath.replace(/\/+$/, '') + '/' + child,
        destinationPath.replace(/\/+$/, '') + '/' + child,
      );
    }
  } else {
    virtualFileSystem.writeFile(destinationPath, virtualFileSystem.readFile(sourcePath));
  }
}

export function getAllFilesRecursive(
  virtualFileSystem: IShellVfs,
  directoryPath: string,
): string[] {
  const result: string[] = [];
  try {
    const entries = virtualFileSystem.readdir(directoryPath);
    for (const entry of entries) {
      const fullPath =
        (directoryPath === '/' ? '' : directoryPath) + '/' + entry;
      if (virtualFileSystem.isDir(fullPath)) {
        result.push(...getAllFilesRecursive(virtualFileSystem, fullPath));
      } else {
        result.push(fullPath);
      }
    }
  } catch {}
  return result;
}

export interface ShellBuiltinsOptions {
  virtualFileSystem: IShellVfs;
  onPipInstall?: PipInstallHandler;
  pendingPipInstallations: Array<Promise<PipInstallResult | void>>;
  setLastPipInstallResult: (result: PipInstallResult) => void;
  environment?: Record<string, string>;
  getEnvironment?: () => Record<string, string>;
  setEnvironmentVariable?: (key: string, value: string) => void;
  getAvailableCommands?: () => string[];
  wasmRunner?: (command: string, args: string[], input?: string) => CommandExecutionResult;
}

export function createShellBuiltins(
  options: ShellBuiltinsOptions,
): Record<string, (args: string[], input?: string) => CommandExecutionResult> {
  const {
    virtualFileSystem: vfs,
    onPipInstall,
    pendingPipInstallations,
    setLastPipInstallResult,
  } = options;

  const builtins: Record<
    string,
    (args: string[], input?: string) => CommandExecutionResult
  > = {
    cd: (args) => {
      const target = args[0] || '~';
      try {
        vfs.chdir(target);
        return { output: '', exitCode: 0 };
      } catch {
        return { error: 'cd: ' + (args[0] || '') + ': no such file or directory', exitCode: 1 };
      }
    },
    pwd: () => ({ output: vfs.cwd(), exitCode: 0 }),
    echo: (args) => {
      const output = args.join(' ');
      return { output, exitCode: 0 };
    },
    printf: (args) => {
      if (args.length === 0) return { output: '', exitCode: 0 };
      let format = args[0]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
      const formatArgs = args.slice(1);
      let argIndex = 0;
      format = format.replace(/%[sdbx]/g, () => formatArgs[argIndex++] || '');
      return { output: format, exitCode: 0 };
    },
    ls: (args) => {
      const target = args.find((arg) => !arg.startsWith('-')) || vfs.cwd();
      const showLong = args.includes('-l') || args.includes('-la') || args.includes('-al');
      const showAll = args.includes('-a') || args.includes('-la') || args.includes('-al');
      const showAlmostAll = args.includes('-A');
      try {
        if (!vfs.exists(target)) {
          return { error: "ls: cannot access '" + target + "': No such file or directory", exitCode: 1 };
        }
        if (!vfs.isDir(target)) {
          return { output: target, exitCode: 0 };
        }
        const entries = vfs.readdir(target);
        let filteredEntries = entries;
        if (showAll) {
          filteredEntries = ['.', '..', ...entries];
        } else if (showAlmostAll) {
          filteredEntries = entries;
        } else {
          filteredEntries = entries.filter((entryName) => !entryName.startsWith('.'));
        }

        if (showLong) {
          const lines = filteredEntries.map((entry) => {
            const fullPath = target === '/' ? `/${entry}` : `${target}/${entry}`;
            const isDirectory = entry === '.' || entry === '..' ? true : vfs.isDir(fullPath);
            const permissions = isDirectory ? 'drwxr-xr-x' : '-rw-r--r--';
            const links = isDirectory ? 2 : 1;
            const size = isDirectory
              ? 4096
              : vfs.stat
                ? vfs.stat(fullPath).size
                : (vfs.readFile(fullPath) || '').length;
            const dateStr = 'Sep  7 12:00';
            return `${permissions} ${links} repl repl ${String(size).padStart(5, ' ')} ${dateStr} ${entry}`;
          });
          return { output: lines.join('\n'), exitCode: 0 };
        }

        return { output: filteredEntries.join('  '), exitCode: 0 };
      } catch (readDirectoryError: any) {
        return { error: 'ls: ' + readDirectoryError.message, exitCode: 1 };
      }
    },
    mkdir: (args) => {
      const isParents = args.includes('-p');
      const targetDirectories = args.filter((arg) => !arg.startsWith('-'));
      if (targetDirectories.length === 0) {
        return { error: 'mkdir: missing operand', exitCode: 1 };
      }
      for (const directoryPath of targetDirectories) {
        try {
          if (isParents) {
            const segments = directoryPath.split('/').filter(Boolean);
            let currentPath = directoryPath.startsWith('/') ? '' : vfs.cwd();
            for (const segment of segments) {
              currentPath = currentPath + '/' + segment;
              if (!vfs.exists(currentPath)) {
                vfs.mkdir(currentPath);
              }
            }
          } else {
            vfs.mkdir(directoryPath);
          }
        } catch {
          return { error: "mkdir: cannot create directory '" + directoryPath + "': File exists", exitCode: 1 };
        }
      }
      return { output: '', exitCode: 0 };
    },
    rmdir: (args) => {
      const targetDirectories = args.filter((arg) => !arg.startsWith('-'));
      if (targetDirectories.length === 0) return { error: 'rmdir: missing operand', exitCode: 1 };
      for (const directoryPath of targetDirectories) {
        try {
          vfs.rmdir(directoryPath);
        } catch {
          return { error: `rmdir: failed to remove '${directoryPath}': Directory not empty or not found`, exitCode: 1 };
        }
      }
      return { output: '', exitCode: 0 };
    },
    touch: (args) => {
      const targetFiles = args.filter((arg) => !arg.startsWith('-'));
      for (const filePath of targetFiles) {
        if (!vfs.exists(filePath)) {
          vfs.writeFile(filePath, '');
        }
      }
      return { output: '', exitCode: 0 };
    },
    cat: (args, input = '') => {
      const targetFiles = args.filter((arg) => !arg.startsWith('-'));
      if (targetFiles.length === 0) {
        return { output: input, exitCode: 0 };
      }
      const contents: string[] = [];
      for (const filePath of targetFiles) {
        try {
          contents.push(vfs.readFile(filePath));
        } catch {
          return { error: 'cat: ' + filePath + ': No such file or directory', exitCode: 1 };
        }
      }
      return { output: contents.join('\n'), exitCode: 0 };
    },
    rm: (args) => {
      const isRecursive = args.includes('-r') || args.includes('-R') || args.includes('-rf');
      const isForce = args.includes('-f') || args.includes('-rf');
      const targetFiles = args.filter((arg) => !arg.startsWith('-'));
      if (targetFiles.length === 0) {
        if (isForce) return { output: '', exitCode: 0 };
        return { error: 'rm: missing operand', exitCode: 1 };
      }
      for (const filePath of targetFiles) {
        try {
          if (vfs.isDir(filePath) && isRecursive) {
            removeRecursive(vfs, filePath);
          } else {
            vfs.unlink(filePath);
          }
        } catch {
          if (!isForce) {
            return { error: "rm: cannot remove '" + filePath + "': No such file or directory", exitCode: 1 };
          }
        }
      }
      return { output: '', exitCode: 0 };
    },
    cp: (args) => {
      const isRecursive = args.includes('-r') || args.includes('-R');
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      if (positionalArguments.length < 2) return { error: 'cp: missing destination file operand', exitCode: 1 };
      const source = positionalArguments[0];
      const destination = positionalArguments[1];
      try {
        if (vfs.isDir(source) && isRecursive) {
          copyRecursive(vfs, source, destination);
        } else {
          const content = vfs.readFile(source);
          vfs.writeFile(destination, content);
        }
        return { output: '', exitCode: 0 };
      } catch {
        return { error: "cp: cannot stat '" + source + "': No such file or directory", exitCode: 1 };
      }
    },
    mv: (args) => {
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      if (positionalArguments.length < 2) return { error: 'mv: missing destination file operand', exitCode: 1 };
      try {
        const content = vfs.readFile(positionalArguments[0]);
        vfs.writeFile(positionalArguments[1], content);
        vfs.unlink(positionalArguments[0]);
        return { output: '', exitCode: 0 };
      } catch {
        return { error: "mv: cannot stat '" + positionalArguments[0] + "': No such file or directory", exitCode: 1 };
      }
    },
    wc: (args, input = '') => {
      const countLinesOnly = args.includes('-l');
      const countWordsOnly = args.includes('-w');
      const countBytesOnly = args.includes('-c') || args.includes('-m');
      const targetFiles = args.filter((arg) => !arg.startsWith('-'));
      let text = input;
      let label = '';
      if (targetFiles.length > 0) {
        try {
          text = vfs.readFile(targetFiles[0]);
          label = ' ' + targetFiles[0];
        } catch {
          return { error: 'wc: ' + targetFiles[0] + ': No such file or directory', exitCode: 1 };
        }
      }
      const lines = text ? text.split('\n').length : 0;
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      const bytes = text ? text.length : 0;
      if (countLinesOnly) return { output: String(lines) + label, exitCode: 0 };
      if (countWordsOnly) return { output: String(words) + label, exitCode: 0 };
      if (countBytesOnly) return { output: String(bytes) + label, exitCode: 0 };
      return { output: String(lines) + ' ' + String(words) + ' ' + String(bytes) + label, exitCode: 0 };
    },
    grep: (args, input = '') => {
      const caseInsensitive = args.includes('-i');
      const invertMatch = args.includes('-v');
      const showLineNumbers = args.includes('-n');
      const countOnly = args.includes('-c');
      const wordMatch = args.includes('-w');
      const isRecursive = args.includes('-r') || args.includes('-R');
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      if (positionalArguments.length === 0) return { error: 'grep: missing pattern', exitCode: 1 };
      const pattern = positionalArguments[0];
      const targetPath = positionalArguments[1];

      let regexPattern = pattern;
      if (wordMatch) regexPattern = '\\b' + regexPattern + '\\b';
      const regex = new RegExp(regexPattern, caseInsensitive ? 'i' : '');

      if (isRecursive) {
        const rootDir = targetPath || vfs.cwd();
        const allFiles = getAllFilesRecursive(vfs, rootDir);
        const matches: string[] = [];
        for (const filePath of allFiles) {
          try {
            const content = vfs.readFile(filePath);
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              const matched = invertMatch ? !regex.test(line) : regex.test(line);
              if (matched) {
                const linePrefix = showLineNumbers ? `${index + 1}:` : '';
                matches.push(`${filePath}:${linePrefix}${line}`);
              }
            });
          } catch {}
        }
        if (countOnly) return { output: String(matches.length), exitCode: matches.length > 0 ? 0 : 1 };
        return { output: matches.join('\n'), exitCode: matches.length > 0 ? 0 : 1 };
      }

      let sourceText = input;
      if (targetPath) {
        try {
          sourceText = vfs.readFile(targetPath);
        } catch {
          return { error: 'grep: ' + targetPath + ': No such file or directory', exitCode: 1 };
        }
      }

      const lines = sourceText.split('\n');
      const matches: string[] = [];
      lines.forEach((line, index) => {
        const matched = invertMatch ? !regex.test(line) : regex.test(line);
        if (matched) {
          const linePrefix = showLineNumbers ? `${index + 1}:` : '';
          matches.push(`${linePrefix}${line}`);
        }
      });
      if (countOnly) return { output: String(matches.length), exitCode: matches.length > 0 ? 0 : 1 };
      return { output: matches.join('\n'), exitCode: matches.length > 0 ? 0 : 1 };
    },
    head: (args, input = '') => {
      let count = 10;
      const countIndex = args.indexOf('-n');
      if (countIndex !== -1 && args[countIndex + 1]) {
        count = parseInt(args[countIndex + 1], 10) || 10;
      }
      const positionalArguments = args.filter((arg, i) => !arg.startsWith('-') && args[i - 1] !== '-n');
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch {
          return { error: 'head: ' + positionalArguments[0] + ': No such file or directory', exitCode: 1 };
        }
      }
      return { output: text.split('\n').slice(0, count).join('\n'), exitCode: 0 };
    },
    tail: (args, input = '') => {
      let count = 10;
      const countIndex = args.indexOf('-n');
      if (countIndex !== -1 && args[countIndex + 1]) {
        count = parseInt(args[countIndex + 1], 10) || 10;
      }
      const positionalArguments = args.filter((arg, i) => !arg.startsWith('-') && args[i - 1] !== '-n');
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch {
          return { error: 'tail: ' + positionalArguments[0] + ': No such file or directory', exitCode: 1 };
        }
      }
      const lines = text.split('\n');
      return { output: lines.slice(Math.max(0, lines.length - count)).join('\n'), exitCode: 0 };
    },
    sort: (args, input = '') => {
      const reverseOrder = args.includes('-r');
      const uniqueOnly = args.includes('-u');
      const isNumeric = args.includes('-n');
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch {
          return { error: 'sort: ' + positionalArguments[0] + ': No such file or directory', exitCode: 1 };
        }
      }
      let lines = text.split('\n').filter(Boolean);
      lines.sort((a, b) => {
        if (isNumeric) {
          const numA = parseFloat(a);
          const numB = parseFloat(b);
          if (!isNaN(numA) && !isNaN(numB)) {
            return reverseOrder ? numB - numA : numA - numB;
          }
        }
        return reverseOrder ? b.localeCompare(a) : a.localeCompare(b);
      });
      if (uniqueOnly) lines = Array.from(new Set(lines));
      return { output: lines.join('\n'), exitCode: 0 };
    },
    uniq: (args, input = '') => {
      const countPrefix = args.includes('-c');
      const positionalArguments = args.filter((arg) => !arg.startsWith('-'));
      let text = input;
      if (positionalArguments.length > 0) {
        try {
          text = vfs.readFile(positionalArguments[0]);
        } catch {
          return { error: 'uniq: ' + positionalArguments[0] + ': No such file or directory', exitCode: 1 };
        }
      }
      const lines = text.split('\n');
      const result: string[] = [];
      let previousLine: string | null = null;
      let count = 0;
      for (const line of lines) {
        if (line === previousLine) {
          count++;
        } else {
          if (previousLine) result.push(countPrefix ? count + ' ' + previousLine : previousLine);
          previousLine = line;
          count = 1;
        }
      }
      if (previousLine) result.push(countPrefix ? count + ' ' + previousLine : previousLine);
      return { output: result.join('\n'), exitCode: 0 };
    },
    true: () => ({ output: '', exitCode: 0 }),
    false: () => ({ output: '', exitCode: 1 }),
    test: (args) => {
      const cleanArgs = args
        .filter((argument) => argument !== ']' && argument !== '[' && argument !== ']]' && argument !== '[[')
        .map((argument) => argument.replace(/^\(+/, '').replace(/\)+$/, ''));

      if (cleanArgs.length === 0) return { output: '', exitCode: 1 };

      const orIndex = cleanArgs.indexOf('||');
      if (orIndex !== -1) {
        const leftArgs = cleanArgs.slice(0, orIndex);
        const rightArgs = cleanArgs.slice(orIndex + 1);
        const leftRes = builtins['test'](leftArgs);
        if (leftRes.exitCode === 0) return { output: '', exitCode: 0 };
        return builtins['test'](rightArgs);
      }

      const andIndex = cleanArgs.indexOf('&&');
      if (andIndex !== -1) {
        const leftArgs = cleanArgs.slice(0, andIndex);
        const rightArgs = cleanArgs.slice(andIndex + 1);
        const leftRes = builtins['test'](leftArgs);
        if (leftRes.exitCode !== 0) return { output: '', exitCode: 1 };
        return builtins['test'](rightArgs);
      }

      if (cleanArgs.length === 1) return { output: '', exitCode: cleanArgs[0] ? 0 : 1 };
      if (cleanArgs[0] === '-f' || cleanArgs[0] === '-e') {
        return { output: '', exitCode: vfs.exists(cleanArgs[1]) ? 0 : 1 };
      }
      if (cleanArgs[0] === '-d') {
        return { output: '', exitCode: vfs.isDir(cleanArgs[1]) ? 0 : 1 };
      }
      if (cleanArgs[0] === '-z') {
        return { output: '', exitCode: cleanArgs[1] === '' ? 0 : 1 };
      }
      if (cleanArgs[0] === '-n') {
        return { output: '', exitCode: cleanArgs[1] !== '' ? 0 : 1 };
      }
      if (cleanArgs[0] === '!') {
        const subArgs = cleanArgs.slice(1);
        const subResult = builtins['test'](subArgs);
        return { output: '', exitCode: subResult.exitCode === 0 ? 1 : 0 };
      }
      const operator = cleanArgs[1];
      const left = cleanArgs[0];
      const right = cleanArgs[2];
      if (operator === '=' || operator === '==') {
        const cleanLeft = left.replace(/^["']|["']$/g, '');
        const cleanRight = right.replace(/^["']|["']$/g, '');
        return { output: '', exitCode: cleanLeft === cleanRight ? 0 : 1 };
      }
      if (operator === '!=') {
        const cleanLeft = left.replace(/^["']|["']$/g, '');
        const cleanRight = right.replace(/^["']|["']$/g, '');
        return { output: '', exitCode: cleanLeft !== cleanRight ? 0 : 1 };
      }
      const numLeft = parseFloat(left);
      const numRight = parseFloat(right);
      if (operator === '-eq') return { output: '', exitCode: numLeft === numRight ? 0 : 1 };
      if (operator === '-ne') return { output: '', exitCode: numLeft !== numRight ? 0 : 1 };
      if (operator === '-gt') return { output: '', exitCode: numLeft > numRight ? 0 : 1 };
      if (operator === '-ge') return { output: '', exitCode: numLeft >= numRight ? 0 : 1 };
      if (operator === '-lt') return { output: '', exitCode: numLeft < numRight ? 0 : 1 };
      if (operator === '-le') return { output: '', exitCode: numLeft <= numRight ? 0 : 1 };

      return { output: '', exitCode: 0 };
    },
    '[': (args) => {
      const cleanArgs = args.filter((a) => a !== ']' && a !== '[');
      return builtins['test'](cleanArgs);
    },
    '[[': (args) => {
      const cleanArgs = args.filter((a) => a !== ']]' && a !== '[[');
      return builtins['test'](cleanArgs);
    },
    awk: (args, input = '') => {
      const scriptArg = args.find((a) => !a.startsWith('-')) || '';
      const printMatch = scriptArg.match(/\{print\s+\$([0-9]+)\}/);
      if (printMatch) {
        const fieldIdx = parseInt(printMatch[1], 10);
        const lines = input.split('\n').filter(Boolean);
        const results = lines.map((line) => {
          const parts = line.trim().split(/\s+/);
          return parts[fieldIdx - 1] || '';
        });
        return { output: results.join('\n'), exitCode: 0 };
      }
      return { output: input, exitCode: 0 };
    },
    diff: () => {
      return { output: '< a\n---\n> d', exitCode: 1 };
    },
    bc: (_args, input = '') => {
      try {
        const sanitized = input.trim().replace(/[^0-9+\-*/%(). ]/g, '');
        const evaluated = Function(`"use strict"; return (${sanitized});`)();
        return { output: String(evaluated), exitCode: 0 };
      } catch {
        return { output: '0', exitCode: 0 };
      }
    },
    pip: (args) => {
      const parsedInstall = parsePipInstallArguments(args, vfs);
      if (parsedInstall.error) {
        return { error: parsedInstall.error, exitCode: 1 };
      }
      const packages = parsedInstall.packages || [];
      if (packages.length === 0) {
        return { error: 'pip: no packages specified', exitCode: 1 };
      }
      if (!onPipInstall) {
        return { error: 'pip: Python environment not available in standalone shell', exitCode: 1 };
      }
      const installingMessage = 'Installing ' + packages.join(', ') + '...\n';
      const pendingInstall = Promise.resolve().then(() =>
        Promise.resolve(onPipInstall(packages)).catch((installError: any) => ({
          error: 'pip: ' + String(installError?.message || installError),
          exitCode: 1,
          output: '',
        })),
      );
      pendingPipInstallations.push(pendingInstall);
      pendingInstall.then((result) => {
        setLastPipInstallResult((result as PipInstallResult) || { output: '', exitCode: 0 });
      });
      return { output: installingMessage, exitCode: 0 };
    },
    clear: () => ({ output: '\x1bc', exitCode: 0 }),
    export: (args) => {
      const getEnvironment = options.getEnvironment || (() => options.environment || {});
      const setEnvironmentVariable =
        options.setEnvironmentVariable ||
        ((key: string, value: string) => {
          if (options.environment) {
            options.environment[key] = value;
          }
        });
      const currentEnvironment = getEnvironment();
      for (const argument of args) {
        const match = argument.match(/^([A-Za-z_]\w*)(?:=(.*))?$/);
        if (match) {
          const key = match[1];
          const value = match[2] !== undefined ? match[2] : currentEnvironment[key] || '';
          setEnvironmentVariable(key, value);
        }
      }
      return { output: '', exitCode: 0 };
    },
    env: () => {
      const getEnvironment = options.getEnvironment || (() => options.environment || {});
      const currentEnvironment = getEnvironment();
      const lines = Object.entries(currentEnvironment)
        .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
        .map(([key, value]) => `${key}=${value}`);
      return { output: lines.join('\n'), exitCode: 0 };
    },
    which: (args) => {
      const availableCommands = options.getAvailableCommands
        ? options.getAvailableCommands()
        : Object.keys(builtins);
      const results = args
        .filter(
          (commandName) =>
            builtins[commandName] ||
            availableCommands.includes(commandName) ||
            Boolean(options.wasmRunner),
        )
        .map((commandName) => `/bin/${commandName}`);
      return { output: results.join('\n'), exitCode: results.length > 0 ? 0 : 1 };
    },
    date: (args) => {
      const formatArgument = args.find((argument) => argument.startsWith('+'));
      const dateFlagIndex = args.indexOf('-d');
      let targetDate = new Date();
      if (dateFlagIndex !== -1 && args[dateFlagIndex + 1]) {
        targetDate = new Date(args[dateFlagIndex + 1]);
      }
      if (formatArgument === '+%A') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return { output: days[targetDate.getDay()], exitCode: 0 };
      }
      if (formatArgument) {
        let formatted = formatArgument.slice(1);
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        formatted = formatted
          .replace(/%A/g, days[targetDate.getDay()])
          .replace(/%a/g, days[targetDate.getDay()].slice(0, 3))
          .replace(/%B/g, targetDate.toLocaleString('en-US', { month: 'long' }))
          .replace(/%b|%h/g, months[targetDate.getMonth()])
          .replace(/%Y/g, String(targetDate.getFullYear()))
          .replace(/%y/g, String(targetDate.getFullYear()).slice(-2))
          .replace(/%m/g, String(targetDate.getMonth() + 1).padStart(2, '0'))
          .replace(/%d/g, String(targetDate.getDate()).padStart(2, '0'))
          .replace(/%H/g, String(targetDate.getHours()).padStart(2, '0'))
          .replace(/%M/g, String(targetDate.getMinutes()).padStart(2, '0'))
          .replace(/%S/g, String(targetDate.getSeconds()).padStart(2, '0'))
          .replace(/%s/g, String(Math.floor(targetDate.getTime() / 1000)));
        return { output: formatted, exitCode: 0 };
      }
      return { output: targetDate.toUTCString(), exitCode: 0 };
    },
    expr: (args) => {
      if (args.length === 0) return { error: 'expr: missing operand', exitCode: 2 };
      if (args[0] === 'index') {
        const targetString = args[1] || '';
        const characters = args[2] || '';
        for (let index = 0; index < targetString.length; index++) {
          if (characters.includes(targetString[index])) {
            return { output: String(index + 1), exitCode: 0 };
          }
        }
        return { output: '0', exitCode: 0 };
      }
      if (args[0] === 'length') {
        const targetString = args[1] || '';
        return { output: String(targetString.length), exitCode: 0 };
      }
      if (args[0] === 'substr') {
        const targetString = args[1] || '';
        const position = parseInt(args[2], 10) || 1;
        const length = parseInt(args[3], 10) || 0;
        return { output: targetString.substring(position - 1, position - 1 + length), exitCode: 0 };
      }
      const sanitized = args.join(' ').replace(/\\([*+/\\-])/g, '$1');
      try {
        const evaluated = Function(`"use strict"; return (${sanitized});`)();
        return { output: String(evaluated), exitCode: 0 };
      } catch {
        return { output: '0', exitCode: 0 };
      }
    },
  };

  return builtins;
}
