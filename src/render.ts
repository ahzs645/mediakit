import * as opentype from 'opentype.js';
import type { CalendarEvent, Palette, Project } from './types';
import { PALETTES } from './types';
import { dateStamp, daysFor, dayLabel, eventOnDay, formatTime } from './dates';
import kalamUrl from '@fontsource/kalam/files/kalam-latin-700-normal.woff?url';
import sansUrl from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url';
import boldUrl from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff?url';
import condensedUrl from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff?url';
import JSZip from 'jszip';
const FONT_OPTIONS = { features: { liga: false, rlig: false } };
type FontKey = 'hand' | 'sans' | 'bold' | 'condensed';
interface DesignParts { background: string; header: string; defs: string; badges: string[] }
interface Resources { fonts: Record<FontKey, opentype.Font>; designs: Record<string, DesignParts> }
let resourcePromise: Promise<Resources> | undefined;
async function resources(): Promise<Resources> {
  if (!resourcePromise) resourcePromise = (async () => {
    const fontEntries = await Promise.all(Object.entries({ hand: kalamUrl, sans: sansUrl, bold: boldUrl, condensed: condensedUrl }).map(async ([key, url]) => {
      const response = await fetch(url); if (!response.ok) throw new Error('A local font could not be loaded. Reload the app.');
      const font = opentype.parse(await response.arrayBuffer());
      // These Latin fonts contain contextual GSUB lookups unsupported by OpenType.js.
      // Keep each character’s original glyph and GPOS kerning, without optional substitutions.
      delete font.tables.gsub;
      return [key, font] as const;
    }));
    const designResponse = await fetch(`${import.meta.env.BASE_URL}assets/design-parts.json`);
    if (!designResponse.ok) throw new Error('The local design artwork could not be loaded.');
    const designs = await designResponse.json() as Record<string, DesignParts>;
    return { fonts: Object.fromEntries(fontEntries) as Resources['fonts'], designs };
  })().catch(error => { resourcePromise = undefined; throw error; });
  return resourcePromise;
}
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
function textPath(font: opentype.Font, text: string, x: number, y: number, size: number, fill: string, maxWidth = Infinity, center = false, stroke?: string, strokeWidth = 16): string {
  const width = font.getAdvanceWidth(text, size, FONT_OPTIONS); const scale = Math.min(1, maxWidth / Math.max(1, width));
  const path = font.getPath(text, center ? -width / 2 : 0, 0, size, FONT_OPTIONS).toPathData(2);
  return `<path d="${path}" fill="${fill}" transform="translate(${x} ${y}) scale(${scale} 1)"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"` : ''}/>`;
}
function wrap(font: opentype.Font, text: string, size: number, width: number): string[] {
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
export interface PlacedEvent { event: CalendarEvent; day: string; titleLines: string[]; detailLines: string[]; summaryLines: string[]; height: number }
export interface RenderedPage { svg: string; width: number; height: number; number: number; total: number; eventCount: number }
export interface DayCapacity { day: string; events: number; slides: number; used: number; available: number; typicalLimit: number; }
export interface RenderResult { pages: RenderedPage[]; warnings: string[]; count: number; capacity: DayCapacity[]; hiddenDays: number; }
export function visibleDays(project: Project): string[] {
  const base = daysFor(project.week, project.layout).filter(day => !project.skippedDays.includes(day));
  if (!project.hideEmptyDays) return base;
  return base.filter(day => [...project.events,...project.manualEvents].some(e => project.selected.includes(e.id) && eventOnDay(e,day,project.timezone)));
}
export function selectedEvents(project: Project): CalendarEvent[] {
  const days = daysFor(project.week, project.layout).filter(day => !project.skippedDays.includes(day));
  return [...project.events, ...project.manualEvents].filter(e => project.selected.includes(e.id) && days.some(day => eventOnDay(e, day, project.timezone)))
    .sort((a,b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
export function dimensions(project: Pick<Project, 'format'>): { width: number; height: number } {
  return project.format === 'story' ? { width: 1080, height: 1920 } : project.format === 'original' ? { width: 964, height: 1302 } : { width: 1080, height: 1350 };
}
export async function renderProject(project: Project): Promise<RenderResult> {
  const { fonts, designs } = await resources();
  const story = project.format === 'story';
  const weekly = project.layout === 'weekly';
  const multiplier = story ? 1080 / 482 : 1;
  const logicalHeight = story ? 1945 : 651;
  const originalWidth = story ? 1080 : 482;
  const dims = dimensions(project);
  const logicalWidth = Math.max(originalWidth, logicalHeight * dims.width / dims.height);
  const logicalCanvasHeight = Math.max(logicalHeight, originalWidth * dims.height / dims.width);
  const padX = (logicalWidth - originalWidth) / 2, padY = (logicalCanvasHeight - logicalHeight) / 2;
  const palette: Palette = project.palette === 'custom' ? project.customPalette : PALETTES[project.palette];
  const baseDesign = designs[story && weekly ? 'story' : project.layout];
  const paint = (value: string) => {
    for (const [token, color] of Object.entries({ '__PAPER__': palette.paper, '__INK__': palette.ink, '__ACCENT__': palette.accent, '__BADGEINK__': palette.badgeInk })) value = value.replaceAll(token,color);
    // Figma's plus-darker blend is not reliably supported by browser SVG-to-canvas.
    // Multiply preserves the embedded paper texture in previews and exports.
    return value.replaceAll('mix-blend-mode:plus-darker','mix-blend-mode:multiply');
  };
  const header = story && !weekly ? `<g transform="translate(-90 0) scale(2.56)">${baseDesign.header}</g>` : baseDesign.header;
  const background = story && !weekly ? designs.story.background.replaceAll('1_7789','bg_7789') : baseDesign.background;
  const template = paint(background + header + baseDesign.defs);
  const days = visibleDays(project);
  const events = selectedEvents(project);
  const warnings: string[] = [];
  if (!days.length) warnings.push('Choose at least one date with an event to export.');
  const cancelled = events.filter(e => /cancelled|canceled|postponed/i.test(e.status));
  if (cancelled.length) warnings.push(`${cancelled.length} selected event(s) are cancelled or postponed. Remove them before exporting.`);
  const fullDayCount = weekly ? 5 : 2;
  const reflow = days.length !== fullDayCount;
  const bodyTop = story ? 428 : weekly ? 151 : 174;
  const bodyBottom = story ? 1823 : weekly ? 615 : 603;
  const gap = story ? (weekly ? 38 : 44) : weekly ? 14.75 : 33;
  const flexibleHeight = (bodyBottom - bodyTop - Math.max(0,days.length-1)*gap)/Math.max(1,days.length);
  const rows = days.map((day, i) => {
    const x = story ? (weekly ? 168 : 190) : weekly ? 59 : i === 0 ? 95 : 96;
    const y = reflow ? bodyTop+i*(flexibleHeight+gap) : story ? weekly ? [428,714,1002,1288,1575][i] : [428,1146][i] : weekly ? [151,246,343,438,534][i] : [174,404][i];
    const w = story ? (weekly ? 832 : 810) : weekly ? 396 : i === 0 ? 360 : 359;
    const h = reflow ? flexibleHeight : story ? weekly ? [248,250,248,249,248][i] : [674,677][i] : weekly ? [81,82,81,82,81][i] : [197,199][i];
    const left = x + (weekly ? 32 * multiplier : 61*multiplier), right = x + w - 14 * multiplier;
    const contentWidth = right - left;
    const entries = events.filter(e => eventOnDay(e,day,project.timezone)).map(event => {
      const edit = project.edits[event.id] || {};
      const title = edit.title ?? event.title;
      const showTitle = edit.showTitle ?? project.showTitle;
      if (showTitle && !title.trim()) warnings.push(`“${event.title}” has an empty title.`);
      const titleLines = showTitle ? wrap(fonts.bold,title,12*multiplier*project.textScale,contentWidth) : [];
      const detail = [(edit.showTime ?? project.showTime) ? edit.timeLabel ?? formatTime(event,day,project.timezone) : '', (edit.showLocation ?? project.showLocation) ? edit.location ?? event.location : ''].filter(Boolean).join(' · ');
      const detailLines = wrap(fonts.sans,detail,9.2*multiplier*project.textScale,contentWidth);
      const summaryLines = (edit.showDescription ?? project.showDescription) ? wrap(fonts.sans,edit.description ?? event.description,9*multiplier*project.textScale,contentWidth) : [];
      if (!titleLines.length && !detailLines.length && !summaryLines.length) warnings.push(`“${event.title}” has every field hidden. Enable a field or deselect this event.`);
      const visibleText = [...titleLines,...detailLines,...summaryLines].join('');
      if ([...visibleText].some(character => !fonts.sans.hasChar(character) && character !== ' ')) warnings.push(`“${title}” contains a symbol the export font cannot draw. Replace it in the event editor.`);
      const height = (titleLines.length*14+detailLines.length*11+summaryLines.length*11+11)*multiplier*project.textScale;
      if (height > h-20*multiplier) warnings.push(`“${title}” is too long for one day box. Shorten it, hide a field, or reduce the text size.`);
      return {event,day,titleLines,detailLines,summaryLines,height};
    });
    const chunks: PlacedEvent[][] = [[]]; let used=0;
    for (const entry of entries) {
      if (used+entry.height > h-20*multiplier && chunks.at(-1)!.length) { chunks.push([]); used=0; }
      chunks.at(-1)!.push(entry); used+=entry.height;
    }
    return {day,x,y,w,h,left,right,chunks,entries};
  });
  const pageCount = Math.max(1,...rows.map(r=>r.chunks.length));
  if (pageCount > 10) warnings.push('This selection needs more than 10 slides. Choose fewer events for a readable set.');
  const capacity: DayCapacity[] = rows.map(row=>({day:row.day,events:row.entries.length,slides:row.chunks.length,used:row.chunks[0].reduce((sum,e)=>sum+e.height,0),available:row.h-20*multiplier,typicalLimit:Math.max(1,Math.floor((row.h-20*multiplier)/(36*multiplier*project.textScale)))}));
  const [month, year] = dateStamp(days.length ? days : daysFor(project.week,project.layout));
  const pages = Array.from({ length: pageCount }, (_, page) => {
    let content = '';
    const stampX = (story ? 861 : 371), stampY = (story ? 185 : 66);
    const stampScale = story ? 2.9 : 1;
    content += textPath(fonts.hand, month, stampX, stampY, 33 * stampScale, palette.paper, 78 * stampScale, true, palette.accent, 21.8453*stampScale);
    content += textPath(fonts.hand, year, stampX - stampScale, stampY + 37 * stampScale, 34 * stampScale, palette.paper, 78 * stampScale, true, palette.accent, 21.8453*stampScale);
    let eventCount = 0;
    rows.forEach((row, index) => {
      const originalY = story && weekly ? [428,714,1002,1288,1575][index] : weekly ? [151,246,343,438,534][index] : [174,404][index];
      const originalH = story && weekly ? [248,250,248,249,248][index] : weekly ? [81,82,81,82,81][index] : [197,199][index];
      const badgeScale = story && !weekly ? multiplier : 1;
      const offsetY = story && !weekly ? row.y + 44 - [235,462][index]*multiplier : row.y+row.h/2-originalY-originalH/2;
      content += `<rect x="${row.x}" y="${row.y}" width="${row.w}" height="${row.h}" rx="${story ? 12.7279 : 2.90649}" fill="${palette.paper}" stroke="${palette.accent}" stroke-width="${story ? 2.93722 : 0.670728}" stroke-dasharray="${story ? 9.79 : 2.24} ${story ? 9.79 : 2.24}"/>`;
      content += `<g transform="translate(0 ${offsetY}) scale(${badgeScale})">${paint(baseDesign.badges[index] || baseDesign.badges[0])}</g>`;
      const badgeX = story ? weekly ? [154,154,160,160,160][index] : 88*multiplier : weekly ? [54,53,50,55,55][index] : 88;
      const originalBaseline = story && weekly ? [545,830,1111,1398,1665][index] : weekly ? [185,285,378,472,568][index] : [274,504][index];
      const badgeY = originalBaseline*badgeScale + offsetY;
      const badgeSize = (weekly ? 16 : 28)*multiplier;
      content += textPath(fonts.condensed,dayLabel(row.day).toUpperCase(),badgeX,badgeY,badgeSize,palette.badgeInk,(weekly?42:78)*multiplier,true);
      content += textPath(fonts.condensed,String(Number(row.day.slice(8))),badgeX,badgeY+(weekly?17:31)*multiplier,badgeSize,palette.badgeInk,40*multiplier,true);
      let baseline = row.y + 19 * multiplier;
      const chunk = row.chunks[page] || [];
      const clipId = `clip-content-${index}`;
      content += `<defs><clipPath id="${clipId}"><rect x="${row.left}" y="${row.y + 5 * multiplier}" width="${row.right-row.left}" height="${row.h-10*multiplier}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
      for (const placed of chunk) {
        eventCount++;
        for (const line of placed.titleLines) { content += textPath(fonts.bold, line, row.left, baseline, 12 * multiplier * project.textScale, palette.ink); baseline += 14 * multiplier * project.textScale; }
        for (const line of placed.detailLines) { content += textPath(fonts.sans, line, row.left, baseline, 9.2 * multiplier * project.textScale, palette.ink); baseline += 11 * multiplier * project.textScale; }
        for (const line of placed.summaryLines) { content += textPath(fonts.sans, line, row.left, baseline, 9 * multiplier * project.textScale, palette.ink); baseline += 11 * multiplier * project.textScale; }
        baseline += 11 * multiplier * project.textScale;
      }
      content += '</g>';
    });
    if (pageCount > 1) content += textPath(fonts.sans, `${page+1} / ${pageCount}`, originalWidth-27*multiplier, logicalHeight-15*multiplier, 8*multiplier, palette.ink, Infinity, true);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${dims.width}" height="${dims.height}" viewBox="${-padX} ${-padY} ${logicalWidth} ${logicalCanvasHeight}" role="img"><title>${escape(`${project.layout === 'weekly' ? 'Weekly' : 'Weekend'} schedule · ${days[0]} · slide ${page+1}`)}</title><rect x="${-padX}" y="${-padY}" width="${logicalWidth}" height="${logicalCanvasHeight}" fill="${palette.paper}"/>${template}${content}</svg>`;
    if (/\bd="[^"]*(?:NaN|Infinity)/.test(svg)) throw new Error('Invalid lettering geometry. Reload the app before exporting.');
    return { svg, ...dims, number: page+1, total: pageCount, eventCount };
  });
  return { pages, warnings: [...new Set(warnings)], count: events.length, capacity, hiddenDays: fullDayCount-days.length };
}
export function svgUrl(svg: string): string { return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); }
export async function rasterize(page: RenderedPage, type: 'png' | 'jpeg' = 'png'): Promise<Blob> {
  const url = svgUrl(page.svg);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = page.width; canvas.height = page.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Image export is unavailable in this browser.');
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed.')), `image/${type}`, 0.96));
  } finally { URL.revokeObjectURL(url); }
}
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function caption(project: Project): string {
  const days = visibleDays(project), events = selectedEvents(project);
  return `${project.layout === 'weekly' ? 'This week' : 'This weekend'} at a glance 🌲\n\n${days.map(day => {
    const items = events.filter(e => eventOnDay(e, day, project.timezone));
    return items.length ? `${dayLabel(day, 'long')}, ${day}\n${items.map(e => { const edit = project.edits[e.id] || {}; return `• ${(edit.showTitle ?? project.showTitle) ? edit.title ?? e.title : 'Event'}\n  ${(edit.showTime ?? project.showTime) ? edit.timeLabel ?? formatTime(e, day, project.timezone) : ''}${(edit.showLocation ?? project.showLocation) && (edit.location ?? e.location) ? ` · ${edit.location ?? e.location}` : ''}${e.url ? `\n  ${e.url}` : ''}`; }).join('\n')}` : '';
  }).filter(Boolean).join('\n\n')}\n\nTimes: ${project.timezone}. Check event links for the latest details.\n#OverTheEdge #UNBC #PrinceGeorge`;
}
export async function exportPages(project: Project, result: RenderResult, type: 'png' | 'jpeg' | 'svg', all: boolean, currentPage: number): Promise<void> {
  if (result.warnings.length) throw new Error('Resolve the layout warnings before exporting.');
  if (!result.count) throw new Error('Select an event before exporting.');
  const pages = all ? result.pages : [result.pages[currentPage]];
  const base = `ote-${project.layout}-${project.week}-${project.palette}`;
  const blobs = await Promise.all(pages.map(async p => ({ name: `${base}-${String(p.number).padStart(2,'0')}.${type === 'jpeg' ? 'jpg' : type}`, blob: type === 'svg' ? new Blob([p.svg], { type: 'image/svg+xml' }) : await rasterize(p,type) })));
  if (all) {
    const zip = new JSZip(); for (const {name,blob} of blobs) zip.file(name,blob);
    zip.file('caption.txt',caption(project));
    download(await zip.generateAsync({ type: 'blob' }),`${base}.zip`);
  } else download(blobs[0].blob,blobs[0].name);
}
