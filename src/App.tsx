import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, FormEvent, CSSProperties } from 'react';
import { ArrowUpRight, ArrowLeft, CalendarDays, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy, Download, ExternalLink, FolderOpen, Laptop, Link2, ListFilter, LoaderCircle, MapPin, Monitor, Palette as PaletteIcon, Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, X, ZoomIn, AlertTriangle, MoreHorizontal } from 'lucide-react';
import type { CalendarEvent, EventEdit, Palette, Project, Source } from './types';
import { PALETTES } from './types';
import { addDays, dateKey, daysFor, dayLabel, eventOnDay, formatTime, localToIso, monday, rangeLabel, readableDay } from './dates';
import { cleanText, fetchEvents, safeUrl, simplifyText } from './api';
import { loadProject, parseProject, STORAGE_KEY } from './storage';
import { caption, dimensions, download, exportPages, renderProject, selectedEvents, svgUrl } from './render';
import type { RenderResult } from './render';
import { localDateFont, importDateFont, clearDateFont } from './date-font';
import { WorkspaceTabs, useCompactScreen } from './WorkspaceTabs';
import type { WorkspaceTab } from './WorkspaceTabs';
import { ExportOptions } from './ExportOptions';
import type { ExportType } from './ExportOptions';
import { isTeamsEvent } from './event-filters';

function Button({ children, onClick, className = '', disabled = false, title, type = 'button' }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; title?: string; type?: 'button' | 'submit' }) {
  return <button type={type} onClick={onClick} className={`button ${className}`} disabled={disabled} title={title}>{children}</button>;
}
function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const container = ref.current!;
    const getFocusable = () => Array.from(container.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]')).filter(e => !e.hasAttribute('disabled') && e.offsetParent !== null);
    getFocusable()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const items = getFocusable(), first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown',handle); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown',handle); document.body.style.overflow = overflow; before?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
const cancelled = (e: CalendarEvent) => /cancelled|canceled|postponed/i.test(e.status);
const sourceRange = (p: Project) => `${p.source.id}:${p.source.url}:${p.source.provider}:${p.week}`;

export default function App() {
  const [project, setProject] = useState<Project>(loadProject);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [originFilter,setOriginFilter] = useState('All');
  const [dayFocus,setDayFocus] = useState('all');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [syncNote, setSyncNote] = useState('');
  const [result, setResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState('');
  const [rendering, setRendering] = useState(true);
  const [page, setPage] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const [modal, setModal] = useState<'source'|'manual'|'export'|'help'|'preview'|'project'|'week'|null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [toast, setToast] = useState('');
  const [saveError, setSaveError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<ExportType>('png');
  const [mobileTab, setMobileTab] = useState<WorkspaceTab>('events');
  const compact = useCompactScreen();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFontName,setDateFontName] = useState(()=>localDateFont()?.name || '');
  const [fontRevision,setFontRevision] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
  const fontRef = useRef<HTMLInputElement>(null);
  const update = (patch: Partial<Project>) => setProject(p => ({ ...p, ...patch }));
  const days = daysFor(project.week, project.layout);
  const activeEvents = useMemo(() => [...project.events, ...project.manualEvents].filter(e => days.some(day => eventOnDay(e,day,project.timezone))), [project.events,project.manualEvents,project.week,project.layout,project.timezone]);
  const selected = useMemo(() => selectedEvents(project), [project]);
  const categories = ['All', ...new Set(activeEvents.flatMap(e => e.labels?.length ? e.labels : [e.category]))].sort((a,b) => a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b));
  const origins = [...new Set(activeEvents.map(e => e.manual ? 'Your events' : e.origin || project.source.name))].sort();
  const teamsEvents = activeEvents.filter(event => isTeamsEvent(event, project.edits[event.id]));
  const selectedTeams = teamsEvents.filter(event => project.selected.includes(event.id)).length;
  const visible = activeEvents.filter(e => (!project.hideTeams || !isTeamsEvent(e,project.edits[e.id])) && (originFilter === 'All' || (e.manual ? 'Your events' : e.origin || project.source.name) === originFilter) && (category === 'All' || e.category === category || e.labels?.includes(category)) && (!selectedOnly || project.selected.includes(e.id)) && `${e.title} ${e.location} ${e.description}`.toLowerCase().includes(query.toLowerCase()));
  const canSuggest = visible.some(e=>!project.selected.includes(e.id)&&!cancelled(e)&&days.some(day=>(dayFocus==='all'||dayFocus===day)&&!project.skippedDays.includes(day)&&eventOnDay(e,day,project.timezone)));
  const palette = project.palette === 'custom' ? project.customPalette : PALETTES[project.palette];
  const dims = dimensions(project);
  const liveRange = project.fetchedRange === sourceRange(project);
  const exportDisabled = !selected.length || rendering || !result || !!renderError || !!result.warnings.length;
  const filterCount = Number(category !== 'All') + Number(originFilter !== 'All') + Number(project.hideTeams);
  const panelProps = (id: WorkspaceTab, label: string) => compact
    ? { id:`panel-${id}`, role:'tabpanel', 'aria-labelledby':`tab-${id}`, tabIndex:0 }
    : { id:`panel-${id}`, 'aria-label':label };

  useEffect(() => {
    const timer = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(project)); setSaveError(''); } catch { setSaveError('Browser storage is full or unavailable. Download your project to keep your work.'); } }, 300);
    return () => clearTimeout(timer);
  }, [project]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''),4000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    const controller = new AbortController(); let active = true, timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); },45000);
    setSyncing(true); setSyncError(''); setSyncNote('');
    fetchEvents(project.source,project.week,controller.signal).then(data => {
      if (!active) return;
      setProject(p => ({ ...p, events: data.events, fetchedAt: new Date().toISOString(), fetchedRange: sourceRange(p) }));
      setSyncNote(`${data.events.length} events · ${data.pages} API page${data.pages === 1 ? '' : 's'}${data.skipped ? ` · ${data.skipped} invalid entries skipped` : ''}`);
    }).catch(error => {
      if (!active || error.name === 'AbortError' && !timedOut) return;
      setSyncError(timedOut ? 'The calendar took too long to respond. Your saved work is still here; try refreshing.' : `${error.message || 'Could not connect.'} Your saved work is still available. If this is another website, its API must allow browser requests (CORS).`);
    }).finally(() => { clearTimeout(timeout); if (active) setSyncing(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [project.week,project.source.id,project.source.url,project.source.provider,refresh]);
  useEffect(() => {
    let active = true; setRendering(true);
    const timer = setTimeout(() => renderProject(project).then(value => { if (active) { setResult(value); setRenderError(''); setRendering(false); setPage(p => Math.min(p,value.pages.length-1)); } }).catch(error => { if (active) { setRenderError(error.message); setRendering(false); } }),80);
    return () => { active = false; clearTimeout(timer); };
  }, [project,fontRevision]);
  useEffect(() => {
    if (!result?.pages[page]) return;
    const url = svgUrl(result.pages[page].svg); setPreviewUrl(url); return () => URL.revokeObjectURL(url);
  }, [result,page]);
  function toggleEvent(id: string) {
    setProject(p => {
      const removing = p.selected.includes(id);
      const event = [...p.events,...p.manualEvents].find(e=>e.id===id);
      return {...p,selected:removing?p.selected.filter(x=>x!==id):[...p.selected,id],skippedDays:removing||!event?p.skippedDays:p.skippedDays.filter(day=>!days.includes(day)||!eventOnDay(event,day,p.timezone))};
    });
  }
  async function chooseDateFont(file?: File) {
    if (!file) return;
    try { setDateFontName(await importDateFont(file)); setFontRevision(n=>n+1); setToast('Month font saved in this browser.'); }
    catch(error) { setToast(error instanceof Error ? error.message : 'Could not load the font.'); }
    if (fontRef.current) fontRef.current.value = '';
  }
  function autoPick() {
    const chosen = new Set(project.selected);
    const picks = days.filter(day=>(dayFocus==='all'||dayFocus===day)&&!project.skippedDays.includes(day)).flatMap(day => {
      const items = visible.filter(e => !chosen.has(e.id) && !cancelled(e) && eventOnDay(e,day,project.timezone));
      const event = [...items].sort((a,b) => Number(!/UNBC|Clubs/i.test(a.category))-Number(!/UNBC|Clubs/i.test(b.category)) || a.title.length-b.title.length || a.start.localeCompare(b.start))[0];
      if(event)chosen.add(event.id);
      return event ? [event.id] : [];
    });
    update({ selected: [...chosen] }); setToast(picks.length?`Added ${picks.length} suggestions. Your other selections are kept.`:'No new suggestions. Show all events or adjust the filters to add more.');
  }
  function saveProject() { download(new Blob([JSON.stringify(project,null,2)], { type: 'application/json' }), `ote-project-${project.week}.json`); setToast('Project downloaded. Import it anytime to keep editing.'); }
  async function importProject(file?: File) {
    if (!file) return;
    try { if (file.size > 15*1024*1024) throw new Error('Project file must be smaller than 15 MB.'); const imported = parseProject(JSON.parse(await file.text())); setProject(imported); setPage(0); setCategory('All'); setDayFocus('all'); setOriginFilter('All'); setSelectedOnly(false); setToast('Project restored. Reconnecting to its calendar.'); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Could not import the project.'); }
    if (importRef.current) importRef.current.value = '';
  }
  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption(project)); setToast('Caption copied, with dates, event details, and source links.'); }
    catch { download(new Blob([caption(project)],{type:'text/plain'}),`ote-caption-${project.week}.txt`); setToast('Caption downloaded as a text file.'); }
  }
  async function performExport(all: boolean) {
    if (!result || rendering) return;
    setExporting(true);
    try { await exportPages(project,result,exportType,all,page); setToast(all ? 'Your slides and caption are ready in a ZIP.' : 'Your image is ready.'); }
    catch(error) { setToast(error instanceof Error ? error.message : 'Export failed.'); }
    finally { setExporting(false); }
  }
  function fillDay(day:string) {
    const picks = visible.filter(e=>!project.selected.includes(e.id)&&eventOnDay(e,day,project.timezone)&&!cancelled(e)).sort((a,b)=>a.title.length-b.title.length).slice(0,1);
    update({selected:[...new Set([...project.selected,...picks.map(e=>e.id)])],skippedDays:project.skippedDays.filter(d=>d!==day)});
    setToast(picks.length ? `Added another event for ${dayLabel(day)}. You can select more.` : 'No new events match these filters on this date.');
  }
  function selectDay(day:string,items:CalendarEvent[],all:boolean) {
    const ids=new Set(items.filter(e=>!cancelled(e)||project.selected.includes(e.id)).map(e=>e.id));
    update({selected:all?project.selected.filter(id=>!ids.has(id)):[...new Set([...project.selected,...items.filter(e=>!cancelled(e)).map(e=>e.id)])],skippedDays:all?project.skippedDays:project.skippedDays.filter(d=>d!==day)});
  }
  function switchTemplate(template:Project['template']) {
    if(template===project.template)return;
    update(template==='list'?{template,layout:'full-week',format:'story',showTime:false}:{template,layout:project.layout==='full-week'?'weekly':project.layout,showTime:true});
    setDayFocus('all');setPage(0);
  }
  function setWeek(value: string) { if (!value) return; update({ week: monday(value) }); setPage(0); setCategory('All'); setDayFocus('all'); }

  const exportOptions = <ExportOptions project={project} days={days} previewUrl={previewUrl}
    width={dims.width} height={dims.height} slides={result?.pages.length || 1} page={page}
    type={exportType} onType={setExportType} exporting={exporting} disabled={exportDisabled}
    onDownload={all => void performExport(all)} onCaption={() => void copyCaption()}/>;

  return <div className="app-shell">
    <header className="app-header compact-header">
      <div className="studio-brand"><span className="studio-monogram">m<span>✳</span></span><h1>Media Studio</h1><span className="local-tag"><span className="status-dot"/>Local</span></div>
      <button className="mobile-project-button icon-button" aria-label="Project menu" onClick={() => setModal('project')}><MoreHorizontal size={23}/></button>
      <div className="project-actions"><span className={`saved-status ${saveError ? 'warning' : ''}`}><ShieldCheck size={14}/>{saveError ? 'Save unavailable' : 'Saved on this device'}</span><Button className="secondary compact" onClick={() => importRef.current?.click()}><FolderOpen size={15}/>Open project</Button><Button className="secondary compact" onClick={saveProject}><Download size={15}/>Save project</Button><button className="icon-button" aria-label="How Media Studio works" onClick={() => setModal('help')}><CircleHelp size={18}/></button><input ref={importRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Import project file" onChange={e => void importProject(e.target.files?.[0])}/></div>
    </header>
    <main>
      <section className="workspace-toolbar" aria-label="Schedule controls"><div className="date-controls"><button className="mobile-week-picker" aria-label="Choose week" title={rangeLabel(days)} onClick={() => setModal('week')}><span>{rangeLabel(days)}</span><ChevronDown size={15}/></button><span className="toolbar-label"><CalendarDays size={16}/>Your week</span><button className="icon-button" aria-label="Previous week" onClick={() => setWeek(addDays(project.week,-7))}><ChevronLeft size={17}/></button><label className="date-picker"><span>{rangeLabel(days)}</span><ChevronDown size={14}/><input type="date" value={project.week} aria-label="Week starting" onChange={e => setWeek(e.target.value)}/></label><button className="icon-button" aria-label="Next week" onClick={() => setWeek(addDays(project.week,7))}><ChevronRight size={17}/></button><button className="text-button today-button" onClick={() => setWeek(dateKey(new Date(),project.timezone))}>This week</button></div><div className="toolbar-right"><label className="mobile-range-select"><select aria-label="Schedule range" value={project.layout} onChange={e => { update({layout:e.target.value as Project['layout']}); setPage(0); setDayFocus('all'); }}><option value="weekly">Weekdays</option><option value="weekend">Weekend</option>{project.template==='list' && <option value="full-week">Full week</option>}</select><ChevronDown size={14}/></label><span className="timezone">Pacific time</span><div className="segmented layout-switch"><button aria-pressed={project.layout === 'weekly'} className={project.layout === 'weekly' ? 'active' : ''} onClick={() => { update({ layout:'weekly' }); setPage(0); setDayFocus('all'); }}>Weekdays</button><button aria-pressed={project.layout === 'weekend'} className={project.layout === 'weekend' ? 'active' : ''} onClick={() => { update({ layout:'weekend' }); setPage(0); setDayFocus('all'); }}>Weekend</button>{project.template==='list' && <button aria-pressed={project.layout==='full-week'} className={project.layout==='full-week'?'active':''} onClick={()=>{update({layout:'full-week'});setPage(0);setDayFocus('all');}}>Full week</button>}</div></div></section>
      {saveError && <div className="global-alert"><AlertTriangle size={16}/>{saveError}<button onClick={saveProject}>Save project</button></div>}
      <div className={`studio-grid mobile-${mobileTab}`}>
        <section className="panel events-panel" {...panelProps('events','Choose events')}><div className="panel-heading"><div><span className="step">01</span><h2>Events</h2></div><button className="icon-button" aria-label="Add a custom event" title="Add your own event" onClick={() => setModal('manual')}><Plus size={19}/></button></div>
          <div className="source-card"><span className="source-icon"><Link2 size={17}/></span><div><strong>{project.source.name}</strong><span className={syncError ? 'source-offline' : ''}><span className={`status-dot ${syncError ? 'offline' : ''}`}/>{syncing ? 'Syncing your calendar…' : syncError ? 'Saved calendar · offline' : liveRange ? 'Connected to live calendar' : 'Waiting for calendar'}</span></div><button className="icon-button" aria-label="Refresh calendar" title={syncNote || 'Refresh calendar'} disabled={syncing} onClick={() => setRefresh(n => n+1)}><RefreshCw className={syncing ? 'spinning' : ''} size={16}/></button><button className="icon-button" aria-label="Change calendar source" title="Calendar connection" onClick={() => setModal('source')}><Settings2 size={16}/></button></div>
          {syncError && <div className="sync-error" role="alert"><AlertTriangle size={15}/><div>{syncError}<button className="text-button" onClick={() => setRefresh(n => n+1)}>Try again</button></div></div>}
          <div className={`event-filters ${filtersOpen ? 'filters-expanded' : ''}`}><div className="search-controls"><label className="search-field"><Search size={16}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events" aria-label="Search events"/></label><button className={`mobile-filter-button ${filterCount ? 'active' : ''}`} aria-expanded={filtersOpen} aria-controls="event-filter-options" onClick={() => setFiltersOpen(value => !value)}><ListFilter size={17}/>Filters{filterCount > 0 && <span>{filterCount}</span>}</button></div><div className="filter-row" id="event-filter-options"><label className="category-select"><ListFilter size={14}/><select value={category} aria-label="Event category" onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c} value={c}>{c==='All'?'All labels':c}</option>)}</select><ChevronDown size={12}/></label><label className="category-select source-filter"><Link2 size={12}/><select aria-label="Event source" value={originFilter} onChange={e=>setOriginFilter(e.target.value)}><option value="All">All sources</option>{origins.map(origin=><option key={origin}>{origin}</option>)}</select><ChevronDown size={12}/></label></div><label className="teams-filter"><input type="checkbox" aria-label="Hide Microsoft Teams events" checked={project.hideTeams} onChange={e => update({hideTeams:e.target.checked})}/><span>Hide Microsoft Teams events</span><small>{teamsEvents.length}</small></label>{project.hideTeams && teamsEvents.length > 0 && <div className="teams-filter-status"><span>{teamsEvents.length} Teams event{teamsEvents.length===1?'':'s'} hidden{selectedTeams > 0 ? ` · ${selectedTeams} already selected and kept in your design` : ''}</span><button onClick={() => update({hideTeams:false})}>Show Teams events</button></div>}<div className="date-selection-heading"><span>Browse dates</span><button className={`selected-filter ${selectedOnly ? 'active' : ''}`} aria-pressed={selectedOnly} title="Filter the event list to your selections" onClick={() => setSelectedOnly(v => !v)}>Selected only <span>{selected.length}</span></button></div><div className="date-chips" role="group" aria-label="Browse events by date"><button className={dayFocus==='all'?'active':''} aria-label="Show all dates" aria-pressed={dayFocus==='all'} onClick={()=>setDayFocus('all')}>All</button>{days.map(day=><button className={`date-chip ${dayFocus===day?'active':''}`} key={day} aria-label={`Show ${day}`} aria-pressed={dayFocus===day} onClick={()=>setDayFocus(day)}><span>{dayLabel(day)}</span><strong>{Number(day.slice(8))}</strong></button>)}</div>{selectedOnly && <div className="selection-filter-note">Showing selected events only.<button onClick={()=>setSelectedOnly(false)}>Show all events</button></div>}<p className="selection-hint">Select several events per date. Use the pencil to edit.</p></div>
          <div className="events-scroll">
            {syncing && !activeEvents.length ? <div className="empty-state"><LoaderCircle size={25} className="spinning"/><h3>Finding your week</h3><p>Loading every page of the calendar.</p></div> : visible.length === 0 ? <div className="empty-state"><CalendarDays size={28}/><h3>{query || selectedOnly || activeEvents.length > 0 ? 'No matching events' : 'A little room in your week'}</h3><p>{query || activeEvents.length > 0 ? 'Adjust your search or filters to see more events.' : selectedOnly ? 'Select events from the calendar to see them here.' : 'No events for these dates. Try another week or add one of your own.'}</p>{activeEvents.length > 0 && <Button className="secondary" onClick={() => { setQuery('');setCategory('All');setOriginFilter('All');setSelectedOnly(false);update({hideTeams:false}); }}>Reset filters</Button>}{!query && !selectedOnly && <Button className="secondary" onClick={() => setModal('manual')}><Plus size={15}/>Add an event</Button>}</div> : days.filter(day=>dayFocus==='all'||dayFocus===day).map(day => {
              const items = visible.filter(e => eventOnDay(e,day,project.timezone)).sort((a,b) => a.start.localeCompare(b.start));
              const available=items.filter(e=>!cancelled(e));
              const allSelected=items.some(e=>project.selected.includes(e.id))&&available.every(e=>project.selected.includes(e.id));
              const daySelected=activeEvents.filter(e=>project.selected.includes(e.id)&&eventOnDay(e,day,project.timezone)).length;
              return <div className={`day-group ${project.skippedDays.includes(day)?'day-skipped':''}`} key={day}><div className="day-group-heading"><span>{dayLabel(day,'long')} <span>{readableDay(day)}</span></span><label className="day-include"><input type="checkbox" aria-label={`Include ${day}`} checked={!project.skippedDays.includes(day)} onChange={e=>update({skippedDays:e.target.checked?project.skippedDays.filter(d=>d!==day):[...project.skippedDays,day]})}/>In design</label></div><div className="day-selection-tools"><span>{daySelected} selected · {items.length} available</span><button aria-label={`${allSelected?'Clear shown':'Select all'} ${day}`} disabled={!items.length} onClick={()=>selectDay(day,items,allSelected)}>{allSelected?'Clear shown':'Select all'}</button><button aria-label={`Add suggestion ${day}`} title="Add the next unselected suggestion for this date" disabled={!available.some(e=>!project.selected.includes(e.id))} onClick={()=>fillDay(day)}><Sparkles size={10}/>Suggest</button></div>{project.skippedDays.includes(day)&&<p className="date-skipped-note">Hidden from your design. Turn on “In design” to include this date.</p>}{items.length === 0 ? <p className="no-events">Nothing on the calendar.</p> : items.map(event => {
                const isSelected = project.selected.includes(event.id), edit = project.edits[event.id];
                return (<div className={`event-card ${isSelected ? 'is-selected' : ''} ${cancelled(event) ? 'is-cancelled' : ''}`} key={event.id}><label className="event-select"><input type="checkbox" checked={isSelected} disabled={cancelled(event) && !isSelected} onChange={() => toggleEvent(event.id)} aria-label={`Select ${event.title}`}/><span className="checkbox-ui">{isSelected && <Check size={12} strokeWidth={3}/>}</span><div className="event-info"><span className={`event-category category-${event.category.toLowerCase()}`}>{event.manual ? 'YOUR EVENT' : event.category.toUpperCase()}{edit && ' · EDITED'}</span><h3>{edit?.title ?? event.title}</h3><p>{edit?.timeLabel ?? formatTime(event,day,project.timezone)}</p>{(edit?.location ?? event.location) && <span className="event-location"><MapPin size={11}/>{edit?.location ?? event.location}</span>}{cancelled(event) && <span className="cancelled-label">{event.status}</span>}</div></label><button className="edit-event" aria-label={`Edit ${event.title}`} title="Edit for this post" onClick={() => setEditing(event)}><Pencil size={13}/></button></div>);
              })}</div>;
            })}
          </div>
          <div className="events-footer"><Button className="auto-button" disabled={syncing || !canSuggest} onClick={autoPick}><Sparkles size={15}/>Add suggestions</Button><button className="text-button" disabled={!selected.length} onClick={() => update({ selected: project.selected.filter(id => !selected.some(e => e.id === id)) })}>Clear</button></div>
        </section>
        <section className="preview-panel" {...panelProps('preview','Live design preview')}><div className="preview-heading"><div><span className="step">{compact ? '03' : '02'}</span><span>Live preview</span><span className="preview-live-dot"/></div><button className="icon-button" aria-label="Enlarge preview" onClick={() => setModal('preview')} disabled={!previewUrl}><ZoomIn size={18}/></button></div>
          <div className="canvas-workspace"><div className={`artboard ${rendering ? 'is-rendering' : ''}`} style={{ '--artboard-ratio': dims.width/dims.height } as CSSProperties}>{previewUrl ? <img src={previewUrl} alt={`${project.layout === 'weekend' ? 'Weekend' : project.layout === 'full-week' ? 'Full week' : 'Weekday'} schedule preview, slide ${page+1} of ${result?.pages.length || 1}`} className="schedule-image"/> : <div className="preview-loading"><LoaderCircle size={26} className="spinning"/><span>Preparing your design</span></div>}</div>{renderError && <div className="preview-error" role="alert">{renderError}</div>}
            {!selected.length && !rendering && <div className="preview-hint"><span><ArrowLeft size={14}/></span>{compact ? <button onClick={() => setMobileTab('events')}>Choose events for your design</button> : 'Select a few events to bring this to life'}</div>}
          </div>
          <div className="preview-pagination" aria-label="Preview slides"><button className="icon-button" aria-label="Previous slide" disabled={page===0} onClick={() => setPage(n=>n-1)}><ChevronLeft size={17}/></button><span className="slide-position">Slide {page+1} / {result?.pages.length || 1}</span><div className="slide-dots">{result?.pages.map((p,i) => <button key={i} className={page===i ? 'active' : ''} aria-current={page===i ? 'true' : undefined} aria-label={`Show slide ${i+1}`} onClick={() => setPage(i)}><span>{p.number}</span></button>)}</div><button className="icon-button" aria-label="Next slide" disabled={!result || page===result.pages.length-1} onClick={() => setPage(n=>n+1)}><ChevronRight size={17}/></button></div>
          <div className="preview-meta"><span><Monitor size={13}/>{dims.width} × {dims.height} px</span><span>{result?.pages.length || 1} slide{result?.pages.length===1?'':'s'}<span className="meta-separator">·</span>{selected.length} event{selected.length===1?'':'s'}</span></div>
          {(result?.warnings.length || 0) > 0 && <div className="layout-warnings" role="alert"><AlertTriangle size={16}/><div><strong>A quick layout check</strong>{result!.warnings.map(w => <p key={w}>{w}</p>)}</div></div>}
          {result && result.pages.length > 1 && !result.warnings.length && <div className="pagination-note"><CheckCheck size={15}/><div><strong>{selected.length} events selected · {result.pages.length} slides</strong><p>This slide shows {result.pages[page]?.eventCount || 0} events. Use the arrows to see the rest. Extra slides keep the text readable.</p>{project.template==='cards' && <button className="text-button" onClick={()=>switchTemplate('list')}>Try the compact weekly list</button>}</div></div>}
        </section>
        <section className="panel design-panel" {...panelProps('design','Design and export')}><div className="panel-heading"><div><span className="step">{compact ? '02' : '03'}</span><h2>Design</h2></div><SlidersHorizontal size={17}/></div><div className="design-scroll"><div className="control-section template-section"><div className="control-label"><span>Schedule style</span></div><div className="template-switch"><button aria-pressed={project.template==='cards'} className={project.template==='cards'?'active':''} onClick={()=>switchTemplate('cards')}><strong>Original cards</strong><small>Textured date badges</small></button><button aria-pressed={project.template==='list'} className={project.template==='list'?'active':''} onClick={()=>switchTemplate('list')}><strong>Weekly list</strong><small>Seven days · compact bullets</small></button></div></div>
          <div className="control-section"><div className="control-label"><span>Format</span><span>INSTAGRAM READY</span></div><div className="format-grid"><button aria-pressed={project.format === 'portrait'} className={project.format === 'portrait' ? 'active' : ''} onClick={() => update({ format:'portrait' })}><span className="format-icon portrait"/><strong>Post</strong><small>4:5</small>{project.format==='portrait' && <Check size={12}/>}</button><button aria-pressed={project.format === 'story'} className={project.format === 'story' ? 'active' : ''} onClick={() => update({ format:'story' })}><span className="format-icon story"/><strong>Story</strong><small>9:16</small>{project.format==='story' && <Check size={12}/>}</button><button aria-pressed={project.format === 'original'} className={project.format === 'original' ? 'active' : ''} onClick={() => update({ format:'original' })}><span className="format-icon original"/><strong>Original</strong><small>Figma</small>{project.format==='original' && <Check size={12}/>}</button></div></div>
          <div className="control-section"><div className="control-label"><span>Colour palette</span><PaletteIcon size={14}/></div><div className="palette-grid">{Object.entries(PALETTES).map(([key,p]) => <button key={key} className={`palette-choice ${project.palette===key?'active':''}`} aria-label={`${p.name} palette`} aria-pressed={project.palette===key} onClick={() => update({ palette:key })}><span className="palette-sample" style={{background:p.paper}}><span style={{background:p.accent}}/>{project.palette===key && <span className="palette-check"><Check size={10}/></span>}</span><small>{p.name}</small></button>)}<button className={`palette-choice ${project.palette==='custom'?'active':''}`} aria-label="Custom palette" onClick={() => update({ palette:'custom' })}><span className="palette-sample custom"><Plus size={16}/></span><small>Custom</small></button></div>{project.palette === 'custom' && <div className="custom-colors">{(['paper','ink','accent','badgeInk'] as (keyof Palette)[]).map(key => <label key={key}><input type="color" value={project.customPalette[key]} aria-label={`Custom ${key} color`} onChange={e => update({ customPalette: { ...project.customPalette,[key]:e.target.value } })}/><span>{{paper:'Background',ink:'Text',accent:'Accent',badgeInk:'Day labels'}[key as string]}</span></label>)}</div>}<div className="palette-note"><span style={{background:palette.accent}}/>Made from your original OTE designs.</div></div>
          <div className="control-section"><div className="control-label"><span>Event details</span><Settings2 size={14}/></div><label className="toggle-row"><span>Event titles</span><input type="checkbox" checked={project.showTitle} onChange={e=>update({showTitle:e.target.checked})}/><span className="toggle"/></label><label className="toggle-row"><span>Event times</span><input type="checkbox" checked={project.showTime} onChange={e=>update({showTime:e.target.checked})}/><span className="toggle"/></label><label className="toggle-row"><span>Show locations</span><input type="checkbox" checked={project.showLocation} onChange={e => update({ showLocation:e.target.checked })}/><span className="toggle"/></label><label className="toggle-row"><span>Include descriptions</span><input type="checkbox" checked={project.showDescription} onChange={e => update({ showDescription:e.target.checked })}/><span className="toggle"/></label><label className="toggle-row"><span>Skip empty dates</span><input type="checkbox" checked={project.hideEmptyDays} onChange={e=>update({hideEmptyDays:e.target.checked})}/><span className="toggle"/></label><div className="text-size-label"><span>Text size</span><span>{Math.round(project.textScale*100)}%</span></div><input type="range" min="0.75" max="1.4" step="0.05" value={project.textScale} aria-label="Text size" onChange={e => update({textScale:Number(e.target.value)})}/><div className="range-labels"><span>Smaller</span><span>Larger</span></div><p className="control-note">Use an event’s pencil to edit or hide individual fields.</p></div>
          {project.template==='cards' && <details className="control-section layout-controls" open><summary>Spacing & date badges</summary><label className="position-control"><span>Heading position<output>{project.headingOffset === 0 ? 'Default' : `${project.headingOffset > 0 ? '+' : ''}${project.headingOffset}%`}</output></span><input type="range" aria-label="Heading position" min="-2" max="1" step="0.1" value={project.headingOffset} onChange={e=>update({headingOffset:Number(e.target.value)})}/></label><label className="position-control"><span>Month badge position<output>{project.stampOffset === 0 ? 'Default' : `${project.stampOffset > 0 ? '+' : ''}${project.stampOffset}%`}</output></span><input type="range" aria-label="Month badge position" min="-2" max="1" step="0.1" value={project.stampOffset} onChange={e=>update({stampOffset:Number(e.target.value)})}/></label><div className="range-labels"><span>Move up</span><span>Move down</span></div><label className="position-control"><span>Day badge height<output>{Math.round(project.badgeHeight*100)}%</output></span><input type="range" aria-label="Day badge height" min="1" max="1.5" step="0.05" value={project.badgeHeight} onChange={e=>update({badgeHeight:Number(e.target.value)})}/></label><button className="text-button" onClick={()=>update({headingOffset:0,stampOffset:0,badgeHeight:1.2})}>Reset spacing</button><p className="control-note">Textured day badges and a shared edge margin across all formats. October 2026 uses your original Salted lettering.</p><div className="local-font-control"><span>Month font · {dateFontName || 'Original artwork / Kalam'}</span><button className="text-button" onClick={()=>fontRef.current?.click()}>{dateFontName ? 'Change local font' : 'Use a local font'}</button>{dateFontName && <button className="text-button" onClick={()=>{clearDateFont();setDateFontName('');setFontRevision(n=>n+1);}}>Remove font</button>}<input ref={fontRef} className="sr-only" type="file" accept=".otf,.ttf,.woff" aria-label="Local month font" onChange={e=>void chooseDateFont(e.target.files?.[0])}/><small>Load Salted for other months. Font files stay in this browser.</small></div></details>}
          <div className="capacity-card"><div className="control-label"><span>Layout capacity</span><span>{result?.pages.length || 1} / 10 slides</span></div>{result?.capacity.map(c=><div className="capacity-row" key={c.day} title={`${Math.round(c.used)} / ${Math.round(c.available)} px on slide 1 · approximately ${c.typicalLimit} short events per slide`}><span>{dayLabel(c.day)} {Number(c.day.slice(8))}</span><div className="capacity-track"><span style={{width:`${Math.min(100,c.used/c.available*100)}%`}}/></div><span>{c.events} events · {c.slides}×</span></div>)}<p>Measured from wrapped text and visible fields. Extra events flow to another slide; oversized entries block export.</p></div>

        </div><div className="export-footer"><Button className="primary export-main" disabled={exportDisabled} onClick={() => setModal('export')}><Download size={17}/>Export your design<ArrowUpRight size={17}/></Button><button className="caption-button" disabled={!selected.length} onClick={() => void copyCaption()}><Copy size={13}/>Copy Instagram caption</button><div className="privacy-note"><Laptop size={12}/>Your work stays on your device.</div></div></section>
        {compact && <section className="panel mobile-export-panel" {...panelProps('export','Export design')}>
          <div className="panel-heading"><div><span className="step">04</span><h2>Export</h2></div><span className="export-readiness">{rendering ? 'Updating…' : exportDisabled ? 'Needs a quick check' : 'Ready to download'}</span></div>
          <div className="mobile-export-scroll">
            {!selected.length ? <div className="empty-state"><Download size={28}/><h3>Your design starts with events</h3><p>Choose events, adjust the design, then download your image here.</p><Button className="primary" onClick={() => setMobileTab('events')}>Choose events</Button></div> : <>
              {exportDisabled && <div className="export-check" role="status"><AlertTriangle size={18}/><div>{rendering ? 'Updating your design. Downloads will be ready in a moment.' : renderError || result?.warnings.join(' ') || 'Check your design before downloading.'}{!rendering && <button className="text-button" onClick={() => setMobileTab('preview')}>Review preview</button>}</div></div>}
              {exportOptions}
            </>}
          </div>
        </section>}
      </div>

    </main>
    <WorkspaceTabs active={mobileTab} onChange={setMobileTab} count={selected.length}/>
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15}/></button></div>}
    {editing && <EventEditor event={editing} project={project} onClose={() => setEditing(null)} onSave={edit => { setProject(p => ({ ...p, edits:{ ...p.edits,[editing.id]:edit } })); setEditing(null); setToast('Event updated in your design.'); }} onRestore={() => { setProject(p => { const edits = { ...p.edits }; delete edits[editing.id]; return { ...p,edits }; }); setEditing(null); }} onDelete={editing.manual ? () => { setProject(p => ({ ...p, manualEvents:p.manualEvents.filter(e=>e.id!==editing.id), selected:p.selected.filter(id=>id!==editing.id) })); setEditing(null); } : undefined}/>}
    {modal==='source' && <SourceDialog source={project.source} onClose={() => setModal(null)} onSave={source => { update({source,events:[],fetchedAt:null,fetchedRange:''}); setCategory('All'); setOriginFilter('All'); setDayFocus('all'); setModal(null); }}/>} 
    {modal==='manual' && <ManualDialog day={days[0]} timezone={project.timezone} onClose={() => setModal(null)} onSave={event => { setProject(p => ({ ...p, manualEvents:[...p.manualEvents,event], selected:[...p.selected,event.id] })); setModal(null); setToast('Your event has been added to the design.'); }}/>} 
    {modal==='preview' && <Modal title="Your design, up close" subtitle={`${dims.width} × ${dims.height} px · Slide ${page+1} of ${result?.pages.length || 1}`} onClose={() => setModal(null)} wide><div className="large-preview">{previewUrl && <img src={previewUrl} alt="Enlarged schedule design"/>}</div></Modal>}
    {modal==='export' && <Modal title="Export design" subtitle="The exact design you see, at full Instagram resolution." onClose={() => { if (!exporting) setModal(null); }}>{exportOptions}</Modal>}
    {modal==='week' && <Modal title="Choose week" subtitle={`${rangeLabel(days)} · Pacific time`} onClose={() => setModal(null)}><div className="week-options"><div className="week-navigation"><button className="button secondary" aria-label="Previous week" onClick={() => setWeek(addDays(project.week,-7))}><ChevronLeft size={18}/></button><Button className="secondary" onClick={() => setWeek(dateKey(new Date(),project.timezone))}>This week</Button><button className="button secondary" aria-label="Next week" onClick={() => setWeek(addDays(project.week,7))}><ChevronRight size={18}/></button></div><label className="field-label">Week starting<input type="date" value={project.week} aria-label="Week starting" onChange={e => setWeek(e.target.value)}/><small>Pick any date. The schedule starts on that week’s Monday.</small></label><Button className="primary full" onClick={() => setModal(null)}>Done</Button></div></Modal>}
    {modal==='project' && <Modal title="Your project" subtitle={saveError || 'Saved automatically on this device.'} onClose={() => setModal(null)}><div className="project-menu"><Button className="secondary full" onClick={() => { setModal(null); importRef.current?.click(); }}><FolderOpen size={18}/>Open project</Button><Button className="secondary full" onClick={() => { saveProject(); setModal(null); }}><Download size={18}/>Save project</Button><Button className="secondary full" onClick={() => setModal('help')}><CircleHelp size={18}/>How Media Studio works</Button><p>Save a project backup to continue on another device. Your selections and edits stay together.</p></div></Modal>}
    {modal==='help' && <Modal title="Media Studio help" subtitle="A small studio for sharing what’s happening around campus." onClose={() => setModal(null)}><div className="help-content"><div><span className="step">01</span><p><strong>Pick your week and events.</strong> The public calendar syncs automatically. Select what matters, or add your own event with the + button.</p></div><div><span className="step">02</span><p><strong>Make it sound like you.</strong> Edit any title, venue, displayed time, or description using its pencil. Simplify makes a shorter first-sentence summary; you have the final say.</p></div><div><span className="step">03</span><p><strong>Choose a style and export.</strong> Original cards keep the textured artwork. Weekly list uses compact bullets and supports all seven days. Post and Story use Instagram dimensions. Original preserves the supplied Figma proportions. Extra events flow to additional slides. Very long entries need a shorter edit before export.</p></div><div className="info-box"><ShieldCheck size={18}/><p>Edits save in this browser. Save project downloads a portable backup; Open project restores it. Refreshing the calendar preserves your edits. Calendar data is read directly from its public API; nothing is published back.</p></div><p className="small-note">The original decorative artwork and layout come from your supplied SVGs. Month, year, and date labels use local fonts to support any date. Date chips browse events without changing the design. Use each day’s In design checkbox to hide it, or enable Skip empty dates. The remaining date boxes expand automatically. Capacity is calculated from the text that is visible in each event.</p></div></Modal>}
  </div>;
}

function EventEditor({ event, project, onClose, onSave, onRestore, onDelete }: { event: CalendarEvent; project: Project; onClose: () => void; onSave: (edit: EventEdit) => void; onRestore: () => void; onDelete?: () => void }) {
  const existing = project.edits[event.id] || {};
  const [edit,setEdit] = useState<EventEdit>({ title:existing.title ?? event.title, description:existing.description ?? event.description, location:existing.location ?? event.location, timeLabel:existing.timeLabel, showTitle:existing.showTitle ?? project.showTitle, showTime:existing.showTime ?? project.showTime, showLocation:existing.showLocation ?? project.showLocation, showDescription:existing.showDescription ?? project.showDescription });
  const [error,setError] = useState('');
  function submit(e:FormEvent) { e.preventDefault(); if (!edit.title?.trim()) { setError('Give this event a title before saving.'); return; } onSave(edit); }
  return <Modal title="Edit event" subtitle="Edit the content and choose which fields appear." onClose={onClose}><form className="dialog-form" onSubmit={submit}><div className="field-visibility"><span>Visible fields</span>{([ ['showTitle','Title'],['showTime','Time'],['showLocation','Location'],['showDescription','Description']] as const).map(([key,label])=><label key={key}><input type="checkbox" aria-label={`Show event ${label.toLowerCase()}`} checked={edit[key] ?? true} onChange={e=>setEdit({...edit,[key]:e.target.checked})}/>{label}</label>)}</div><div className="editor-source"><span className="event-category">{event.category}</span><span>{readableDay(dateKey(event.start,project.timezone),{year:'numeric'})} · {formatTime(event,undefined,project.timezone)}</span>{safeUrl(event.url) && <a href={safeUrl(event.url)} target="_blank" rel="noreferrer">View source<ExternalLink size={12}/></a>}</div><label className="field-label">Event title<input required maxLength={400} value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/></label><label className="field-label">Location<input maxLength={400} value={edit.location} onChange={e=>setEdit({...edit,location:e.target.value})}/></label><label className="field-label">Display time <span className="optional">optional override</span><input maxLength={120} value={edit.timeLabel ?? ''} placeholder={formatTime(event,undefined,project.timezone)} onChange={e=>setEdit({...edit,timeLabel:e.target.value || undefined})}/><small>Leave blank for automatic times. This changes the label, not the event date.</small></label><label className="field-label">Description<textarea aria-label="Description" rows={4} maxLength={12000} value={edit.description} onChange={e=>setEdit({...edit,description:e.target.value})}/></label><div className="editor-description-actions"><Button className="secondary compact" onClick={()=>setEdit({...edit,description:simplifyText(edit.description || '')})}><Sparkles size={14}/>Simplify description</Button><span className="small-note">Local text summary</span></div>{error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-footer"><button type="button" className="text-button" onClick={onRestore}><RefreshCw size={13}/>Restore original</button>{onDelete && <button type="button" className="icon-button danger" aria-label="Delete custom event" onClick={onDelete}><Trash2 size={16}/></button>}<Button className="primary" type="submit"><Check size={15}/>Save edits</Button></div></form></Modal>;
}
function SourceDialog({ source,onClose,onSave }: { source:Source; onClose:()=>void; onSave:(s:Source)=>void }) {
  const [draft,setDraft] = useState(source); const [error,setError] = useState('');
  function submit(e:FormEvent) { e.preventDefault(); if (!safeUrl(draft.url)) { setError('Enter a valid http:// or https:// API URL.'); return; } onSave({...draft,id:draft.url===source.url?source.id:`source-${crypto.randomUUID()}`,name:draft.name.trim() || 'Calendar'}); }
  return <Modal title="Connect a calendar" subtitle="A public REST API is all you need. No account or API key." onClose={onClose}><form className="dialog-form" onSubmit={submit}><label className="field-label">Calendar name<input value={draft.name} maxLength={80} onChange={e=>setDraft({...draft,name:e.target.value})} required/></label><label className="field-label">API type<select value={draft.provider} onChange={e=>setDraft({...draft,provider:e.target.value as Source['provider']})}><option value="unbc">UNBC / Campus Manager</option><option value="tribe">WordPress · The Events Calendar</option><option value="json">Generic JSON events</option></select></label><label className="field-label">Events API URL<input type="url" required value={draft.url} onChange={e=>setDraft({...draft,url:e.target.value})} placeholder="https://example.com/wp-json/…/events"/></label><div className="info-box"><Link2 size={17}/><p>Use an events API endpoint, such as <code>/wp-json/unbc-events/v1/events/</code> or <code>/wp-json/tribe/events/v1/events</code>. The website must allow cross-origin browser requests.</p></div>{draft.provider==='json' && <div className="json-help"><p>Return an array, or <code>{'{ "events": […] }'}</code>. Each event needs:</p><pre>{'{\n  "id": "event-1",\n  "title": "Campus night",\n  "start": "2026-10-23T18:00:00-07:00",\n  "end": "2026-10-23T20:00:00-07:00",\n  "location": "Student centre",\n  "category": "Campus"\n}'}</pre><p>Use ISO timestamps with an explicit offset or Z. Optional: description, allDay, status, url.</p></div>}{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><Button className="secondary" onClick={onClose}>Cancel</Button><Button className="primary" type="submit"><Link2 size={15}/>Connect calendar</Button></div></form></Modal>;
}
function ManualDialog({day,timezone,onClose,onSave}:{day:string;timezone:string;onClose:()=>void;onSave:(e:CalendarEvent)=>void}) {
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[location,setLocation]=useState(''),[date,setDate]=useState(day),[endDate,setEndDate]=useState(day),[start,setStart]=useState('12:00'),[end,setEnd]=useState('13:00'),[allDay,setAllDay]=useState(false),[error,setError]=useState('');
  function submit(e:FormEvent){e.preventDefault();try{const startIso=localToIso(date,allDay?'00:00':start,timezone),endIso=localToIso(allDay?addDays(endDate,1):endDate,allDay?'00:00':end,timezone);if(!title.trim())throw new Error('Give your event a title.');if(Date.parse(endIso)<Date.parse(startIso))throw new Error('The end must be after the start.');onSave({id:`manual:${crypto.randomUUID()}`,sourceId:'manual',title:cleanText(title),description:cleanText(description),start:startIso,end:endIso,allDay,location:cleanText(location),category:'Your events',url:'',status:'scheduled',cost:'',manual:true});}catch(e){setError(e instanceof Error?e.message:'Check the event details.');}}
  return <Modal title="Add event" subtitle={`Create your own event. All times are in ${timezone}.`} onClose={onClose}><form className="dialog-form" onSubmit={submit}><label className="field-label">Event title<input required value={title} maxLength={400} placeholder="Give your event a name" onChange={e=>setTitle(e.target.value)}/></label><div className="field-grid"><label className="field-label">Start date<input type="date" required value={date} onChange={e=>{setDate(e.target.value);if(e.target.value>endDate)setEndDate(e.target.value);}}/></label><label className="field-label">End date<input type="date" required value={endDate} min={date} onChange={e=>setEndDate(e.target.value)}/></label></div><label className="simple-checkbox"><input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)}/>All-day event</label>{!allDay && <div className="field-grid"><label className="field-label">Starts<input type="time" required value={start} onChange={e=>setStart(e.target.value)}/></label><label className="field-label">Ends<input type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}<label className="field-label">Location<input value={location} maxLength={400} placeholder="Where’s it happening?" onChange={e=>setLocation(e.target.value)}/></label><label className="field-label">Description <span className="optional">optional</span><textarea rows={3} value={description} maxLength={12000} onChange={e=>setDescription(e.target.value)}/></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><Button className="secondary" onClick={onClose}>Cancel</Button><Button className="primary" type="submit"><Plus size={15}/>Add to design</Button></div></form></Modal>;
}
