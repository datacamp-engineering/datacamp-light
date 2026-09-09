import '../i18n';
import { DataLabLogo } from '@datacamp/waffles/brand';
import { Button } from '@datacamp/waffles/button';
import { Chapeau } from '@datacamp/waffles/chapeau';
import { Moon, Sun } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React from 'react';
import type { ThemeMode } from '../theme/themeManager';
import { buildDataLabUrl } from '../utils/urlUtils';

export interface FooterProps {
  code?: string;
  language?: string;
  utmSource?: string;
  utmCampaign?: string;
  impactTrackingLink?: string;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  code,
  language = 'python',
  utmSource = 'datacamp_light',
  utmCampaign = 'powered_by_datalab',
  impactTrackingLink,
  theme: activeTheme = 'dark',
  onToggleTheme,
}) => {
  const datalabUrl = buildDataLabUrl({
    code,
    language,
    utmSource,
    utmCampaign,
    impactTrackingLink,
  });

  const isDarkMode = activeTheme === 'dark';
  const toggleLabel = isDarkMode ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <div
      css={{
        alignItems: 'center',
        backgroundColor: theme.background.secondary,
        borderBottomLeftRadius: tokens.borderRadius.medium,
        borderBottomRightRadius: tokens.borderRadius.medium,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        display: 'flex',
        gap: tokens.spacingNew.medium,
        justifyContent: 'flex-end',
        padding: `${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium}`,
      }}
    >
      {onToggleTheme && (
        <Button
          aria-label={toggleLabel}
          icon={isDarkMode ? <Sun size="small" /> : <Moon size="small" />}
          onClick={onToggleTheme}
          size="small"
          title={toggleLabel}
          variant="plain"
        />
      )}

      <a
        aria-label="Powered by DataCamp DataLab - Open this code in a cloud workbook"
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
        title="Open this code in DataLab (DataCamp's cloud notebook)"
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
