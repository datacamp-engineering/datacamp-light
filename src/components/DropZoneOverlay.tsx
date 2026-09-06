import { theme } from '@datacamp/waffles/theme';
import { tokens } from '@datacamp/waffles/tokens';
import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface DropZoneOverlayProps {
  children: ReactNode;
  theme?: 'light' | 'dark';
  onFileDrop: (file: File) => void | Promise<void>;
}

/**
 * Waffles-styled drag-and-drop overlay that uploads dropped files into the
 * underlying exercise session's virtual filesystem. The overlay sits over the
 * whole widget card and only renders once a file is actually dragged over it,
 * so it never intercepts clicks or keyboard interactions on the exercise.
 */
export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({
  children,
  theme: themeMode = 'dark',
  onFileDrop,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragDepthReference = useRef(0);
  const onFileDropReference = useRef(onFileDrop);

  useEffect(() => {
    onFileDropReference.current = onFileDrop;
  }, [onFileDrop]);

  const isLightMode = themeMode === 'light';

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepthReference.current++;
    setIsDraggingOver(true);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepthReference.current = Math.max(0, dragDepthReference.current - 1);
    if (dragDepthReference.current === 0) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    dragDepthReference.current = 0;
    setIsDraggingOver(false);
    const files = Array.from(event.dataTransfer?.files || []);
    for (const file of files) {
      await onFileDropReference.current(file);
    }
  };

  return (
    <div
      css={{
        position: 'relative',
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDraggingOver && (
        <div
          css={{
            alignItems: 'center',
            display: 'flex',
            inset: 0,
            justifyContent: 'center',
            pointerEvents: 'none',
            position: 'absolute',
            zIndex: tokens.zIndex.sticky + 1,
          }}
        >
          <div
            css={{
              backgroundColor: isLightMode
                ? 'rgba(5, 120, 255, 0.08)'
                : 'rgba(5, 120, 255, 0.14)',
              border: `2px dashed ${theme.blue.main}`,
              borderRadius: tokens.borderRadius.medium,
              inset: tokens.spacingNew.tiny,
              position: 'absolute',
            }}
          />
          <div
            css={{
              alignItems: 'center',
              backgroundColor: theme.background.contrast,
              borderRadius: tokens.borderRadius.medium,
              boxShadow: tokens.boxShadow.medium,
              color: theme.text.main,
              display: 'flex',
              flexDirection: 'column',
              fontFamily: tokens.fontFamilies.sansSerif,
              fontSize: tokens.fontSizes.medium,
              fontWeight: tokens.fontWeights.bold,
              gap: tokens.spacingNew.small,
              padding: tokens.spacingNew.medium,
            }}
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="40"
              stroke={theme.blue.main}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              width="40"
            >
              <path d="M17.5 19a4.5 4.5 0 0 0-1.1-8.87 3.7 3.7 0 0 0-6.7-2.03A3.5 3.5 0 0 0 4.5 11.5 4.5 4.5 0 0 0 2.9 7.5" />
              <path d="M12 12v6" />
              <path d="M9 15l3 3 3-3" />
            </svg>
            <span>Drop files to upload into the exercise filesystem</span>
          </div>
        </div>
      )}
    </div>
  );
};