import type { CalendarEvent, EventEdit } from './types';

// Use the venue or a direct meeting URL, rather than incidental mentions in a description.
export function isTeamsEvent(event: CalendarEvent, edit?: EventEdit): boolean {
  const venues = [event.location, edit?.location].filter((value): value is string => typeof value === 'string');
  return venues.some(location => isTeamsVenue(location)) || isTeamsUrl(event.url);
}
const isTeamsUrl = (value: string) => /\bteams\.(?:microsoft\.com|live\.com|cloud\.microsoft)(?:[/:?#\s]|$)/i.test(value);
function isTeamsVenue(location: string): boolean {
  const venue = location.normalize('NFKC').trim();
  const namedVenue = /\b(?:microsoft[\s_-]*teams|ms\.?[\s_-]*teams)\b/i.test(venue);
  const shortVenue = /^(?:(?:online|virtual)\s*(?:[-:–—]|via)?\s*|(?:via|on)\s+)?teams(?:\s+(?:meeting|online))?(?:\s*\((?:online|virtual)\))?$/i.test(venue);
  return namedVenue || shortVenue || isTeamsUrl(venue);
}
