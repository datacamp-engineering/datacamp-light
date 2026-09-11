import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useRef, useState } from 'react';

interface ResizeHandleProps {
  onResize: (deltaY: number) => void;
  ariaLabel?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  onResize,
  ariaLabel = 'Resize section',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startYRef.current = e.clientY;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startYRef.current;
      startYRef.current = e.clientY;
      onResize(deltaY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  return (
    <div
      aria-label={ariaLabel}
      css={{
        cursor: 'row-resize',
        height: '8px',
        margin: '-4px 0',
        position: 'relative',
        userSelect: 'none',
        width: '100%',
        zIndex: tokens.zIndex.default,
      }}
      onMouseDown={handleMouseDown}
      role="separator"
    />
  );
};
