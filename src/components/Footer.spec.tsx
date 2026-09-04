import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DCLWidgetShell } from './DCLWidgetShell';
import { Footer } from './Footer';

const renderWithShell = (component: React.ReactElement) => {
  return render(<DCLWidgetShell>{component}</DCLWidgetShell>);
};

describe('Footer', () => {
  it('should render powered by DataLab link with default query parameters', () => {
    renderWithShell(<Footer utmSource="test_source" utmCampaign="test_campaign" />);
    const link = screen.getByRole('link', { name: /DataLab/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'title',
      "Open this code in DataLab (DataCamp's cloud notebook)",
    );
    expect(link).toHaveAttribute(
      'href',
      'https://www.datacamp.com/datalab/new?_tag=test_source&utm_source=test_source&utm_campaign=test_campaign',
    );
  });

  it('should include code and language query parameters for direct workbook opening', () => {
    const code = 'x = 10\nprint(x)';
    renderWithShell(
      <Footer
        code={code}
        language="python"
        utmSource="test_source"
        utmCampaign="test_campaign"
      />,
    );
    const link = screen.getByRole('link', { name: /DataLab/i });
    expect(link).toBeInTheDocument();
    const expectedParameters = new URLSearchParams({
      _tag: 'test_source',
      utm_source: 'test_source',
      utm_campaign: 'test_campaign',
      code,
      language: 'python',
    });
    expect(link).toHaveAttribute(
      'href',
      `https://www.datacamp.com/datalab/new?${expectedParameters.toString()}`,
    );
  });

  it('should format affiliate tracking URL when impactTrackingLink is provided', () => {
    const code = 'x = 10\nprint(x)';
    renderWithShell(
      <Footer
        code={code}
        impactTrackingLink="/c/67577/1012793/13294"
        language="python"
        utmCampaign="test_campaign"
        utmSource="test_source"
      />,
    );
    const link = screen.getByRole('link', { name: /DataLab/i });
    expect(link).toBeInTheDocument();

    const expectedParameters = new URLSearchParams({
      _tag: 'test_source',
      utm_source: 'test_source',
      utm_campaign: 'test_campaign',
      code,
      language: 'python',
    });
    const expectedDatalabUrl = `https://www.datacamp.com/datalab/new?${expectedParameters.toString()}`;
    const expectedHref = `https://datacamp.pxf.io/c/67577/1012793/13294?u=${encodeURIComponent(expectedDatalabUrl)}`;

    expect(link).toHaveAttribute('href', expectedHref);
  });

  it('should render theme toggle button and trigger callback when clicked in dark mode', () => {
    const handleToggleTheme = vi.fn();
    renderWithShell(<Footer theme="dark" onToggleTheme={handleToggleTheme} />);
    const button = screen.getByRole('button', { name: /switch to light theme/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('should render theme toggle button for light mode to switch to dark', () => {
    const handleToggleTheme = vi.fn();
    renderWithShell(<Footer theme="light" onToggleTheme={handleToggleTheme} />);
    const button = screen.getByRole('button', { name: /switch to dark theme/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleToggleTheme).toHaveBeenCalledTimes(1);
  });
});
