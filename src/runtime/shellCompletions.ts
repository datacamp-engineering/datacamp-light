import type { IShellVfs } from './shellInterpreter';

export interface ShellCompletionTemplate {
  label: string;
  detail: string;
  category: string;
  snippet: string;
  boost?: number;
}

const DEFAULT_SHELL_COMMANDS = [
  'ls',
  'cd',
  'pwd',
  'mkdir',
  'rmdir',
  'touch',
  'rm',
  'cat',
  'head',
  'tail',
  'grep',
  'sed',
  'awk',
  'cut',
  'sort',
  'uniq',
  'wc',
  'find',
  'echo',
  'cp',
  'mv',
  'clear',
  'export',
  'env',
  'which',
  'date',
  'pip',
  'exit',
];

export function getShellVfsCompletions(
  virtualFileSystem: IShellVfs,
  currentWorkingDirectory: string,
  code: string,
  lineNumber: number,
  columnNumber: number,
  _prefix: string,
  triggerCharacter: string,
  availableCommands?: string[],
): ShellCompletionTemplate[] {
  const lines = (code || '').split('\n');
  const currentLine = lines[lineNumber] || '';
  const textBeforeCursor = currentLine.slice(0, columnNumber);
  const trimmedLeft = textBeforeCursor.trimStart();
  const hasSpace = /\s/.test(trimmedLeft);
  const isCommandPosition = !hasSpace && !triggerCharacter;

  let currentToken = '';
  if (isCommandPosition) {
    currentToken = trimmedLeft;
  } else {
    const match = textBeforeCursor.match(/[\w./~-]*$/);
    currentToken = match ? match[0] : '';
  }

  const completions: ShellCompletionTemplate[] = [];

  if (isCommandPosition && !currentToken.includes('/')) {
    const commandsToSearch =
      availableCommands && availableCommands.length > 0
        ? availableCommands
        : DEFAULT_SHELL_COMMANDS;

    const seenCommands = new Set<string>();
    for (const command of commandsToSearch) {
      if (command.startsWith(currentToken) && !seenCommands.has(command)) {
        seenCommands.add(command);
        completions.push({
          label: command,
          detail: 'shell command',
          category: 'function',
          snippet: command,
          boost: 90,
        });
      }
    }
    return completions;
  }

  const lastSlashIndex = currentToken.lastIndexOf('/');
  let targetDirectory = currentWorkingDirectory;
  let partialName = currentToken;

  if (lastSlashIndex !== -1) {
    const rawDirectory = lastSlashIndex === 0 ? '/' : currentToken.slice(0, lastSlashIndex);
    partialName = currentToken.slice(lastSlashIndex + 1);
    targetDirectory = rawDirectory.startsWith('/')
      ? rawDirectory
      : `${currentWorkingDirectory}/${rawDirectory}`.replace(/\/+/g, '/');
  }

  let entries: string[] = [];
  try {
    if (virtualFileSystem.exists(targetDirectory) && virtualFileSystem.isDir(targetDirectory)) {
      entries = virtualFileSystem.readdir(targetDirectory);
    }
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    if (entry.startsWith('.') && !partialName.startsWith('.')) continue;
    if (!entry.startsWith(partialName)) continue;

    const fullPath =
      targetDirectory === '/'
        ? `/${entry}`
        : `${targetDirectory}/${entry}`.replace(/\/+/g, '/');
    const isDirectory = virtualFileSystem.isDir(fullPath);

    const commandName = trimmedLeft.split(/\s+/)[0] || '';
    if (commandName === 'cd' && !isDirectory) {
      continue;
    }

    completions.push({
      label: isDirectory ? `${entry}/` : entry,
      detail: isDirectory ? 'directory' : 'file',
      category: isDirectory ? 'directory' : 'file',
      snippet: isDirectory ? `${entry}/` : entry,
      boost: isDirectory ? 85 : 75,
    });
  }

  return completions;
}
