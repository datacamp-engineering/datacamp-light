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
export function buildPrompt(cwd: string | null | undefined, prompt: string): string {
  return cwd ? `${cwd} ${prompt.trimEnd()} ` : prompt;
}

/**
 * Maps a shell command result onto the lines the terminal should draw. Empty
 * output is deliberately NOT swallowed: a successful silent command (cd,
 * mkdir, touch, ls on an empty directory) still yields one blank line so the
 * learner sees the shell respond and the next prompt arrive.
 */
export function formatTerminalResult(
  result: { output?: string; error?: string },
): Array<{ text: string; color?: 'error' }> {
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
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const lineBufferRef = useRef('');
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);
  const isExecutingRef = useRef(false);
  const cwdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const termBg =
      getComputedStyle(containerRef.current).getPropertyValue('--wf-bg--main').trim() ||
      '#05192D';

    const term = new Xterm({
      cursorBlink: true,
      fontFamily: tokens.fontFamilies.mono,
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: termBg,
        foreground: theme.text.main as string,
        cursor: theme.blue.main as string,
        selectionBackground: theme.blue.transparent as string,
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    term.write(welcomeMessage);
    term.write(buildPrompt(cwdRef.current, prompt));

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore transient resize race on unmount
      }
    });
    resizeObserver.observe(containerRef.current);

    const rewriteLine = () => {
      term.write('\r\x1b[K' + buildPrompt(cwdRef.current, prompt) + lineBufferRef.current);
    };

    term.onData(async (data) => {
      if (isExecutingRef.current) return;

      const code = data.charCodeAt(0);

      if (data === '\r') {
        const command = lineBufferRef.current;
        term.write('\r\n');
        lineBufferRef.current = '';
        historyIndexRef.current = null;

        if (command.trim()) {
          historyRef.current.push(command);
          isExecutingRef.current = true;
          try {
            const result = await onExecuteCommand(command);
            if (result.cwd) {
              cwdRef.current = result.cwd;
            }
            for (const entry of formatTerminalResult(result)) {
              const text = entry.text.replace(/\n/g, '\r\n');
              term.write(entry.color === 'error' ? `\x1b[31m${text}\x1b[0m\r\n` : `${text}\r\n`);
            }
          } finally {
            isExecutingRef.current = false;
          }
        }

        term.write(buildPrompt(cwdRef.current, prompt));
      } else if (code === 127) {
        if (lineBufferRef.current.length > 0) {
          lineBufferRef.current = lineBufferRef.current.slice(0, -1);
          rewriteLine();
        }
      } else if (data === '\x1b[A') {
        const history = historyRef.current;
        if (history.length === 0) return;
        const nextIndex =
          historyIndexRef.current === null
            ? history.length - 1
            : Math.max(0, historyIndexRef.current - 1);
        historyIndexRef.current = nextIndex;
        lineBufferRef.current = history[nextIndex] || '';
        rewriteLine();
      } else if (data === '\x1b[B') {
        const history = historyRef.current;
        if (historyIndexRef.current === null) return;
        const nextIndex = historyIndexRef.current + 1;
        if (nextIndex >= history.length) {
          historyIndexRef.current = null;
          lineBufferRef.current = '';
        } else {
          historyIndexRef.current = nextIndex;
          lineBufferRef.current = history[nextIndex] || '';
        }
        rewriteLine();
      } else if (code >= 32) {
        lineBufferRef.current += data;
        term.write(data);
      }
    });

    termRef.current = term;

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

return (
    <div
      css={{
        backgroundColor: theme.background.main,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        height: typeof height === 'number' ? `${height}px` : height,
        padding: `${tokens.spacingNew.medium} 0 ${tokens.spacingNew.medium} ${tokens.spacingNew.medium}`,
      }}
    >
      <div
        ref={containerRef}
        css={{
          backgroundColor: theme.background.main,
          height: '100%',
          '& .xterm-viewport': {
            backgroundColor: `${theme.background.main} !important`,
          },
        }}
      />
    </div>
  );
};
