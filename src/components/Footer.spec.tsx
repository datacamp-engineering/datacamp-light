import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';

describe('Footer', () => {
  it('should render powered by DataCamp link', () => {
    render(<Footer utmSource="test_source" utmCampaign="test_campaign" />);
    const link = screen.getByRole('link', { name: /DataCamp/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      'https://www.datacamp.com/?utm_source=test_source&utm_campaign=test_campaign',
    );
  });
});
