import { CheckmarkCircle, CrossCircle } from '@datacamp/waffles/icon';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import { renderMarkdown } from '../utils/richText';
import {
  BannerCloseButton,
  getFeedbackBannerStyle,
  getFeedbackTheme,
} from '../styles/bannerStyles';
import { SanitizedHtml } from './SanitizedHtml';

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
        <SanitizedHtml html={renderMarkdown(message)} />
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
