import { DataLabLogo } from '@datacamp/waffles/brand';
import { Chapeau } from '@datacamp/waffles/chapeau';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';

export interface FooterProps {
  code?: string;
  language?: string;
  utmSource?: string;
  utmCampaign?: string;
}

export const Footer: React.FC<FooterProps> = ({
  code,
  language = 'python',
  utmSource = 'datacamp_light',
  utmCampaign = 'powered_by_datalab',
}) => {
  const queryParameters = new URLSearchParams();
  queryParameters.set('_tag', utmSource);
  queryParameters.set('utm_source', utmSource);
  queryParameters.set('utm_campaign', utmCampaign);

  if (code && (language === 'python' || language === 'r')) {
    queryParameters.set('code', code);
    queryParameters.set('language', language);
  }

  const datalabUrl = `https://www.datacamp.com/datalab/new?${queryParameters.toString()}`;

  return (
    <div
      css={{
        alignItems: 'center',
        backgroundColor: theme.background.secondary,
        borderBottomLeftRadius: tokens.borderRadius.medium,
        borderBottomRightRadius: tokens.borderRadius.medium,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        display: 'flex',
        justifyContent: 'flex-end',
        padding: `${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium}`,
      }}
    >
      <a
        aria-label="Powered by DataLab"
        css={{
          alignItems: 'center',
          cursor: 'pointer',
          display: 'inline-flex',
          gap: tokens.spacingNew.tiny,
          textDecoration: 'none !important',
        }}
        href={datalabUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Chapeau
          aria-hidden="true"
          css={{
            color: theme.text.inverseSubtle,
            marginBottom: '0 !important',
            marginTop: '2px',
          }}
          size="small"
        >
          Powered by
        </Chapeau>
        <DataLabLogo
          css={{ color: theme.text.inverseSubtle }}
          height={17}
          monochrome
          width={71}
        />
      </a>
    </div>
  );
};
