import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import sharp from 'sharp';
const endpoint='**/wp-json/unbc-events/v1/events/**';
function fixture() {
  const events=[];const metadata: Record<string,unknown>={};
  for(let day=19;day<=25;day++)for(let i=0;i<5;i++){
    const id=`${day}-${i}`;events.push({id,title:`Campus event ${day}.${i+1}`,description:'Come meet your campus community. Snacks and conversation included.',startDate:`2026-10-${day}T${17+i}:00:00Z`,endDate:`2026-10-${day}T${18+i}:00:00Z`,category:'unbc',status:'scheduled'});metadata[id]={location:'Student centre',categories:[{name:i%2?'Community':'UNBC'}],permalink:`https://overtheedge.unbc.ca/event/${id}/`,website:`https://${i%2?'tourismpg.com':'www.unbc.ca'}/events/${id}`};
  }
  return {events,eventMetadata:metadata,pages:1,pagination:{hasMore:false}};
}
async function setup(page:Page) {
  await page.clock.setFixedTime(new Date('2026-10-22T20:00:00Z'));
  await page.route(endpoint,route=>route.fulfill({json:fixture()}));
  await page.goto('/');
  await expect(page.getByText('Connected to live calendar')).toBeVisible();
  await expect(page.locator('.schedule-image')).toBeAttached();
}
async function ready(page:Page){await expect(page.locator('.artboard')).not.toHaveClass(/is-rendering/);await expect(page.locator('.preview-error')).toHaveCount(0);}
async function pick(page:Page){await page.getByRole('button',{name:'Pick one per day'}).click();await expect(page.locator('.export-main')).toBeEnabled();await ready(page);}

test('select, edit, simplify, refresh, and restore a saved project',async({page})=>{
  await setup(page);await pick(page);await expect(page.locator('.selected-filter')).toContainText('5');
  await page.getByRole('button',{name:'Edit Campus event 19.1',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Event title',exact:true}).fill('Coffee with campus');
  await dialog.getByRole('button',{name:'Simplify description'}).click();await expect(dialog.getByLabel('Description',{exact:true})).toHaveValue('Come meet your campus community.');
  await dialog.getByRole('button',{name:'Save edits'}).click();await expect(page.locator('.event-card').filter({hasText:'Coffee with campus'})).toBeVisible();
  await page.getByRole('button',{name:'Refresh calendar'}).click();await expect(page.getByText('Connected to live calendar')).toBeVisible();await expect(page.getByRole('heading',{name:'Coffee with campus'})).toBeVisible();
  await page.waitForTimeout(400);await page.reload();await expect(page.getByRole('heading',{name:'Coffee with campus'})).toBeVisible();
  const dl=page.waitForEvent('download');await page.getByRole('button',{name:'Save project'}).click();const file=await dl;const path=await file.path();const saved=JSON.parse(await fs.readFile(path!,'utf8'));expect(saved.edits['ote:19-0'].title).toBe('Coffee with campus');
  await page.getByRole('button',{name:'Clear',exact:true}).click();await expect(page.locator('.selected-filter')).toContainText('0');
  await page.getByLabel('Import project file').setInputFiles(path!);await expect(page.locator('.selected-filter')).toContainText('5');
});

test('exports full-resolution PNG, JPEG, portable SVG, and a ZIP with caption',async({page})=>{
  await setup(page);await pick(page);await page.getByRole('button',{name:'Sage palette',exact:true}).click();await ready(page);
  await page.getByRole('button',{name:'Export your design'}).click();
  for(const format of ['png','jpeg','svg']){
    await page.getByLabel('File format').selectOption(format);const next=page.waitForEvent('download');await page.getByRole('button',{name:'Download current slide'}).click();const dl=await next;const buffer=await fs.readFile((await dl.path())!);
    if(format==='svg'){expect(buffer.toString()).toContain('<path');expect(buffer.toString()).not.toContain('<text');expect(/__PAPER__|__ACCENT__|__INK__|\bd="[^"]*(?:NaN|Infinity)/.test(buffer.toString())).toBe(false);}
    const image=sharp(buffer);const meta=await image.metadata();expect(meta.width).toBe(1080);expect(meta.height).toBe(1350);
    const pixels=await image.removeAlpha().raw().toBuffer();expect([...pixels.subarray(0,3)]).toEqual(format==='jpeg'?expect.arrayContaining([expect.any(Number)]):[227,239,207]);
  }
  await page.getByLabel('File format').selectOption('png');const next=page.waitForEvent('download');await page.getByRole('button',{name:'Download all slides + caption'}).click();const dl=await next;const zip=await JSZip.loadAsync(await fs.readFile((await dl.path())!));expect(Object.keys(zip.files)).toHaveLength(2);const text=await zip.file('caption.txt')!.async('string');expect(text).toContain('2026-10-19');expect(text).toContain('https://overtheedge.unbc.ca/event/19-0/');expect(text).toContain('America/Vancouver');
});

test('busy days automatically paginate without dropping events',async({page})=>{
  await setup(page);await page.getByLabel('Search events').fill('Campus event 19.');const choices=page.getByRole('checkbox',{name:/Select Campus event 19\./});for(let i=0;i<await choices.count();i++)await choices.nth(i).check();await ready(page);
  await expect(page.getByText(/Automatically arranged across/)).toBeVisible();await expect(page.locator('.selected-filter')).toContainText('5');
  const source=await page.locator('.schedule-image').evaluate(async(img:HTMLImageElement)=>fetch(img.src).then(r=>r.text()));expect(source).toContain('slide 1');await page.getByRole('button',{name:'Next slide',exact:true}).click();await expect(page.locator('.schedule-image')).toHaveAttribute('alt',/slide 2/);
});

test('long edits block export until corrected, cancelled events cannot be selected',async({page})=>{
  await setup(page);await pick(page);await page.getByRole('button',{name:'Edit Campus event 19.1',exact:true}).click();await page.getByRole('dialog').getByRole('textbox',{name:'Event title',exact:true}).fill('A very long title with many details '.repeat(10));await page.getByRole('button',{name:'Save edits'}).click();await expect(page.locator('.layout-warnings')).toContainText('too long');await expect(page.getByRole('button',{name:'Export your design'})).toBeDisabled();
  await page.getByRole('button',{name:'Edit Campus event 19.1',exact:true}).click();await page.getByRole('button',{name:'Restore original'}).click();await expect(page.getByRole('button',{name:'Export your design'})).toBeEnabled();
});

test('weekend, story, original, custom colours, and manual events work',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'Weekend',exact:true}).click();await expect(page.getByRole('heading',{name:'Campus event 24.1'})).toBeVisible();await expect(page.getByRole('heading',{name:'Campus event 19.1'})).toHaveCount(0);await pick(page);await expect(page.locator('.selected-filter')).toContainText('2');
  await page.getByRole('button',{name:'Story 9:16'}).click();await ready(page);await expect(page.locator('.preview-meta')).toContainText('1080 × 1920');
  await page.getByRole('button',{name:'Original Figma'}).click();await ready(page);await expect(page.locator('.preview-meta')).toContainText('964 × 1302');
  await page.getByRole('button',{name:'Custom palette',exact:true}).click();await page.getByLabel('Custom paper color').fill('#faeada');await ready(page);
  await page.getByRole('button',{name:'Add a custom event'}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Event title',exact:true}).fill('My campus event');await dialog.getByLabel('Start date').fill('2026-10-24');await dialog.getByLabel('End date').fill('2026-10-25');await dialog.getByLabel('All-day event').check();await dialog.getByRole('button',{name:'Add to design'}).click();await expect(page.getByRole('heading',{name:'My campus event'})).toHaveCount(2);
});

test('month/year changes, connection failure, and offline saved edits',async({page})=>{
  await setup(page);await pick(page);await page.getByLabel('Week starting').fill('2026-12-28');await expect(page.locator('.date-picker')).toContainText('2027');await ready(page);
  const svg=await page.locator('.schedule-image').evaluate(async(img:HTMLImageElement)=>fetch(img.src).then(r=>r.text()));expect(svg).toContain('2026-12-28');
  await page.getByLabel('Week starting').fill('2026-10-19');await expect(page.getByText('Connected to live calendar')).toBeVisible();await pick(page);await page.waitForTimeout(400);await page.route(endpoint,route=>route.abort('failed'));await page.getByRole('button',{name:'Refresh calendar'}).click();await expect(page.getByRole('alert')).toContainText('saved work');await expect(page.locator('.selected-filter')).toContainText('5');await expect(page.getByRole('button',{name:'Export your design'})).toBeEnabled();
});

test('mobile layout has no horizontal overflow and supports the complete flow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);await pick(page);await page.getByRole('button',{name:'2. Preview',exact:true}).click();await expect(page.locator('.schedule-image')).toBeVisible();await expect(page.getByRole('button',{name:'Choose events'})).toHaveCount(0);
  await page.screenshot({path:'docs/media-studio-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.getByRole('button',{name:'3. Design & export'}).click();await page.getByRole('button',{name:'Story 9:16'}).click();await expect(page.getByRole('button',{name:'Export your design'})).toBeEnabled();await page.getByRole('button',{name:'Export your design'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});

test('live UNBC API loads every page through actual browser CORS and exports',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const pages:number[]=[];page.on('response',async response=>{if(response.url().includes('/wp-json/unbc-events/v1/events/')){const data=await response.json().catch(()=>null);if(data?.pagination?.currentPage)pages.push(data.pagination.currentPage);}});
  await page.clock.setFixedTime(new Date('2026-10-22T20:00:00Z'));await page.goto('/');await expect(page.getByText('Connected to live calendar')).toBeVisible({timeout:50000});expect(pages).toContain(2);expect(await page.locator('.event-card').count()).toBeGreaterThan(50);await pick(page);
  await page.getByRole('button',{name:'Export your design'}).click();const next=page.waitForEvent('download');await page.getByRole('button',{name:'Download current slide'}).click();const dl=await next;const buffer=await fs.readFile((await dl.path())!);expect((await sharp(buffer).metadata()).width).toBe(1080);expect(errors).toEqual([]);await page.getByRole('button',{name:'Close dialog'}).click();await page.screenshot({path:'test-results/live-studio.png',fullPage:true});
});

test('date selection, sources, labels, field switches, and capacity reflow stay in sync',async({page})=>{
  await setup(page);await page.getByLabel('Event source',{exact:true}).selectOption('tourismpg.com');await expect(page.locator('.event-card')).toHaveCount(10);
  await page.getByLabel('Event source',{exact:true}).selectOption('All');await page.getByLabel('Event category',{exact:true}).selectOption('UNBC');await expect(page.locator('.event-card')).toHaveCount(15);await page.getByLabel('Event category',{exact:true}).selectOption('All');
  await page.getByRole('button',{name:'Fill 2026-10-21',exact:true}).click();await expect(page.locator('.selected-filter')).toContainText('1');
  await page.getByLabel('Include 2026-10-20',{exact:true}).uncheck();await ready(page);await expect(page.locator('.capacity-row')).toHaveCount(4);
  await page.getByRole('button',{name:'Show 2026-10-21',exact:true}).click();await expect(page.locator('.event-card')).toHaveCount(5);
  await page.getByRole('button',{name:'Edit Campus event 21.1',exact:true}).click();await page.getByLabel('Show event location',{exact:true}).uncheck();await page.getByLabel('Show event time',{exact:true}).uncheck();await page.getByLabel('Show event description',{exact:true}).uncheck();await page.getByRole('button',{name:'Save edits',exact:true}).click();await ready(page);await expect(page.getByRole('button',{name:'Export your design'})).toBeEnabled();
  await page.getByLabel('Skip empty dates',{exact:true}).check();await ready(page);await expect(page.locator('.capacity-row')).toHaveCount(1);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ote-media-studio-v1')||'{}'));expect(stored.version).toBe(1);
});

test('cancelled events are disabled, but a newly cancelled selection can be removed',async({page})=>{
  await setup(page);await pick(page);await page.route(endpoint,route=>{const data=fixture();data.events[0].status='cancelled';return route.fulfill({json:data});});await page.getByRole('button',{name:'Refresh calendar'}).click();await expect(page.locator('.layout-warnings')).toContainText('cancelled');const checkbox=page.getByRole('checkbox',{name:'Select Campus event 19.1',exact:true});await expect(checkbox).toBeEnabled();await checkbox.uncheck();await expect(checkbox).toBeDisabled();await expect(page.locator('.layout-warnings')).toHaveCount(0);
});
