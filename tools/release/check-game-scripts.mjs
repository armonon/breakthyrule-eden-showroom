// Parse every loaded game script without launching a Node process for each classic script.
import fs from 'node:fs';
import {Script} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url)),scripts=new Map();
for(const page of ['showroom.html','expedition.html']){
  const html=fs.readFileSync(new URL(page,new URL('../../',import.meta.url)),'utf8');
  for(const [,attrs] of html.matchAll(/<script\b([^>]*)>/gi)){
    const src=attrs.match(/\bsrc\s*=\s*['"](\/[^'"?]+\.m?js)(?:\?[^'"]*)?['"]/i);
    if(!src)continue;
    const name=decodeURIComponent(src[1].slice(1)),module=/\btype\s*=\s*['"]module['"]/i.test(attrs);
    scripts.set(name+'|'+module,{name,module});
  }
}
let failed=0;
for(const {name,module} of scripts.values()){
  try{
    const text=fs.readFileSync(root+name,'utf8');
    if(module){
      const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:text,encoding:'utf8'});
      if(result.error||result.status!==0)throw result.error||Error(result.stderr.trim());
    }else new Script(text,{filename:name});
  }catch(error){console.error(name+': '+error.message);failed++;}
}
if(failed)process.exitCode=1;
else console.log('Syntax checked '+scripts.size+' loaded game scripts.');
