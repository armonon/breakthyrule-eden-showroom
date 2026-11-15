'use strict';
// Bars, pipes and ropes in Beyond Eden, and the frames, towers and walls that hold them up.
//
// Pure data (district coordinates, metres, y up from the street), so the same props exist wherever parkour.js runs:
// the showroom, the expedition page and the authoritative server (server/expedition-runtime.mjs loads this file
// before parkour.js). parkour.js reads `grips` for the moves and `boxes` for collisions; mount() adds the meshes
// on clients only.
//   bar   {a:[x,y,z], b:[x,y,z]}       horizontal: hang, shimmy (A/D), swing (W/S pump), jump to let go and fly
//   pipe  {x, z, y0, y1, n:[nx,nz]}    vertical, standing off a face whose outward normal is n: climb W/S, jump off
//   rope  {x, z, top, len}             hanging from (x, top, z): climb W/S, swing (W/S pump toward where you look)
// Boxes are [x, z, w, d, top] like night-district walls (bottom at the street).
(function(root){
 // Monkey bars across the road's east verge, a high swing bar beside them.
 const east={
  grips:[...[0,1,2,3,4,5].map(i=>({type:'bar',a:[17.6,2.75,-31.6-i*1.35],b:[20.2,2.75,-31.6-i*1.35]})),
   {type:'bar',a:[23,3.05,-35.5],b:[25.6,3.05,-35.5]}],
  boxes:[[17.5,-31,.16,.16,2.9],[20.3,-31,.16,.16,2.9],[17.5,-38.9,.16,.16,2.9],[20.3,-38.9,.16,.16,2.9],[22.9,-35.5,.16,.16,3.2],[25.7,-35.5,.16,.16,3.2]],
  beams:[[17.5,2.85,-31,17.5,2.85,-38.9],[20.3,2.85,-31,20.3,2.85,-38.9]]
 };
 // West verge: a tower with a drainpipe up its face, and two ropes from a gantry to swing between.
 const west={
  grips:[{type:'pipe',x:1.78,z:-33,y0:.2,y1:4.15,n:[1,0]},{type:'rope',x:4.4,z:-34.6,top:6.4,len:5.3},{type:'rope',x:4.4,z:-38.4,top:6.4,len:5.3}],
  boxes:[[.6,-33,2.2,2.2,4.2],[4.4,-32.6,.2,.2,6.6],[4.4,-40.4,.2,.2,6.6]],
  beams:[[4.4,6.5,-32.6,4.4,6.5,-40.4]]
 };
 // The Yard (east of the road, behind the Observatory): a wall-jump chimney, a pipe tower, a swing-bar run and ropes.
 const yard={
  grips:[{type:'pipe',x:66,z:-67.82,y0:.2,y1:7.9,n:[0,-1]},
   ...[0,1,2].map(i=>({type:'bar',a:[62.6+i*3.1,4.1,-79.6],b:[62.6+i*3.1,4.1,-77.4]})),
   {type:'rope',x:69.4,z:-71.6,top:7.6,len:5.6},{type:'rope',x:69.4,z:-75.4,top:7.6,len:5.6}],
  boxes:[
   [59,-71,.6,6,6],[62.8,-71,.6,6,6],[57.4,-71,2.6,6,6],           // chimney walls, and a roof to climb out onto
   [66,-66.6,2.2,2.2,8],                                              // pipe tower
   [62.6,-79.7,.16,.16,4.25],[62.6,-77.3,.16,.16,4.25],[65.7,-79.7,.16,.16,4.25],[65.7,-77.3,.16,.16,4.25],[68.8,-79.7,.16,.16,4.25],[68.8,-77.3,.16,.16,4.25],
   [71.4,-78.5,2.2,3,3],                                              // landing deck after the bars
   [69.4,-69.8,.2,.2,7.8],[69.4,-77.2,.2,.2,7.8]                      // rope gantry posts
  ],
  beams:[[69.4,7.7,-69.8,69.4,7.7,-77.2],[62.6,4.15,-79.7,68.8,4.15,-79.7],[62.6,4.15,-77.3,68.8,4.15,-77.3]]
 };
 const sets=[east,west,yard];
 const grips=sets.flatMap(s=>s.grips).map((g,i)=>Object.freeze({...g,id:i}));
 const boxes=sets.flatMap(s=>s.boxes).map(([x,z,w,d,top])=>Object.freeze({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top,bottom:-1,wall:true,grip:true}));
 const beams=sets.flatMap(s=>s.beams);

 // Client visuals, in the old civilization's own materials (night-district.js): grained sage plaster bodies on cream
 // marble plinths and cornices with a charcoal band, fluted marble columns with capitals, carved lintels, brass bars
 // with finials, a verdigris copper drainpipe on brass collars, hemp ropes on brass rings, and amber lanterns.
 // Static meshes are frozen (no per-frame matrix work); only held ropes move.
 function mount(T,scene,{getPose=null}={}){
  if(!T||!scene||scene.getObjectByName('Parkour grips'))return null;
  const group=new T.Group();group.name='Parkour grips';
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const pc=canvas.getContext('2d');pc.fillStyle='#d9dbd5';pc.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++){const shade=185+(i*17%55);pc.fillStyle=`rgba(${shade},${shade},${shade},.18)`;pc.fillRect((i*71)%256,(i*131+Math.floor(i/256)*7)%256,1+(i%3),1+(i%2));}
  const grain=new T.CanvasTexture(canvas);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.colorSpace=T.SRGBColorSpace;
  const plaster=new T.MeshStandardMaterial({map:grain,color:0xbec5bd,roughness:.94,bumpMap:grain,bumpScale:.018});
  const marble=plaster.clone();marble.color.set(0xd9d8c5);marble.roughness=.63;
  const charcoal=new T.MeshStandardMaterial({color:0x151d20,roughness:.92});
  const brass=new T.MeshStandardMaterial({color:0x948455,metalness:.72,roughness:.38});
  const copper=new T.MeshStandardMaterial({color:0x6a9c93,emissive:0x1e3432,emissiveIntensity:.3,metalness:.3,roughness:.49});
  const glow=new T.MeshStandardMaterial({color:0xe6cd9e,emissive:0xffb34f,emissiveIntensity:.9,roughness:.45});
  const hemp=new T.MeshStandardMaterial({color:0x7d6a48,roughness:.97});
  const mats=[plaster,marble,charcoal,brass,copper,glow,hemp];
  const cube=new T.BoxGeometry(1,1,1),fluted=new T.CylinderGeometry(1,1,1,16),round=new T.CylinderGeometry(1,1,1,10),ball=new T.SphereGeometry(1,14,10),ring=new T.TorusGeometry(1,.18,8,18);
  const geos=[cube,fluted,round,ball,ring];
  const add=(geo,mat,x,y,z,sx,sy,sz,parent=group)=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  const rod=(a,b,r,mat,geo=round)=>{const A=new T.Vector3(a[0],a[1],a[2]),B=new T.Vector3(b[0],b[1],b[2]),m=add(geo,mat,0,0,0,r,A.distanceTo(B),r);m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),B.sub(A).normalize());return m;};
  const lantern=(x,y,z)=>{add(cube,brass,x,y+.02,z,.2,.04,.2);add(cube,glow,x,y+.16,z,.12,.22,.12);add(cube,brass,x,y+.3,z,.22,.04,.22);add(ball,brass,x,y+.37,z,.04,.04,.04);};
  for(const b of boxes){
   const w=b.maxX-b.minX,d=b.maxZ-b.minZ,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,h=b.top;
   if(w<.3&&d<.3){// a fluted marble column: base, shaft, capital; tall gantry columns carry a lantern, bar posts a finial
    const r=Math.max(w,d)/2+.015;add(cube,marble,x,.08,z,r*3.4,.16,r*3.4);add(fluted,marble,x,(h-.12)/2+.08,z,r,h-.28,r);add(cube,marble,x,h-.07,z,r*3.2,.14,r*3.2);
    if(h>5)lantern(x,h,z);else add(ball,brass,x,h+.05,z,.06,.06,.06);continue;}
   // a plastered block on a marble plinth, a charcoal band two-thirds up, a marble cornice; tall ones get pilasters
   add(cube,marble,x,.17,z,w+.14,.34,d+.14);add(cube,plaster,x,.34+(h-.5)/2,z,w,h-.5,d);
   add(cube,charcoal,x,h*.66,z,w+.02,.09,d+.02);add(cube,marble,x,h-.08,z,w+.2,.16,d+.2);add(cube,marble,x,h-.19,z,w+.08,.06,d+.08);
   if(h>=5)for(const [px,pz] of [[b.minX,b.minZ],[b.minX,b.maxZ],[b.maxX,b.minZ],[b.maxX,b.maxZ]])add(cube,marble,px,.34+(h-.6)/2,pz,.16,h-.6,.16);
   if(h>=7)lantern(x,h,z);
  }
  // carved marble lintels between columns, with a charcoal groove underneath
  for(const [x1,y1,z1,x2,y2,z2] of beams){const alongX=Math.abs(x2-x1)>Math.abs(z2-z1),len=Math.hypot(x2-x1,z2-z1)+.3,x=(x1+x2)/2,z=(z1+z2)/2,y=(y1+y2)/2;
   add(cube,marble,x,y+.04,z,alongX?len:.22,.18,alongX?.22:len);add(cube,charcoal,x,y-.06,z,alongX?len-.2:.1,.03,alongX?.1:len-.2);}
  const ropes=[];
  for(const g of grips){
   if(g.type==='bar'){rod(g.a,g.b,.034,brass);for(const e of [g.a,g.b])add(ball,brass,e[0],e[1],e[2],.055,.055,.055);}
   else if(g.type==='pipe'){const out=[g.n[0],g.n[1]];rod([g.x,g.y0-.25,g.z],[g.x,g.y1+.08,g.z],.055,copper);add(ball,copper,g.x,g.y1+.1,g.z,.07,.05,.07);
    for(let y=g.y0+.5;y<g.y1;y+=1.1){add(round,brass,g.x,y,g.z,.075,.07,.075);add(cube,charcoal,g.x-out[0]*.13,y,g.z-out[1]*.13,Math.abs(out[1])>.5?.05:.2,.05,Math.abs(out[0])>.5?.05:.2);}}
   else if(g.type==='rope'){const holder=new T.Group();holder.userData.dynamicShadow=true;holder.position.set(g.x,g.top,g.z);group.add(holder);
    const ringM=add(ring,brass,g.x,g.top+.02,g.z,.08,.08,.08);ringM.rotation.x=Math.PI/2;
    add(round,hemp,0,-g.len/2,0,.032,g.len,.032,holder);for(let y=.9;y<g.len-.3;y+=1.1)add(ring,hemp,0,-y,0,.045,.045,.045,holder).rotation.x=Math.PI/2;
    add(ball,hemp,0,-g.len,0,.08,.09,.08,holder);ropes.push({g,m:holder});}
  }
  // One mesh per material for everything that never moves (222 draw calls -> a handful, in the main and shadow pass).
  root.mergeStaticMeshes?.(T,group,{skip:o=>ropes.some(r=>r.m===o)});
  group.traverse(o=>{if(o.isMesh&&!ropes.some(r=>r.m===o.parent)){o.updateMatrix();o.matrixAutoUpdate=false;}});
  scene.add(group);
  const tmp=new T.Vector3(),down=new T.Vector3(0,-1,0);
  return {group,update(){const pose=getPose?.();for(const {g,m} of ropes){if(pose&&pose.id===g.id){tmp.set(pose.dx,-1,pose.dz).normalize();m.quaternion.setFromUnitVectors(down,tmp);}else if(m.quaternion.w<1)m.quaternion.identity();}},
   dispose(){scene.remove(group);geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());grain.dispose();}};
 }
 root.parkourGrips=Object.freeze({version:1,grips,boxes,mount});
})(typeof window==='object'?window:globalThis);
