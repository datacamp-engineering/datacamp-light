import { Chapeau } from '@datacamp/waffles/chapeau';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useRef, useState } from 'react';

export interface ConsoleEntry {
  type: 'input' | 'output' | 'error';
  text: string;
}

interface OutputConsoleProps {
  entries: ConsoleEntry[];
  prompt?: string;
  onExecuteCommand?: (command: string) => void;
  isExecuting?: boolean;
  height?: number | string;
}

export const OutputConsole: React.FC<OutputConsoleProps> = ({
  entries,
  prompt = '>>> ',
  onExecuteCommand,
  isExecuting = false,
  height = 140,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, currentInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = currentInput.trim();
      if (!trimmed || isExecuting) return;

      setCommandHistory((prev) => [...prev, trimmed]);
      setHistoryIndex(null);
      setCurrentInput('');
      onExecuteCommand?.(trimmed);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex =
        historyIndex === null ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCurrentInput(commandHistory[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(null);
        setCurrentInput('');
      } else {
        setHistoryIndex(nextIndex);
        setCurrentInput(commandHistory[nextIndex] || '');
      }
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div
      css={{
        backgroundColor: theme.background.contrast,
        borderBottomLeftRadius: onExecuteCommand
          ? 0
          : tokens.borderRadius.medium,
        borderBottomRightRadius: onExecuteCommand
          ? 0
          : tokens.borderRadius.medium,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        cursor: onExecuteCommand ? 'text' : 'default',
        height: typeof height === 'number' ? `${height}px` : height,
        overflowY: 'auto',
        padding: `${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium}`,
      }}
      onClick={handleContainerClick}
      ref={containerRef}
    >
      <div
        css={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: tokens.spacingNew.tiny,
          minHeight: tokens.sizing.small,
        }}
      >
        <Chapeau css={{ fontSize: `${tokens.fontSizes.small} !important`, margin: 0 }}>
          Output
        </Chapeau>
      </div>

      {entries.length === 0 && !onExecuteCommand && (
        <div css={{ color: theme.text.inverseSubtle, fontStyle: 'italic' }}>
          Console output will appear here.
        </div>
      )}

      {entries.map((entry, idx) => (
        <div
          key={idx}
          css={{
            color:
              entry.type === 'error'
                ? theme.error.text
                : entry.type === 'input'
                ? theme.blue.text
                : theme.text.main,
            fontFamily: tokens.fontFamilies.mono,
            fontSize: tokens.fontSizes.medium,
            lineHeight: tokens.lineHeights.tight,
            marginBottom: tokens.spacingNew.tiny,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {entry.type === 'input' ? `${prompt}${entry.text}` : entry.text}
        </div>
      ))}

      {onExecuteCommand && (
        <div css={{ alignItems: 'center', display: 'flex', marginTop: tokens.spacingNew.tiny }}>
          <span css={{ color: theme.blue.text, marginRight: tokens.spacingNew.xsmall, userSelect: 'none' }}>
            {prompt}
          </span>
          <input
            aria-label="Console command input"
            css={{
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.text.main,
              flex: 1,
              fontFamily: tokens.fontFamilies.mono,
              fontSize: tokens.fontSizes.medium,
              outline: 'none',
              padding: 0,
              margin: 0,
            }}
            disabled={isExecuting}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isExecuting ? 'Executing…' : ''}
            ref={inputRef}
            type="text"
            value={currentInput}
          />
        </div>
      )}
    </div>
  );
};
