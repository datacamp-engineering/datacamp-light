import React from 'react';
import type { CSSObject } from '@emotion/react';
import { richTextContentStyle, sanitizeHtml } from '../utils/richText';

export interface SanitizedHtmlProps {
  html: string;
  /** Element to render; defaults to an inline span. */
  as?: 'div' | 'span';
  className?: string;
}

/**
 * Renders a sanitized HTML fragment. The single choke point for
 * dangerouslySetInnerHTML in this codebase: no other element should render
 * raw HTML directly.
 *
 * The wrapper carries `richTextContentStyle` so markdown-produced block
 * elements (p, ul, ol, pre, headings, ...) get consistent interior spacing
 * and their first/last margins collapse against the surrounding container.
 */
export const SanitizedHtml: React.FC<SanitizedHtmlProps> = ({
  as: Tag = 'span',
  html,
  ...rest
}) => (
  <Tag
    css={richTextContentStyle as CSSObject}
    dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    {...rest}
  />
);