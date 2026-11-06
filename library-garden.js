'use strict';
// The library's west garden, where the old pavilion stood: a flagstone walk from the reading deck to the museum's portico.
window.createLibraryGarden=function createLibraryGarden(T,scene){
 const garden=new T.Group();garden.name='Library west garden';scene.add(garden);
 const stone=new T.MeshStandardMaterial({color:0xd6d3c4,roughness:.94});
 const from=new T.Vector3(-1.1,0,-3.5),to=new T.Vector3(-5.7,0,-1),slabShape=new T.CylinderGeometry(1,1.07,.065,9);
 for(let i=0,n=Math.ceil(from.distanceTo(to)/.8);i<=n;i++){
  const p=from.clone().lerp(to,i/n),slab=new T.Mesh(slabShape,stone);
  slab.position.set(p.x,-.012,p.z+Math.sin(i*2.1)*.1);slab.scale.set(.52,1,.46);slab.rotation.y=i*.9;slab.receiveShadow=true;garden.add(slab);
 }
 return {root:garden,blocks:()=>false};
};
