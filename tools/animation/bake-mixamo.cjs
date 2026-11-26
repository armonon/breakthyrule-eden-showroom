// Reproducible offline bake of the COWNinja / Beyond Eden Mixamo source bundle.
// npm install --prefix .anim-work three@0.158.0 --no-audit --no-fund
// node tools/animation/bake-mixamo.cjs           merge all 15 into the shared library
// node tools/animation/bake-mixamo.cjs --check   rebake and verify, without writing
// Optional --source-dir /path/to/mixamo for an equivalent local source bundle.
// --legacy runs the preserved original .anim-work/mixamo build-kit workflow.
// No browser, renderer, network fetch, skin, or image decoding is needed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const ROOT=path.join(__dirname,'../..'),OUT=path.join(ROOT,'assets/anim/clips.json');
const CHECK=process.argv.includes('--check'),sourceArg=process.argv.indexOf('--source-dir');
const DIR=sourceArg>=0?path.resolve(process.argv[sourceArg+1]):path.join(ROOT,'assets/cowninja/mixamo');
const THREE=path.join(ROOT,'.anim-work/node_modules/three');
const WANT=JSON.parse(fs.readFileSync(path.join(__dirname,'mixamo-clips.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const importFile=f=>import(pathToFileURL(f).href);

if(process.argv.includes('--legacy'))require('./bake-mixamo-legacy.cjs');
else (async()=>{
 if(!fs.existsSync(THREE))throw Error('Install the pinned baker: npm install --prefix .anim-work three@0.158.0 --no-audit --no-fund');
 const version=JSON.parse(fs.readFileSync(path.join(THREE,'package.json'),'utf8')).version;
 if(version!=='0.158.0')throw Error('The reproducible baker requires three@0.158.0; found '+version);
 const T=await importFile(path.join(THREE,'build/three.module.js'));
 const {FBXLoader}=await importFile(path.join(THREE,'examples/jsm/loaders/FBXLoader.js'));
 const {createBaker}=await importFile(path.join(__dirname,'bake-core.mjs'));
 const {processClip,mergeLibrary}=await importFile(path.join(__dirname,'mixamo-postprocess.mjs'));
 const load=async file=>{const b=fs.readFileSync(file);return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),path.dirname(file)+'/');};
 // The full Falling To Roll starts 14 frames in mid-air. Movement already owns
 // that fall, so pkRoll begins at its first ground contact, retaining compression.
 const jobs=WANT.map(w=>({id:w.id,src:'mixamoX',url:path.join(DIR,w.file),clip:null,loop:w.loop,startTime:w.startTime||0,rootXZ:!!w.rootXZ}));
 for(const j of jobs)if(!fs.existsSync(j.url))throw Error('Missing source: '+j.url);
 const baked=await createBaker(T,load)(jobs,{},30);
 for(const w of WANT)baked.clips[w.id]=processClip(T,baked.clips[w.id],w.rootMotion,baked.bones.length);
 const lib=JSON.parse(fs.readFileSync(OUT,'utf8')),merged=mergeLibrary(lib,baked);
 const changed=Object.entries(baked.clips).filter(([id,c])=>JSON.stringify(lib.clips[id])!==JSON.stringify(c)).map(([id])=>id);
 if(CHECK){
  if(changed.length||JSON.stringify(lib.sources.mixamoX)!==JSON.stringify(baked.sources.mixamoX))throw Error('Runtime bake is stale: '+changed.join(', '));
  console.log('Verified all 15 Mixamo source files reproduce their runtime clips.');
 }else{
  merged.credits=(lib.credits||'').replace(/ \(royalty-free for use in projects; raw files not redistributed\)/,' (royalty-free for use in projects)');
  fs.writeFileSync(OUT,JSON.stringify(merged));
  const manifest={source:'Adobe Mixamo / X Bot',baker:'three@0.158.0',fps:30,
   settings:{format:'FBX Binary',skin:'Without Skin',keyframeReduction:'none'},
   runtimeSha256:sha(fs.readFileSync(OUT)),
   clips:WANT.map(w=>({...w,sourceSha256:sha(fs.readFileSync(path.join(DIR,w.file))),duration:baked.clips[w.id].duration,frames:baked.clips[w.id].n}))};
  fs.writeFileSync(path.join(ROOT,'assets/anim/mixamo-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const creditFile=path.join(ROOT,'assets/anim/CREDITS.txt');
  const credits=fs.readFileSync(creditFile,'utf8').replace(/animation library — \d+ clips/,'animation library — '+Object.keys(merged.clips).length+' clips')
   .replace(/Runtime clips\.json SHA-256: [a-f0-9]+/,'Runtime clips.json SHA-256: '+manifest.runtimeSha256);
  fs.writeFileSync(creditFile,credits);
  console.log('Merged '+WANT.length+' source clips; preserved '+(Object.keys(lib.clips).length-WANT.filter(w=>lib.clips[w.id]).length)+' existing clips.');
 }
 for(const w of WANT){const c=baked.clips[w.id];console.log(w.id.padEnd(17),c.duration+'s',c.n+' frames',w.rootMotion);}
})().catch(e=>{console.error('Mixamo bake failed:',e.stack||e.message);process.exitCode=1;});
