import { DataLabLogo } from '@datacamp/waffles/brand';
import { Chapeau } from '@datacamp/waffles/chapeau';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';

interface FooterProps {
  utmSource?: string;
  utmCampaign?: string;
}

export const Footer: React.FC<FooterProps> = ({
  utmSource = 'datacamp_light',
  utmCampaign = 'powered_by_datacamp',
}) => {
  const datacampUrl = `https://www.datacamp.com/?utm_source=${encodeURIComponent(
    utmSource,
  )}&utm_campaign=${encodeURIComponent(utmCampaign)}`;

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
        aria-label="Powered by DataCamp"
        css={{
          alignItems: 'center',
          cursor: 'pointer',
          display: 'inline-flex',
          gap: tokens.spacingNew.tiny,
          textDecoration: 'none !important',
        }}
        href={datacampUrl}
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
