import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import type { LineChange } from '../ai/lineDiff';

export interface AiCodeDiffProps {
  diff: LineChange[];
}

export const AiCodeDiff: React.FC<AiCodeDiffProps> = ({ diff }) => {
  return (
    <div
      css={{
        backgroundColor: theme.background.contrast,
        border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        borderRadius: tokens.borderRadius.medium,
        color: theme.text.main,
        fontFamily: tokens.fontFamilies.mono,
        fontSize: '13px',
        lineHeight: 1.4,
        maxHeight: '260px',
        overflowY: 'auto',
        padding: tokens.spacingNew.xsmall,
      }}
    >
      {diff.map((change, changeIndex) => {
        const isAdded = change.added === true;
        const isRemoved = change.removed === true;

        return (
          <div
            key={`diff-line-${changeIndex}`}
            css={{
              backgroundColor: isAdded
                ? 'rgba(0, 208, 108, 0.15)'
                : isRemoved
                ? 'rgba(255, 92, 92, 0.15)'
                : 'transparent',
              color: isAdded
                ? theme.success.text
                : isRemoved
                ? theme.error.text
                : theme.text.main,
              display: 'flex',
              padding: '2px 8px',
              position: 'relative',
              whiteSpace: 'pre-wrap',
            }}
          >
            <span
              css={{
                color: isAdded
                  ? theme.success.text
                  : isRemoved
                  ? theme.error.text
                  : theme.text.subtle,
                display: 'inline-block',
                userSelect: 'none',
                width: '20px',
              }}
            >
              {isAdded ? '+' : isRemoved ? '-' : ' '}
            </span>
            <span css={{ flex: 1 }}>{change.value}</span>
          </div>
        );
      })}
    </div>
  );
};
