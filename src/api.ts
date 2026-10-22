import type { CalendarEvent, Source } from './types';
import { addDays } from './dates';
export function cleanText(input: unknown): string {
  if (typeof input !== 'string') return '';
  let text = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\[\/?[a-zA-Z_][^\]\n]*\]/g, '').replace(/<\/(p|div|li|h\d)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '');
  if (typeof DOMParser !== 'undefined') text = new DOMParser().parseFromString(text, 'text/html').body.textContent || '';
  else text = text.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 12000);
}
export function safeUrl(input: unknown): string {
  try { const url = new URL(String(input)); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
type Raw = Record<string, any>;
export function normalizeEvent(raw: Raw, metadata: Raw, source: Source): CalendarEvent | null {
  const tribe = source.provider === 'tribe';
  const title = cleanText(typeof raw.title === 'object' ? raw.title?.rendered : raw.title);
  const start = tribe ? raw.utc_start_date?.replace(' ', 'T') + 'Z' : raw.startDate || raw.start;
  const end = (tribe ? raw.utc_end_date?.replace(' ', 'T') + 'Z' : raw.endDate || raw.end) || start;
  if (!title || !start || !['string','number'].includes(typeof raw.id) || typeof start !== 'string' || typeof end !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(start) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(end) || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) < Date.parse(start) || raw.id == null) return null;
  return { id: `${source.id}:${raw.id}`, sourceId: source.id, title, description: cleanText(raw.description), start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    allDay: Boolean(raw.isAllDay ?? raw.all_day ?? raw.allDay ?? metadata.isAllDay),
    location: cleanText(tribe ? raw.venue?.venue : metadata.location ?? raw.location),
    category: cleanText(metadata.categories?.[0]?.name || metadata.category || raw.categories?.[0]?.name || raw.category || 'Events'),
    origin: raw.manual ? 'Your events' : (() => { try { return new URL(safeUrl(metadata.website || raw.website || raw.url) || source.url).hostname.replace(/^www\./,''); } catch { return source.name; } })(),
    labels: (metadata.categories || raw.categories || []).map((c: Raw) => cleanText(c.name)).filter(Boolean),
    url: safeUrl(metadata.permalink || metadata.website || raw.url), status: cleanText(metadata.status || raw.status || 'scheduled'), cost: cleanText(metadata.cost || raw.cost) };
}
export interface FetchResult { events: CalendarEvent[]; skipped: number; pages: number }
export async function fetchEvents(source: Source, week: string, signal?: AbortSignal): Promise<FetchResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Reconnect to refresh the calendar.');
  if (!safeUrl(source.url)) throw new Error('Enter a valid https:// or http:// API endpoint.');
  const collected = new Map<string, CalendarEvent>(); let skipped = 0, page = 1; const visited = new Set<number>();
  while (page <= 100) {
    if (visited.has(page)) throw new Error('The API returned a repeated page. Import stopped to avoid incomplete results.');
    visited.add(page);
    const url = new URL(source.url);
    url.searchParams.set('start_date', week); url.searchParams.set('end_date', addDays(week, 6));
    url.searchParams.set('per_page', '100'); url.searchParams.set('page', String(page));
    const response = await fetch(url, { signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Calendar returned HTTP ${response.status}. Check the API endpoint or try again.`);
    const data: unknown = await response.json();
    const body = data as Raw; const rows = Array.isArray(data) ? data : body.events;
    if (!Array.isArray(rows)) throw new Error('This endpoint did not return events. Choose the matching API type or import a JSON file.');
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') { skipped++; continue; }
      const event = normalizeEvent(raw, body.eventMetadata?.[String(raw.id)] || {}, source);
      if (event) collected.set(event.id, event); else skipped++;
    }
    const totalPages = Number(body.pages ?? body.total_pages ?? response.headers.get('X-WP-TotalPages')) || 0;
    const hasMore = body.pagination?.hasMore ?? (totalPages ? page < totalPages : rows.length === 100);
    if (!hasMore || source.provider === 'json' && !totalPages && !body.pagination) return { events: [...collected.values()], skipped, pages: visited.size };
    page = Number(body.pagination?.nextPage) || page + 1;
  }
  throw new Error('The calendar exceeded 100 pages. Narrow its feed before importing.');
}
export function simplifyText(value: string): string {
  const text = cleanText(value); const sentence = text.match(/^.{1,210}?[.!?](?:\s|$)/)?.[0]?.trim();
  if (sentence) return sentence;
  if (text.length <= 160) return text;
  return text.slice(0, 157).replace(/\s+\S*$/, '') + '…';
}
