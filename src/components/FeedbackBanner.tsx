import { CheckmarkCircle, CrossCircle } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';

interface FeedbackBannerProps {
  correct?: boolean;
  message?: string;
  onClose?: () => void;
}

export const FeedbackBanner: React.FC<FeedbackBannerProps> = ({
  correct,
  message,
  onClose,
}) => {
  if (!message) {
    return null;
  }

  const isSuccess = correct === true;
  const formattedMessage = message.replace(/`([^`]+)`/g, '<code>$1</code>').trim();

  // Reuse waffles semantic colours so the banner reads like the product.
  const bg = isSuccess ? theme.success.transparent : theme.error.transparent;
  const border = isSuccess ? theme.success.main : theme.error.main;
  const color = isSuccess ? theme.success.text : theme.error.text;

  return (
    <div
      data-testid="feedback-banner"
      data-correct={String(isSuccess)}
      css={{
        alignItems: 'center',
        backgroundColor: bg,
        borderBottom: `${tokens.borderWidth.medium} solid ${border}`,
        borderTop: `${tokens.borderWidth.medium} solid ${border}`,
        color,
        display: 'flex',
        fontSize: tokens.fontSizes.medium,
        gap: tokens.spacingNew.small,
        justifyContent: 'space-between',
        padding: `${tokens.spacingNew.small} ${tokens.spacingNew.medium}`,
        '& code': {
          backgroundColor: isSuccess
            ? 'rgba(0, 168, 90, 0.15)'
            : 'rgba(255, 75, 75, 0.15)',
          borderRadius: tokens.borderRadius.medium,
          fontFamily: tokens.fontFamilies.mono,
          fontSize: '0.9em',
          padding: '2px 5px',
        },
      }}
    >
      <div css={{ alignItems: 'center', display: 'flex', gap: tokens.spacingNew.xsmall }}>
        {isSuccess ? (
          <CheckmarkCircle size="small" />
        ) : (
          <CrossCircle size="small" />
        )}
        <span dangerouslySetInnerHTML={{ __html: formattedMessage }} />
      </div>
      {onClose && (
        <button
          aria-label="Close feedback"
          css={{
            background: 'none',
            border: 'none',
            color,
            cursor: 'pointer',
            fontSize: tokens.fontSizes.large,
            lineHeight: tokens.lineHeights.tight,
            padding: tokens.spacingNew.tiny,
          }}
          onClick={onClose}
        >
          ×
        </button>
      )}
    </div>
  );
};
