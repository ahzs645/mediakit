import type { CalendarEvent, Layout } from './types';
export const TIMEZONE = 'America/Vancouver';
export function dateKey(value: Date | string, timezone = TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}
export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}
export function monday(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); return addDays(day, -(weekday + 6) % 7);
}
export function daysFor(week: string, layout: Layout): string[] {
  return Array.from({ length: layout === 'weekly' ? 5 : 2 }, (_, i) => addDays(week, i + (layout === 'weekend' ? 5 : 0)));
}
export function dayLabel(day: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: style }).format(new Date(`${day}T12:00:00Z`));
}
export function readableDay(day: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric', ...options }).format(new Date(`${day}T12:00:00Z`));
}
export function rangeLabel(days: string[]): string {
  const start = days[0], end = days.at(-1)!;
  if (start === end) return readableDay(start, { year: 'numeric' });
  const sameYear = start.slice(0, 4) === end.slice(0, 4), sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${readableDay(start, sameYear ? {} : { year: 'numeric' })} – ${sameMonth ? Number(end.slice(8)) : readableDay(end)}, ${end.slice(0, 4)}`;
}
export function dateStamp(days: string[]): [string, string] {
  const first = days[0], last = days.at(-1)!;
  const month = (d: string) => readableDay(d, { month: 'short', day: undefined }).toUpperCase();
  return [first.slice(0, 7) === last.slice(0, 7) ? month(first) : `${month(first)}/${month(last)}`,
    first.slice(0, 4) === last.slice(0, 4) ? first.slice(0, 4) : `${first.slice(2, 4)}/${last.slice(2, 4)}`];
}
export function eventOnDay(event: CalendarEvent, day: string, timezone = TIMEZONE): boolean {
  const start = dateKey(event.start, timezone);
  // End timestamps are exclusive at midnight, including all-day and multiday events.
  const end = dateKey(new Date(Math.max(Date.parse(event.start), Date.parse(event.end) - 1)), timezone);
  return start <= day && end >= day;
}
export function formatTime(event: CalendarEvent, day?: string, timezone = TIMEZONE): string {
  if (event.allDay) return 'All day';
  const time = (s: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(s)).replace(':00', '').replace(/\s?a\.?m\.?/i, 'am').replace(/\s?p\.?m\.?/i, 'pm');
  const startDay = dateKey(event.start, timezone), endDay = dateKey(new Date(Math.max(Date.parse(event.start), Date.parse(event.end) - 1)), timezone);
  if (startDay !== endDay) {
    if (day && day !== startDay && day !== endDay) return 'Ongoing';
    if (day && day !== startDay) return `Until ${time(event.end)}`;
    return `${time(event.start)} · continues`;
  }
  return event.start === event.end ? time(event.start) : `${time(event.start)}–${time(event.end)}`;
}
export function localToIso(day: string, time: string, timezone = TIMEZONE): string {
  const target = Date.parse(`${day}T${time}:00Z`); let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    instant += target - local;
  }
  const result = new Date(instant).toISOString();
  const actual = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(result));
  if (dateKey(result, timezone) !== day || actual !== time) throw new Error('That local time does not exist because of a daylight-saving clock change. Choose another time.');
  return result;
}
