import type * as opentype from 'opentype.js';
import type { CalendarEvent, Palette, Project } from './types';
import type { RenderedPage } from './render';
import { PALETTES } from './types';
import { eventOnDay, formatTime, readableDay } from './dates';
import { escape, fontForText, textPath, wrap } from './vector-text';
import paperUrl from './assets/daily-paper.jpg?inline';
import tapeUrl from './assets/daily-tape.png?inline';

type Fonts = Record<'hand' | 'sans' | 'bold' | 'display', opentype.Font>;
export interface DailyDay { day: string; events: CalendarEvent[]; pages: RenderedPage[]; warnings: string[] }
export const DAILY_SIZE = { width: 1080, height: 1920 };
const coverBorder = 'M-15 6 63 127 134 -17 M170 -12 168 77 324 -14 M369 -14 318 73 488 -11 M517 -12 Q469 49 483 60 L648 -12 M658 -10 608 54 794 -13 M908 -12 840 55 Q978 25 1100 16 M1098 60 1004 136 1096 302 M1092 385 1028 352 1095 524 M1094 670 1026 596 1091 812 M1092 899 Q1008 794 1018 819 L1099 1090 M1095 1162 1044 1119 1094 1292 M1097 1358 1005 1301 1092 1483 M1095 1570 1018 1547 1096 1755 M1095 1766 1016 1706 1097 1916 M1096 1928 1012 1794 Q1002 1830 951 1935 M910 1935 914 1841 758 1937 M720 1933 763 1846 Q666 1913 587 1938 M564 1929 Q610 1867 591 1859 L434 1929 M388 1933 471 1867 260 1931 M157 1936 244 1851 Q102 1894 -16 1897 M-16 1859 83 1793 -13 1625 M-14 1533 73 1622 -11 1376 M-11 1263 87 1404 -12 1080 M-14 992 Q116 1112 110 1098 L-13 816 M-12 762 70 810 -13 624 M-12 569 75 622 -11 427 M-13 361 46 419 -14 182 M-10 151 61 211 -13 -6';
// Page 12 of Golden Age Social.pdf, scaled from 810 × 1440 to Story dimensions.
const titleCard = { x: 117, y: 303.25, width: 642, minHeight: 312, angle: -3.26 };
const tapeArtwork = `<defs><image id="daily-tape" href="${tapeUrl}" width="126" height="327"/></defs>`;
const paperTape = '<use href="#daily-tape" transform="matrix(-.4087 .17463 -.17423 -.40776 984.47 625.99)"/>'
  + '<use href="#daily-tape" transform="matrix(.25857 .39039 -.38753 .25669 902.51 1584.76)"/>';
// This strip is relative to the tilted title card so it stays on the corner as the title grows.
const titleTape = '<use href="#daily-tape" transform="matrix(.17598 .30162 -.30376 .17723 74.91 -14.61)"/>';
const coverLines = ['WHAT IS HAPPENING', 'IN PRINCE GEORGE', 'TODAY?'];
const paperOutline = 'M239.04 492.81 972.01 531.74 910.91 1682.12 177.94 1643.19Z';

const rgb = (hex: string) => {
  const value = /^#?([\da-f]{6})$/i.exec(hex.trim())?.[1] ?? '808080';
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
};
const mix = (from: string, to: string, amount: number) => '#' + rgb(from)
  .map((channel, i) => Math.round(channel + (rgb(to)[i] - channel) * amount).toString(16).padStart(2, '0')).join('').toUpperCase();
const luminance = (hex: string) => rgb(hex).reduce((sum, channel, i) => {
  const c = channel / 255;
  return sum + [.2126, .7152, .0722][i] * (c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
}, 0);

/** The taped paper sheet must read as a separate object on every background, including custom palettes. */
export function dailyPaperTone(paletteKey: string, palette: Palette): { fill: string; dark: boolean } {
  // The original artwork places sage paper on the cream background.
  if (paletteKey === 'cream') return { fill: PALETTES.sage.paper, dark: false };
  const dark = luminance(palette.paper) < .22;
  // Light backgrounds take a deeper tint of their accent, like the original sage-on-cream sheet.
  // Dark backgrounds take a lighter tone toward the text colour so light text stays readable.
  return { fill: dark ? mix(palette.paper, palette.ink, .14) : mix(palette.paper, palette.accent, .16), dark };
}

export function renderDaily(project: Project, fonts: Fonts, events: CalendarEvent[], days: string[], lettering?: opentype.Font): DailyDay[] {
  const { width: w, height: h } = DAILY_SIZE;
  const palette = project.palette === 'custom' ? project.customPalette : PALETTES[project.palette];
  const paperTone = dailyPaperTone(project.palette, palette);
  const textScale = project.textScale;
  const dateLabel = (day: string) => readableDay(day, { month: 'long', year: 'numeric' }).toUpperCase();
  const coverFont = fontForText(lettering, fonts.hand, coverLines.join(' '));
  const coverHeading = coverLines.map((line, i) => textPath(coverFont, line, w / 2, 740 + i * 101, 76, palette.accent, 790, true)).join('');
  const logo = textPath(fonts.display, 'OVER THE EDGE', 0, 0, 98, project.palette === 'cream' ? '#81AE50' : palette.accent);
  let watermark = `<defs><g id="daily-logo">${logo}</g></defs><g data-layer="watermark" opacity=".12" transform="rotate(-5 540 960)">`;
  for (let row = -1; row <= 10; row++) for (let col = -2; col <= 2; col++) {
    watermark += `<use href="#daily-logo" transform="translate(${col * 640 + (row % 2 ? 310 : 0)} ${row * 230})"/>`;
  }
  watermark += '</g>';
  // Crease shading darkens the sheet; dark sheets also get lifted highlights so the crumple stays visible.
  const texture = (id: string, values: string, opacity: number) =>
    `<filter id="${id}"><feColorMatrix values="${values}"/></filter><image href="${paperUrl}" x="175" y="450" width="805" height="1235" preserveAspectRatio="none" filter="url(#${id})" opacity="${opacity}"/>`;
  const shade = texture('daily-texture', '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.2126 -.7152 -.0722 0 1', paperTone.dark ? .2 : .11);
  const highlight = paperTone.dark ? texture('daily-texture-light', '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .2126 .7152 .0722 0 -.35', .14) : '';
  const paper = `<defs><clipPath id="daily-paper"><path d="${paperOutline}"/></clipPath><filter id="daily-paper-shadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter></defs>`
    + `<path data-layer="paper-shadow" d="${paperOutline}" transform="translate(10 16)" fill="#000" opacity="${paperTone.dark ? .4 : .2}" filter="url(#daily-paper-shadow)"/>`
    + `<g data-layer="paper" clip-path="url(#daily-paper)"><rect x="175" y="450" width="805" height="1235" fill="${paperTone.fill}"/>${shade}${highlight}</g>`;
  const svg = (title: string, content: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${escape(title)}</title><rect width="${w}" height="${h}" fill="${palette.paper}"/>${content}</svg>`;
  const bodyX = 265, bodyWidth = 600, bodyBottom = 1510;

  return days.flatMap(day => {
    const items = events.filter(event => eventOnDay(event, day, project.timezone));
    if (!items.length) return [];
    const total = items.length + 1, date = dateLabel(day), warnings: string[] = [];
    const dateFont = fontForText(lettering, fonts.bold, date);
    const dateMark = (x: number, y: number, size: number, maxWidth: number, center = false) =>
      `<g data-layer="date" aria-label="${escape(date)}">${textPath(dateFont, date, x, y, size, palette.ink, maxWidth, center)}</g>`;
    const cover = `<path data-layer="border" d="${coverBorder}" fill="none" stroke="${palette.accent}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`
      + dateMark(w / 2, 630, 37, 750, true)
      + `<g data-layer="heading">${coverHeading}</g>`
      + `<path d="M519 1282h39m-13-12 13 12-13 12" stroke="${palette.ink}" fill="none" stroke-width="4" stroke-linecap="round"/>`
      + textPath(fonts.sans, 'OVER THE EDGE PRESENTS', w / 2, 1330, 26, palette.ink, 620, true)
      + `<path d="M314 1444h452" stroke="${palette.ink}" stroke-width="3" stroke-dasharray="9 5"/>`;
    const pages: RenderedPage[] = [{ ...DAILY_SIZE, svg: svg(`Daily cover · ${date}`, cover), number: 1, total, eventCount: 0 }];

    items.forEach((event, index) => {
      const edit = project.edits[event.id] || {};
      const name = edit.title ?? event.title;
      const title = (edit.showTitle ?? project.showTitle) ? name : '';
      const titleFont = fontForText(lettering, fonts.display, title);
      const time = (edit.showTime ?? project.dailyShowTime) ? edit.timeLabel ?? formatTime(event, day, project.timezone) : '';
      const location = (edit.showLocation ?? project.showLocation) ? edit.location ?? event.location : '';
      const description = (edit.showDescription ?? project.dailyShowDescription) ? edit.description ?? event.description : '';
      const details = [time, location].filter(Boolean).join(' · ');
      if (/cancelled|canceled|postponed/i.test(event.status)) warnings.push(`“${name}” is cancelled or postponed. Remove it before exporting.`);
      if (![title, details, description].some(text => text.trim())) warnings.push(`“${event.title}” has every daily field hidden. Enable a field or deselect this event.`);
      const missingGlyph = (text: string, font: opentype.Font) =>
        [...text.replace(/\s+/g, ' ')].some(char => !font.hasChar(char));
      if (missingGlyph(title, titleFont) || missingGlyph(details + description, fonts.sans)) {
        warnings.push(`“${name}” contains a symbol the daily export font cannot draw. Replace it in the event editor.`);
      }

      let titleSize = Math.round(72 * textScale), titleLines = wrap(titleFont, title, titleSize, 570);
      while (titleSize > 35 && titleLines.length * titleSize * 1.08 > 254) {
        titleSize = Math.max(35, titleSize - 3);
        titleLines = wrap(titleFont, title, titleSize, 570);
      }
      const titleLeading = titleSize * 1.08;
      const maxTitleLines = Math.floor(254 / titleLeading);
      if (titleLines.length > maxTitleLines) {
        warnings.push(`“${name}” needs a shorter title for its daily slide.`);
        titleLines = titleLines.slice(0, maxTitleLines);
      }
      const titleHeight = Math.max(titleCard.minHeight, titleLines.length * titleLeading + 62);
      const titleBottom = titleCard.y + titleHeight;
      let content = watermark + paper + tapeArtwork + paperTape;
      if (titleLines.length) {
        const panel = `<rect width="${titleCard.width}" height="${titleHeight}"`;
        const firstBaseline = (titleHeight - titleLines.length * titleLeading) / 2 + titleSize * .82;
        content += `<g data-layer="event-title" aria-label="${escape(title)}" transform="translate(${titleCard.x} ${titleCard.y}) rotate(${titleCard.angle})">`
          + `${panel} fill="${palette.accent}"/><defs><clipPath id="daily-title">${panel}/></clipPath></defs><g clip-path="url(#daily-title)">`
          + titleLines.map((line, i) => textPath(titleFont, line, titleCard.width / 2, firstBaseline + i * titleLeading, titleSize, palette.badgeInk, 570, true)).join('')
          + `</g>${titleTape}</g>`;
      }
      let y = Math.max(650, titleLines.length ? titleBottom + 68 : 0);
      content += dateMark(bodyX, y, 34, bodyWidth);
      const detailSize = 35 * textScale, detailLeading = detailSize * 1.22;
      const detailLines = wrap(fonts.sans, details, detailSize, bodyWidth);
      let bodySize = Math.round(39 * textScale), bodyLines = wrap(fonts.sans, description, bodySize, bodyWidth);
      const bodyTop = y + detailLines.length * detailLeading + 88;
      while (bodySize > 27 && bodyTop + bodyLines.length * bodySize * 1.28 > bodyBottom) {
        bodySize = Math.max(27, bodySize - 2);
        bodyLines = wrap(fonts.sans, description, bodySize, bodyWidth);
      }
      if (bodyTop + bodyLines.length * bodySize * 1.28 > bodyBottom) warnings.push(`“${name}” needs shorter details for its daily slide. Shorten or hide the description, or reduce the text size.`);
      content += `<defs><clipPath id="daily-content"><rect x="${bodyX - 5}" y="${y + 6}" width="${bodyWidth + 10}" height="${bodyBottom - y}"/></clipPath></defs><g clip-path="url(#daily-content)">`;
      for (const line of detailLines.slice(0, Math.floor((bodyBottom - y) / detailLeading))) {
        y += detailLeading;
        content += textPath(fonts.sans, line, bodyX, y, detailSize, palette.ink, bodyWidth);
      }
      if (bodyLines.length) {
        content += `<path d="M${bodyX} ${y + 27}h${bodyWidth}" stroke="${palette.ink}" stroke-width="2" stroke-dasharray="8 8"/>`;
        bodyLines.slice(0, Math.max(0, Math.floor((bodyBottom - bodyTop) / (bodySize * 1.28)))).forEach((line, i) => {
          content += textPath(fonts.sans, line, bodyX, bodyTop + i * bodySize * 1.28, bodySize, palette.ink, bodyWidth);
        });
      }
      content += `</g><path d="M${bodyX} 1530h${bodyWidth}" stroke="${palette.ink}" stroke-width="2" stroke-dasharray="8 8"/>`;
      pages.push({ ...DAILY_SIZE, svg: svg(`${title || 'Daily event'} · ${date}`, `<g data-event-id="${escape(event.id)}">${content}</g>`), number: index + 2, total, eventCount: 1 });
    });
    return [{ day, events: items, pages, warnings: [...new Set(warnings)] }];
  });
}
