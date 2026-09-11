import { Button } from '@datacamp/waffles/button';
import { Checkmark, Cross, CrossCircle, Sparkles } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import type { LineChange } from '../ai/lineDiff';
import { renderMarkdown } from '../utils/richText';
import { baseBannerStyle } from '../styles/bannerStyles';
import { AiCodeDiff } from './AiCodeDiff';
import { SanitizedHtml } from './SanitizedHtml';

export interface AiExplanationPanelProps {
  title?: string;
  explanation: string;
  isLoading?: boolean;
  diff?: LineChange[];
  error?: string | null;
  onAcceptFix?: () => void;
  onRejectFix?: () => void;
  onClose: () => void;
}

export const AiExplanationPanel: React.FC<AiExplanationPanelProps> = ({
  title = 'AI Explanation',
  explanation,
  isLoading = false,
  diff,
  error,
  onAcceptFix,
  onRejectFix,
  onClose,
}) => {
  const formattedExplanation = explanation ? renderMarkdown(explanation) : '';

  return (
    <div
      css={{
        ...baseBannerStyle,
        flexDirection: 'column',
      }}
    >
      <div
        css={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <div css={{ alignItems: 'center', display: 'flex', gap: tokens.spacingNew.xsmall }}>
          <Sparkles css={{ color: theme.purple.text }} size="small" />
          <span css={{ color: theme.text.main, fontWeight: tokens.fontWeights.bold }}>
            {title}
          </span>
          {isLoading && (
            <span css={{ color: theme.text.subtle, fontSize: tokens.fontSizes.small }}>
              (Generating...)
            </span>
          )}
        </div>
        <Button
          aria-label="Close explanation"
          icon={<Cross size="small" />}
          onClick={onClose}
          size="small"
          variant="plain"
        />
      </div>

      {error ? (
        <div css={{ color: theme.error.text, fontSize: tokens.fontSizes.medium }}>
          {error}
        </div>
      ) : (
        <>
          {formattedExplanation && (
            <div
              css={{
                color: theme.text.main,
                fontSize: tokens.fontSizes.medium,
                lineHeight: tokens.lineHeights.relaxed,
                maxHeight: '260px',
                overflowY: 'auto',
                '& strong': {
                  fontWeight: tokens.fontWeights.bold,
                },
                '& em': {
                  fontStyle: 'italic',
                },
                '& ul, & ol': {
                  paddingLeft: '20px',
                },
                '& li': {
                  marginBottom: '4px',
                },
                '& code': {
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: tokens.borderRadius.medium,
                  fontFamily: tokens.fontFamilies.mono,
                  fontSize: '0.9em',
                  padding: '2px 4px',
                },
                '& pre': {
                  backgroundColor: theme.background.contrast,
                  border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
                  borderRadius: tokens.borderRadius.medium,
                  margin: '8px 0',
                  overflowX: 'auto',
                  padding: tokens.spacingNew.xsmall,
                  '& code': {
                    backgroundColor: 'transparent',
                    padding: 0,
                  },
                },
              }}
            >
              <SanitizedHtml html={formattedExplanation} />
            </div>
          )}

          {diff && diff.length > 0 && (
            <div>
              <div
                css={{
                  color: theme.text.secondary,
                  fontSize: tokens.fontSizes.small,
                  marginBottom: tokens.spacingNew.tiny,
                }}
              >
                Suggested Fix:
              </div>
              <AiCodeDiff diff={diff} />
            </div>
          )}

          {diff && diff.length > 0 && onAcceptFix && onRejectFix && (
            <div css={{ display: 'flex', gap: tokens.spacingNew.xsmall, marginTop: tokens.spacingNew.tiny }}>
              <Button
                iconLeft={<Checkmark size="small" />}
                onClick={onAcceptFix}
                size="small"
                variant="primary"
              >
                Accept Fix
              </Button>
              <Button
                iconLeft={<CrossCircle size="small" />}
                onClick={onRejectFix}
                size="small"
                variant="regularOutline"
              >
                Reject
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
