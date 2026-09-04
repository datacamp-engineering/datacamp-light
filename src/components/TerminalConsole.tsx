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

interface TerminalConsoleProps {
  onExecuteCommand: (command: string) => Promise<TerminalCommandResult>;
  prompt?: string;
  height?: number | string;
  welcomeMessage?: string;
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({
  onExecuteCommand,
  prompt = '$ ',
  height = 260,
  welcomeMessage = 'Welcome to the DataCamp Light shell (WebAssembly).\r\n',
}) => {
  const terminalContainerReference = useRef<HTMLDivElement>(null);
  const terminalReference = useRef<Xterm | null>(null);
  const lineBufferReference = useRef('');
  const historyReference = useRef<string[]>([]);
  const historyIndexReference = useRef<number | null>(null);
  const isExecutingReference = useRef(false);
  const currentWorkingDirectoryReference = useRef<string | null>(null);

  // Keep a stable callback reference so parent re-renders never destroy the xterm instance
  const onExecuteCommandReference = useRef(onExecuteCommand);
  useEffect(() => {
    onExecuteCommandReference.current = onExecuteCommand;
  }, [onExecuteCommand]);

  const promptReference = useRef(prompt);
  useEffect(() => {
    promptReference.current = prompt;
  }, [prompt]);

  useEffect(() => {
    if (!terminalContainerReference.current) return;

    const computedStyle = getComputedStyle(terminalContainerReference.current);
    const isLightMode =
      terminalContainerReference.current.closest('[data-wf-theme="light"]') !== null;

    const terminalBackground =
      computedStyle.getPropertyValue('--wf-bg--main').trim() ||
      (isLightMode ? '#FFFFFF' : '#05192D');

    const terminalForeground =
      computedStyle.getPropertyValue('--wf-text--main').trim() ||
      (isLightMode ? '#05192D' : '#FFFFFF');

    const cursorColor =
      computedStyle.getPropertyValue('--wf-blue--main').trim() || '#0578FF';

    const selectionColor =
      computedStyle.getPropertyValue('--wf-blue--transparent').trim() ||
      'rgba(5, 120, 255, 0.2)';

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
      terminalInstance.write(
        '\r\x1b[K' +
          buildPrompt(currentWorkingDirectoryReference.current, promptReference.current) +
          lineBufferReference.current,
      );
    };

    terminalInstance.onData(async (data) => {
      if (isExecutingReference.current) return;

      if (data === '\r') {
        const commandToExecute = lineBufferReference.current;
        terminalInstance.write('\r\n');
        lineBufferReference.current = '';
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

      // Backspace
      if (data === '\x7f' || data === '\b') {
        if (lineBufferReference.current.length > 0) {
          lineBufferReference.current = lineBufferReference.current.slice(
            0,
            -1,
          );
          terminalInstance.write('\b \b');
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
        lineBufferReference.current = historyList[nextIndex];
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
        } else {
          historyIndexReference.current = nextIndex;
          lineBufferReference.current = historyList[nextIndex];
        }
        rewriteLine();
        return;
      }

      // Ctrl+C: Cancel current line
      if (data === '\x03') {
        lineBufferReference.current = '';
        historyIndexReference.current = null;
        terminalInstance.write(
          '^C\r\n' +
            buildPrompt(currentWorkingDirectoryReference.current, promptReference.current),
        );
        return;
      }

      // Normal character input
      if (data >= ' ' || data === '\t') {
        lineBufferReference.current += data;
        terminalInstance.write(data);
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
