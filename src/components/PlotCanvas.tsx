import { Button } from '@datacamp/waffles/button';
import { Chapeau } from '@datacamp/waffles/chapeau';
import { ChevronLeft, ChevronRight } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useRef, useState } from 'react';

interface PlotCanvasProps {
  plots: string[];
  height?: number | string;
}

export const PlotCanvas: React.FC<PlotCanvasProps> = ({ plots, height = 400 }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const containerReference = useRef<HTMLDivElement>(null);

  // When new plots arrive, auto-switch to the newest plot
  useEffect(() => {
    if (plots && plots.length > 0) {
      setCurrentIndex(plots.length - 1);
    }
  }, [plots]);

  const handleScroll = () => {
    if (containerReference.current) {
      const scrolled = containerReference.current.scrollTop > 0;
      setIsScrolled(scrolled);
    }
  };

  if (!plots || plots.length === 0) {
    return null;
  }

  const safeIndex = Math.min(Math.max(0, currentIndex), plots.length - 1);
  const totalPlots = plots.length;
  const currentPlotUrl = plots[safeIndex];

  const maximumImageHeight =
    typeof height === 'number' ? `${Math.max(80, height - 65)}px` : '335px';

  return (
    <div
      css={{
        backgroundColor: theme.background.contrast,
        borderTop: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
        height: typeof height === 'number' ? `${height}px` : height,
        overflowY: 'auto',
        position: 'relative',
      }}
      onScroll={handleScroll}
      ref={containerReference}
    >
      <div
        css={{
          alignItems: 'center',
          backgroundColor: theme.background.contrast,
          boxShadow: isScrolled ? tokens.boxShadow.medium : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          minHeight: '36px',
          padding: `4px ${tokens.spacingNew.medium}`,
          position: 'sticky',
          top: 0,
          transition: 'box-shadow 0.15s ease-in-out',
          zIndex: tokens.zIndex.sticky,
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
              onClick={() => setCurrentIndex((previousIndex) => Math.max(0, previousIndex - 1))}
              size="small"
              variant="plain"
            />
            <Button
              aria-label="Next plot"
              disabled={safeIndex === totalPlots - 1}
              icon={<ChevronRight size="small" />}
              onClick={() => setCurrentIndex((previousIndex) => Math.min(totalPlots - 1, previousIndex + 1))}
              size="small"
              variant="plain"
            />
          </div>
        )}
      </div>

      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.spacingNew.small,
          padding: `0 ${tokens.spacingNew.medium} ${tokens.spacingNew.medium} ${tokens.spacingNew.medium}`,
        }}
      >
        {currentPlotUrl && (
          <img
            alt={`Plot output ${safeIndex + 1} of ${totalPlots}`}
            css={{
              backgroundColor: '#ffffff',
              borderRadius: tokens.borderRadius.medium,
              boxShadow: theme.boxShadow.xthick,
              display: 'block',
              height: 'auto',
              margin: '0 auto',
              maxHeight: maximumImageHeight,
              maxWidth: '100%',
              objectFit: 'contain',
              width: 'auto',
            }}
            src={currentPlotUrl}
          />
        )}
      </div>
    </div>
  );
};
