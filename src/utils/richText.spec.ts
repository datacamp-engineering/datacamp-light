// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { theme } from '@datacamp/waffles/theme';
import {
  closeUnterminatedCodeFences,
  renderMarkdown,
  richTextContentStyle,
  sanitizeHtml,
} from './richText';

describe('richTextContentStyle', () => {
  it('gives markdown block elements a consistent interior gap', () => {
    const [blockRule] = Object.entries(richTextContentStyle).find(
      ([selector]) => selector.startsWith('& p,'),
    )!;
    expect(blockRule).toBeDefined();
  });

  it('collapses the outer edges of any rendered block element', () => {
    const selectors = Object.keys(richTextContentStyle);
    expect(selectors).toContain('& > :first-child');
    expect(selectors).toContain('& > :last-child');
    expect(richTextContentStyle['& > :first-child']).toEqual({ marginTop: 0 });
    expect(richTextContentStyle['& > :last-child']).toEqual({ marginBottom: 0 });
  });

  it('styles links with the waffles link treatment', () => {
    const anchorRule = richTextContentStyle['& a'] as Record<string, string>;
    expect(anchorRule.color).toBe(theme.blue.text);
    expect(anchorRule.textDecoration).toBe('none');
    const hoverRule = richTextContentStyle['& a:hover'] as Record<string, string>;
    expect(hoverRule.textDecoration).toBe('underline');
  });

  it('covers the block element types markdown produces', () => {
    const blockSelector = Object.keys(richTextContentStyle).find((selector) =>
      selector.includes('& p,'),
    )!;
    for (const element of ['p', 'ul', 'ol', 'pre', 'blockquote', 'h1', 'h6']) {
      expect(blockSelector).toContain(element);
    }
  });
});

describe('sanitizeHtml', () => {
  it('removes script tags and event handlers while keeping formatting', () => {
    const sanitized = sanitizeHtml(
      '<p onclick="alert(1)">Hello <strong>world</strong><script>alert(1)</script></p>',
    );
    expect(sanitized).not.toContain('script');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).toContain('<strong>world</strong>');
  });

  it('keeps code, pre, and list elements used by widget content', () => {
    const sanitized = sanitizeHtml(
      '<code>area</code><ul><li>one</li></ul><pre><code>x = 1</code></pre>',
    );
    expect(sanitized).toContain('<code>area</code>');
    expect(sanitized).toContain('<li>one</li>');
    expect(sanitized).toContain('<pre>');
  });

  it('strips iframe and javascript hrefs', () => {
    const sanitized = sanitizeHtml(
      '<iframe src="https://evil.example"></iframe><a href="javascript:alert(1)">bad</a>',
    );
    expect(sanitized).not.toContain('iframe');
    expect(sanitized).not.toContain('javascript:');
  });

  it('forces external anchors to open in a new tab with noopener', () => {
    const sanitized = sanitizeHtml('<a href="https://docs.example.com/guide">guide</a>');
    const match = sanitized.match(/<a [^>]*>/);
    expect(match?.[0]).toContain('target="_blank"');
    expect(match?.[0]).toContain('rel="noopener noreferrer"');
  });

  it('leaves same-page anchors without a target', () => {
    const sanitized = sanitizeHtml('<a href="#section">section</a>');
    expect(sanitized).not.toContain('target="_blank"');
  });
});

describe('closeUnterminatedCodeFences', () => {
  it('appends a closing fence for an unclosed backtick fence', () => {
    const partial = 'Explanation:\n\n```python\n# a comment inside code';
    const normalized = closeUnterminatedCodeFences(partial);
    expect(normalized.endsWith('\n```')).toBe(true);
  });

  it('does not alter fully closed code blocks', () => {
    const complete = '```python\n# comment\n```\nDone.';
    expect(closeUnterminatedCodeFences(complete)).toBe(complete);
  });

  it('counts backtick and tilde fences independently', () => {
    const mixed = '```python\nx = 1\n```\n\n~~~\ncode';
    const normalized = closeUnterminatedCodeFences(mixed);
    expect(normalized.endsWith('\n```')).toBe(false);
    expect(normalized.endsWith('\n~~~')).toBe(true);
  });
});

describe('renderMarkdown', () => {
  it('converts markdown to sanitized html', () => {
    const html = renderMarkdown('Use `x = 5` and **bold** text.');
    expect(html).toContain('<code>x = 5</code>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('passes author-authored html through', () => {
    const html = renderMarkdown('The variable <code>area</code> is wrong.');
    expect(html).toContain('<code>area</code>');
    expect(html).toContain('is wrong');
  });

  it('renders unterminated fenced code as code, not as headings', () => {
    const html = renderMarkdown('```python\n# a comment inside code\nx = 1');
    expect(html).not.toContain('<h1>');
    expect(html).toContain('<code');
    expect(html).toContain('# a comment inside code');
  });

  it('sanitizes raw html embedded in markdown', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script><b>world</b>');
    expect(html).not.toContain('<script');
    expect(html).toContain('<b>world</b>');
  });

  it('renders multiline sct messages with line breaks', () => {
    const html = renderMarkdown('Line one\nLine two');
    expect(html).toContain('<br');
  });
});