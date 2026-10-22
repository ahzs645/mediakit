import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir('docs/visual-comparison',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://127.0.0.1:5173/');
const entries=[];
for(const [key,file,layout,format,width,height] of [
 ['weekday-post','Instagram post - 131.svg','weekly','original',482,651],
 ['weekend-post','Instagram post - 136.svg','weekend','original',482,651],
 ['weekday-story','Instagram story - 15.svg','weekly','story',1080,1945],
]){
 const rendered=await page.evaluate(async({layout,format})=>{
  const {newProject}=await import('/src/storage.ts'); const {renderProject}=await import('/src/render.ts');const p=newProject();Object.assign(p,{week:'2026-10-05',layout,format,palette:layout==='weekend'?'forest':'cream'});const r=await renderProject(p);return r.pages[0].svg;
 },{layout,format});
 const native=Buffer.from(rendered.replace(/width="\d+" height="\d+" viewBox="[^"]*"/,`width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`));
 const reference=await sharp(await readFile(`design-reference/${file}`)).resize(width,height).ensureAlpha().raw().toBuffer();
 const actual=await sharp(native).resize(width,height).ensureAlpha().raw().toBuffer();
 const overlay=Buffer.alloc(reference.length),diff=Buffer.alloc(reference.length);let changed=0,outsideChanged=0,outsideTotal=0;
 // Exclude replaced month/year and day typography when measuring retained artwork.
 const isDynamic=(x,y)=>{
  const m=width/482;
  if(x>315*m&&x<460*m&&y<165*m)return true;
  if(width===1080)return x>65&&x<248&&y>420;
  if(layout==='weekend')return x>55&&x<120&&((y>240&&y<325)||(y>465&&y<550));
  return x>25&&x<85&&y>160;
 };
 for(let i=0;i<reference.length;i+=4){let delta=0;for(let c=0;c<3;c++){overlay[i+c]=Math.round((reference[i+c]+actual[i+c])/2);delta=Math.max(delta,Math.abs(reference[i+c]-actual[i+c]));}overlay[i+3]=255;const x=i/4%width,y=Math.floor(i/4/width),dynamic=isDynamic(x,y);if(delta>20)changed++;if(!dynamic){outsideTotal++;if(delta>20)outsideChanged++;}diff[i]=delta>20?181:245;diff[i+1]=delta>20?53:247;diff[i+2]=delta>20?87:240;diff[i+3]=255;}
 const out=`docs/visual-comparison/${key}`;for(const [suffix,bytes]of[['reference',reference],['actual',actual],['overlay',overlay],['difference',diff]])await sharp(bytes,{raw:{width,height,channels:4}}).png().toFile(`${out}-${suffix}.png`);
 entries.push({key,width,height,changedPercent:Number((changed/(width*height)*100).toFixed(3)),retainedArtworkMatch:Number((100-outsideChanged/outsideTotal*100).toFixed(3))});
}
await browser.close();
await writeFile('docs/visual-comparison/metrics.json',JSON.stringify(entries,null,2));
const styles=`body{font:14px system-ui;background:#f4f6ef;color:#31452c;margin:30px auto;padding:0 22px;max-width:1400px}h1{letter-spacing:-1px}p{line-height:1.8;color:#718565;max-width:900px}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:25px 0 45px}img{width:100%;border:1px solid #d5dfcb}figure{margin:0}figcaption{font-size:11px;color:#718565;padding:10px 0}strong{font-weight:600}label{display:block;margin:14px 0}input{width:220px}.overlay{position:relative}.overlay img+img{position:absolute;inset:0;opacity:.5}.metric{font-size:12px;background:#e5efdb;padding:8px 12px;border-radius:6px;display:inline-block}@media(max-width:700px){.row{grid-template-columns:repeat(2,1fr)}}`;
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Media Studio · visual comparison</title><style>${styles}</style><h1>Media Studio · aligned overlay analysis</h1><p>Reference and output are aligned at the supplied SVG’s native viewBox, with October 5–9 / October 10–11, 2026. No event content is included so structural differences are visible. The post overlays use the exact original aspect ratio. Instagram Post (4:5) and Story (9:16) preserve this artwork without stretching.</p><p><strong>Preserved:</strong> original title paths, watermark paths, badge silhouettes, embedded texture images, and five/two-day frame geometry. The SVG badge blend mode is adapted from Figma’s plus-darker to browser-supported multiply so textures survive canvas export. <strong>Dynamic replacement:</strong> month, year, and day lettering use bundled Kalam and Barlow Condensed fonts. This lettering is an approximation: the ZIP contains outlined paths, not editable original fonts. Weekend Story is reconstructed from the supplied weekend vectors and the proportions in the screenshot; its editable Figma SVG was not supplied.</p><p><strong>Corrections:</strong> full-height weekend Story boxes replace centred Post padding; invalid font path coordinates are prevented; date omissions reflow rows; content wraps into measured boxes; excess events continue on additional slides; an oversized individual event blocks export instead of clipping silently.</p><label>Overlay opacity <input type="range" min="0" max="1" step=".01" value=".5" oninput="document.querySelectorAll('.overlay img+img').forEach(i=>i.style.opacity=this.value)"></label>${entries.map(e=>`<section><h2>${e.key.replaceAll('-',' ')}</h2><span class="metric">${e.retainedArtworkMatch}% retained-artwork pixel agreement · ${e.changedPercent}% full image differs</span><div class="row"><figure><img src="${e.key}-reference.png"><figcaption>Supplied Figma SVG</figcaption></figure><figure><img src="${e.key}-actual.png"><figcaption>Dynamic output · original viewBox</figcaption></figure><figure class="overlay"><img src="${e.key}-reference.png"><img src="${e.key}-actual.png"><figcaption>Aligned overlay · use opacity slider</figcaption></figure><figure><img src="${e.key}-difference.png"><figcaption>Pixels differing by &gt;20 RGB units</figcaption></figure></div></section>`).join('')}<p>Pixel agreement excludes rectangular regions containing the intentionally replaced dates, uses a per-channel threshold of 20/255, and includes anti-aliasing differences. It measures retained artwork, not font fidelity or the reconstructed weekend Story. Full-image difference includes every pixel. Values are reproducible with <code>node scripts/compare-designs.mjs</code> while the dev server is running.</p></html>`;
await writeFile('docs/visual-comparison/index.html',html);console.log(JSON.stringify(entries));
