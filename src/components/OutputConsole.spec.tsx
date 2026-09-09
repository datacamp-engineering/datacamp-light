import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DCLWidgetShell } from './DCLWidgetShell';
import { OutputConsole } from './OutputConsole';
import type { ConsoleEntry } from './OutputConsole';

const renderWithShell = (component: React.ReactElement) => {
  return render(<DCLWidgetShell>{component}</DCLWidgetShell>);
};

describe('OutputConsole', () => {
  it('renders output and error entries correctly', () => {
    const entries: ConsoleEntry[] = [
      { type: 'output', text: 'Hello, World!' },
      { type: 'error', text: 'NameError: name x is not defined' },
    ];

    renderWithShell(<OutputConsole entries={entries} />);

    expect(screen.getByText('Hello, World!')).toBeInTheDocument();
    expect(screen.getByText('NameError: name x is not defined')).toBeInTheDocument();
  });

  it('triggers onExecuteCommand when entering a command and pressing Enter', () => {
    const handleExecuteCommand = vi.fn();
    renderWithShell(
      <OutputConsole
        entries={[]}
        onExecuteCommand={handleExecuteCommand}
        prompt=">>> "
      />,
    );

    const inputElement = screen.getByRole('textbox', { name: /console command input/i });
    fireEvent.change(inputElement, { target: { value: 'print(42)' } });
    fireEvent.keyDown(inputElement, { key: 'Enter', code: 'Enter' });

    expect(handleExecuteCommand).toHaveBeenCalledWith('print(42)');
  });

  it('renders Fix & Explain button when an error entry is present and triggers callback', () => {
    const handleFixAndExplain = vi.fn();
    const entries: ConsoleEntry[] = [
      { type: 'error', text: 'TypeError: unsupported operand type' },
    ];

    renderWithShell(
      <OutputConsole
        entries={entries}
        onFixAndExplain={handleFixAndExplain}
        showAi={true}
      />,
    );

    const fixButton = screen.getByRole('button', { name: /Fix & Explain/i });
    expect(fixButton).toBeInTheDocument();

    fireEvent.click(fixButton);
    expect(handleFixAndExplain).toHaveBeenCalledTimes(1);
  });

  it('maintains input element in readOnly mode during execution and refocuses on completion', () => {
    const { rerender } = renderWithShell(
      <OutputConsole
        entries={[]}
        onExecuteCommand={vi.fn()}
        isExecuting={true}
      />,
    );

    const inputElement = screen.getByRole('textbox', { name: /console command input/i }) as HTMLInputElement;
    expect(inputElement.readOnly).toBe(true);

    rerender(
      <DCLWidgetShell>
        <OutputConsole
          entries={[]}
          onExecuteCommand={vi.fn()}
          isExecuting={false}
        />
      </DCLWidgetShell>,
    );

    expect(inputElement.readOnly).toBe(false);
  });
});
