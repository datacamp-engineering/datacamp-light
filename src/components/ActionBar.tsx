import { Button } from '@datacamp/waffles/button';
import { Checkmark, Cross, Sparkles } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import type { ISessionStatus } from '../jsonrpc/types';

interface ActionBarProps {
  onRun?: () => void;
  onSubmit: () => void;
  onReset: () => void;
  onToggleSolution?: () => void;
  onToggleHint?: () => void;
  onExplainCode?: () => void;
  isExecuting: boolean;
  executingAction?: 'run' | 'submit' | null;
  isExplainingCode?: boolean;
  hasSolution?: boolean;
  showingSolution?: boolean;
  hasHint?: boolean;
  showingHint?: boolean;
  hasSct?: boolean;
  showRunButton?: boolean;
  showAi?: boolean;
  status: ISessionStatus;
  borderTop?: boolean;
  resetAriaLabel?: string;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onRun,
  onSubmit,
  onReset,
  onToggleSolution,
  onToggleHint,
  onExplainCode,
  isExecuting,
  executingAction = null,
  isExplainingCode = false,
  hasSolution = false,
  showingSolution = false,
  hasHint = false,
  showingHint = false,
  hasSct = true,
  showRunButton = true,
  showAi = true,
  status,
  borderTop = true,
  resetAriaLabel = 'Reset exercise',
}) => {
  const disabled = isExecuting || status.status === 'busy' || status.status === 'starting';

  return (
    <div
      css={{
        alignItems: 'center',
        backgroundColor: theme.background.secondary,
        ...(borderTop
          ? { borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}` }
          : {}),
        display: 'flex',
        flexWrap: 'wrap',
        gap: tokens.spacingNew.xsmall,
        padding: `${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium}`,
      }}
    >
      {showRunButton && onRun && (
        <Button
          disabled={disabled}
          isLoading={isExecuting && executingAction === 'run'}
          onClick={onRun}
          size="small"
          variant="regular"
        >
          Run Code
        </Button>
      )}
      {hasSct && (
        <Button
          disabled={disabled}
          isLoading={isExecuting && executingAction === 'submit'}
          onClick={onSubmit}
          size="small"
          variant="regularOutline"
        >
          Submit Answer
        </Button>
      )}
      {hasHint && onToggleHint && (
        <Button
          disabled={disabled}
          onClick={onToggleHint}
          size="small"
          variant="plain"
        >
          {showingHint ? 'Hide Hint' : 'Show Hint'}
        </Button>
      )}
      {hasSolution && onToggleSolution && (
        <Button
          disabled={disabled}
          onClick={onToggleSolution}
          size="small"
          variant="plain"
        >
          {showingSolution ? 'Hide Solution' : 'Show Solution'}
        </Button>
      )}
      {showAi && onExplainCode && (
        <Button
          disabled={disabled}
          iconLeft={<Sparkles size="small" />}
          isLoading={isExplainingCode}
          onClick={onExplainCode}
          size="small"
          variant="plain"
        >
          Explain Code
        </Button>
      )}

      <div
        css={{
          alignItems: 'center',
          display: 'flex',
          flexShrink: 0,
          gap: tokens.spacingNew.xsmall,
          marginLeft: 'auto',
        }}
      >
        <span
          css={{
            alignItems: 'center',
            color:
              status.status === 'ready'
                ? theme.success.text
                : status.status === 'busy' || status.status === 'starting'
                ? theme.warning.text
                : theme.text.subtle,
            display: 'flex',
            fontSize: tokens.fontSizes.xsmall,
            gap: tokens.spacingNew.tiny,
            justifyContent: 'flex-end',
            minWidth: 'fit-content',
            '@container (max-width: 480px)': {
              fontSize: '11px',
            },
            '@container (max-width: 360px)': {
              '& .status-text': {
                display: 'none',
              },
            },
          }}
        >
          {status.status === 'ready' ? (
            <Checkmark size="small" />
          ) : status.status === 'broken' ? (
            <Cross size="small" />
          ) : null}
          <span className="status-text">
            {status.status === 'ready'
              ? 'Ready'
              : status.status === 'busy'
              ? 'Busy'
              : status.status === 'starting'
              ? 'Starting'
              : status.status === 'broken'
              ? 'Error'
              : 'Idle'}
          </span>
        </span>
        <Button
          aria-label={resetAriaLabel}
          disabled={isExecuting}
          onClick={onReset}
          size="small"
          variant="plain"
          css={{
            minWidth: 'auto',
            paddingLeft: `${tokens.spacingNew.xsmall} !important`,
            paddingRight: `${tokens.spacingNew.xsmall} !important`,
            '@container (max-width: 420px)': {
              fontSize: tokens.fontSizes.small,
              paddingLeft: '6px !important',
              paddingRight: '6px !important',
            },
          }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
};
