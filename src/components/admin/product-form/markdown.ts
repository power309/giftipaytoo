/**
 * Minimal, dependency-free Markdown-ish → HTML renderer for the admin
 * description fields' live preview. Deliberately small: headings, bold,
 * italic, links, unordered/ordered lists and paragraphs — enough for
 * product copy, rendered through the same `.prose-fa` styles the
 * storefront uses. Input is HTML-escaped first, so the "markdown" syntax
 * is the only thing ever turned into markup — this can never inject
 * arbitrary HTML from admin input.
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
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

export function renderMarkdownFa(source: string): string {
  if (!source.trim()) return '';
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  }
  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length === 1 ? 2 : heading[1].length === 2 ? 2 : 3;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushParagraph();
      const type = ul ? 'ul' : 'ol';
      if (listType !== type) {
        closeList();
        html.push(`<${type}>`);
        listType = type;
      }
      html.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  flushParagraph();
  closeList();
  return html.join('\n');
}
