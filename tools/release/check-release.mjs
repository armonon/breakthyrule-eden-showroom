#!/usr/bin/env node
// Validate the actual publish directory, then stamp the exact source used by a build.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const root=path.resolve(option('--root')||fileURLToPath(new URL('../../',import.meta.url)));
const config=JSON.parse(fs.readFileSync(new URL('./required-assets.json',import.meta.url),'utf8'));
const failures=[],seen=new Map(),queue=[],visited=new Set();
const fail=message=>failures.push(message);
function localUrl(value,from='index.html'){
  if(!value||/^(?:[a-z]+:|\/\/|#)/i.test(value)||value.includes('${'))return null;
  try{
    const url=new URL(value,new URL(from,'https://release.invalid/'));
    const name=decodeURIComponent(url.pathname).replace(/^\//,'');
    if(!name||name.split('/').includes('..'))return null;
    return name;
  }catch{return null;}
}
function requireFile(name,reason){
  name=name.replace(/^\/+/, '');
  if(seen.has(name))return seen.get(name);
  const full=path.resolve(root,name);
  if(!full.startsWith(root+path.sep)){fail('Outside publish directory: '+name);return null;}
  try{
    if(!fs.statSync(full).isFile())throw Error('not a file');
    const bytes=fs.readFileSync(full);
    if(!bytes.length)throw Error('empty file');
    const item={path:name,bytes:bytes.length,sha1:crypto.createHash('sha1').update(bytes).digest('hex'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    seen.set(name,item);
    if(/\.(?:html|m?js|css)$/.test(name))queue.push({name,text:bytes.toString('utf8')});
    return item;
  }catch(error){fail(`${name} is unavailable (${reason}; ${error.code||error.message})`);return null;}
}
function readJson(name){
  if(!requireFile(name,'required catalog'))return null;
  try{return JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));}
  catch(error){fail(name+' is invalid JSON: '+error.message);return null;}
}
function catalogAsset(value,owner,expected){
  const name=localUrl('/'+String(value||'').replace(/^\//,''));
  if(!name){fail(owner+' has an invalid local asset path');return;}
  const item=requireFile(name,owner);
  if(item&&expected?.sha256&&item.sha256!==expected.sha256)fail(name+' differs from its catalog SHA256');
  if(item&&expected?.bytes!=null&&item.bytes!==expected.bytes)fail(name+' differs from its catalog byte count');
  return name;
}
for(const name of config.requiredEntries)requireFile(name,'public entry');
for(const name of config.requiredRuntime)requireFile(name,'game/runtime dependency');
for(const name of config.recoveredAssets)requireFile(name,'latest verified storefront asset baseline');

const sculptures=readJson('assets/museum-sculptures/catalog.json');
if(!Array.isArray(sculptures?.sculptures)||sculptures.sculptures.length<7)fail('Museum requires the seven catalogued sculptures');
else for(const sculpture of sculptures.sculptures){
  const name=catalogAsset(sculpture.file,'museum sculpture '+sculpture.id,sculpture);
  if(name&&seen.has(name)){
    const data=fs.readFileSync(path.join(root,name));
    if(data.length<12||data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(8)!==data.length)fail(name+' is not a complete GLB');
  }
}
const daily=readJson('assets/lost-eden/daily-apple/catalog.json');
if(!Array.isArray(daily?.pages)||daily.pages.length<56||daily.pages.length!==daily.page_count)fail('Daily Apple catalog must contain all declared pages (at least the original 56)');
else{
  const numbers=new Set();
  for(const page of daily.pages){
    if(numbers.has(page.page))fail('Duplicate Daily Apple page '+page.page);
    numbers.add(page.page);catalogAsset(page.file||page.url,'Daily Apple page '+page.page,page);
  }
  for(const highlight of daily.highlights||[])if(highlight.file)catalogAsset(highlight.file,'Daily Apple highlight',highlight);
  const pdf=catalogAsset(daily.pdf,'Daily Apple source PDF');
  if(pdf&&seen.has(pdf)&&fs.readFileSync(path.join(root,pdf)).toString('ascii',0,5)!=='%PDF-')fail(pdf+' is not a PDF');
}
const chapterManifest=readJson('assets/worlds/chapters.json');
for(const [id,chapter] of Object.entries(chapterManifest?.chapters||{})){
  if(chapter.status==='live'&&chapter.script){const name=localUrl(chapter.script);if(name)requireFile(name,'live chapter '+id);}
}
const exhibition='museum-exhibition.js';
if(seen.has(exhibition)){
  const text=fs.readFileSync(path.join(root,exhibition),'utf8');
  for(const match of text.matchAll(/\bart\('([^']+)'/g))requireFile('assets/museum-gallery/graphics-'+match[1]+'.webp','museum artwork');
  requireFile('assets/colour-collage-0524.jpg','museum original collage');
}

// Follow static module dependencies and each public entry's actual script/style URLs.
while(queue.length){
  const {name,text}=queue.shift();if(visited.has(name))continue;visited.add(name);
  const urls=[];
  if(name.endsWith('.html')){
    for(const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi))urls.push(m[1]);
    for(const m of text.matchAll(/<link\b[^>]*>/gi))if(/\brel\s*=\s*['"]stylesheet['"]/i.test(m[0])){
      const href=m[0].match(/\bhref\s*=\s*['"]([^'"]+)['"]/i);if(href)urls.push(href[1]);
    }
  }else if(/\.m?js$/.test(name)){
    for(const m of text.matchAll(/\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?['"]([^'"]+)['"]/g))if(/^(?:\/|\.\.?\/)/.test(m[1]))urls.push(m[1]);
    for(const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g))if(/^(?:\/|\.\.?\/)/.test(m[1]))urls.push(m[1]);
  }else if(name.endsWith('.css'))for(const m of text.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g))urls.push(m[1]);
  for(const url of urls){const dependency=localUrl(url,name);if(dependency)requireFile(dependency,'referenced by '+name);}
}
if(failures.length){
  console.error('Release blocked: '+failures.length+' missing or invalid dependencies.');
  for(const message of [...new Set(failures)])console.error(' - '+message);
  process.exitCode=1;
}else{
  const files=[...seen.values()].sort((a,b)=>a.path.localeCompare(b.path));
  const contentVersion=crypto.createHash('sha256').update(JSON.stringify(files.map(f=>[f.path,f.sha256]))).digest('hex');
  const clips=JSON.parse(fs.readFileSync(path.join(root,'assets/anim/clips.json'),'utf8'));
  const git=(...values)=>{try{return execFileSync('git',values,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}};
  const sourceCommit=option('--source-commit')||process.env.COMMIT_REF||git('rev-parse','HEAD');
  const sourceStatus=git('status','--porcelain','--untracked-files=normal');
  const sourceDirty=sourceStatus==null?null:sourceStatus.length>0;
  if(args.includes('--write-manifest')){
    if(!sourceCommit||!/^[a-f0-9]{40}$/i.test(sourceCommit))throw Error('A full source commit is required to stamp a release');
    const manifest={schemaVersion:2,generatedAt:new Date().toISOString(),sourceCommit,sourceCommitRole:sourceDirty?'base commit; uncommitted files are identified by contentVersion':'build source commit',sourceDirty,sourceBranch:process.env.BRANCH||git('branch','--show-current')||null,contentVersion,animationClips:Object.keys(clips.clips||{}).length,inputAuthorityEnabled:false,publicMultiplayerHostConfigured:false,internetMusicRelayConfigured:false,netlifyPathNormalization:'lowercase',coverage:{entryCount:config.requiredEntries.length,validatedFiles:files.length,museumSculptures:sculptures.sculptures.length,newspaperPages:daily.pages.length,recoveredStorefrontAssets:config.recoveredAssets.length},files};
    fs.writeFileSync(path.join(root,'game-release.json'),JSON.stringify(manifest,null,2)+'\n');
  }
  if(option('--report'))fs.writeFileSync(path.resolve(option('--report')),JSON.stringify({ok:true,root,sourceCommit,sourceDirty,contentVersion,files},null,2)+'\n');
  console.log(JSON.stringify({ok:true,sourceCommit,contentVersion,validatedFiles:files.length,museumSculptures:sculptures.sculptures.length,newspaperPages:daily.pages.length,animationClips:Object.keys(clips.clips||{}).length,manifestWritten:args.includes('--write-manifest')},null,2));
}
