import * as opentype from 'opentype.js';

// Optional fonts stay on the user's device, outside project backups and deployments.
const KEY = 'media-studio-local-date-font-v1';
let cached: { font: opentype.Font; name: string } | null | undefined;
function parse(bytes: ArrayBuffer) {
  const font = opentype.parse(bytes);
  delete font.tables.gsub;
  if (![...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/'].every(char=>font.hasChar(char))) throw new Error('Choose a font containing the alphabet, digits, and a slash.');
  return { font, name: font.names.fontFamily.en || 'Local font' };
}
export function localDateFont() {
  if (typeof window === 'undefined') return null;
  if (cached !== undefined) return cached;
  try {
    const data = globalThis.localStorage?.getItem(KEY);
    cached = data ? parse(Uint8Array.from(atob(data),char=>char.charCodeAt(0)).buffer) : null;
  } catch { cached = null; }
  return cached;
}
export async function importDateFont(file: File) {
  if (file.size > 1024*1024) throw new Error('Choose an OTF, TTF, or WOFF font smaller than 1 MB.');
  const bytes = await file.arrayBuffer();
  let parsed;
  try { parsed = parse(bytes); } catch { throw new Error('This font could not be read. Choose an OTF, TTF, or WOFF file with Latin letters and digits.'); }
  const data = Array.from(new Uint8Array(bytes),byte=>String.fromCharCode(byte)).join('');
  localStorage.setItem(KEY,btoa(data));
  cached = parsed;
  return parsed.name;
}
export function clearDateFont() { localStorage.removeItem(KEY); cached = null; }
