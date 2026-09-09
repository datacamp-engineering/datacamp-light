import type { CSSObject } from '@emotion/react';
import { Button } from '@datacamp/waffles/button';
import { Cross } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';

export const baseBannerStyle: CSSObject = {
  backgroundColor: theme.background.secondary,
  borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
  display: 'flex',
  gap: tokens.spacingNew.small,
  padding: `${tokens.spacingNew.small} ${tokens.spacingNew.medium}`,
};

export const bannerRowStyle: CSSObject = {
  ...baseBannerStyle,
  alignItems: 'center',
  justifyContent: 'space-between',
};

export function getFeedbackTheme(isSuccess: boolean) {
  return {
    background: isSuccess ? theme.success.transparent : theme.error.transparent,
    border: isSuccess ? theme.success.main : theme.error.main,
    codeBackground: isSuccess
      ? 'rgba(0, 168, 90, 0.15)'
      : 'rgba(255, 75, 75, 0.15)',
    color: isSuccess ? theme.success.text : theme.error.text,
  };
}

export function getFeedbackBannerStyle(isSuccess: boolean): CSSObject {
  const feedbackTheme = getFeedbackTheme(isSuccess);

  return {
    ...bannerRowStyle,
    backgroundColor: feedbackTheme.background,
    borderTop: `${tokens.borderWidth.thin} solid ${feedbackTheme.border}`,
    color: feedbackTheme.color,
    fontSize: tokens.fontSizes.medium,
    '& code': {
      backgroundColor: feedbackTheme.codeBackground,
      borderRadius: tokens.borderRadius.medium,
      fontFamily: tokens.fontFamilies.mono,
      fontSize: '0.9em',
      padding: '2px 5px',
    },
  };
}

export interface BannerCloseButtonProps {
  onClose: () => void;
  label?: string;
  color?: string;
}

export const BannerCloseButton: React.FC<BannerCloseButtonProps> = ({
  onClose,
  label = 'Close',
  color,
}) => {
  return (
    <Button
      aria-label={label}
      icon={<Cross size="small" />}
      onClick={onClose}
      size="small"
      variant="plain"
      css={color ? { color: `${color} !important` } : undefined}
    />
  );
};
