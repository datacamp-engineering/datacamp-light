import { Button } from '@datacamp/waffles/button';
import { Chapeau } from '@datacamp/waffles/chapeau';
import { Sparkles } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useRef, useState } from 'react';

export interface ConsoleEntry {
  type: 'input' | 'output' | 'error';
  text: string;
}

const consoleTypographyStyle = {
  fontFamily: tokens.fontFamilies.mono,
  fontSize: tokens.fontSizes.medium,
  lineHeight: tokens.lineHeights.default,
};

interface OutputConsoleProps {
  entries: ConsoleEntry[];
  prompt?: string;
  onExecuteCommand?: (command: string) => void;
  onFixAndExplain?: () => void;
  isExecuting?: boolean;
  isFixingAndExplaining?: boolean;
  showAi?: boolean;
  height?: number | string;
}

export const OutputConsole: React.FC<OutputConsoleProps> = ({
  entries,
  prompt = '>>> ',
  onExecuteCommand,
  onFixAndExplain,
  isExecuting = false,
  isFixingAndExplaining = false,
  showAi = true,
  height = 140,
}) => {
  const containerReference = useRef<HTMLDivElement>(null);
  const inputReference = useRef<HTMLInputElement>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);

  const hasErrorEntry = entries.some((entry) => entry.type === 'error');
  const wasExecutingReference = useRef(false);

  useEffect(() => {
    if (wasExecutingReference.current && !isExecuting) {
      inputReference.current?.focus();
    }
    wasExecutingReference.current = isExecuting;
  }, [isExecuting]);

  useEffect(() => {
    if (containerReference.current) {
      containerReference.current.scrollTop = containerReference.current.scrollHeight;
    }
  }, [entries, currentInput]);

  const handleScroll = () => {
    if (containerReference.current) {
      const scrolled = containerReference.current.scrollTop > 0;
      setIsScrolled(scrolled);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = currentInput.trim();
      if (!trimmed || isExecuting) return;

      setCommandHistory((previous) => [...previous, trimmed]);
      setHistoryIndex(null);
      setCurrentInput('');
      onExecuteCommand?.(trimmed);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex =
        historyIndex === null ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setCurrentInput(commandHistory[nextIndex] || '');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
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
    inputReference.current?.focus();
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
        position: 'relative',
      }}
      onClick={handleContainerClick}
      onScroll={handleScroll}
      ref={containerReference}
    >
      <div
        css={{
          alignItems: 'center',
          backgroundColor: theme.background.contrast,
          boxShadow: isScrolled ? tokens.boxShadow.medium : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          minHeight: '36px',
          padding: `4px ${tokens.spacingNew.medium}`,
          position: 'sticky',
          top: 0,
          transition: 'box-shadow 0.15s ease-in-out',
          zIndex: 1,
        }}
      >
        <Chapeau css={{ fontSize: `${tokens.fontSizes.small} !important`, margin: 0 }}>
          Output
        </Chapeau>
        {showAi && hasErrorEntry && onFixAndExplain && (
          <Button
            disabled={isExecuting}
            iconLeft={<Sparkles size="small" />}
            isLoading={isFixingAndExplaining}
            onClick={onFixAndExplain}
            size="small"
            variant="plain"
          >
            Fix & Explain
          </Button>
        )}
      </div>

      <div css={{ padding: `0 ${tokens.spacingNew.medium} ${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium}` }}>
        {entries.length === 0 && !onExecuteCommand && (
          <div css={{ color: theme.text.inverseSubtle, fontStyle: 'italic' }}>
            Console output will appear here.
          </div>
        )}

        {entries.map((entry, entryIndex) => (
          <div
            key={entryIndex}
            css={{
              ...consoleTypographyStyle,
              color:
                entry.type === 'error'
                  ? theme.error.text
                  : entry.type === 'input'
                  ? theme.blue.text
                  : theme.text.main,
              marginBottom: tokens.spacingNew.tiny,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {entry.type === 'input' ? `${prompt}${entry.text}` : entry.text}
          </div>
        ))}

        {onExecuteCommand && (
          <div
            css={{
              ...consoleTypographyStyle,
              alignItems: 'center',
              display: 'flex',
              marginTop: tokens.spacingNew.tiny,
            }}
          >
            <span
              css={{
                ...consoleTypographyStyle,
                color: theme.blue.text,
                marginRight: tokens.spacingNew.xsmall,
                userSelect: 'none',
                whiteSpace: 'pre',
              }}
            >
              {prompt}
            </span>
            <input
              aria-label="Console command input"
              css={{
                ...consoleTypographyStyle,
                backgroundColor: 'transparent',
                border: 'none',
                color: theme.text.main,
                flex: 1,
                outline: 'none',
                padding: 0,
                margin: 0,
              }}
              onChange={(event) => setCurrentInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isExecuting ? 'Executing…' : ''}
              readOnly={isExecuting}
              ref={inputReference}
              type="text"
              value={currentInput}
            />
          </div>
        )}
      </div>
    </div>
  );
};
