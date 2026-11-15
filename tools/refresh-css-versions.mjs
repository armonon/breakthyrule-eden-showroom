// Content-hash cache versions for stylesheets, the companion of tools/expedition/build-revision.mjs (which does scripts).
// Rewrites <link href="/x.css?v=..."> in the game pages to the first 16 hex of the file's sha256. Hand-picked
// versions (?v=about-1 and the like) on site pages are left alone; only the game pages use content hashes.
import fs from 'node:fs';import crypto from 'node:crypto';
const base=new URL('../',import.meta.url);
const pages=process.argv.slice(2).length?process.argv.slice(2):['showroom.html','expedition.html'];
let changed=0;
for(const page of pages){
 const url=new URL(page,base);if(!fs.existsSync(url))continue;const before=fs.readFileSync(url,'utf8');
 const after=before.replace(/(<link\b[^>]*\bhref=")(\/[^"?]+\.css)(?:\?v=[^"]*)?(")/g,(m,start,path,end)=>{
  const file=new URL(path.slice(1),base);if(!fs.existsSync(file))return m;
  return start+path+'?v='+crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0,16)+end;});
 if(after!==before){fs.writeFileSync(url,after);changed++;}
}
console.log(JSON.stringify({pages,changed}));
