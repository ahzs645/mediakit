import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir('docs/visual-comparison',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://127.0.0.1:5173/');
const render=({layout,format})=>page.evaluate(async({layout,format})=>{
  const {newProject}=await import('/src/storage.ts');const {renderProject}=await import('/src/render.ts');
  const p={...newProject(),week:'2026-10-05',layout,format,palette:layout==='weekend'?'forest':'cream'};
  return (await renderProject(p)).pages[0].svg;
},{layout,format});
const entries=[];
for(const [key,file,layout,format,width,height] of [
 ['weekday-post','Instagram post - 131.svg','weekly','original',482,651],
 ['weekend-post','Instagram post - 136.svg','weekend','original',482,651],
 ['weekday-story','Instagram story - 15.svg','weekly','story',1080,1945],
 ['weekend-story','Weekend story.svg','weekend','story',1080,1945],
]){
 const rendered=await render({layout,format});
 const native=Buffer.from(rendered.replace(/width="\d+" height="\d+" viewBox="[^"]*"/,`width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"`));
 const reference=await sharp(await readFile(`design-reference/${file}`)).resize(width,height).ensureAlpha().raw().toBuffer();
 const actual=await sharp(native).resize(width,height).ensureAlpha().raw().toBuffer();
 const overlay=Buffer.alloc(reference.length),diff=Buffer.alloc(reference.length);let changed=0;
 for(let i=0;i<reference.length;i+=4){
  let delta=0;for(let c=0;c<3;c++){overlay[i+c]=Math.round((reference[i+c]+actual[i+c])/2);delta=Math.max(delta,Math.abs(reference[i+c]-actual[i+c]));}
  overlay[i+3]=255;if(delta>20)changed++;
  diff[i]=delta>20?181:245;diff[i+1]=delta>20?53:247;diff[i+2]=delta>20?87:240;diff[i+3]=255;
 }
 const out=`docs/visual-comparison/${key}`;
 for(const [suffix,bytes]of [['reference',reference],['actual',actual],['overlay',overlay],['difference',diff]])await sharp(bytes,{raw:{width,height,channels:4}}).png().toFile(`${out}-${suffix}.png`);
 entries.push({key,width,height,changedPercent:Number((changed/(width*height)*100).toFixed(3))});
}
// Actual export dimensions, arranged by layout and format for margin inspection.
const tiles=[];let index=0;
for(const layout of ['weekly','weekend'])for(const format of ['portrait','story','original']){
 const svg=await render({layout,format});const image=await sharp(Buffer.from(svg)).resize({width:300}).png().toBuffer();
 const label=Buffer.from(`<svg width="320" height="30"><text x="10" y="20" fill="#31452c" font-family="sans-serif" font-size="14">${layout==='weekly'?'Weekday':'Weekend'} · ${format==='portrait'?'Post 4:5':format==='story'?'Story 9:16':'Original'}</text></svg>`);
 const tile=await sharp({create:{width:320,height:600,channels:4,background:'#e9ece4'}}).composite([{input:label,left:0,top:0},{input:image,left:10,top:35}]).png().toBuffer();
 tiles.push({input:tile,left:index%3*320,top:Math.floor(index/3)*600});index++;
}
await sharp({create:{width:960,height:1200,channels:4,background:'#e9ece4'}}).composite(tiles).png().toFile('docs/layout-variants.png');
await browser.close();
await writeFile('docs/visual-comparison/metrics.json',JSON.stringify(entries,null,2));
const styles=`body{font:14px system-ui;background:#f4f6ef;color:#31452c;margin:30px auto;padding:0 22px;max-width:1400px}h1{letter-spacing:-1px}p,li{line-height:1.8;color:#657858}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:25px 0 45px}img{width:100%;border:1px solid #d5dfcb}figure{margin:0}figcaption{font-size:11px;color:#718565;padding:10px 0}label{display:block;margin:14px 0}input{width:220px}.overlay{position:relative}.overlay img+img{position:absolute;inset:0;opacity:.5}.metric{font-size:12px;background:#e5efdb;padding:8px 12px;border-radius:6px;display:inline-block}.variants{max-width:960px}@media(max-width:700px){.row{grid-template-columns:repeat(2,1fr)}}`;
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Media Studio · visual comparison</title><style>${styles}</style><h1>Media Studio · aligned overlay analysis</h1><p>Four original SVG references, including the weekend Story from the new Section 1 montage, are aligned at their native viewBox. The dynamic output uses October 5–9 / October 10–11, 2026. Reference day numbers are static; output dates follow the real calendar.</p><ul><li>The original heading silhouettes and October 2026 Salted lettering are retained. Heading and month can move independently.</li><li>Every format uses a 4% top heading / bottom frame margin by default. Badge heights default to 120%, with a 100–150% control. These deliberate spacing changes appear in the difference images.</li><li>The watermark repeats one complete original eleven-letter vector logo on the original staggered lattice, across the full canvas. Duplicate source logos are removed and aspect-ratio padding also contains the pattern.</li><li>The original paper photograph is directly tinted for each day badge. Its texture survives browser image/canvas rendering without depending on Figma blend modes.</li><li>Other months use Kalam unless the user loads a local font such as Salted. Local font files stay in browser storage and are excluded from the public repo and project backups.</li></ul><h2>Actual export proportions</h2><p>Columns: Post, Story, Original. Rows: weekday, weekend. Blank canvas bands in the application preview are fixed by sizing the artboard to both available dimensions.</p><img class="variants" src="../layout-variants.png" alt="All six schedule layouts"><label>Overlay opacity <input type="range" min="0" max="1" step=".01" value=".5" oninput="document.querySelectorAll('.overlay img+img').forEach(i=>i.style.opacity=this.value)"></label>${entries.map(e=>`<section><h2>${e.key.replaceAll('-',' ')}</h2><span class="metric">${e.changedPercent}% of pixels differ by &gt;20 RGB units</span><div class="row"><figure><img src="${e.key}-reference.png"><figcaption>Supplied Figma SVG</figcaption></figure><figure><img src="${e.key}-actual.png"><figcaption>Dynamic output · aligned native viewBox</figcaption></figure><figure class="overlay"><img src="${e.key}-reference.png"><img src="${e.key}-actual.png"><figcaption>Aligned overlay · use opacity slider</figcaption></figure><figure><img src="${e.key}-difference.png"><figcaption>Difference, including deliberate spacing changes</figcaption></figure></div></section>`).join('')}<p>Difference percentages include every pixel, with a per-channel threshold of 20/255 and no excluded regions. They describe the visual change, not a claim of exact pixel fidelity. Native-viewBox alignment removes the small output-ratio adjustment only for the overlays. Automated browser tests separately check actual PNGs in all six layouts and three original palettes: texture, all four watermark edges, margins, dimensions, mobile preview sizing, and exports.</p></html>`;
await writeFile('docs/visual-comparison/index.html',html);console.log(JSON.stringify(entries));
