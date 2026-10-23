import { DEFAULT_SOURCE, PALETTES } from './types';
import type { Project, CalendarEvent, EventEdit } from './types';
import { dateKey, monday, validDay, TIMEZONE } from './dates';
import { safeUrl } from './api';
export const STORAGE_KEY = 'ote-media-studio-v1';
export function newProject(): Project {
  return { version: 1, week: monday(dateKey(new Date())), layout: 'weekly', format: 'portrait', palette: 'cream', customPalette: { ...PALETTES.cream, name: 'Custom' }, source: { ...DEFAULT_SOURCE }, events: [], manualEvents: [], selected: [], edits: {}, fetchedAt: null, fetchedRange: '', showLocation: true, showDescription: false, textScale: 1, timezone: TIMEZONE, skippedDays: [], hideEmptyDays: false, showTime: true, showTitle: true, headingOffset: 0, stampOffset: 0, badgeHeight: 1.2 };
}
function validEvents(data: unknown): data is CalendarEvent[] {
  return Array.isArray(data) && data.length <= 10000 && data.every(e => e && ['id','sourceId','title','description','start','end','location','category','url','status','cost'].every(k => typeof e[k] === 'string') && typeof e.allDay === 'boolean' && (e.origin === undefined || typeof e.origin === 'string') && (e.labels === undefined || Array.isArray(e.labels) && e.labels.every((label: unknown) => typeof label === 'string')) && Number.isFinite(Date.parse(e.start)) && Number.isFinite(Date.parse(e.end)) && Date.parse(e.end) >= Date.parse(e.start));
}
export function parseProject(data: unknown): Project {
  const p = data as Project;
  if (p && p.version === 1) { p.skippedDays ??= []; p.hideEmptyDays ??= false; p.showTime ??= true; p.showTitle ??= true; p.headingOffset ??= 0; p.stampOffset ??= 0; p.badgeHeight ??= 1.2; }
  if (!p || p.version !== 1 || !validDay(p.week) || !['weekly','weekend'].includes(p.layout) || !['portrait','story','original'].includes(p.format)
    || typeof p.palette !== 'string' || ![...Object.keys(PALETTES),'custom'].includes(p.palette) || !p.customPalette || !['paper','ink','accent','badgeInk'].every(k => /^#[0-9a-f]{6}$/i.test(p.customPalette[k as keyof typeof p.customPalette]))
    || !p.source || !['unbc','tribe','json'].includes(p.source.provider) || !safeUrl(p.source.url) || typeof p.source.name !== 'string' || typeof p.source.id !== 'string'
    || !validEvents(p.events) || !validEvents(p.manualEvents) || !Array.isArray(p.selected) || !p.selected.every(x => typeof x === 'string')
    || typeof p.showLocation !== 'boolean' || typeof p.showDescription !== 'boolean' || typeof p.textScale !== 'number' || p.textScale < 0.75 || p.textScale > 1.4
    || !Array.isArray(p.skippedDays) || !p.skippedDays.every(validDay) || typeof p.hideEmptyDays !== 'boolean' || typeof p.showTime !== 'boolean' || typeof p.showTitle !== 'boolean'
    || ![p.headingOffset,p.stampOffset].every(n => Number.isFinite(n) && n >= -2 && n <= 1) || !Number.isFinite(p.badgeHeight) || p.badgeHeight < 1 || p.badgeHeight > 1.5
    || typeof p.timezone !== 'string' || typeof p.fetchedRange !== 'string' || !(p.fetchedAt === null || typeof p.fetchedAt === 'string' && Number.isFinite(Date.parse(p.fetchedAt)))
    || !p.edits || typeof p.edits !== 'object' || Array.isArray(p.edits)) throw new Error('This is not a valid Media Studio project file.');
  try { new Intl.DateTimeFormat('en', { timeZone: p.timezone }); } catch { throw new Error('Project contains an invalid time zone.'); }
  const edits: Record<string, EventEdit> = {};
  for (const [id, edit] of Object.entries(p.edits)) {
    if (!edit || typeof edit !== 'object' || ['title','description','location','timeLabel'].some(k => edit[k as keyof EventEdit] !== undefined && typeof edit[k as keyof EventEdit] !== 'string') || ['showDescription','showTitle','showTime','showLocation'].some(k => edit[k as keyof EventEdit] !== undefined && typeof edit[k as keyof EventEdit] !== 'boolean')) throw new Error('Project contains invalid event edits.');
    edits[id] = { title: edit.title, description: edit.description, location: edit.location, timeLabel: edit.timeLabel, showDescription: edit.showDescription, showTitle: edit.showTitle, showTime: edit.showTime, showLocation: edit.showLocation };
  }
  return { ...newProject(), ...p, week: monday(p.week), edits, selected: [...new Set(p.selected)] };
}
export function loadProject(): Project {
  try { const saved = localStorage.getItem(STORAGE_KEY); return saved ? parseProject(JSON.parse(saved)) : newProject(); } catch { return newProject(); }
}
