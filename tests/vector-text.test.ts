import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as opentype from 'opentype.js';
import { mixedTextPath, textPath } from '../src/vector-text';
const load = (family: string, file: string) => { const b = readFileSync(join(process.cwd(), 'node_modules/@fontsource', family, 'files', file)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const display = load('barlow-condensed', 'barlow-condensed-latin-700-normal.woff');
const hand = load('kalam', 'kalam-latin-700-normal.woff');
// A display font like Salted that has letters but no question mark.
const noQuestion = Object.assign(Object.create(display), { hasChar: (c: string) => c !== '?' && display.hasChar(c) }) as opentype.Font;
describe('mixed-font headings', () => {
  it('keeps the display font for every glyph it has and borrows only missing ones', () => {
    const mixed = mixedTextPath(noQuestion, hand, 'TODAY?', 540, 900, 76, '#155329', 790, true);
    const a = display.getAdvanceWidth('TODAY', 76, { features: { liga: false, rlig: false } }), b = hand.getAdvanceWidth('?', 76, { features: { liga: false, rlig: false } });
    const d = display.getPath('TODAY', -(a + b) / 2, 0, 76, { features: { liga: false, rlig: false } }).toPathData(2) + hand.getPath('?', -(a + b) / 2 + a, 0, 76, { features: { liga: false, rlig: false } }).toPathData(2);
    expect(mixed).toBe(`<path d="${d}" fill="#155329" transform="translate(540 900) scale(1 1)"/>`);
  });
  it('matches a single-font path when the display font has every glyph or none is loaded', () => {
    expect(mixedTextPath(display, hand, 'TODAY?', 540, 900, 76, '#000', 790, true)).toBe(textPath(display, 'TODAY?', 540, 900, 76, '#000', 790, true));
    expect(mixedTextPath(undefined, hand, 'TODAY?', 540, 900, 76, '#000', 790, true)).toBe(textPath(hand, 'TODAY?', 540, 900, 76, '#000', 790, true));
  });
});
