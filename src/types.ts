export type Layout = 'weekly' | 'weekend' | 'full-week';
export type Template = 'cards' | 'list';
export type Format = 'portrait' | 'story' | 'original';
export type Provider = 'unbc' | 'tribe' | 'json';
export interface Source { id: string; name: string; url: string; provider: Provider }
export interface CalendarEvent {
  id: string; sourceId: string; title: string; description: string;
  start: string; end: string; allDay: boolean; location: string; category: string;
  url: string; status: string; cost: string; manual?: boolean; origin?: string; labels?: string[];
}
export interface EventEdit { title?: string; description?: string; location?: string; timeLabel?: string; showDescription?: boolean; showTitle?: boolean; showTime?: boolean; showLocation?: boolean }
export interface Palette { name: string; paper: string; ink: string; accent: string; badgeInk: string }
export interface Project {
  version: 1; week: string; layout: Layout; template: Template; format: Format; palette: string;
  customPalette: Palette; source: Source; events: CalendarEvent[]; manualEvents: CalendarEvent[];
  selected: string[]; edits: Record<string, EventEdit>; fetchedAt: string | null; fetchedRange: string;
  showLocation: boolean; showDescription: boolean; textScale: number; timezone: string;
  skippedDays: string[]; hideEmptyDays: boolean; showTime: boolean; showTitle: boolean;
  headingOffset: number; stampOffset: number; badgeHeight: number;
}
export const DEFAULT_SOURCE: Source = { id: 'ote', name: 'Over the Edge', url: 'https://overtheedge.unbc.ca/wp-json/unbc-events/v1/events/', provider: 'unbc' };
export const PALETTES: Record<string, Palette> = {
  cream: { name: 'Paper', paper: '#FFFBF3', ink: '#262626', accent: '#155329', badgeInk: '#FFFFFF' },
  sage: { name: 'Sage', paper: '#E3EFCF', ink: '#262626', accent: '#155329', badgeInk: '#FFFFFF' },
  forest: { name: 'Forest', paper: '#155329', ink: '#FFFBF3', accent: '#E3EFCF', badgeInk: '#262626' },
  rose: { name: 'Rose', paper: '#F5E4E1', ink: '#392C33', accent: '#8B394A', badgeInk: '#FFFBF3' },
  blue: { name: 'Blue', paper: '#E5EDF4', ink: '#253746', accent: '#284C72', badgeInk: '#FFFBF3' },
};
