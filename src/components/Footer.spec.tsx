import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';

describe('Footer', () => {
  it('should render powered by DataLab link', () => {
    render(<Footer utmSource="test_source" utmCampaign="test_campaign" />);
    const link = screen.getByRole('link', { name: /DataLab/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      'https://www.datacamp.com/datalab?utm_source=test_source&utm_campaign=test_campaign',
    );
  });
});
