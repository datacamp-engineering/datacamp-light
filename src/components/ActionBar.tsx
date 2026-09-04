import { Button } from '@datacamp/waffles/button';
import { Checkmark, Cross } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import type { ISessionStatus } from '../jsonrpc/types';

interface ActionBarProps {
  onRun: () => void;
  onSubmit: () => void;
  onReset: () => void;
  onToggleSolution?: () => void;
  onToggleHint?: () => void;
  isExecuting: boolean;
  executingAction?: 'run' | 'submit' | null;
  hasSolution: boolean;
  showingSolution: boolean;
  hasHint: boolean;
  showingHint?: boolean;
  showRunButton?: boolean;
  status: ISessionStatus;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  onRun,
  onSubmit,
  onReset,
  onToggleSolution,
  onToggleHint,
  isExecuting,
  executingAction = null,
  hasSolution,
  showingSolution,
  hasHint,
  showingHint = false,
  showRunButton = true,
  status,
}) => {
  const disabled = isExecuting || status.status === 'busy' || status.status === 'starting';

  return (
    <div
      css={{
        alignItems: 'center',
        backgroundColor: theme.background.secondary,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: tokens.spacingNew.xsmall,
        justifyContent: 'space-between',
        padding: `${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium}`,
      }}
    >
      <div
        css={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: tokens.spacingNew.xsmall,
        }}
      >
        {showRunButton && (
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
        <Button
          disabled={disabled}
          isLoading={isExecuting && executingAction === 'submit'}
          onClick={onSubmit}
          size="small"
          variant="regularOutline"
        >
          Submit Answer
        </Button>
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
      </div>

      <div css={{ alignItems: 'center', display: 'flex', gap: tokens.spacingNew.small }}>
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
            minWidth: '65px',
          }}
        >
          {status.status === 'ready' ? (
            <Checkmark size="small" />
          ) : status.status === 'broken' ? (
            <Cross size="small" />
          ) : null}
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
        <Button
          aria-label="Reset exercise"
          disabled={isExecuting}
          onClick={onReset}
          size="small"
          variant="plain"
        >
          Reset
        </Button>
      </div>
    </div>
  );
};
