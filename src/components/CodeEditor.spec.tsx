import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodeEditor } from './CodeEditor';

describe('CodeEditor', () => {
  it('renders Python code and initializes editor view', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <CodeEditor code="x = 5\nprint(x)" language="python" onChange={handleChange} />,
    );

    const cmEditor = container.querySelector('.cm-editor');
    expect(cmEditor).toBeInTheDocument();
    expect(container.textContent).toContain('x = 5');
  });

  it('renders R code with R syntax highlighting mode', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <CodeEditor
        code="radius <- 5\narea <- pi * (radius ** 2)\nprint(area)"
        language="r"
        onChange={handleChange}
      />,
    );

    const cmEditor = container.querySelector('.cm-editor');
    expect(cmEditor).toBeInTheDocument();
    expect(container.textContent).toContain('radius <- 5');
  });
});
