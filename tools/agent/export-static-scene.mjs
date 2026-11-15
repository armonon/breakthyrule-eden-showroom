#!/usr/bin/env node
// Dump the live garden's static geometry for baking: world-space triangles grouped by material, with average albedo.
//   node tools/agent/export-static-scene.mjs --url http://127.0.0.1:8790/ --out DIR
// Writes DIR/scene.json (buckets) and DIR/scene.bin (Float32 xyz, non-indexed). Characters and animated things are left out.
// The sky box and its backstage are left out too: from inside the garden they read as open sky, so they must not block it.
// Grass and fake blob shadows would only darken the ground under them.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, sleep } from './headless-chrome.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : null).filter(Boolean));
const world=args.world||'eden';if(!['eden','beyond'].includes(world))throw Error('Use --world eden|beyond');
const out = args.out; fs.mkdirSync(out, { recursive: true });
const page = await openPage(); await page.goto(args.url || 'http://127.0.0.1:8790/showroom.html'); await page.ready(); await sleep(args.settle ? Number(args.settle) * 1000 : 25000);
await page.evaluate(`document.querySelectorAll('dialog[open]').forEach(d=>d.close())`);
if(world==='beyond'){
 await page.evaluate(`(async()=>{const S=breakThyRuleShowroom,g=S.garden();while(!g.warmNight())await new Promise(r=>setTimeout(r,60));S.teleport(10,-65);await new Promise(r=>setTimeout(r,1500));while(S.worlds().loading())await new Promise(r=>setTimeout(r,100));S.battle()?.suspend();g.nightRoad.setOverride(1);g.district.setLOD?.(false);g.district.prepare(nightLayout.landmarks.map(s=>s.id));const start=performance.now();while(Object.values(g.district.inspect().models).some(v=>v==='waiting'||v==='loading')){if(performance.now()-start>180000)throw Error('Landmark loading timed out');await new Promise(r=>setTimeout(r,250));}g.nightRoad.setOverride(1);g.nightRoad.update(performance.now()/1000,edenCamera);if(Object.values(g.district.inspect().models).includes('fallback'))throw Error('Incomplete bake: a landmark failed to load');})();`);
}
const lighting=await page.evaluate(`(()=>{const S=breakThyRuleShowroom,s=S.scene(),g=S.garden();if(${JSON.stringify(world)}==='beyond'){g.nightRoad.setOverride(1);g.nightRoad.update(performance.now()/1000,edenCamera);}const sun=s.children.find(o=>o.isDirectionalLight&&o.castShadow),d=new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize();return {world:${JSON.stringify(world)},bounds:window.nightLayout?[nightLayout.bounds[0],nightLayout.bounds[1],-190,nightLayout.bounds[3]]:null,lamps:g.nightBuilt()?g.district.lamps.map(p=>p.toArray()):[],moon:{direction:d.toArray(),color:sun.color.toArray(),intensity:sun.intensity},lamp:{color:new THREE.Color(0xffc68c).toArray(),intensity:10,decay:1.7,distance:13},sky:{horizon:[.012,.02,.016],zenith:[.002,.004,.005],strength:.7},models:g.nightBuilt()?g.district.inspect().models:{},unit:'game meters, Y up'};})()`);
fs.writeFileSync(path.join(out,'lighting.json'),JSON.stringify(lighting,null,2));
const names = await page.evaluate(`edenScene.children.map(o=>o.name||o.type)`); console.log('scene:', names.join(' | '));
const census = await page.evaluate(`(()=>{const rows=[];edenScene.traverse(o=>{if(o.isMesh&&o.visible&&o.geometry?.attributes?.position){const g=o.geometry,t=(g.index?g.index.count:g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);rows.push([o.name||o.parent?.name||'mesh',Math.round(t),o.isInstancedMesh?o.count:1]);}});rows.sort((a,b)=>b[1]-a[1]);return {meshes:rows.length,total:rows.reduce((s,r)=>s+r[1],0),top:rows.slice(0,8)};})()`);
console.log('census', JSON.stringify(census));
await page.evaluate(`(()=>{
 const beyond=${world==='beyond'},allowed=new Set(['Garden of Eden','Beyond Eden / the old civilization','Pyramid at the end of the road','Parkour grips']);
 const T=THREE,buckets=new Map(),m=new T.Matrix4(),im=new T.Matrix4(),v=new T.Vector3(),skip=/resident|jester|character|avatar|snake|multiplayer|visitor|player|violet|bird|eden grass|sky box|backstage of the sky/i;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=8;const ctx=canvas.getContext('2d',{willReadFrequently:true});
 function albedo(mat){const c=mat.color?mat.color.clone():new T.Color(.5,.5,.5);const img=mat.map?.image;let a=null;
  if(img&&!mat.map.isCompressedTexture){try{ctx.clearRect(0,0,8,8);ctx.drawImage(img,0,0,8,8);const d=ctx.getImageData(0,0,8,8).data;let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;r+=d[i];g+=d[i+1];b+=d[i+2];n++;}if(n)a=new T.Color().setRGB(r/n/255,g/n/255,b/n/255,T.SRGBColorSpace);}catch{}}
  if(a)c.multiply(a);else if(mat.map)c.multiplyScalar(.45);return c.toArray();}
 edenScene.updateMatrixWorld(true);
 (function visit(o){if(!o.visible||o.userData.dynamicShadow||skip.test(o.name)||/Lost page|hunt bell|combat|loot|effect|Attendant/i.test(o.name))return;if(beyond&&o.parent===edenScene&&!allowed.has(o.name))return;if(o.isSkinnedMesh)return;
  if(o.isMesh&&o.geometry?.attributes?.position){
   const mat=Array.isArray(o.material)?o.material[0]:o.material;const custom=mat.isShaderMaterial;
   const isTerrain=o.geometry.parameters?.width===240;const sky=custom&&mat.side===T.BackSide;
   if(!sky&&!/blob shadow/i.test(mat.name||o.name)&&!(mat.transparent&&mat.opacity<.5&&!mat.map)){
    const key=isTerrain?'terrain':(custom?'water':mat.uuid);
    if(!buckets.has(key))buckets.set(key,{name:isTerrain?'terrain':(custom?'water':(mat.name||o.name||'mesh')),albedo:custom?[.05,.12,.12]:albedo(mat),cutout:!!mat.alphaTest&&mat.alphaTest>0,emissive:mat.emissiveIntensity&&mat.emissive?mat.emissive.toArray().map(x=>x*mat.emissiveIntensity):[0,0,0],chunks:[],n:0});
    const b=buckets.get(key),g=o.geometry,p=g.attributes.position,ix=g.index?.array,tri=ix?ix.length:p.count,count=o.isInstancedMesh?o.count:1,a=new Float32Array(tri*3*count);let w=0;
    for(let k=0;k<count;k++){if(o.isInstancedMesh){o.getMatrixAt(k,im);m.multiplyMatrices(o.matrixWorld,im);}else m.copy(o.matrixWorld);
     for(let t=0;t<tri;t++){v.fromBufferAttribute(p,ix?ix[t]:t).applyMatrix4(m);a[w++]=v.x;a[w++]=v.y;a[w++]=v.z;}}
    if(beyond){const bounds=[nightLayout.bounds[0],nightLayout.bounds[1],-190,nightLayout.bounds[3]],pad=12;let kept=0;for(let t=0;t<a.length;t+=9){let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(let j=0;j<9;j+=3){minX=Math.min(minX,a[t+j]);maxX=Math.max(maxX,a[t+j]);minZ=Math.min(minZ,a[t+j+2]);maxZ=Math.max(maxZ,a[t+j+2]);}if(maxX<bounds[0]-pad||minX>bounds[1]+pad||maxZ<bounds[2]-pad||minZ>bounds[3]+pad)continue;for(let j=0;j<9;j++)a[kept++]=a[t+j];}const keep=a.subarray(0,kept);b.chunks.push(keep);b.n+=kept;}else{b.chunks.push(a);b.n+=a.length;}
   }
  }
  for(const c of o.children)visit(c);
 })(edenScene);
 const list=[...buckets.values()].filter(b=>b.n>0),total=list.reduce((s,b)=>s+b.n,0),all=new Float32Array(total);let w=0;
 for(const b of list){b.offset=w;for(const c of b.chunks){all.set(c,w);w+=c.length;}delete b.chunks;}
 window.__bakeBytes=new Uint8Array(all.buffer);window.__bakeMeta=list;
 return true;})()`);
const meta = await page.evaluate('window.__bakeMeta'), size = await page.evaluate('window.__bakeBytes.length');
console.log('expanded', meta.length, 'buckets', size, 'bytes');
const fd = fs.openSync(path.join(out, 'scene.bin'), 'w'), CHUNK = 1 << 19;
for (let at = 0; at < size; at += CHUNK) { const b64 = await page.evaluate(`(()=>{const s=window.__bakeBytes.subarray(${at},${at + CHUNK});let o='';for(let i=0;i<s.length;i+=32768)o+=String.fromCharCode.apply(null,s.subarray(i,i+32768));return btoa(o);})()`); fs.writeSync(fd, Buffer.from(b64, 'base64')); }
fs.closeSync(fd); fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(meta, null, 1));
console.log(`${meta.length} buckets, ${(size / 36 / 1e6).toFixed(2)} M triangles, ${(size / 1048576).toFixed(0)} MB`);
meta.slice().sort((a, b) => b.n - a.n).slice(0, 12).forEach(b => console.log(' ', b.name, Math.round(b.n / 9), 'tris', b.cutout ? 'cutout' : '', b.albedo.map(x => x.toFixed(2)).join(',')));
if (page.problems.length) console.log([...new Set(page.problems)].slice(0, 8).join('\n'));
await page.close();
