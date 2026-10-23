import * as opentype from 'opentype.js';
import type { CalendarEvent, Palette, Project } from './types';
import { PALETTES } from './types';
import { dateStamp, daysFor, dayLabel, eventOnDay, formatTime } from './dates';
import kalamUrl from '@fontsource/kalam/files/kalam-latin-700-normal.woff?url';
import sansUrl from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff?url';
import boldUrl from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff?url';
import italicUrl from '@fontsource/dm-sans/files/dm-sans-latin-400-italic.woff?url';
import displayUrl from '@fontsource/barlow-condensed/files/barlow-condensed-latin-900-normal.woff?url';
import { textPath, wrap, escape } from './vector-text';
import { renderList } from './list-layout';
import condensedUrl from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff?url';
import JSZip from 'jszip';
import { localDateFont } from './date-font';
import designUrl from './assets/design-parts.json?url';
type FontKey = 'hand' | 'sans' | 'bold' | 'condensed' | 'italic' | 'display';
interface DesignBadge { artwork: string; x: number; y: number; width: number; height: number }
interface DesignFrame { x: number; y: number; width: number; height: number; rx: number; 'stroke-width': number }
interface DesignParts { header: string; stamp: string; defs: string; badges: DesignBadge[]; frames: DesignFrame[]; watermark?: string }
interface Resources { fonts: Record<FontKey, opentype.Font>; designs: Record<string, DesignParts> }
let resourcePromise: Promise<Resources> | undefined;
async function resources(): Promise<Resources> {
  if (!resourcePromise) resourcePromise = (async () => {
    const fontEntries = await Promise.all(Object.entries({ hand: kalamUrl, sans: sansUrl, bold: boldUrl, condensed: condensedUrl, italic: italicUrl, display: displayUrl }).map(async ([key, url]) => {
      const response = await fetch(url); if (!response.ok) throw new Error('A local font could not be loaded. Reload the app.');
      const font = opentype.parse(await response.arrayBuffer());
      // These Latin fonts contain contextual GSUB lookups unsupported by OpenType.js.
      // Keep each character’s original glyph and GPOS kerning, without optional substitutions.
      delete font.tables.gsub;
      return [key, font] as const;
    }));
    // The artwork URL is fingerprinted with the bundle, so an older offline
    // worker cannot serve a previous layer schema to a newly deployed renderer.
    const designResponse = await fetch(designUrl);
    if (!designResponse.ok) throw new Error('The local design artwork could not be loaded.');
    const designs = await designResponse.json() as Record<string, DesignParts>;
    return { fonts: Object.fromEntries(fontEntries) as Resources['fonts'], designs };
  })().catch(error => { resourcePromise = undefined; throw error; });
  return resourcePromise;
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
  if (project.template === 'list') return renderList(project,fonts,selectedEvents(project),visibleDays(project),dimensions(project));
  const dateFont = localDateFont();
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
  const baseDesign = designs[story ? weekly ? 'story' : 'weekend-story' : project.layout];
  const paint = (value: string) => {
    for (const [token, color] of Object.entries({ '__PAPER__': palette.paper, '__INK__': palette.ink, '__ACCENT__': palette.accent, '__BADGEINK__': palette.badgeInk })) value = value.replaceAll(token,color);
    // Fallback for any retained Figma blend styles; badges use a colour filter.
    return value.replaceAll('mix-blend-mode:plus-darker','mix-blend-mode:multiply');
  };
  // Rebuild the supplied staggered logo lattice from one original vector logo.
  // Repeating complete logos avoids seams and fills any aspect-ratio padding.
  const patternScale = story ? 2.974 : 1;
  let watermark = `<defs><g id="watermark-logo">${paint(designs.weekly.watermark!)}</g></defs><g data-layer="watermark" opacity="0.04" transform="scale(${patternScale})">`;
  for (let column = -5; column <= 7; column++) for (let row = -3; row <= 6; row++) for (const stagger of [false,true]) {
    const x = column*120.54 + row*18.106 + (stagger ? 76.743 : 0);
    const y = column*-11.628 + row*192.384 + (stagger ? 89.664 : 0);
    if (x+186 < -padX/patternScale || x+113 > logicalWidth/patternScale || y+246 < -padY/patternScale || y+164 > logicalCanvasHeight/patternScale) continue;
    watermark += `<use href="#watermark-logo" transform="translate(${x} ${y})"/>`;
  }
  watermark += '</g>';
  // A shared 4% edge margin is measured in canvas coordinates, for every format.
  const headingY = logicalHeight*.04 - (story ? 82.7705 : 28.9775) + project.headingOffset/100*logicalHeight;
  const stampY = logicalHeight*.04 - (story ? 52.145 : 23.613) + project.stampOffset/100*logicalHeight;
  const header = `<g data-layer="heading" transform="translate(0 ${headingY})">${paint(baseDesign.header)}</g>`;
  // Tint the actual embedded paper image, avoiding SVG/canvas blend-mode differences.
  const [red,green,blue] = [1,3,5].map(i=>parseInt(palette.accent.slice(i,i+2),16)/255);
  const matrix = [red,green,blue].map(c=>`${c*.2126} ${c*.7152} ${c*.0722} 0 0`).join(' ');
  const texture = `<filter id="badge-paper-tone" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feComponentTransfer><feFuncR type="linear" slope="2.5" intercept="-1.5"/><feFuncG type="linear" slope="2.5" intercept="-1.5"/><feFuncB type="linear" slope="2.5" intercept="-1.5"/></feComponentTransfer><feColorMatrix type="matrix" values="${matrix} 0 0 0 1 0"/></filter>`;
  const template = watermark + header + paint(baseDesign.defs) + `<defs>${texture}</defs>`;
  const days = visibleDays(project);
  const events = selectedEvents(project);
  const warnings: string[] = [];
  if (!days.length) warnings.push('Choose at least one date with an event to export.');
  const cancelled = events.filter(e => /cancelled|canceled|postponed/i.test(e.status));
  if (cancelled.length) warnings.push(`${cancelled.length} selected event(s) are cancelled or postponed. Remove them before exporting.`);
  const fullDayCount = weekly ? 5 : 2;
  const bodyTop = baseDesign.frames[0].y;
  const bodyBottom = logicalHeight*.96;
  const gap = story ? (weekly ? 38 : 44) : weekly ? 14.75 : 33;
  const flexibleHeight = (bodyBottom - bodyTop - Math.max(0,days.length-1)*gap)/Math.max(1,days.length);
  const rows = days.map((day, i) => {
    const frame = baseDesign.frames[i] || baseDesign.frames[0];
    const x = frame.x, y = bodyTop+i*(flexibleHeight+gap), w = frame.width, h = flexibleHeight;
    const badge = baseDesign.badges[i] || baseDesign.badges[0];
    const left = Math.max(x+14*multiplier,badge.x+badge.width+10*multiplier), right = x + w - 14 * multiplier;
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
    return {day,x,y,w,h,left,right,chunks,entries,frame,badge};
  });
  const pageCount = Math.max(1,...rows.map(r=>r.chunks.length));
  if (pageCount > 10) warnings.push('This selection needs more than 10 slides. Choose fewer events for a readable set.');
  const capacity: DayCapacity[] = rows.map(row=>({day:row.day,events:row.entries.length,slides:row.chunks.length,used:row.chunks[0].reduce((sum,e)=>sum+e.height,0),available:row.h-20*multiplier,typicalLimit:Math.max(1,Math.floor((row.h-20*multiplier)/(36*multiplier*project.textScale)))}));
  const [month, year] = dateStamp(days.length ? days : daysFor(project.week,project.layout));
  const pages = Array.from({ length: pageCount }, (_, page) => {
    let content = '';
    const stampX = (story ? 861 : 371), stampBaseline = (story ? 185 : 66);
    const stampScale = story ? 2.9 : 1;
    content += `<g data-layer="month-stamp" aria-label="${escape(`${month} ${year}`)}" transform="translate(0 ${stampY})">`;
    // October 2026 uses the exact supplied Salted outlines, including its contour.
    if (month === 'OCT' && year === '2026') content += paint(baseDesign.stamp);
    else {
      const font = dateFont?.font || fonts.hand;
      content += textPath(font, month, stampX, stampBaseline+(dateFont ? 10*stampScale : 0), (dateFont ? 45 : 33)*stampScale, palette.badgeInk, 78*stampScale, true, palette.accent, (dateFont ? 43.69 : 21.8453)*stampScale);
      content += textPath(font, year, stampX-stampScale, stampBaseline+37*stampScale+(dateFont ? 10*stampScale : 0), (dateFont ? 43 : 34)*stampScale, palette.badgeInk, 78*stampScale, true, palette.accent, (dateFont ? 43.69 : 21.8453)*stampScale);
    }
    content += '</g>';
    let eventCount = 0;
    rows.forEach((row, index) => {
      content += `<rect data-day="${row.day}" x="${row.x}" y="${row.y}" width="${row.w}" height="${row.h}" rx="${row.frame.rx}" fill="${palette.paper}" stroke="${palette.accent}" stroke-width="${row.frame['stroke-width']}" stroke-dasharray="${row.frame['stroke-width']*3.333} ${row.frame['stroke-width']*3.333}"/>`;
      const badgeH = row.badge.height*project.badgeHeight;
      const badgeTop = story && !weekly ? row.y+(row.badge.y-row.frame.y)-(badgeH-row.badge.height)/2 : row.y+(row.h-badgeH)/2;
      content += `<g data-day-badge="${row.day}" transform="translate(${row.badge.x} ${badgeTop}) scale(1 ${project.badgeHeight})">${paint(row.badge.artwork)}</g>`;
      const badgeX = row.badge.x+row.badge.width/2;
      const badgeY = badgeTop+badgeH/2-3*multiplier;
      const badgeSize = (weekly ? 16 : 24)*multiplier;
      content += textPath(fonts.condensed,dayLabel(row.day).toUpperCase(),badgeX,badgeY,badgeSize,palette.badgeInk,row.badge.width*.8,true);
      content += textPath(fonts.condensed,String(Number(row.day.slice(8))),badgeX,badgeY+badgeSize*1.1,badgeSize,palette.badgeInk,row.badge.width*.7,true);
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
  return `${project.layout === 'weekend' ? 'This weekend' : 'This week'} at a glance 🌲\n\n${days.map(day => {
    const items = events.filter(e => eventOnDay(e, day, project.timezone));
    return items.length ? `${dayLabel(day, 'long')}, ${day}\n${items.map(e => { const edit = project.edits[e.id] || {}; return `• ${(edit.showTitle ?? project.showTitle) ? edit.title ?? e.title : 'Event'}\n  ${(edit.showTime ?? project.showTime) ? edit.timeLabel ?? formatTime(e, day, project.timezone) : ''}${(edit.showLocation ?? project.showLocation) && (edit.location ?? e.location) ? ` · ${edit.location ?? e.location}` : ''}${e.url ? `\n  ${e.url}` : ''}`; }).join('\n')}` : '';
  }).filter(Boolean).join('\n\n')}\n\nTimes: ${project.timezone}. Check event links for the latest details.\n#OverTheEdge #UNBC #PrinceGeorge`;
}
export async function exportPages(project: Project, result: RenderResult, type: 'png' | 'jpeg' | 'svg', all: boolean, currentPage: number): Promise<void> {
  if (result.warnings.length) throw new Error('Resolve the layout warnings before exporting.');
  if (!result.count) throw new Error('Select an event before exporting.');
  const pages = all ? result.pages : [result.pages[currentPage]];
  const base = `ote-${project.template}-${project.layout}-${project.week}-${project.palette}`;
  const blobs = await Promise.all(pages.map(async p => ({ name: `${base}-${String(p.number).padStart(2,'0')}.${type === 'jpeg' ? 'jpg' : type}`, blob: type === 'svg' ? new Blob([p.svg], { type: 'image/svg+xml' }) : await rasterize(p,type) })));
  if (all) {
    const zip = new JSZip(); for (const {name,blob} of blobs) zip.file(name,blob);
    zip.file('caption.txt',caption(project));
    download(await zip.generateAsync({ type: 'blob' }),`${base}.zip`);
  } else download(blobs[0].blob,blobs[0].name);
}
