import { Button } from '@datacamp/waffles/button';
import { Cross, ExternalLink, Sparkles } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import { getMainAppBaseUrl } from '../ai/aiConfig';

export interface AiUpsellBannerProps {
  variant: 'third-party' | 'signed-out';
  code?: string;
  language?: string;
  utmSource?: string;
  utmCampaign?: string;
  onClose: () => void;
}

export const AiUpsellBanner: React.FC<AiUpsellBannerProps> = ({
  variant,
  code,
  language = 'python',
  utmSource = 'datacamp_light',
  utmCampaign = 'ai_upsell',
  onClose,
}) => {
  const isThirdParty = variant === 'third-party';

  const queryParameters = new URLSearchParams();
  queryParameters.set('_tag', utmSource);
  queryParameters.set('utm_source', utmSource);
  queryParameters.set('utm_campaign', utmCampaign);
  if (code) {
    queryParameters.set('code', code);
    queryParameters.set('language', language);
  }

  const datalabUrl = `https://www.datacamp.com/datalab/new?${queryParameters.toString()}`;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://www.datacamp.com';
  const signUpUrl = `${getMainAppBaseUrl()}/users/sign_up?redirect=${encodeURIComponent(
    currentUrl,
  )}&utm_source=${encodeURIComponent(utmSource)}&utm_campaign=${encodeURIComponent(utmCampaign)}`;

  return (
    <div
      css={{
        alignItems: 'center',
        backgroundColor: theme.background.secondary,
        borderBottom: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: tokens.spacingNew.small,
        justifyContent: 'space-between',
        padding: `${tokens.spacingNew.small} ${tokens.spacingNew.medium}`,
      }}
    >
      <div css={{ alignItems: 'center', display: 'flex', gap: tokens.spacingNew.small }}>
        <Sparkles css={{ color: theme.purple.text }} size="medium" />
        <div>
          <div css={{ color: theme.text.main, fontWeight: tokens.fontWeights.bold }}>
            {isThirdParty
              ? 'AI Assistant Available in DataLab'
              : 'Unlock AI with a Free Account'}
          </div>
          <div css={{ color: theme.text.secondary, fontSize: tokens.fontSizes.small }}>
            {isThirdParty
              ? 'Run live AI code explanations and automated fixes directly in DataLab.'
              : 'Sign in to access AI code explanations and automated fix suggestions.'}
          </div>
        </div>
      </div>

      <div css={{ alignItems: 'center', display: 'flex', gap: tokens.spacingNew.xsmall }}>
        {isThirdParty ? (
          <Button
            as="a"
            href={datalabUrl}
            iconRight={<ExternalLink size="small" />}
            size="small"
            target="_blank"
            variant="primary"
          >
            Open in DataLab
          </Button>
        ) : (
          <Button
            as="a"
            href={signUpUrl}
            size="small"
            target="_blank"
            variant="primary"
          >
            Sign Up Free
          </Button>
        )}
        <Button
          aria-label="Close AI banner"
          icon={<Cross size="small" />}
          onClick={onClose}
          size="small"
          variant="plain"
        />
      </div>
    </div>
  );
};
