import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { DCLWidgetShell } from './DCLWidgetShell';
import { PlotCanvas } from './PlotCanvas';

const renderWithShell = (component: React.ReactElement) => {
  return render(<DCLWidgetShell>{component}</DCLWidgetShell>);
};

describe('PlotCanvas', () => {
  it('renders null when no plots are provided', () => {
    const { container } = renderWithShell(<PlotCanvas plots={[]} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders a single plot image', () => {
    const plotUrl = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    renderWithShell(<PlotCanvas plots={[plotUrl]} />);

    const imageElement = screen.getByRole('img', { name: /Plot output 1 of 1/i });
    expect(imageElement).toBeInTheDocument();
    expect(imageElement).toHaveAttribute('src', plotUrl);
  });

  it('renders pagination controls for multiple plots and navigates between them', () => {
    const plot1 = 'data:image/svg+xml;base64,cGxvdDE=';
    const plot2 = 'data:image/svg+xml;base64,cGxvdDI=';

    renderWithShell(<PlotCanvas plots={[plot1, plot2]} />);

    // By default, switches to the newest plot (index 1)
    expect(screen.getByText('Plot (2/2)')).toBeInTheDocument();
    let currentImage = screen.getByRole('img', { name: /Plot output 2 of 2/i });
    expect(currentImage).toHaveAttribute('src', plot2);

    // Click previous plot button
    const previousButton = screen.getByRole('button', { name: /Previous plot/i });
    fireEvent.click(previousButton);

    expect(screen.getByText('Plot (1/2)')).toBeInTheDocument();
    currentImage = screen.getByRole('img', { name: /Plot output 1 of 2/i });
    expect(currentImage).toHaveAttribute('src', plot1);

    // Click next plot button
    const nextButton = screen.getByRole('button', { name: /Next plot/i });
    fireEvent.click(nextButton);

    expect(screen.getByText('Plot (2/2)')).toBeInTheDocument();
  });
});
