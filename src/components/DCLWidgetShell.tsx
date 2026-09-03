import { darkThemeStyle, theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import type { ReactNode } from 'react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';

/**
 * Themed, self-contained wrapper for every WASM exercise widget.
 *
 * Spreads the waffles dark theme (an emotion SerializedStyles that sets
 * all --wf-* CSS variables) onto the widget root, so `theme.*` tokens
 * resolve correctly everywhere inside without leaking into (or depending
 * on) the host page. This mirrors how the LearnByExample block in
 * media-app anchors its styles to a dark container, but scoped so the
 * widget stays visually stable when embedded on arbitrary third-party
 * sites.
 */
export const DCLWidgetShell: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  return (
    <I18nextProvider i18n={i18n}>
      <div
        css={[
          darkThemeStyle,
          {
            backgroundColor: theme.background.contrast,
            border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
            borderRadius: tokens.borderRadius.medium,
            color: theme.text.main,
            fontFamily: tokens.fontFamilies.sansSerif,
            fontSize: tokens.fontSizes.medium,
            lineHeight: tokens.lineHeights.relaxed,
            maxWidth: '100%',
            overflow: 'hidden',
            '& *': {
              boxSizing: 'border-box',
            },
            '& [data-waffles-component="button"] [data-waffles-component="text"]': {
              fontFamily: tokens.fontFamilies.sansSerif,
              fontSize: 'inherit',
              fontWeight: tokens.fontWeights.bold,
            },
            '& code': {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: tokens.borderRadius.medium,
              fontFamily: tokens.fontFamilies.mono,
              fontSize: '0.9em',
              padding: '2px 5px',
            },
          },
        ]}
      >
        {children}
      </div>
    </I18nextProvider>
  );
};
