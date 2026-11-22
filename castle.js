'use strict';
// Castle generator: a walkable old-world castle laid out from axis-aligned boxes, so every wall, floor, stair and
// ledge is also exact collision for walking and parkour (parkour.js: STEP .45, REACH 2.25, MANTLE 1.35, leaps of
// 2-6.5 m). One description becomes the geometry and the collision, so they can never disagree.
//
// Layout (local metres; +x east, +z south; the gate faces west, toward the district):
//   curtain wall  22 x 34, 1.4 thick, 7 high, a wall-walk on top behind battlements
//   corner towers 5 x 5, solid to the wall-walk, hollow above with a stair to a 11 m roof
//   gatehouse     a 3.4 m opening in the west wall with a raised portcullis
//   keep          9 x 20, three storeys (floors at 0, 3.6, 7.2) and a roof walk at 10.8; stairs between every floor,
//                 windows you can climb through, stone ledges around the outside at each floor
//   courtyard     a stone stair up to the wall-walk, and a scaffold you can mantle up step by step
// Parkour lines: scaffold to wall-walk (grab), wall-walk into the towers, keep roof down to the wall-walk across a
// 3.1 m gap, keep ledges between windows, tower roofs.
//
// createCastle(T, parent, {x, z, seed}) -> {root, walls, surfaces, torches, ready, covers(x, z, margin), update(viewer), inspect()}
//   walls:    [x, z, w, d, height] for boxes that stand on the ground (night-district.js format)
//   surfaces: {minX, maxX, minZ, maxZ, top, bottom, wall} for everything raised (floors, upper walls, lintels, stairs)
window.createCastle=function(T,parent,{x:originX=87,z:originZ=-93,seed=7}={}){
 const root=new T.Group();root.name='Castle';root.position.set(originX,0,originZ);parent.add(root);
 let rand=seed>>>0||1;const random=()=>(rand=(rand*1664525+1013904223)>>>0)/4294967296;

 // ---- materials: CC0 scans (assets/castle/SOURCE.txt), mapped in world metres so they never stretch ----
 const loader=new T.TextureLoader();
 const tex=(name,srgb=true)=>{const t=loader.load('/assets/castle/'+name+'.webp?v=1');t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;return t;};
 const scanned=(name,tile,params={})=>({material:new T.MeshStandardMaterial({map:tex(name),normalMap:tex(name+'-nor',false),roughness:.92,...params}),tile});
 const MATS={
  wall:scanned('wall',2.6,{color:0xc9c4b8}),
  inner:scanned('inner',2.2,{color:0xbdb6a8}),
  planks:scanned('planks',1.8,{color:0x9a7a58,roughness:.8}),
  cobble:scanned('cobble',2.4,{color:0xb4aea2}),
  iron:{material:new T.MeshStandardMaterial({color:0x1e1d1c,metalness:.8,roughness:.55}),tile:1},
  timber:{material:new T.MeshStandardMaterial({color:0x4a3826,roughness:.9}),tile:1},
  flame:{material:new T.MeshStandardMaterial({color:0xffc27a,emissive:0xff9a3c,emissiveIntensity:2.2,roughness:1}),tile:1}
 };
 const buffers=Object.fromEntries(Object.keys(MATS).map(k=>[k,{p:[],n:[],uv:[],i:[]}]));
 const walls=[],surfaces=[],torches=[];
 const stats={boxes:0,stairs:0,windows:0,rooms:0};

 // A box from min to max corners (local), drawn with a material and, unless solid:false, added to collision.
 // UVs come from the two in-plane axes of each face in metres / tile, so a 7 m wall shows 7 m of stone.
 function box(mat,x0,x1,y0,y1,z0,z1,{solid=true,wall=null,hidden=false}={}){
  if(x1-x0<=0||y1-y0<=0||z1-z0<=0)return;
  if(hidden){addCollision(x0,x1,y0,y1,z0,z1,wall);return;}
  const b=buffers[mat],tile=MATS[mat].tile,wx=originX,wz=originZ;
  const faces=[ // normal, 4 corners (counter-clockwise from outside), uv axes
   [[1,0,0],[[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],'zy'],[[-1,0,0],[[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],'zy'],
   [[0,1,0],[[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],'xz'],[[0,-1,0],[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],'xz'],
   [[0,0,1],[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],'xy'],[[0,0,-1],[[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]],'xy']];
  for(const [n,corners,axes] of faces){
   const start=b.p.length/3;
   for(const [px,py,pz] of corners){
    b.p.push(px,py,pz);b.n.push(...n);
    const w={x:px+wx,y:py,z:pz+wz};b.uv.push(w[axes[0]]/tile,w[axes[1]]/tile);
   }
   b.i.push(start,start+1,start+2,start,start+2,start+3);
  }
  stats.boxes++;
  if(solid)addCollision(x0,x1,y0,y1,z0,z1,wall);
 }
 function addCollision(x0,x1,y0,y1,z0,z1,wall){
  const g={minX:x0+originX,maxX:x1+originX,minZ:z0+originZ,maxZ:z1+originZ};
  if(y0<=.01)walls.push([(g.minX+g.maxX)/2,(g.minZ+g.maxZ)/2,g.maxX-g.minX,g.maxZ-g.minZ,y1]);
  else surfaces.push({...g,top:y1,bottom:y0,wall:wall??(y1-y0>1.2),castle:true});
 }
 // A straight stair of solid steps from (x0,z0) rising `rise` to the top, `run` long along dir (+x, -x, +z, -z).
 function stair(mat,x0,z0,width,run,rise,dir,baseY=0){
  const steps=Math.ceil(rise/.3),r=rise/steps,g=run/steps;stats.stairs++;
  for(let k=0;k<steps;k++){
   const a=k*g,b2=(k+1)*g,top=baseY+(k+1)*r;
   // each step is solid down to the floor below it, so there is nothing to fall through
   if(dir==='+x')box(mat,x0+a,x0+b2,baseY,top,z0,z0+width);
   else if(dir==='-x')box(mat,x0-b2,x0-a,baseY,top,z0,z0+width);
   else if(dir==='+z')box(mat,x0,x0+width,baseY,top,z0+a,z0+b2);
   else box(mat,x0,x0+width,baseY,top,z0-b2,z0-a);
  }
 }
 // A wall along x or z with openings: [{at, width, bottom, top}] in metres along the wall from its start.
 function wallRun(mat,axis,fixed0,fixed1,from,to,y0,y1,openings=[]){
  let cursor=from;const sorted=[...openings].sort((a,b)=>a.at-b.at);
  const piece=(a,b,lo,hi)=>axis==='x'?box(mat,a,b,lo,hi,fixed0,fixed1):box(mat,fixed0,fixed1,lo,hi,a,b);
  for(const o of sorted){
   const a=from+o.at-o.width/2,b=from+o.at+o.width/2;
   piece(cursor,a,y0,y1);
   if(o.bottom>y0)piece(a,b,y0,o.bottom);
   if(o.top<y1)piece(a,b,o.top,y1);
   cursor=b;
  }
  piece(cursor,to,y0,y1);
 }
 // A floor slab (0.25 thick, top at `top`) over x0..x1, z0..z1 with a rectangular hole [hx0, hx1, hz0, hz1] in it.
 function slabWithHole(mat,x0,x1,z0,z1,top,[hx0,hx1,hz0,hz1]){
  const y0=top-.25,o={wall:false};
  box(mat,x0,x1,y0,top,z0,Math.max(z0,hz0),o);box(mat,x0,x1,y0,top,Math.min(z1,hz1),z1,o);
  box(mat,x0,Math.max(x0,hx0),y0,top,Math.max(z0,hz0),Math.min(z1,hz1),o);box(mat,Math.min(x1,hx1),x1,y0,top,Math.max(z0,hz0),Math.min(z1,hz1),o);
 }
 const battlements=(axis,fixed0,fixed1,from,to,y)=>{for(let s=from;s<to-.4;s+=1.3)axis==='x'?box('wall',s,Math.min(s+.7,to),y,y+1.1,fixed0,fixed1):box('wall',fixed0,fixed1,y,y+1.1,s,Math.min(s+.7,to));};
 function torch(x,y,z,facing){const [dx,dz]=facing;box('iron',x-.06+dx*.1,x+.06+dx*.1,y-.35,y,z-.06+dz*.1,z+.06+dz*.1,{solid:false});box('flame',x-.09+dx*.16,x+.09+dx*.16,y,y+.22,z-.09+dz*.16,z+.09+dz*.16,{solid:false});torches.push(new T.Vector3(originX+x+dx*.25,y+.3,originZ+z+dz*.25));}

 // ---- curtain wall: 22 x 34, gate in the west wall ----
 const W=11,D=17,T_=1.4,H=7,TW=5; // half width, half depth, wall thickness, wall height, tower size
 box('cobble',-W,W,-.08,0,-D,D,{solid:false}); // courtyard paving (the terrain is the walking floor)
 // north and south walls between the towers
 for(const s of [-1,1]){const z0=s<0?-D:D-T_,z1=s<0?-D+T_:D;box('wall',-W+TW,W-TW,0,H,z0,z1);battlements('x',s<0?z0:z1-.45,s<0?z0+.45:z1,-W+TW,W-TW,H);}
 // east wall, plain; west wall with the gate (3.4 m wide, 4.2 m high) and a raised portcullis in it
 box('wall',W-T_,W,0,H,-D+TW,D-TW);battlements('z',W-.45,W,-D+TW,D-TW,H);
 wallRun('wall','z',-W,-W+T_,-D+TW,D-TW,0,H,[{at:D-TW,width:3.4,bottom:0,top:4.2}]);battlements('z',-W,-W+.45,-D+TW,D-TW,H);
 for(let k=-1.5;k<=1.5;k+=.5)box('iron',-W+.55,-W+.65,3.2,4.2,k-.04,k+.04,{solid:false});
 for(let y=3.3;y<4.2;y+=.35)box('iron',-W+.55,-W+.65,y,y+.06,-1.7,1.7,{solid:false});
 torch(-W-.05,3.2,-2.4,[-1,0]);torch(-W-.05,3.2,2.4,[-1,0]);

 // ---- corner towers: solid to the wall-walk, hollow above with doorways from both wall-walks; inside, two
 // climbing decks (each a mantle) lead up through a hatch to an 11 m roof ----
 const TH=11,tt=.45;
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const x0=sx<0?-W:W-TW,x1=x0+TW,z0=sz<0?-D:D-TW,z1=z0+TW;
  box('wall',x0,x1,0,H,z0,z1);
  // The wall-walks meet the tower along its outer edges, so the doorways sit .45-1.45 m in from them.
  const along=sx<0?.95:TW-.95,across=sz<0?.95:TW-.95,door=at=>({at,width:1,bottom:H,top:H+2.3});
  wallRun('wall','x',z0,z0+tt,x0,x1,H,TH,sz>0?[door(along)]:[]);
  wallRun('wall','x',z1-tt,z1,x0,x1,H,TH,sz<0?[door(along)]:[]);
  wallRun('wall','z',x0,x0+tt,z0+tt,z1-tt,H,TH,sx>0?[door(across-tt)]:[]);
  wallRun('wall','z',x1-tt,x1,z0+tt,z1-tt,H,TH,sx<0?[door(across-tt)]:[]);
  // decks in the inner corner, away from both doorways
  const cx=sx<0?x1-tt:x0+tt,cz=sz<0?z1-tt:z0+tt,ox=sx<0?-1:1,oz=sz<0?-1:1; // inner corner and the way back into the tower
  const deck=(top,offx,offz)=>{const a=cx+ox*offx,b=cx+ox*(offx+1.3),c=cz+oz*offz,d=cz+oz*(offz+1.3);box('timber',Math.min(a,b),Math.max(a,b),H,top,Math.min(c,d),Math.max(c,d));return [Math.min(a,b),Math.max(a,b),Math.min(c,d),Math.max(c,d)];};
  deck(H+1.3,1.3,0);const hatch=deck(H+2.6,0,0);
  // roof slab with a hatch over the high deck (the last climb is a 1.4 m grab)
  const rx=[x0+tt,x1-tt],rz=[z0+tt,z1-tt];
  slabWithHole('planks',rx[0],rx[1],rz[0],rz[1],TH,hatch);
  box('wall',x0,x1,TH-.25,TH,z0,z0+tt,{wall:false});box('wall',x0,x1,TH-.25,TH,z1-tt,z1,{wall:false});
  battlements('x',z0,z0+.45,x0,x1,TH);battlements('x',z1-.45,z1,x0,x1,TH);battlements('z',x0,x0+.45,z0,z1,TH);battlements('z',x1-.45,x1,z0,z1,TH);
  torch(sx<0?x0+tt+.05:x1-tt-.05,H+1.9,(z0+z1)/2,[sx<0?1:-1,0]);
 }

 // ---- courtyard: a stone stair to the south wall-walk, a scaffold to the north one ----
 // 24 steps of .29 m along the inner face of the south wall: the foot is in the open courtyard and the top arrives
 // level with the wall-walk beside the south-west tower's doorway.
 stair('wall',-W+TW+.4+8,D-T_-1.4,1.4,8,H,'-x');
 // scaffold: decks every 1.3 m (each a mantle), the last one 1.6 m under the wall-walk (a grab)
 // scaffold along the inner face of the north wall: decks rising 1.3 m each (a mantle), the last one 1.6 m under the
 // wall-walk (a grab), then over the battlements' inner edge onto the walk
 const scX=-W+TW+1.2,scZ=-D+T_;
 [1.3,2.6,3.9,5.4].forEach((top,k)=>{const x0=scX+k*1.6;box('timber',x0,x0+1.8,top-.15,top,scZ,scZ+1.4);for(const [px,pz] of [[0,0],[1.68,0],[0,1.28],[1.68,1.28]])box('timber',x0+px,x0+px+.12,0,top-.15,scZ+pz,scZ+pz+.12);});

 // ---- keep: 9 x 20, floors at 0 / 3.6 / 7.2, roof walk at 10.8 ----
 const K={x0:-2.5,x1:6.5,z0:-10,z1:10,t:.6},FL=[0,3.6,7.2],ROOF=10.8;
 const ix0=K.x0+K.t,ix1=K.x1-K.t,iz0=K.z0+K.t,iz1=K.z1-K.t;
 // Window openings per storey (1.2 wide, sill .9, head 2.4 above the floor), spaced along each face.
 const windowsAlong=(len,floor,skip=[])=>{const out=[];for(let a=2.2;a<len-1.5;a+=3.4){if(skip.some(s=>Math.abs(s-a)<1.6))continue;out.push({at:a,width:1.2,bottom:floor+.9,top:floor+2.4});stats.windows++;}return out;};
 FL.forEach((floor,i)=>{
  const top=floor+3.6,door=i===0?[{at:(K.z1-K.z0)/2,width:1.8,bottom:0,top:2.8}]:[];
  wallRun('wall','z',K.x0,K.x0+K.t,K.z0,K.z1,floor,top,[...door,...windowsAlong(K.z1-K.z0,floor,i===0?[(K.z1-K.z0)/2]:[])]);
  wallRun('wall','z',K.x1-K.t,K.x1,K.z0,K.z1,floor,top,windowsAlong(K.z1-K.z0,floor));
  wallRun('wall','x',K.z0,K.z0+K.t,K.x0+K.t,K.x1-K.t,floor,top,windowsAlong(K.x1-K.x0-2*K.t,floor));
  wallRun('wall','x',K.z1-K.t,K.z1,K.x0+K.t,K.x1-K.t,floor,top,windowsAlong(K.x1-K.x0-2*K.t,floor));
  // a stone ledge (string course) around the outside at each upper floor: something to hang from between windows
  if(i>0)for(const [a,b,c,d] of [[K.x0-.35,K.x0,K.z0-.35,K.z1+.35],[K.x1,K.x1+.35,K.z0-.35,K.z1+.35],[K.x0,K.x1,K.z0-.35,K.z0],[K.x0,K.x1,K.z1,K.z1+.35]])box('wall',a,b,floor-.25,floor,c,d,{wall:false});
 });
 box('wall',K.x0-.2,K.x1+.2,ROOF-.4,ROOF,K.z0-.2,K.z0+.2,{wall:false});
 // roof parapet (1.0 high: a vault or a mantle) and battlements on it
 for(const [a,b,c,d] of [[K.x0,K.x0+.4,K.z0,K.z1],[K.x1-.4,K.x1,K.z0,K.z1],[K.x0,K.x1,K.z0,K.z0+.4],[K.x0,K.x1,K.z1-.4,K.z1]])box('wall',a,b,ROOF,ROOF+1,c,d,{wall:false});
 // Floors and stairs: stairwells alternate north / south so you climb in a zigzag; each floor has its hole.
 const run=4.2,sw=1.6; // stair run and width
 // each stair starts .9 m clear of the end wall, so you can walk straight onto its first step
 const wells=[{z0:iz1-sw,z1:iz1,x:ix0+.9,dir:'+x'},{z0:iz0,z1:iz0+sw,x:ix1-.9,dir:'-x'},{z0:iz1-sw,z1:iz1,x:ix0+.9,dir:'+x'}];
 wells.forEach((w,i)=>{
  stair('planks',w.x,w.z0,sw,run,3.6,w.dir,FL[i]);
  const slabTop=i<2?FL[i+1]:ROOF,hole=w.dir==='+x'?[w.x-.1,w.x+run+.3]:[w.x-run-.3,w.x+.1];
  // the slab above, with a hole over this stair
  slabWithHole('planks',ix0,ix1,iz0,iz1,slabTop,[hole[0],hole[1],w.z0,w.z1]);
 });
 box('cobble',ix0,ix1,-.08,.02,iz0,iz1,{solid:false});
 // Rooms: the ground floor is one great hall; the first floor splits in two across the middle with a doorway;
 // the second floor has three chambers off a passage by the stair. Partitions are raised (they stand on a floor).
 wallRun('inner','x',-.2,.2,ix0,ix1,FL[1],FL[1]+3.35,[{at:(ix1-ix0)/2,width:1.3,bottom:FL[1],top:FL[1]+2.3}]);stats.rooms+=2;
 for(const zc of [-3.4,3.4])wallRun('inner','x',zc-.15,zc+.15,ix0+1.9,ix1,FL[2],FL[2]+3.35,[{at:1.4,width:1.1,bottom:FL[2],top:FL[2]+2.2}]);
 wallRun('inner','z',ix0+1.75,ix0+2.05,iz0+sw,iz1-sw,FL[2],FL[2]+3.35,[{at:3.2,width:1.1,bottom:FL[2],top:FL[2]+2.2},{at:10.2,width:1.1,bottom:FL[2],top:FL[2]+2.2}]);stats.rooms+=4;stats.rooms+=1;
 // great hall: a long table, a dais and a throne seat at the east end (solid, so you can vault them)
 box('timber',.6,3.4,.7,.8,-4,4);for(const [px,pz] of [[.7,-3.8],[3.2,-3.8],[.7,3.7],[3.2,3.7]])box('timber',px,px+.12,0,.7,pz,pz+.12);
 box('wall',ix1-1.6,ix1,0,.35,-2.5,2.5,{wall:false});box('timber',ix1-1,ix1-.2,.35,.85,-.5,.5);box('timber',ix1-.35,ix1-.2,.85,2.1,-.5,.5);
 // torches through the keep
 FL.forEach(f=>{torch(ix0+.05,f+2.1,-5,[1,0]);torch(ix1-.05,f+2.1,5,[-1,0]);});
 torch(K.x0-.05,2.9,-1.6,[-1,0]);torch(K.x0-.05,2.9,1.6,[-1,0]);

 // courtyard torches on the inner faces of the curtain wall
 for(const z of [-9,0,9])torch(-W+T_+.05,2.8,z,[1,0]);for(const x of [-4,4])torch(x,2.8,-D+T_+.05,[0,1]);

 // ---- furnishing: models from the asset workshop (assets/castle/props, made by its generator) ----
 // Each is placed by its base centre; its collision is a plain box of its measured size, so a bed is something to
 // vault and a suit of armour something to stand behind.
 const PROPS=[
  {file:'plain-bronze-suit-of-armour',size:[.83,1.99,.9],at:[ix1-.6,.35,-2],yaw:-Math.PI/2,solid:true},
  {file:'plain-bronze-suit-of-armour',size:[.83,1.99,.9],at:[ix1-.6,.35,2],yaw:-Math.PI/2,solid:true},
  {file:'old-wood-four-poster-bed',size:[1.39,2.06,1.51],at:[3.6,FL[2],-5.7],yaw:0,top:.55},
  {file:'old-granite-chimney-stack',size:[.72,1.66,.67],at:[K.x1-1,ROOF,K.z1-1],yaw:0,solid:true},
  {file:'old-granite-chimney-stack',size:[.72,1.66,.67],at:[K.x1-1,ROOF,K.z0+1],yaw:0,solid:true}
 ];
 for(const p of PROPS){
  const [sx,sy,sz]=p.size,[px,py,pz]=p.at,turned=Math.abs(Math.sin(p.yaw))>.5,hx=(turned?sz:sx)/2,hz=(turned?sx:sz)/2;
  if(p.solid||p.top)box('timber',px-hx,px+hx,py,py+(p.top??sy),pz-hz,pz+hz,{solid:true,wall:false,hidden:true});
 }
 const propsReady=Promise.all([...new Set(PROPS.map(p=>p.file))].map(file=>window.showroomAssets.model('/assets/castle/props/'+file+'.glb?v=1').then(g=>[file,g.scene]).catch(()=>[file,null]))).then(models=>{
  const byFile=new Map(models);
  for(const p of PROPS){const src=byFile.get(p.file);if(!src)continue;const m=src.clone(true);m.position.set(p.at[0],p.at[1],p.at[2]);m.rotation.y=p.yaw;
   m.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});root.add(m);}
 });

 // ---- build meshes: one draw per material ----
 for(const [key,b] of Object.entries(buffers)){if(!b.p.length)continue;
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));g.setIndex(b.i);g.computeBoundingSphere();
  const m=new T.Mesh(g,MATS[key].material);m.name='Castle '+key;m.castShadow=key!=='flame';m.receiveShadow=true;root.add(m);}
 // A few warm lights follow the nearest torches (a pool, not one light per torch).
 const pool=[0,1,2,3,4,5].map(()=>{const l=new T.PointLight(0xff9c50,0,12,1.5);l.name='Castle torch light';parent.add(l);return l;});
 const fx=Math.max(W,D)+6;
 return {root,walls,surfaces,torches,ready:propsReady,
  covers:(x,z,m=0)=>Math.abs(x-originX)<W+m&&Math.abs(z-originZ)<D+m,
  update(viewer){const p=viewer.position,near=Math.abs(p.x-originX)<fx+20&&Math.abs(p.z-originZ)<fx+20;
   const sorted=near?[...torches].sort((a,b)=>a.distanceToSquared(p)-b.distanceToSquared(p)):[];
   pool.forEach((l,i)=>{const t=sorted[i];l.intensity=t?20:0;if(t)l.position.copy(t);});},
  inspect:()=>({origin:[originX,originZ],...stats,walls:walls.length,surfaces:surfaces.length,torches:torches.length,triangles:Object.values(buffers).reduce((n,b)=>n+b.i.length/3,0)})};
};
