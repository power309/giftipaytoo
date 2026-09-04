/**
 * A tiny, dependency-free Markdown-ish → HTML renderer for admin content
 * previews (pages, blog posts). Supports headings, bold/italic, links,
 * lists, blockquotes and paragraphs — enough for a live `prose-fa` preview
 * without pulling in a Markdown library. All literal text is HTML-escaped
 * before any markup is applied, so the output is safe to render.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  return out;
}

export function renderSimpleMarkdown(md: string): string {
  if (!md) return '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let listOpen: 'ul' | 'ol' | null = null;
  let quoteOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push(`</${listOpen}>`);
      listOpen = null;
    }
  };
  const closeQuote = () => {
    if (quoteOpen) {
      html.push('</blockquote>');
      quoteOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      closeList();
      closeQuote();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      closeQuote();
      const level = h[1].length + 1; // start at h2 to stay under the page's own h1
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      if (!quoteOpen) {
        html.push('<blockquote>');
        quoteOpen = true;
      }
      html.push(`<p>${inline(line.replace(/^>\s?/, ''))}</p>`);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      closeQuote();
      if (listOpen !== 'ul') {
        closeList();
        html.push('<ul>');
        listOpen = 'ul';
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      closeQuote();
      if (listOpen !== 'ol') {
        closeList();
        html.push('<ol>');
        listOpen = 'ol';
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    closeQuote();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeQuote();
  return html.join('\n');
}
