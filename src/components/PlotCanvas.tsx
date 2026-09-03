import { Button } from '@datacamp/waffles/button';
import { Chapeau } from '@datacamp/waffles/chapeau';
import { ChevronLeft, ChevronRight } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useState } from 'react';

interface PlotCanvasProps {
  plots: string[];
  height?: number | string;
}

export const PlotCanvas: React.FC<PlotCanvasProps> = ({ plots, height = 400 }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // When new plots arrive, auto-switch to the newest plot
  useEffect(() => {
    if (plots && plots.length > 0) {
      setCurrentIndex(plots.length - 1);
    }
  }, [plots]);

  if (!plots || plots.length === 0) {
    return null;
  }

  const safeIndex = Math.min(Math.max(0, currentIndex), plots.length - 1);
  const totalPlots = plots.length;
  const currentPlotUrl = plots[safeIndex];

  const maxImgHeight =
    typeof height === 'number' ? `${Math.max(80, height - 65)}px` : '335px';

  return (
    <div
      css={{
        backgroundColor: theme.background.contrast,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        display: 'flex',
        flexDirection: 'column',
        gap: tokens.spacingNew.small,
        height: typeof height === 'number' ? `${height}px` : height,
        overflowY: 'auto',
        padding: `${tokens.spacingNew.xsmall} ${tokens.spacingNew.medium} ${tokens.spacingNew.medium}`,
      }}
    >
      <div
        css={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          minHeight: tokens.sizing.small,
        }}
      >
        <Chapeau css={{ fontSize: `${tokens.fontSizes.small} !important`, margin: 0 }}>
          {totalPlots > 1 ? `Plot (${safeIndex + 1}/${totalPlots})` : 'Plot'}
        </Chapeau>

        {totalPlots > 1 && (
          <div css={{ alignItems: 'center', display: 'flex', gap: tokens.spacingNew.tiny }}>
            <Button
              aria-label="Previous plot"
              disabled={safeIndex === 0}
              icon={<ChevronLeft size="small" />}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              size="small"
              variant="plain"
            />
            <Button
              aria-label="Next plot"
              disabled={safeIndex === totalPlots - 1}
              icon={<ChevronRight size="small" />}
              onClick={() => setCurrentIndex((prev) => Math.min(totalPlots - 1, prev + 1))}
              size="small"
              variant="plain"
            />
          </div>
        )}
      </div>

      {currentPlotUrl && (
        <img
          alt={`Plot output ${safeIndex + 1} of ${totalPlots}`}
          css={{
            borderRadius: tokens.borderRadius.medium,
            boxShadow: theme.boxShadow.xthick,
            display: 'block',
            height: 'auto',
            margin: '0 auto',
            maxHeight: maxImgHeight,
            maxWidth: '100%',
            objectFit: 'contain',
            width: 'auto',
          }}
          src={currentPlotUrl}
        />
      )}
    </div>
  );
};
