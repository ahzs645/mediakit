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
 else path=join(process.cwd(),'public/assets',filename);
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
});
