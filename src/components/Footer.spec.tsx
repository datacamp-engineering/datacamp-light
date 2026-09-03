import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';

describe('Footer', () => {
  it('should render powered by DataLab link with default query parameters', () => {
    render(<Footer utmSource="test_source" utmCampaign="test_campaign" />);
    const link = screen.getByRole('link', { name: /DataLab/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      'https://www.datacamp.com/datalab/new?_tag=test_source&utm_source=test_source&utm_campaign=test_campaign',
    );
  });

  it('should include code and language query parameters for direct workbook opening', () => {
    const code = 'x = 10\nprint(x)';
    render(
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
});
