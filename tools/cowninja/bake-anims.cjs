// COWNinja's climbing, leap and takedown clips (ids cn*), added to assets/anim/clips.json without rebaking the
// rest. A copy of tools/animation/bake-mixamo.cjs with its own clip list; the same steps apply, with the files named
// as below in .anim-work/mixamo/ (git-ignored: raw Mixamo files are not to be published, only the bake).
// Run: NODE_PATH=$(npm root -g) node tools/cowninja/bake-anims.cjs
//
// 1. On mixamo.com (free Adobe login), with the default "Y Bot" character, download each clip below as
//    FBX Binary, "Without Skin", 30 fps, "In Place" ticked where Mixamo offers it. Name the files as listed.
//    Also download "T-Pose" once, "With Skin", as tpose.fbx (the rest pose every clip is measured against).
// 2. Put them in .anim-work/mixamo/ (git-ignored: the raw Mixamo files must not be published, only the bake).
// 3. npm install --prefix .anim-work three@0.158.0   (once)
// 4. node tools/animation/bake-mixamo.cjs
// Any file that is missing is skipped; the game falls back to the older clip for that move.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const ROOT=path.join(__dirname,'../..'),DIR=path.join(ROOT,'.anim-work/mixamo'),OUT=path.join(ROOT,'assets/anim/clips.json');
// [our id, file, loop, Mixamo search term, keep hip height]
// Clips whose hip track is root motion (the body rising onto a ledge, over a wall, up a wall or through a leap) are
// stored flat: player-movement.js / parkour.js already move the body along that path, and the two would stack.
const WANT=[
 ['cnWallClimb','Climbing Up Wall.fbx',true,'Climbing Up Wall',true],
 ['cnShimmyR','Braced Hang Shimmy.fbx',true,'Braced Hang Shimmy',true],
 ['cnShimmyL','Braced Hang Shimmy - Mirrored.fbx',true,'Braced Hang Shimmy, Mirror ticked',true],
 ['cnHopUp','Braced Hang Hop Up.fbx',false,'Braced Hang Hop Up',false],
 ['cnHopL','Braced Hang Hop Left.fbx',false,'Braced Hang Hop Left',false],
 ['cnHopR','Braced Hang Hop Right.fbx',false,'Braced Hang Hop Right',false],
 ['cnPullUp','Braced Hang To Crouch.fbx',false,'Braced Hang To Crouch',false],
 ['cnClimbTop','Climbing To Top.fbx',false,'Climbing To Top',false],
 ['cnLadder','Climbing Ladder.fbx',true,'Climbing Ladder',true],
 ['cnDrop','Braced Hang Drop - To Standing.fbx',false,'Braced Hang Drop',false],
 ['cnRoll','Falling To Roll.fbx',false,'Falling To Roll',true],
 ['cnLeap','Running Jump.fbx',false,'Running Jump',false],
 ['cnStab','Stealth Assassination - Assassin.fbx',false,'Stealth Assassination (attacker)',true],
 ['cnStabbed','Stealth Assassination - Victim.fbx',false,'Stealth Assassination (victim)',true],
];
// .fbx from Mixamo, or the same name as .glb.
const found=f=>[f,f.replace(/\.fbx$/,'.glb')].find(n=>fs.existsSync(path.join(DIR,n)));
const jobs=WANT.filter(([,file])=>found(file)).map(([id,file,loop])=>({id,src:'mixamo',url:'/.anim-work/mixamo/'+found(file),clip:null,loop}));
if(!jobs.length){console.log('No clips in .anim-work/mixamo/. Expected:\n'+WANT.map(w=>`  ${w[1].padEnd(18)} Mixamo: ${w[3]}`).join('\n'));process.exit(1);}
const rest=found('tpose.fbx')?'/.anim-work/mixamo/'+found('tpose.fbx'):null;
if(!rest)console.log('No tpose.fbx: measuring the rest pose from the first clip (download T-Pose for a cleaner result).');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.fbx':'application/octet-stream','.glb':'model/gltf-binary','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);}).listen(0,'127.0.0.1');
(async()=>{await new Promise(r=>server.listening?r():server.once('listening',r));const port=server.address().port,b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`http://127.0.0.1:${port}/tools/animation/bake.html`);await p.waitForFunction(()=>window.ready,null,{timeout:60000});
 const baked=await p.evaluate(({jobs,rest})=>window.bake(jobs,rest?{mixamo:rest}:{},30),{jobs,rest});
 const lib=JSON.parse(fs.readFileSync(OUT,'utf8'));
 if(JSON.stringify(lib.bones)!==JSON.stringify(baked.bones))throw Error('bone list changed: rebake everything with bake-clips.cjs');
 for(const [id,,,,keepHip] of WANT)if(baked.clips[id]&&!keepHip)baked.clips[id].hip=Buffer.alloc(baked.clips[id].n*2).toString('base64');
 lib.sources.mixamo=baked.sources.mixamo;Object.assign(lib.clips,baked.clips);
 if(!/Mixamo/.test(lib.credits||''))lib.credits=(lib.credits||'')+' Parkour clips: Adobe Mixamo (royalty-free for use in projects; raw files not redistributed).';
 fs.writeFileSync(OUT,JSON.stringify(lib));
 for(const [id,c] of Object.entries(baked.clips))console.log(id.padEnd(11),c.duration+'s',c.n+' frames');
 console.log('clips',Object.keys(lib.clips).length,'bytes',fs.statSync(OUT).size);console.log(errs.join('\n')||'no errors');
 await b.close();server.close();})().catch(e=>{console.error('ERR',e.message);server.close();process.exit(1);});
