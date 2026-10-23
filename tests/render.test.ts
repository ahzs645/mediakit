import { describe,it,expect,vi,beforeAll,afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { basename,join } from 'node:path';
import { renderProject, visibleDays } from '../src/render';
import { newProject } from '../src/storage';
import type { CalendarEvent } from '../src/types';
const realFetch=globalThis.fetch;
beforeAll(()=>vi.stubGlobal('fetch',async(url:string)=>{
 const filename=basename(String(url));let path;
 if(filename.endsWith('.woff')){const family=filename.startsWith('dm-sans')?'dm-sans':filename.startsWith('kalam')?'kalam':'barlow-condensed';path=join(process.cwd(),'node_modules/@fontsource',family,'files',filename);}
 else path=join(process.cwd(),'src/assets',filename);
 return new Response(await readFile(path));
}));
afterAll(()=>{globalThis.fetch=realFetch;});
const event=(id:string,day=19):CalendarEvent=>({id,sourceId:'ote',title:'Advisors in the Wild',description:'Come meet campus. Bring questions.',start:`2026-10-${day}T19:00:00Z`,end:`2026-10-${day}T20:00:00Z`,allDay:false,location:'Student centre',category:'UNBC',url:'',status:'scheduled',cost:''});
describe('production SVG layout engine',()=>{
 it('produces finite vector paths with all original artwork embedded',async()=>{const p=newProject();p.week='2026-10-19';p.events=[event('a',21)];p.selected=['a'];const r=await renderProject(p);expect(r.warnings).toEqual([]);expect(r.pages[0].svg).not.toMatch(/\bd="[^"]*(?:NaN|Infinity)/);expect(/data:image\/(?:png|jpeg);base64/.test(r.pages[0].svg)).toBe(true);expect(r.pages[0].svg).not.toContain('<text');});
 it('measures capacity and includes every selected event on additional slides',async()=>{const p=newProject();p.week='2026-10-19';p.events=Array.from({length:12},(_,i)=>event(String(i)));p.selected=p.events.map(e=>e.id);const r=await renderProject(p);expect(r.pages.length).toBeGreaterThan(1);expect(r.pages.reduce((n,page)=>n+page.eventCount,0)).toBe(12);expect(r.capacity[0].events).toBe(12);expect(r.capacity[0].used).toBeLessThanOrEqual(r.capacity[0].available);});
 it('reflows remaining dates when individual days are skipped',async()=>{const p=newProject();p.week='2026-10-19';p.events=[event('a'),event('b',21)];p.selected=['a','b'];p.skippedDays=['2026-10-20','2026-10-22','2026-10-23'];const r=await renderProject(p);expect(visibleDays(p)).toEqual(['2026-10-19','2026-10-21']);expect(r.capacity).toHaveLength(2);expect(r.capacity[0].available).toBeGreaterThan(180);expect(r.hiddenDays).toBe(3);});
 it('automatically omits empty dates without losing chosen events',async()=>{const p=newProject();p.week='2026-10-19';p.hideEmptyDays=true;p.events=[event('a')];p.selected=['a'];const r=await renderProject(p);expect(r.capacity).toHaveLength(1);expect(r.count).toBe(1);expect(r.capacity[0].available).toBeGreaterThan(400);});
 it('hides individual fields and prevents fully invisible or oversized events',async()=>{const p=newProject();p.week='2026-10-19';p.events=[event('a')];p.selected=['a'];p.edits.a={showTitle:false,showTime:false,showLocation:false,showDescription:false};let r=await renderProject(p);expect(r.warnings[0]).toContain('every field hidden');p.edits.a={title:'A very detailed event '.repeat(40)};r=await renderProject(p);expect(r.warnings.join()).toContain('too long');p.edits.a={showDescription:false,showLocation:false};r=await renderProject(p);expect(r.warnings).toEqual([]);});
 it('fills the tall weekend Story layout instead of padding a Post',async()=>{const p=newProject();p.week='2026-10-19';p.layout='weekend';p.format='story';p.events=[event('a',24),event('b',25)];p.selected=['a','b'];const r=await renderProject(p);expect(r.pages[0].height).toBe(1920);expect(r.capacity[0].available).toBeGreaterThan(600);expect(r.capacity).toHaveLength(2);expect(r.warnings).toEqual([]);});
 it('uses original October outlines and reserves the same bottom margin in all six layouts',async()=>{
  for(const layout of ['weekly','weekend'] as const)for(const format of ['portrait','story','original'] as const){
   const p={...newProject(),week:'2026-10-19',layout,format};const r=await renderProject(p);const svg=r.pages[0].svg;
   expect(svg).toContain('aria-label="OCT 2026"');expect(svg).toContain('<use');expect(svg).toContain('id="badge-paper-tone"');
   const boxes=[...svg.matchAll(/<rect data-day="[^"]+" x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/g)];
   const last=boxes.at(-1)!;const height=format==='story'?1945:651;
   expect(Number(last[1])+Number(last[2])).toBeCloseTo(height*.96,6);expect(boxes).toHaveLength(layout==='weekly'?5:2);
   expect(svg).not.toMatch(/\bd="[^"]*(?:NaN|Infinity)/);
  }
 });
 it('moves heading and month independently and increases badge height without changing event capacity',async()=>{
  const p={...newProject(),week:'2026-10-19'};const original=await renderProject(p);
  const adjusted=await renderProject({...p,headingOffset:-1,stampOffset:1,badgeHeight:1.5});
  expect(adjusted.capacity).toEqual(original.capacity);
  for(const layer of ['heading','month-stamp']){
   const translation=(svg:string)=>Number(svg.match(new RegExp(`data-layer="${layer}"[^>]*transform="translate\\(0 ([^)]*)\\)`))![1]);
   expect(translation(adjusted.pages[0].svg)-translation(original.pages[0].svg)).toBeCloseTo(layer==='heading'?-6.51:6.51,6);
  }
  expect(adjusted.pages[0].svg).toContain('scale(1 1.5)');
 });
 it('fits three short events per day on one full-week list Story',async()=>{
  const p={...newProject(),week:'2026-10-19',template:'list' as const,layout:'full-week' as const,format:'story' as const,showTime:false};
  p.events=Array.from({length:21},(_,i)=>({...event(String(i),19+Math.floor(i/3)),title:['Line Dancing','Campus meetup','Movie Night'][i%3],location:'UNBC'}));p.selected=p.events.map(e=>e.id);
  const r=await renderProject(p);expect(r.warnings).toEqual([]);expect(r.pages).toHaveLength(1);expect(r.pages[0].eventCount).toBe(21);expect(r.capacity).toHaveLength(7);expect(r.pages[0].svg).toContain('Oct 19 – 25, 2026');expect(r.pages[0].svg).toContain('data-day="2026-10-25"');expect(r.pages[0].svg).not.toContain('<text');
 });
 it('paginates list events without dropping entries and reflows skipped dates in every format',async()=>{
  for(const format of ['portrait','story','original'] as const){const p={...newProject(),week:'2026-10-19',template:'list' as const,layout:'full-week' as const,format,showTime:false};p.events=Array.from({length:40},(_,i)=>({...event(String(i),19+i%7),title:'Campus event',location:'UNBC'}));p.selected=p.events.map(e=>e.id);p.skippedDays=['2026-10-21'];const r=await renderProject(p);expect(r.warnings).toEqual([]);expect(r.count).toBe(p.events.filter(e=>!e.start.startsWith('2026-10-21')).length);expect(r.pages.reduce((n,page)=>n+page.eventCount,0)).toBe(r.count);expect(r.capacity).toHaveLength(6);expect(r.hiddenDays).toBe(1);for(const day of r.capacity)expect(day.used).toBeLessThanOrEqual(day.available);}
 });
 it('blocks oversized and invisible list entries before export',async()=>{const p={...newProject(),week:'2026-10-19',template:'list' as const,layout:'full-week' as const,format:'story' as const};p.events=[{...event('long'),title:'Long detailed title '.repeat(100)}];p.selected=['long'];let r=await renderProject(p);expect(r.warnings.join()).toContain('too long');p.edits.long={showTitle:false,showTime:false,showLocation:false,showDescription:false};r=await renderProject(p);expect(r.warnings.join()).toContain('every field hidden');});
});
