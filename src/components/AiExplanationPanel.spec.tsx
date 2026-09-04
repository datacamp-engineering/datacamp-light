import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DCLWidgetShell } from './DCLWidgetShell';
import { AiExplanationPanel } from './AiExplanationPanel';

const renderWithShell = (component: React.ReactElement) => {
  return render(<DCLWidgetShell>{component}</DCLWidgetShell>);
};

describe('AiExplanationPanel', () => {
  it('renders markdown formatted content (bold, inline code, paragraphs) and close button', () => {
    const handleClose = vi.fn();
    renderWithShell(
      <AiExplanationPanel
        explanation="This code uses a **for loop** with `enumerate` to iterate."
        onClose={handleClose}
        title="Code Explanation"
      />,
    );

    expect(screen.getByText('Code Explanation')).toBeInTheDocument();
    expect(screen.getByText('for loop')).toBeInTheDocument();
    expect(screen.getByText('enumerate')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: /close explanation/i });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('renders diff and triggers accept/reject handlers', () => {
    const handleAccept = vi.fn();
    const handleReject = vi.fn();
    const handleClose = vi.fn();

    renderWithShell(
      <AiExplanationPanel
        diff={[
          { value: 'x = 10' },
          { added: true, value: 'y = 20' },
          { removed: true, value: 'y = 10' },
        ]}
        explanation="Fixed variable assignment."
        onAcceptFix={handleAccept}
        onClose={handleClose}
        onRejectFix={handleReject}
        title="Fix & Explain"
      />,
    );

    const acceptButton = screen.getByRole('button', { name: /accept fix/i });
    expect(acceptButton).toBeInTheDocument();
    fireEvent.click(acceptButton);
    expect(handleAccept).toHaveBeenCalledTimes(1);

    const rejectButton = screen.getByRole('button', { name: /reject/i });
    expect(rejectButton).toBeInTheDocument();
    fireEvent.click(rejectButton);
    expect(handleReject).toHaveBeenCalledTimes(1);
  });

  it('renders error message when error is provided', () => {
    renderWithShell(
      <AiExplanationPanel
        error="Network error while contacting AI API"
        explanation=""
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Network error while contacting AI API')).toBeInTheDocument();
  });
});
