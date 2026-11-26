'use strict';
// The asset workshop's models in Beyond Eden and the garden, placed by tools/world/build-props-layout.py
// (world-props-layout.js). Collision exists from the start; a model is only downloaded and held in memory while it is
// near enough to matter for its size, and its memory is freed once the player has left.
window.createWorldProps=function(T,parent,{props,onChange=()=>{},warmup=null}={}){
 if(!props?.length)return null;
 const phone=!!window.edenRenderProfile?.().mobile;
 // The scanned street props have their own allowance on top, so they never push a workshop model out.
 const MAX=phone?16:96,SCANS=phone?4:24,CAP=MAX+SCANS,LOADS=phone?1:2,SCALE=phone?.5:.85;
 const root=new T.Group();root.name='Workshop models';parent.add(root);
 const ground=new Map(),live=new Map();let loading=0,nextCheck=0,disposed=false,wanted=[],enabled=true;
 for(const p of props){
  const turned=(p.r||0)%2;p.hx=(turned?p.s[2]:p.s[0])/2;p.hz=(turned?p.s[0]:p.s[2])/2;if(p.c==='round')p.hx=p.hz=Math.min(p.s[0],p.s[2])/2;
  // On desktop a barrel is drawn from about 14 m, a market stall from 28.
  p.range=Math.min(36,9+Math.max(...p.s)*9)*SCALE;
  if(p.p[1]<.1)for(let cx=Math.floor((p.p[0]-p.hx-2)/4);cx<=Math.floor((p.p[0]+p.hx+2)/4);cx++)for(let cz=Math.floor((p.p[2]-p.hz-2)/4);cz<=Math.floor((p.p[2]+p.hz+2)/4);cz++){const k=cx+','+cz;(ground.get(k)||ground.set(k,[]).get(k)).push(p);}
 }
 function free(scene){scene.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of [].concat(o.material)){for(const v of Object.values(m))if(v?.isTexture){v.dispose();v.image?.close?.();}m.dispose();}});}
 function release(p){const e=live.get(p);live.delete(p);if(e?.scene){root.remove(e.scene);free(e.scene);}}
 async function load(p){
  const entry={scene:null};live.set(p,entry);loading++;
  try{
   // 'scan:name' is one of Beyond Eden's photo-scanned street props (assets/beyond-eden/scan, CC0).
   const s=(await window.showroomAssets.model((p.f.startsWith('scan:')?'/assets/beyond-eden/scan/models/'+p.f.slice(5):'/assets/world-props/'+p.f)+'.glb?v=1',{priority:'low'})).scene;
   if(disposed||live.get(p)!==entry){free(s);return;}
   s.name='Workshop model '+p.n+' '+p.k;s.position.set(...p.p);s.rotation.y=p.a??p.r*Math.PI/2;
   const tall=Math.max(...p.s)>1.1;
   s.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;o.castShadow=!phone&&tall;const m=o.material;m.metalness=Math.min(m.metalness,.55);m.side=T.FrontSide;
    if(m.map){m.emissiveMap=m.map;m.emissive.set(0xffffff);m.emissiveIntensity=.07;}});
   window.edenMatrix?.surface(T,s,{kind:'model'});
   // Props are seen from metres away: 1024 px colour and 512 px detail maps on desktop (the 2048 px originals were
   // ~16 MB of uploads each, a visible hitch as each appeared), 256/128 on phones.
   if(phone)window.shrinkModelTextures?.(s,{maxTextureSize:256,detailSize:128});else window.shrinkModelTextures?.(s,{maxTextureSize:1024,detailSize:512});
   s.updateMatrixWorld(true);s.traverse(o=>{o.matrixAutoUpdate=false;});
   // Shaders compiled and textures uploaded before it is drawn, so walking does not stutter.
   try{await warmup?.()?.prepare(s);}catch{}
   if(disposed||live.get(p)!==entry){free(s);return;}
   entry.scene=s;root.add(s);if(s.position.z<-21)window.edenMatrix?.form(T,s,{duration:1.5});onChange();
  }catch{if(live.get(p)===entry){live.delete(p);p.retry=performance.now()+20000;}}
  finally{loading--;pump();}
 }
 function pump(){while(!disposed&&loading<LOADS&&wanted.length&&live.size<CAP+LOADS){const p=wanted.shift();if(!live.has(p))load(p);}}
 function update(viewer){
  const now=performance.now();if(disposed||!enabled||now<nextCheck)return;nextCheck=now+300;
  const {x,y,z}=viewer.position,near=[];
  for(const p of props){const d=p.distance=Math.hypot(p.p[0]-x,(p.p[1]+1.6-y)*1.5,p.p[2]-z)/p.range;if(d<1&&!(p.retry>now))near.push(p);}
  near.sort((a,b)=>a.distance-b.distance);{let a=0,b=0;for(let i=0;i<near.length;i++){const p=near[i];if(p.f.startsWith('scan:')?b++<SCANS:a++<MAX)continue;near.splice(i--,1);}}const keep=new Set(near);
  let over=live.size-near.filter(p=>live.has(p)).length;
  // Models just out of range or past the cap only go to make room, so standing on an edge does not thrash.
  for(const p of [...live.keys()])if(!keep.has(p)&&(p.distance>1.35||over>CAP*.15)){over--;release(p);}
  wanted=near.filter(p=>!live.has(p));pump();
 }
 const around=(x,z)=>ground.get(Math.floor(x/4)+','+Math.floor(z/4))||[];
 return {root,props,update,
  setEnabled(on){enabled=on;root.visible=on;},
  // Free everything that is loaded (the player has left this part of the world); update() brings it back.
  clear(){wanted=[];for(const p of [...live.keys()])release(p);},
  covers:(x,z,m=1)=>around(x,z).some(p=>Math.abs(x-p.p[0])<p.hx+m&&Math.abs(z-p.p[2])<p.hz+m),
  blocks:(q,radius=.25)=>around(q.x,q.z).some(p=>p.c==='round'&&Math.hypot(q.x-p.p[0],q.z-p.p[2])<p.hx+radius),
  dispose(){disposed=true;for(const p of [...live.keys()])release(p);parent.remove(root);},
  inspect:()=>({enabled,props:props.length,live:live.size,shown:root.children.length,wanted:wanted.length,loading,max:MAX})};
};
// Beyond Eden's share: collision for walking and parkour, and lamps.
window.createDistrictProps=function(T,district,options){
 const set=window.createWorldProps(T,district.root,{...options,props:window.worldPropsLayout?.props});if(!set)return null;
 const surfaces=[];let on=false;
 for(const p of set.props){
  const [x,y,z]=p.p,w=p.hx*2,d=p.hz*2,h=p.s[1],add=(x0,x1,z0,z1)=>surfaces.push({minX:x0,maxX:x1,minZ:z0,maxZ:z1,top:y+h,bottom:y<=0?-1:y,wall:h>1.2,prop:p.n});
  // Surfaces, not district walls: bots and bullets treat every wall as taller than anyone, and a barrel is not.
  if(p.c==='box')add(x-w/2,x+w/2,z-d/2,z+d/2);
  // An arch is its two posts, across its wider side, so you can walk through it.
  else if(p.c==='posts'){if(w>=d){add(x-w/2,x-w/2+w*.2,z-d/2,z+d/2);add(x+w/2-w*.2,x+w/2,z-d/2,z+d/2);}else{add(x-w/2,x+w/2,z-d/2,z-d/2+d*.2);add(x-w/2,x+w/2,z+d/2-d*.2,z+d/2);}}
  if(['lamp-post','lantern','brazier','wall-torch'].includes(p.k))district.lamps.push(new T.Vector3(x,y+h+.1,z+(p.k==='wall-torch'?.5:0)));
 }
 // Off during an expedition: its server has its own world without these, and would refuse a player standing on one.
 function setEnabled(value){if(value===on)return;on=value;set.setEnabled(on);const S=district.surfaces;
  if(on)S.push(...surfaces);else{const mine=new Set(surfaces),kept=S.filter(s=>!mine.has(s));S.length=0;S.push(...kept);}options?.onChange?.();}
 setEnabled(true);
 return {...set,surfaces,setEnabled,inspect:()=>({...set.inspect(),surfaces:surfaces.length})};
};
