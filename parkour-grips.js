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

 // Client visuals. Rope meshes follow the rope while it is held (parkour.ropePose).
 function mount(T,scene,{getPose=null}={}){
  if(!T||!scene||scene.getObjectByName('Parkour grips'))return null;
  const group=new T.Group();group.name='Parkour grips';
  const steel=new T.MeshStandardMaterial({color:0x7d8287,metalness:.85,roughness:.35}),rust=new T.MeshStandardMaterial({color:0x6b4a36,metalness:.5,roughness:.7});
  const stone=new T.MeshStandardMaterial({color:0xb7b2a6,roughness:.92}),hemp=new T.MeshStandardMaterial({color:0xa58a5c,roughness:.95});
  const cyl=(a,b,r,mat)=>{const A=new T.Vector3(...a),B=new T.Vector3(...b),len=A.distanceTo(B),m=new T.Mesh(new T.CylinderGeometry(r,r,len,12),mat);m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),B.clone().sub(A).normalize());m.castShadow=true;return m;};
  for(const b of boxes){const w=b.maxX-b.minX,d=b.maxZ-b.minZ,thin=w<.3&&d<.3;
   const m=thin?cyl([(b.minX+b.maxX)/2,0,(b.minZ+b.maxZ)/2],[(b.minX+b.maxX)/2,b.top,(b.minZ+b.maxZ)/2],Math.max(w,d)/2,steel):new T.Mesh(new T.BoxGeometry(w,b.top,d),stone);
   if(!thin){m.position.set((b.minX+b.maxX)/2,b.top/2,(b.minZ+b.maxZ)/2);m.castShadow=m.receiveShadow=true;}group.add(m);}
  for(const [x1,y1,z1,x2,y2,z2] of beams)group.add(cyl([x1,y1,z1],[x2,y2,z2],.07,steel));
  const ropes=[];
  for(const g of grips){
   if(g.type==='bar')group.add(cyl(g.a,g.b,.035,steel));
   else if(g.type==='pipe'){group.add(cyl([g.x,g.y0-.2,g.z],[g.x,g.y1+.05,g.z],.055,rust));for(let y=g.y0+.6;y<g.y1;y+=1.2)group.add(cyl([g.x,y,g.z],[g.x-g.n[0]*.22,y,g.z-g.n[1]*.22],.02,rust));}
   else if(g.type==='rope'){const m=new T.Mesh(new T.CylinderGeometry(.03,.035,g.len,8),hemp);m.geometry.translate(0,-g.len/2,0);m.position.set(g.x,g.top,g.z);m.castShadow=true;group.add(m);
    const knot=new T.Mesh(new T.SphereGeometry(.07,10,8),hemp);knot.position.y=-g.len;m.add(knot);ropes.push({g,m});}
  }
  scene.add(group);
  const tmp=new T.Vector3(),down=new T.Vector3(0,-1,0);
  return {group,update(){const pose=getPose?.();for(const {g,m} of ropes){if(pose&&pose.id===g.id){tmp.set(pose.dx,-1,pose.dz).normalize();m.quaternion.setFromUnitVectors(down,tmp);}else m.quaternion.identity();}},
   dispose(){scene.remove(group);group.traverse(o=>{o.geometry?.dispose?.();});[steel,rust,stone,hemp].forEach(m=>m.dispose());}};
 }
 root.parkourGrips=Object.freeze({version:1,grips,boxes,mount});
})(typeof window==='object'?window:globalThis);
