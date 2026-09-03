import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeedbackBanner } from './FeedbackBanner';

describe('FeedbackBanner', () => {
  it('renders nothing when message is empty', () => {
    const { container } = render(<FeedbackBanner correct={true} message="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders success banner when correct is true', () => {
    render(<FeedbackBanner correct={true} message="Great work!" />);
    const banner = screen.getByTestId('feedback-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('data-correct', 'true');
    expect(banner).toHaveTextContent('Great work!');
  });

  it('renders error banner when correct is false', () => {
    render(<FeedbackBanner correct={false} message="The solution is incorrect." />);
    const banner = screen.getByTestId('feedback-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('data-correct', 'false');
    expect(banner).toHaveTextContent('The solution is incorrect.');
  });

  it('converts markdown backticks into inline code elements', () => {
    const { container } = render(
      <FeedbackBanner correct={false} message="Use `cd ..` to navigate." />,
    );
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement?.textContent).toBe('cd ..');
  });

  it('renders HTML code elements properly', () => {
    const { container } = render(
      <FeedbackBanner correct={false} message="The variable <code>area</code> is wrong." />,
    );
    const codeElement = container.querySelector('code');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement?.textContent).toBe('area');
  });
});
