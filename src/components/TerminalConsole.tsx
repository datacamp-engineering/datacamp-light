import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal as Xterm } from '@xterm/xterm';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useRef } from 'react';

export interface TerminalCommandResult {
  output?: string;
  error?: string;
  cwd?: string;
}

function findLongestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, prefix.length - 1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

function formatTerminalCompletions(
  completions: Array<{ label: string; category?: string }>,
): string {
  return completions.map((completion) => completion.label).join('  ');
}

/**
 * Builds the prompt rendered before each input line. When the session reports
 * a current working directory (shell runCommand), the prompt reflects it so a
 * silent command such as `cd` still produces visible state feedback - exactly
 * like a real terminal whose prompt tracks the shell's cwd.
 */
export function buildPrompt(
  currentWorkingDirectory: string | null | undefined,
  prompt: string,
): string {
  return currentWorkingDirectory
    ? `${currentWorkingDirectory} ${prompt.trimEnd()} `
    : prompt;
}

/**
 * Maps a shell command result onto the lines the terminal should draw. Empty
 * output is deliberately NOT swallowed: a successful silent command (cd,
 * mkdir, touch, ls on an empty directory) still yields one blank line so the
 * learner sees the shell respond and the next prompt arrive.
 */
export function formatTerminalResult(result: {
  output?: string;
  error?: string;
}): Array<{ text: string; color?: 'error' }> {
  const entries: Array<{ text: string; color?: 'error' }> = [];
  if (result.output) entries.push({ text: result.output });
  if (result.error) entries.push({ text: result.error, color: 'error' });
  if (entries.length === 0) entries.push({ text: '' });
  return entries;
}

const darkAnsiPalette = {
  black: '#152535',
  red: '#FF5C5C',
  green: '#00D06C',
  yellow: '#FFD15C',
  blue: '#58A6FF',
  magenta: '#E06CFF',
  cyan: '#39C5BB',
  white: '#FFFFFF',
  brightBlack: '#6A7D8F',
  brightRed: '#FF7B7B',
  brightGreen: '#2EE58B',
  brightYellow: '#FFE08A',
  brightBlue: '#79B8FF',
  brightMagenta: '#EB8CFF',
  brightCyan: '#56D4CB',
  brightWhite: '#FFFFFF',
};

const lightAnsiPalette = {
  black: '#05192D',
  red: '#D91E18',
  green: '#0E7C3B',
  yellow: '#B78103',
  blue: '#0052CC',
  magenta: '#7B1FA2',
  cyan: '#006D75',
  white: '#F0F4F8',
  brightBlack: '#8FA6B2',
  brightRed: '#E83E38',
  brightGreen: '#1A9E4E',
  brightYellow: '#D49605',
  brightBlue: '#0747A6',
  brightMagenta: '#9C27B0',
  brightCyan: '#00838F',
  brightWhite: '#FFFFFF',
};

interface TerminalConsoleProps {
  onExecuteCommand: (command: string) => Promise<TerminalCommandResult>;
  onIntrospect?: (code: string, column: number) => Promise<Array<{ label: string; category?: string }>>;
  prompt?: string;
  height?: number | string;
  welcomeMessage?: string;
  resetKey?: number | string;
  theme?: 'light' | 'dark';
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({
  onExecuteCommand,
  onIntrospect,
  prompt = '$ ',
  height = 260,
  welcomeMessage = 'Welcome to the DataCamp Light shell (WebAssembly).\r\n',
  resetKey,
  theme: themeMode = 'dark',
}) => {
  const terminalContainerReference = useRef<HTMLDivElement>(null);
  const terminalReference = useRef<Xterm | null>(null);
  const lineBufferReference = useRef('');
  const cursorPositionReference = useRef(0);
  const historyReference = useRef<string[]>([]);
  const historyIndexReference = useRef<number | null>(null);
  const isExecutingReference = useRef(false);
  const currentWorkingDirectoryReference = useRef<string | null>(null);

  const onExecuteCommandReference = useRef(onExecuteCommand);
  useEffect(() => {
    onExecuteCommandReference.current = onExecuteCommand;
  }, [onExecuteCommand]);

  const onIntrospectReference = useRef(onIntrospect);
  useEffect(() => {
    onIntrospectReference.current = onIntrospect;
  }, [onIntrospect]);

  const promptReference = useRef(prompt);
  useEffect(() => {
    promptReference.current = prompt;
  }, [prompt]);

  // Handle external reset triggers
  const resetKeyReference = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== resetKeyReference.current) {
      resetKeyReference.current = resetKey;
      const terminalInstance = terminalReference.current;
      if (terminalInstance) {
        terminalInstance.clear();
        lineBufferReference.current = '';
        cursorPositionReference.current = 0;
        historyReference.current = [];
        historyIndexReference.current = null;
        terminalInstance.write(welcomeMessage);
        terminalInstance.write(
          buildPrompt(currentWorkingDirectoryReference.current, promptReference.current),
        );
      }
    }
  }, [resetKey, welcomeMessage]);

  // Dynamically update xterm theme options when themeMode changes
  useEffect(() => {
    const terminalInstance = terminalReference.current;
    if (!terminalInstance) return;

    const isLightMode = themeMode === 'light';
    const terminalBackground = isLightMode ? '#F7F7FC' : '#05192D';
    const terminalForeground = isLightMode ? '#05192D' : '#FFFFFF';
    const cursorColor = '#0578FF';
    const selectionColor = 'rgba(5, 120, 255, 0.2)';
    const ansiPalette = isLightMode ? lightAnsiPalette : darkAnsiPalette;

    terminalInstance.options.theme = {
      background: terminalBackground,
      foreground: terminalForeground,
      cursor: cursorColor,
      selectionBackground: selectionColor,
      ...ansiPalette,
    };
  }, [themeMode]);

  useEffect(() => {
    if (!terminalContainerReference.current) return;

    const isLightMode = themeMode === 'light';
    const terminalBackground = isLightMode ? '#F7F7FC' : '#05192D';
    const terminalForeground = isLightMode ? '#05192D' : '#FFFFFF';
    const cursorColor = '#0578FF';
    const selectionColor = 'rgba(5, 120, 255, 0.2)';
    const ansiPalette = isLightMode ? lightAnsiPalette : darkAnsiPalette;

    const terminalInstance = new Xterm({
      cursorBlink: true,
      fontFamily: tokens.fontFamilies.mono,
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: terminalBackground,
        foreground: terminalForeground,
        cursor: cursorColor,
        selectionBackground: selectionColor,
        ...ansiPalette,
      },
    });

    const fitTerminalAddon = new FitAddon();
    terminalInstance.loadAddon(fitTerminalAddon);
    terminalInstance.open(terminalContainerReference.current);
    fitTerminalAddon.fit();

    terminalInstance.write(welcomeMessage);
    terminalInstance.write(
      buildPrompt(currentWorkingDirectoryReference.current, promptReference.current),
    );

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitTerminalAddon.fit();
      } catch {
        // ignore transient resize race on unmount
      }
    });
    resizeObserver.observe(terminalContainerReference.current);

    const rewriteLine = () => {
      const promptText = buildPrompt(
        currentWorkingDirectoryReference.current,
        promptReference.current,
      );
      const text = lineBufferReference.current;
      const cursorPosition = cursorPositionReference.current;
      const moveBackCount = text.length - cursorPosition;
      const moveBackSequence = moveBackCount > 0 ? `\x1b[${moveBackCount}D` : '';

      terminalInstance.write(
        '\r\x1b[K' + promptText + text + moveBackSequence,
      );
    };

    terminalInstance.onData(async (data) => {
      if (isExecutingReference.current) return;

      // Ctrl+L: Clear screen
      if (data === '\x0c') {
        terminalInstance.clear();
        rewriteLine();
        return;
      }

      // Enter
      if (data === '\r') {
        const commandToExecute = lineBufferReference.current;
        terminalInstance.write('\r\n');
        lineBufferReference.current = '';
        cursorPositionReference.current = 0;
        historyIndexReference.current = null;

        if (commandToExecute.trim()) {
          historyReference.current.push(commandToExecute);
        }

        isExecutingReference.current = true;
        try {
          const result = await onExecuteCommandReference.current(commandToExecute);
          if (result.cwd) {
            currentWorkingDirectoryReference.current = result.cwd;
          }

          if (result.output === '\x1bc') {
            terminalInstance.clear();
          } else {
            const formattedEntries = formatTerminalResult(result);
            for (const entry of formattedEntries) {
              if (entry.color === 'error') {
                terminalInstance.write(
                  `\x1b[31m${entry.text.replace(/\n/g, '\r\n')}\x1b[0m`,
                );
              } else if (entry.text) {
                terminalInstance.write(entry.text.replace(/\n/g, '\r\n'));
              }
              if (!entry.text.endsWith('\n') && !entry.text.endsWith('\r\n')) {
                terminalInstance.write('\r\n');
              }
            }
          }
        } catch (executionError: any) {
          terminalInstance.write(
            `\x1b[31m${(executionError.message || 'Execution error').replace(
              /\n/g,
              '\r\n',
            )}\x1b[0m\r\n`,
          );
        } finally {
          isExecutingReference.current = false;
          terminalInstance.write(
            buildPrompt(currentWorkingDirectoryReference.current, promptReference.current),
          );
        }
        return;
      }

      // Multiline paste
      if (data.includes('\n') || (data.includes('\r') && data.length > 1)) {
        const lines = data.split(/\r\n|\r|\n/);
        for (let i = 0; i < lines.length; i++) {
          const chunk = lines[i];
          if (i === lines.length - 1) {
            const position = cursorPositionReference.current;
            const currentBuffer = lineBufferReference.current;
            lineBufferReference.current =
              currentBuffer.slice(0, position) + chunk + currentBuffer.slice(position);
            cursorPositionReference.current = position + chunk.length;
            rewriteLine();
          } else {
            const fullCommand = lineBufferReference.current + chunk;
            terminalInstance.write(chunk + '\r\n');
            lineBufferReference.current = '';
            cursorPositionReference.current = 0;
            historyIndexReference.current = null;
            if (fullCommand.trim()) {
              historyReference.current.push(fullCommand);
            }
            isExecutingReference.current = true;
            try {
              const result = await onExecuteCommandReference.current(fullCommand);
              if (result.cwd) {
                currentWorkingDirectoryReference.current = result.cwd;
              }
              if (result.output === '\x1bc') {
                terminalInstance.clear();
              } else {
                const formattedEntries = formatTerminalResult(result);
                for (const entry of formattedEntries) {
                  if (entry.color === 'error') {
                    terminalInstance.write(
                      `\x1b[31m${entry.text.replace(/\n/g, '\r\n')}\x1b[0m`,
                    );
                  } else if (entry.text) {
                    terminalInstance.write(entry.text.replace(/\n/g, '\r\n'));
                  }
                  if (!entry.text.endsWith('\n') && !entry.text.endsWith('\r\n')) {
                    terminalInstance.write('\r\n');
                  }
                }
              }
            } catch (executionError: any) {
              terminalInstance.write(
                `\x1b[31m${(executionError.message || 'Execution error').replace(
                  /\n/g,
                  '\r\n',
                )}\x1b[0m\r\n`,
              );
            } finally {
              isExecutingReference.current = false;
            }
          }
        }
        return;
      }

      // Backspace
      if (data === '\x7f' || data === '\b') {
        const position = cursorPositionReference.current;
        if (position > 0) {
          const currentBuffer = lineBufferReference.current;
          lineBufferReference.current =
            currentBuffer.slice(0, position - 1) + currentBuffer.slice(position);
          cursorPositionReference.current = position - 1;
          rewriteLine();
        }
        return;
      }

      // Delete key (\x1b[3~)
      if (data === '\x1b[3~') {
        const position = cursorPositionReference.current;
        const currentBuffer = lineBufferReference.current;
        if (position < currentBuffer.length) {
          lineBufferReference.current =
            currentBuffer.slice(0, position) + currentBuffer.slice(position + 1);
          rewriteLine();
        }
        return;
      }

      // Left Arrow
      if (data === '\x1b[D') {
        if (cursorPositionReference.current > 0) {
          cursorPositionReference.current--;
          terminalInstance.write('\x1b[D');
        }
        return;
      }

      // Right Arrow
      if (data === '\x1b[C') {
        if (cursorPositionReference.current < lineBufferReference.current.length) {
          cursorPositionReference.current++;
          terminalInstance.write('\x1b[C');
        }
        return;
      }

      // Home / Ctrl+A
      if (data === '\x1b[H' || data === '\x1b[1~' || data === '\x1bOH' || data === '\x01') {
        if (cursorPositionReference.current > 0) {
          cursorPositionReference.current = 0;
          rewriteLine();
        }
        return;
      }

      // End / Ctrl+E
      if (data === '\x1b[F' || data === '\x1b[4~' || data === '\x1bOF' || data === '\x05') {
        if (cursorPositionReference.current < lineBufferReference.current.length) {
          cursorPositionReference.current = lineBufferReference.current.length;
          rewriteLine();
        }
        return;
      }

      // Arrow Up (History previous)
      if (data === '\x1b[A') {
        const historyList = historyReference.current;
        if (historyList.length === 0) return;
        const nextIndex =
          historyIndexReference.current === null
            ? historyList.length - 1
            : Math.max(0, historyIndexReference.current - 1);
        historyIndexReference.current = nextIndex;
        const selectedHistory = historyList[nextIndex];
        lineBufferReference.current = selectedHistory;
        cursorPositionReference.current = selectedHistory.length;
        rewriteLine();
        return;
      }

      // Arrow Down (History next)
      if (data === '\x1b[B') {
        const historyList = historyReference.current;
        if (historyIndexReference.current === null) return;
        const nextIndex = historyIndexReference.current + 1;
        if (nextIndex >= historyList.length) {
          historyIndexReference.current = null;
          lineBufferReference.current = '';
          cursorPositionReference.current = 0;
        } else {
          historyIndexReference.current = nextIndex;
          const selectedHistory = historyList[nextIndex];
          lineBufferReference.current = selectedHistory;
          cursorPositionReference.current = selectedHistory.length;
        }
        rewriteLine();
        return;
      }

      // Ctrl+C: Cancel current line
      if (data === '\x03') {
        lineBufferReference.current = '';
        cursorPositionReference.current = 0;
        historyIndexReference.current = null;
        terminalInstance.write(
          '^C\r\n' +
            buildPrompt(currentWorkingDirectoryReference.current, promptReference.current),
        );
        return;
      }

      // Ctrl+U: Clear line before cursor
      if (data === '\x15') {
        const position = cursorPositionReference.current;
        lineBufferReference.current = lineBufferReference.current.slice(position);
        cursorPositionReference.current = 0;
        rewriteLine();
        return;
      }

      // Ctrl+K: Clear line after cursor
      if (data === '\x0b') {
        const position = cursorPositionReference.current;
        lineBufferReference.current = lineBufferReference.current.slice(0, position);
        rewriteLine();
        return;
      }

      // Tab: Readline autocomplete
      if (data === '\t') {
        const onIntrospectCallback = onIntrospectReference.current;
        if (!onIntrospectCallback) return;

        const currentLine = lineBufferReference.current;
        const cursorPosition = cursorPositionReference.current;
        const textBeforeCursor = currentLine.slice(0, cursorPosition);
        const match = textBeforeCursor.match(/[\w./~-]*$/);
        const wordPrefix = match ? match[0] : '';
        const wordStartIndex = cursorPosition - wordPrefix.length;

        try {
          const completions = await onIntrospectCallback(currentLine, cursorPosition);
          if (!completions || completions.length === 0) {
            terminalInstance.write('\x07');
            return;
          }

          if (completions.length === 1) {
            const completion = completions[0];
            const insertText = completion.label;
            const suffix =
              completion.category === 'directory' || insertText.endsWith('/') ? '' : ' ';
            lineBufferReference.current =
              currentLine.slice(0, wordStartIndex) + insertText + suffix + currentLine.slice(cursorPosition);
            cursorPositionReference.current = wordStartIndex + insertText.length + suffix.length;
            rewriteLine();
            return;
          }

          const labels = completions.map((c) => c.label);
          const commonPrefix = findLongestCommonPrefix(labels);

          if (commonPrefix && commonPrefix.length > wordPrefix.length) {
            lineBufferReference.current =
              currentLine.slice(0, wordStartIndex) + commonPrefix + currentLine.slice(cursorPosition);
            cursorPositionReference.current = wordStartIndex + commonPrefix.length;
            rewriteLine();
          } else {
            terminalInstance.write('\r\n' + formatTerminalCompletions(completions) + '\r\n');
            const promptText = buildPrompt(
              currentWorkingDirectoryReference.current,
              promptReference.current,
            );
            const moveBackCount = currentLine.length - cursorPosition;
            const moveBackSequence = moveBackCount > 0 ? `\x1b[${moveBackCount}D` : '';
            terminalInstance.write(promptText + currentLine + moveBackSequence);
          }
        } catch (error) {
          // ignore autocomplete error
        }
        return;
      }

      // Normal character input
      if (data >= ' ') {
        const position = cursorPositionReference.current;
        const currentBuffer = lineBufferReference.current;
        lineBufferReference.current =
          currentBuffer.slice(0, position) + data + currentBuffer.slice(position);
        cursorPositionReference.current = position + data.length;
        rewriteLine();
      }
    });

    terminalReference.current = terminalInstance;

    return () => {
      resizeObserver.disconnect();
      terminalInstance.dispose();
      terminalReference.current = null;
    };
    // Initialize xterm only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      css={{
        backgroundColor: theme.background.main,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: 120,
        overflow: 'hidden',
        padding: tokens.spacingNew.xsmall,
        position: 'relative',
        width: '100%',
        '& .xterm': {
          backgroundColor: theme.background.main,
          height: '100%',
          padding: tokens.spacingNew.tiny,
        },
        '& .xterm-viewport': {
          backgroundColor: `${theme.background.main} !important`,
        },
      }}
      ref={terminalContainerReference}
    />
  );
};
