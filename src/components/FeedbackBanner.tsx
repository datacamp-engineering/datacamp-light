import { CheckmarkCircle, CrossCircle } from '@datacamp/waffles/icon';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import {
  BannerCloseButton,
  getFeedbackBannerStyle,
  getFeedbackTheme,
} from '../styles/bannerStyles';

export interface FeedbackBannerProps {
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
  const feedbackTheme = getFeedbackTheme(isSuccess);

  return (
    <div
      css={getFeedbackBannerStyle(isSuccess)}
      data-correct={String(isSuccess)}
      data-testid="feedback-banner"
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
        <BannerCloseButton
          label="Close feedback"
          color={feedbackTheme.color}
          onClose={onClose}
        />
      )}
    </div>
  );
};
