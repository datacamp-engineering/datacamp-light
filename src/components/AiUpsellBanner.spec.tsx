import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DCLWidgetShell } from './DCLWidgetShell';
import { AiUpsellBanner } from './AiUpsellBanner';

const renderWithShell = (component: React.ReactElement) => {
  return render(<DCLWidgetShell>{component}</DCLWidgetShell>);
};

describe('AiUpsellBanner', () => {
  it('renders third-party upsell with Open in DataLab CTA link', () => {
    const handleClose = vi.fn();
    renderWithShell(
      <AiUpsellBanner
        code="print('hello')"
        language="python"
        onClose={handleClose}
        utmCampaign="blog_post"
        utmSource="medium"
        variant="third-party"
      />,
    );

    expect(screen.getByText('AI Assistant Available in DataLab')).toBeInTheDocument();
    const ctaLink = screen.getByRole('link', { name: /open in datalab/i });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute(
      'href',
      expect.stringContaining('https://www.datacamp.com/datalab/new?'),
    );

    const closeButton = screen.getByRole('button', { name: /close ai banner/i });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('routes third-party CTA through the affiliate link with top-level utm parameters', () => {
    renderWithShell(
      <AiUpsellBanner
        impactTrackingLink="/c/67577/1012793/13294"
        language="python"
        onClose={vi.fn()}
        utmCampaign="blog_post"
        utmSource="medium"
        variant="third-party"
      />,
    );

    const ctaLink = screen.getByRole('link', { name: /open in datalab/i });
    const href = new URL(ctaLink.getAttribute('href') || '');
    expect(href.origin).toBe('https://datacamp.pxf.io');
    expect(href.pathname).toBe('/c/67577/1012793/13294');
    expect(href.searchParams.get('utm_source')).toBe('medium');
    expect(href.searchParams.get('utm_campaign')).toBe('blog_post');
    expect(href.searchParams.get('u')).toContain('utm_source=medium');
    expect(href.searchParams.get('u')).toContain('utm_campaign=blog_post');
  });

  it('renders signed-out upsell with Sign Up Free CTA link', () => {
    const handleClose = vi.fn();
    renderWithShell(
      <AiUpsellBanner
        onClose={handleClose}
        variant="signed-out"
      />,
    );

    expect(screen.getByText('Unlock AI with a Free Account')).toBeInTheDocument();
    const ctaLink = screen.getByRole('link', { name: /sign up free/i });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute(
      'href',
      expect.stringContaining('/users/sign_up'),
    );
  });
});
