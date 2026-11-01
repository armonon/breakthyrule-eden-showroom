'use strict';
// The library's west garden, where the old pavilion stood: a flagstone walk from the reading deck to the museum's
// portico, between two open-air bookcases of spines that face each other across it.
window.createLibraryGarden=function createLibraryGarden(T,scene){
 const garden=new T.Group();garden.name='Library west garden';scene.add(garden);
 const stone=new T.MeshStandardMaterial({color:0xd6d3c4,roughness:.94});
 const green=new T.MeshStandardMaterial({color:0x244e43,roughness:.65,metalness:.15}),wood=new T.MeshStandardMaterial({color:0xb19b73,roughness:.83});
 const from=new T.Vector3(-1.1,0,-3.5),to=new T.Vector3(-5.7,0,-1),slabShape=new T.CylinderGeometry(1,1.07,.065,9);
 for(let i=0,n=Math.ceil(from.distanceTo(to)/.8);i<=n;i++){
  const p=from.clone().lerp(to,i/n),slab=new T.Mesh(slabShape,stone);
  slab.position.set(p.x,-.012,p.z+Math.sin(i*2.1)*.1);slab.scale.set(.52,1,.46);slab.rotation.y=i*.9;slab.receiveShadow=true;garden.add(slab);
 }
 // Bookcases: a green frame, four wooden shelves and rows of spines in leather and cloth colours.
 const spineColours=[0x6b2b22,0x2f3f5c,0x3d5a3a,0x8a6a35,0x4a2f4f,0x1f2a2a,0x9b8a6a,0x5c1f1f,0x2b4a52,0xc2b48f].map(c=>new T.Color(c));
 const spine=new T.BoxGeometry(1,1,1),spineMaterial=new T.MeshStandardMaterial({roughness:.8});
 const rng=(seed=>()=>(seed=(seed*16807)%2147483647)/2147483647)(11);
 const cases=[[-4.7,.4,Math.PI],[-4.7,-3.45,0]];
 for(const [x,z,turn] of cases){
  const shelf=new T.Group();shelf.position.set(x,0,z);shelf.rotation.y=turn;garden.add(shelf);
  const box=(w,h,d,px,py,pz,material)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(px,py,pz);mesh.castShadow=mesh.receiveShadow=true;shelf.add(mesh);};
  box(2.5,2.2,.05,0,1.12,-.2,green);for(const px of [-1.24,0,1.24])box(.06,2.3,.46,px,1.15,0,green);box(2.62,.08,.56,0,2.32,0,green);
  const rows=[.12,.66,1.2,1.74],books=[];
  for(const y of rows){box(2.5,.04,.44,0,y,0,wood);
   for(let px=-1.19;px<1.17;){const w=.035+rng()*.04,h=.3+rng()*.16;if(px+w>1.19)break;if(Math.abs(px+w/2)>.05)books.push([px+w/2,y+.02+h/2,w,h,.24+rng()*.1]);px+=w+.004;}}
  const mesh=new T.InstancedMesh(spine,spineMaterial,books.length),m=new T.Matrix4();
  books.forEach(([px,py,w,h,d],i)=>{m.makeScale(w,h,d).setPosition(px,py,-.15+d/2);mesh.setMatrixAt(i,m);mesh.setColorAt(i,spineColours[Math.floor(rng()*spineColours.length)]);});
  mesh.castShadow=mesh.receiveShadow=true;shelf.add(mesh);
 }
 return {root:garden,blocks:p=>cases.some(([x,z])=>Math.abs(p.x-x)<1.6&&Math.abs(p.z-z)<.6)};
};
