import DOMPurify from 'dompurify';
import type { Config } from 'dompurify';
import { marked } from 'marked';

// Anchors may only keep their href; target is re-added by the hook below so
// links can never navigate the host page's top frame or tab-nab it.
const SANITIZE_OPTIONS: Config = {
  ADD_ATTR: ['target'],
};

/**
 * DOMPurify hook applied to every sanitized document: external links open in a
 * new tab with `rel="noopener noreferrer"` so embedded widgets on third-party
 * pages cannot tab-nab the host. Anchors added by this hook are set after
 * attribute sanitization, so they are not stripped by the allow-list.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const elementNode = node as Element;
  if (elementNode.tagName !== 'A') {
    return;
  }
  const href = elementNode.getAttribute('href') ?? '';
  if (href && !href.startsWith('#')) {
    elementNode.setAttribute('target', '_blank');
    elementNode.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Sanitizes an HTML fragment for safe rendering inside a DataCamp Light
 * widget. Scripts, event handlers, and dangerous URLs are removed while
 * formatting elements (code, pre, strong, em, lists, ...) are preserved.
 */
export function sanitizeHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, SANITIZE_OPTIONS);
  return typeof sanitized === 'string' ? sanitized : String(sanitized);
}

/**
 * Layout resets for containers that render markdown output. Markdown produces
 * many block element types (p, ul, ol, pre, headings, blockquotes), each with
 * its own browser default margins — resetting only `p` leaves stray margins
 * when the rendered fragment ends with (or starts with) a list or code block.
 * Block elements get a consistent interior gap, and the first/last child
 * collapse against the surrounding container edges.
 */
export const richTextContentStyle = {
  '& p, & ul, & ol, & pre, & blockquote, & h1, & h2, & h3, & h4, & h5, & h6': {
    margin: '0 0 8px 0',
  },
  '& > :first-child': {
    marginTop: 0,
  },
  '& > :last-child': {
    marginBottom: 0,
  },
} as const;

/**
 * Closes an unterminated fenced code block so partially streamed markdown
 * renders the block's content (including `#` comment lines) as code instead
 * of as top-level markdown (which would turn `# comment` into an h1 heading).
 *
 * Fences are counted per marker type (``` and ~~~) because a fence is only
 * closed by a marker of the same character; mixed markers cannot close each
 * other per CommonMark.
 */
export function closeUnterminatedCodeFences(markdown: string): string {
  const backtickFenceCount = (markdown.match(/^[ \t]{0,3}```/gm) ?? []).length;
  const tildeFenceCount = (markdown.match(/^[ \t]{0,3}~~~/gm) ?? []).length;
  let normalized = markdown;
  if (backtickFenceCount % 2 === 1) {
    normalized += '\n```';
  }
  if (tildeFenceCount % 2 === 1) {
    normalized += '\n~~~';
  }
  return normalized;
}

/**
 * Removes uniform leading indentation and surrounding whitespace from
 * author-authored HTML/Markdown fragments. Host pages author hint blocks
 * indented inside their markup; left intact, that indentation turns the first
 * content lines into indented code blocks when parsed as markdown. Relative
 * indentation inside the fragment is preserved.
 */
export function dedent(block: string): string {
  const matches = block.match(/^[ \t]*(?=\S)/gm);
  if (!matches) {
    return block.trim();
  }
  const baseIndent = Math.min(...matches.map((element) => element.length));
  const dedented =
    baseIndent > 0 ? block.replace(new RegExp(`^[ \\t]{${baseIndent}}`, 'gm'), '') : block;
  return dedented.trim();
}

/**
 * Renders markdown (or embedded raw HTML) to sanitized HTML. Used for AI
 * explanations, SCT feedback messages, and exercise hints, so a single
 * pipeline accepts both markdown syntax and author-authored HTML.
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(closeUnterminatedCodeFences(markdown), {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;
  return sanitizeHtml(html);
}