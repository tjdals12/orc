export function splitTextLines(text: string): string[] {
  const textLines = text.split('\n');
  const lastLine = textLines.at(-1);
  const lines = lastLine === '' ? textLines.slice(0, -1) : textLines;
  return lines;
}

export function collapseWhitespace(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed;
}

export function buildPreview(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  const omittedCount = text.length - limit;
  const preview = `${text.slice(0, limit)}... (+${omittedCount} chars)`;
  return preview;
}
