import * as opentype from 'opentype.js';
export const FONT_OPTIONS = { features: { liga: false, rlig: false } };
export const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export function fontForText(preferred: opentype.Font | undefined, fallback: opentype.Font, text: string): opentype.Font {
  return preferred && [...text.replace(/\s+/g, ' ')].every(char => preferred.hasChar(char)) ? preferred : fallback;
}
export function textPath(font: opentype.Font, text: string, x: number, y: number, size: number, fill: string, maxWidth = Infinity, center = false, stroke?: string, strokeWidth = 16): string {
  const width = font.getAdvanceWidth(text, size, FONT_OPTIONS); const scale = Math.min(1, maxWidth / Math.max(1, width));
  const path = font.getPath(text, center ? -width / 2 : 0, 0, size, FONT_OPTIONS).toPathData(2);
  return `<path d="${path}" fill="${fill}" transform="translate(${x} ${y}) scale(${scale} 1)"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"` : ''}/>`;
}
/** Draws text in the preferred font, borrowing only the glyphs it lacks (such as “?”) from the fallback. */
export function mixedTextPath(preferred: opentype.Font | undefined, fallback: opentype.Font, text: string, x: number, y: number, size: number, fill: string, maxWidth = Infinity, center = false): string {
  if (!preferred) return textPath(fallback, text, x, y, size, fill, maxWidth, center);
  const runs: { font: opentype.Font; text: string }[] = [];
  for (const char of text) {
    const font = char === ' ' || preferred.hasChar(char) ? preferred : fallback;
    if (runs.at(-1)?.font === font) runs.at(-1)!.text += char; else runs.push({ font, text: char });
  }
  if (runs.length === 1) return textPath(runs[0].font, text, x, y, size, fill, maxWidth, center);
  const widths = runs.map(run => run.font.getAdvanceWidth(run.text, size, FONT_OPTIONS));
  const width = widths.reduce((sum, w) => sum + w, 0), scale = Math.min(1, maxWidth / Math.max(1, width));
  let cursor = center ? -width / 2 : 0, d = '';
  runs.forEach((run, i) => { d += run.font.getPath(run.text, cursor, 0, size, FONT_OPTIONS).toPathData(2); cursor += widths[i]; });
  return `<path d="${d}" fill="${fill}" transform="translate(${x} ${y}) scale(${scale} 1)"/>`;
}
export function wrap(font: opentype.Font, text: string, size: number, width: number): string[] {
  const lines: string[] = []; let line = '';
  // Break overlong words by Unicode codepoint, so URLs cannot escape the frame.
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (!word) continue;
    if (font.getAdvanceWidth(word, size, FONT_OPTIONS) > width) {
      if (line) { lines.push(line); line = ''; }
      for (const character of word) {
        if (font.getAdvanceWidth(line + character, size, FONT_OPTIONS) > width && line) { lines.push(line); line = ''; }
        line += character;
      }
    } else if (font.getAdvanceWidth(line ? `${line} ${word}` : word, size, FONT_OPTIONS) <= width) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line); return lines;
}
