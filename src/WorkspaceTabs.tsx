import { useEffect, useRef, useSyncExternalStore } from 'react';
import { CalendarDays, Download, Image, SlidersHorizontal } from 'lucide-react';
import type { KeyboardEvent } from 'react';

const compactQuery = '(max-width: 760px), (max-width: 1000px) and (max-height: 500px)';
const compactScreen = () => window.matchMedia(compactQuery).matches;
const subscribe = (listener: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
export function useCompactScreen() {
  const compact = useSyncExternalStore(subscribe, compactScreen, () => false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!compact || !viewport) return;
    const resize = () => {
      if (viewport.scale !== 1) return;
      document.documentElement.style.setProperty('--visual-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--visual-top', `${viewport.offsetTop}px`);
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
      document.documentElement.style.removeProperty('--visual-height');
      document.documentElement.style.removeProperty('--visual-top');
    };
  }, [compact]);
  return compact;
}

const tabs = [
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'design', label: 'Design', icon: SlidersHorizontal },
  { id: 'preview', label: 'Preview', icon: Image },
  { id: 'export', label: 'Export', icon: Download },
] as const;
export type WorkspaceTab = typeof tabs[number]['id'];

export function WorkspaceTabs({ active, onChange, count }: { active: WorkspaceTab; onChange: (tab: WorkspaceTab) => void; count: number }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function navigate(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
    buttons.current[next]?.focus();
  }
  return <nav className="mobile-tabs" role="tablist" aria-label="Studio workspace">
    {tabs.map(({ id, label, icon: Icon }, index) => <button
      key={id} id={`tab-${id}`} type="button" role="tab"
      ref={button => { buttons.current[index] = button; }}
      aria-selected={active === id} aria-controls={`panel-${id}`}
      tabIndex={active === id ? 0 : -1} className={active === id ? 'active' : ''}
      onClick={() => onChange(id)} onKeyDown={event => navigate(event, index)}
    ><span className="tab-icon"><Icon size={20}/>{id === 'events' && count > 0 && <span className="tab-count" aria-hidden="true">{count}</span>}</span><span>{label}</span></button>)}
  </nav>;
}
