import React from 'react';
import { sanitizeHtml } from '../utils/richText';

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
 */
export const SanitizedHtml: React.FC<SanitizedHtmlProps> = ({
  as: Tag = 'span',
  html,
  ...rest
}) => <Tag dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} {...rest} />;