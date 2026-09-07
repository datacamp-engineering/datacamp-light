import { Multidoc } from '@datacamp/waffles/icon';
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
 * Waffles-styled drag-and-drop overlay that ingests dropped files into the
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
              gap: tokens.spacingNew.tiny,
              padding: `${tokens.spacingNew.medium} ${tokens.spacingNew.large}`,
            }}
          >
            <Multidoc
              css={{
                color: theme.blue.main,
                height: 40,
                marginBottom: tokens.spacingNew.tiny,
                width: 40,
              }}
            />
            <span css={{ color: theme.text.main, fontWeight: tokens.fontWeights.bold }}>
              Drop files to add to working directory
            </span>
            <span
              css={{
                color: theme.text.subtle,
                fontSize: tokens.fontSizes.small,
                fontWeight: tokens.fontWeights.regular,
              }}
            >
              Saved locally in your session's filesystem
            </span>
          </div>
        </div>
      )}
    </div>
  );
};