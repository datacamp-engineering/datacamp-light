// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HintPanel } from './DataCampExercise';

describe('HintPanel', () => {
  it('renders markdown hints: inline code and emphasis', () => {
    const { container } = render(
      <HintPanel hint="Use `x = 5` and keep the **radius** fixed." />,
    );

    const codeElement = container.querySelector('code');
    expect(codeElement?.textContent).toBe('x = 5');
    expect(container.querySelector('strong')?.textContent).toBe('radius');
  });

  it('passes author-authored html hints through unchanged', () => {
    const { container } = render(
      <HintPanel hint="Use the operator (<code>=</code>) to assign values." />,
    );

    expect(container.querySelector('code')?.textContent).toBe('=');
    expect(screen.getByText(/Use the operator/)).toBeInTheDocument();
  });

  it('wraps plain-text hints in paragraphs', () => {
    const { container } = render(<HintPanel hint="A plain text hint." />);

    const paragraph = container.querySelector('p');
    expect(paragraph?.textContent).toBe('A plain text hint.');
  });

  it('renders multiline hints as separate paragraphs', () => {
    const { container } = render(<HintPanel hint={'First line\n\nSecond line'} />);

    expect(container.querySelectorAll('p')).toHaveLength(2);
  });

  it('passes authored html paragraphs through sanitization', () => {
    render(
      <HintPanel hint={'<p data-testid="authored-paragraph">authored</p>'} />,
    );

    // The author's own paragraph survives sanitization untouched; the
    // container css only resets paragraphs created by the markdown renderer.
    expect(screen.getByTestId('authored-paragraph')).toBeInTheDocument();
  });
});