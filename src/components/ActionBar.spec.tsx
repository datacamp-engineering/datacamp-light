import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from './ActionBar';
import { DCLWidgetShell } from './DCLWidgetShell';

const renderWithShell = (component: React.ReactElement) => {
  return render(<DCLWidgetShell>{component}</DCLWidgetShell>);
};

describe('ActionBar', () => {
  it('renders Submit Answer and Run Code when hasSct is true', () => {
    const handleRun = vi.fn();
    const handleSubmit = vi.fn();
    renderWithShell(
      <ActionBar
        hasSct={true}
        isExecuting={false}
        onReset={vi.fn()}
        onRun={handleRun}
        onSubmit={handleSubmit}
        showRunButton={true}
        status={{ status: 'ready' }}
      />,
    );

    const submitButton = screen.getByRole('button', { name: /submit answer/i });
    expect(submitButton).toBeInTheDocument();

    const runButton = screen.getByRole('button', { name: /run code/i });
    expect(runButton).toBeInTheDocument();

    fireEvent.click(submitButton);
    expect(handleSubmit).toHaveBeenCalledTimes(1);

    fireEvent.click(runButton);
    expect(handleRun).toHaveBeenCalledTimes(1);
  });

  it('hides Submit Answer button when hasSct is false', () => {
    const handleRun = vi.fn();
    renderWithShell(
      <ActionBar
        hasSct={false}
        isExecuting={false}
        onReset={vi.fn()}
        onRun={handleRun}
        onSubmit={vi.fn()}
        showRunButton={true}
        status={{ status: 'ready' }}
      />,
    );

    expect(screen.queryByRole('button', { name: /submit answer/i })).toBeNull();
    const runButton = screen.getByRole('button', { name: /run code/i });
    expect(runButton).toBeInTheDocument();
  });

  it('renders Explain Code button when onExplainCode is provided and showAi is true', () => {
    const handleExplain = vi.fn();
    renderWithShell(
      <ActionBar
        hasSct={true}
        isExecuting={false}
        onExplainCode={handleExplain}
        onReset={vi.fn()}
        onSubmit={vi.fn()}
        showAi={true}
        status={{ status: 'ready' }}
      />,
    );

    const explainButton = screen.getByRole('button', { name: /explain code/i });
    expect(explainButton).toBeInTheDocument();

    fireEvent.click(explainButton);
    expect(handleExplain).toHaveBeenCalledTimes(1);
  });

  it('renders status badge with title and accessible aria-label', () => {
    renderWithShell(
      <ActionBar
        isExecuting={false}
        onReset={vi.fn()}
        onSubmit={vi.fn()}
        status={{ status: 'ready' }}
      />,
    );

    const statusBadge = screen.getByLabelText('Session: Ready');
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveAttribute('title', 'Session: Ready');
  });

  it('keeps Hint, Solution, and Explain Code enabled even when code execution is busy', () => {
    const handleToggleHint = vi.fn();
    const handleToggleSolution = vi.fn();
    const handleExplain = vi.fn();

    renderWithShell(
      <ActionBar
        hasHint={true}
        hasSct={true}
        hasSolution={true}
        isExecuting={true}
        executingAction="run"
        onExplainCode={handleExplain}
        onReset={vi.fn()}
        onSubmit={vi.fn()}
        onToggleHint={handleToggleHint}
        onToggleSolution={handleToggleSolution}
        showAi={true}
        status={{ status: 'busy' }}
      />,
    );

    const hintButton = screen.getByRole('button', { name: /hint/i });
    expect(hintButton).not.toBeDisabled();
    fireEvent.click(hintButton);
    expect(handleToggleHint).toHaveBeenCalledTimes(1);

    const solutionButton = screen.getByRole('button', { name: /solution/i });
    expect(solutionButton).not.toBeDisabled();
    fireEvent.click(solutionButton);
    expect(handleToggleSolution).toHaveBeenCalledTimes(1);

    const explainButton = screen.getByRole('button', { name: /explain/i });
    expect(explainButton).not.toBeDisabled();
    fireEvent.click(explainButton);
    expect(handleExplain).toHaveBeenCalledTimes(1);
  });
});
