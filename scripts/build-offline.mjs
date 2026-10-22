import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('dist',{recursive:true,withFileTypes:true})).filter(e=>e.isFile()&&e.name!=='sw.js').map(e=>`${e.parentPath}/${e.name}`.replace(/^dist\//,''));
const hash = createHash('sha256'); for (const file of [...files].sort()) { hash.update(file); hash.update(await readFile(`dist/${file}`)); }
const version=hash.digest('hex').slice(0,12);
await writeFile('dist/sw.js',`const PREFIX='media-studio-'+new URL(self.registration.scope).pathname+'-';
const CACHE=PREFIX+'${version}';
const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new URL(file,self.registration.scope).href))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>response.ok?response:caches.match(new URL('index.html',self.registration.scope),{cacheName:CACHE,ignoreVary:true})).catch(()=>caches.match(new URL('index.html',self.registration.scope),{cacheName:CACHE,ignoreVary:true})));return;
 }
 event.respondWith(caches.match(event.request,{cacheName:CACHE,ignoreVary:true}).then(cached=>cached||fetch(event.request)));
});\n`);
console.log(`Offline shell prepared: ${files.length} local files, version ${version}`);
