import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function ThrowingComponent({ throwOnRender }: { throwOnRender: boolean }) {
  if (throwOnRender) {
    throw new Error('Render exploded');
  }
  return <div data-testid="healthy-content">content</div>;
}

function renderWithThrowingChild(throwOnRender: boolean) {
  return render(
    <ErrorBoundary label="test-boundary">
      <ThrowingComponent throwOnRender={throwOnRender} />
    </ErrorBoundary>,
  );
}

describe('ErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    renderWithThrowingChild(false);
    expect(screen.getByTestId('healthy-content')).toBeInTheDocument();
  });

  it('renders the reload card instead of unmounting when the child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithThrowingChild(true);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Render exploded')).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[DataCamp Light] (test-boundary) unexpected error:',
      expect.any(Error),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it('remounts the wrapped subtree when reload is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = renderWithThrowingChild(true);
    expect(screen.getByTestId('error-boundary-reload')).toBeInTheDocument();

    // The child stops throwing; the reload remounts it fresh.
    rerender(
      <ErrorBoundary label="test-boundary">
        <ThrowingComponent throwOnRender={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByTestId('error-boundary-reload'));

    expect(screen.getByTestId('healthy-content')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('shows a compact inline variant for subcomponents', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary label="editor" variant="inline">
        <ThrowingComponent throwOnRender={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('This section failed to load')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-reload')?.textContent?.toLowerCase()).toBe('reload section');
    consoleSpy.mockRestore();
  });

  it('uses a custom fallback when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let fallbackMessage: string | undefined;
    render(
      <ErrorBoundary
        fallback={(error, reload) => {
          fallbackMessage = error.message;
          return <button data-testid="custom-retry" onClick={reload}>retry</button>;
        }}
      >
        <ThrowingComponent throwOnRender={true} />
      </ErrorBoundary>,
    );

    expect(fallbackMessage).toBe('Render exploded');
    fireEvent.click(screen.getByTestId('custom-retry'));
    // Still throwing → fallback again, but the custom path was wired through
    expect(screen.getByTestId('custom-retry')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});