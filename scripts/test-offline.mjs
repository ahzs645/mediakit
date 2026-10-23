// Run after npm run build, with npm run preview serving port 4173.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext();const page=await context.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4173/');
 await page.getByText('Connected to live calendar').waitFor({timeout:50000});
 await page.getByRole('button',{name:'Add suggestions'}).click();
 await page.waitForFunction(()=>!document.querySelector('.export-main')?.disabled);
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ote-media-studio-v1')||'{}').selected?.length>0);
 await context.setOffline(true);
 await page.reload();
 await page.getByText('Saved calendar · offline').waitFor({timeout:15000});
 await page.waitForFunction(()=>!document.querySelector('.export-main')?.disabled);
 await page.getByRole('button',{name:'Export your design'}).click();
 const next=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download current slide'}).click();
 const download=await next;
 const metadata=await sharp(await readFile(await download.path())).metadata();
 if(metadata.width!==1080||metadata.height!==1350||errors.length)throw new Error(`Invalid offline export: ${JSON.stringify({width:metadata.width,height:metadata.height,errors})}`);
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('button',{name:'Weekly list',exact:false}).click();
 await page.waitForFunction(()=>!document.querySelector('.export-main')?.disabled);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ote-media-studio-v1')||'{}').template==='list');
 await page.reload();
 await page.getByText('Saved calendar · offline').waitFor({timeout:15000});
 await page.waitForFunction(()=>!document.querySelector('.export-main')?.disabled);
 await page.getByRole('button',{name:'Export your design'}).click();
 const listDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download current slide'}).click();
 const listMetadata=await sharp(await readFile(await(await listDownload).path())).metadata();
 if(listMetadata.width!==1080||listMetadata.height!==1920||errors.length)throw new Error(`Invalid offline list export: ${JSON.stringify({width:listMetadata.width,height:listMetadata.height,errors})}`);
 console.log('PASS: original cards and the seven-day list reload fully offline, preserve selections, and export 1080×1350 / 1080×1920 PNGs without script errors.');
} finally { await browser.close(); }
