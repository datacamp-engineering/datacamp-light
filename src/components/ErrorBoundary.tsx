import { Button } from '@datacamp/waffles/button';
import { CrossCircle } from '@datacamp/waffles/icon';
import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import type { CSSObject } from '@emotion/react';
import React from 'react';
import { baseBannerStyle } from '../styles/bannerStyles';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Context label included in the console error report. */
  label?: string;
  /**
   * `widget` renders the full-width reload card shown when the whole exercise
   * fails; `inline` renders a compact notice for a single subcomponent.
   */
  variant?: 'widget' | 'inline';
  fallback?: (error: Error, reload: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Incremented on reload so the wrapped subtree remounts from scratch. */
  generation: number;
}

/**
 * Catches unexpected render errors inside a DataCamp Light widget and shows a
 * reload card instead of letting React unmount the widget (which would leave
 * an empty hole in the host page until the page itself is refreshed).
 *
 * Reloading remounts the wrapped subtree: effects run again, so the session is
 * re-acquired and the exercise re-initializes without a page refresh.
 *
 * Error boundaries only catch errors thrown during rendering, not errors in
 * async event handlers — those are handled by the individual call sites.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { error: null, generation: 0 };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[DataCamp Light]${this.props.label ? ` (${this.props.label})` : ''} unexpected error:`,
      error,
      info?.componentStack ?? '',
    );
  }

  private handleReload = () => {
    this.setState((previous) => ({
      error: null,
      generation: previous.generation + 1,
    }));
  };

  public render(): React.ReactNode {
    const { error, generation } = this.state;

    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.handleReload);
      }
      return this.renderDefaultFallback(error);
    }

    return <React.Fragment key={generation}>{this.props.children}</React.Fragment>;
  }

private renderDefaultFallback(error: Error): React.ReactNode {
    const isWidgetVariant = (this.props.variant ?? 'widget') === 'widget';

    return (
      <div css={isWidgetVariant ? widgetFallbackStyle : inlineFallbackStyle}>
        <div css={{ alignItems: 'center', display: 'flex', gap: tokens.spacingNew.xsmall }}>
          <CrossCircle css={{ color: theme.error.text }} size="small" />
          <span css={{ color: theme.text.main, fontWeight: tokens.fontWeights.bold }}>
            {isWidgetVariant ? 'Something went wrong' : 'This section failed to load'}
          </span>
        </div>
        <div css={{ color: theme.text.secondary, fontSize: tokens.fontSizes.small }}>
          {truncate(error.message || 'An unexpected error occurred.')}
        </div>
        <div>
          <Button
            data-testid="error-boundary-reload"
            onClick={this.handleReload}
            size="small"
            variant="regularOutline"
          >
            {isWidgetVariant ? 'Reload widget' : 'Reload section'}
          </Button>
        </div>
      </div>
    );
  }
}

/**
 * The widget-level fallback replaces the whole exercise, which renders outside
 * DCLWidgetShell, so it must carry the shell's card treatment itself: full
 * border, rounded corners, and the waffles sans-serif font.
 */
const widgetFallbackStyle: CSSObject = {
  backgroundColor: theme.background.contrast,
  border: `${tokens.borderWidth.thin} solid ${theme.border.main}`,
  borderRadius: tokens.borderRadius.medium,
  color: theme.text.main,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: tokens.fontFamilies.sansSerif,
  fontSize: tokens.fontSizes.medium,
  gap: tokens.spacingNew.xsmall,
  lineHeight: tokens.lineHeights.relaxed,
  maxWidth: '100%',
  padding: tokens.spacingNew.medium,
};

/**
 * The inline fallback lives inside DCLWidgetShell, so it only needs the
 * banner treatment (top border, no radius) to sit flush under the section it
 * replaces.
 */
const inlineFallbackStyle: CSSObject = {
  ...baseBannerStyle,
  flexDirection: 'column',
  gap: tokens.spacingNew.xsmall,
};

function truncate(message: string, maxLength = 240): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.slice(0, maxLength)}…`;
}