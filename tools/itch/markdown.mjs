/**
 * Minimal markdown → HTML for the itch store description.
 *
 * itch's description field is a Redactor WYSIWYG backed by an HTML textarea. It does not parse
 * markdown, so markdown submitted straight into the field renders literally on the store page
 * (verified: no <strong>, no <table>, literal "**" visible).
 *
 * This covers exactly the syntax used in docs/itch-store-page.md: paragraphs, ### headings,
 * - lists, **bold**, *italic*, [links](url) and pipe tables.
 */
export function markdownToHtml(markdown) {
  const inline = text => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');

  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (paragraph.length) { blocks.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; }
  };
  const flushList = () => {
    if (list.length) { blocks.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`); list = []; }
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    // A pipe table: header row followed by a delimiter row.
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1] || '')) {
      flushParagraph(); flushList();
      const header = line.split('|').slice(1, -1).map(cell => cell.trim());
      index += 2;
      const rows = [];
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        rows.push(lines[index].split('|').slice(1, -1).map(cell => cell.trim()));
        index += 1;
      }
      const head = `<thead><tr>${header.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      blocks.push(`<table>${head}${body}</table>`);
      continue;
    }

    if (/^###\s+/.test(line)) { flushParagraph(); flushList(); blocks.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); index += 1; continue; }
    if (/^##\s+/.test(line)) { flushParagraph(); flushList(); blocks.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); index += 1; continue; }
    if (/^\s*[-*]\s+/.test(line)) { flushParagraph(); list.push(line.replace(/^\s*[-*]\s+/, '')); index += 1; continue; }
    if (!line.trim()) { flushParagraph(); flushList(); index += 1; continue; }

    flushList();
    paragraph.push(line.trim());
    index += 1;
  }
  flushParagraph(); flushList();
  return blocks.join('\n');
}
