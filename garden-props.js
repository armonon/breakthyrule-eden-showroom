'use strict';
// Props produced by the local asset workshop (~/Projects/breakthyrule-asset-workshop).
// GLBs are exported Y-up in metres, grounded at y=0 and centred on x/z, so they place without rescaling.
// Collision is a simple circle per prop (radius in metres), checked by app.js move() like the pond and trunk.
window.gardenPropDefinitions=[
 {name:'Weathered limestone planter',url:'/assets/props/limestone-planter-v003.glb',position:[-1.25,-.06,7.2],rotationY:.6,radius:.3}
];
window.createGardenProps=function(T,scene,{onLoad=()=>{}}={}){
 const root=new T.Group();root.name='Workshop garden props';scene.add(root);
 const entries=window.gardenPropDefinitions.map(definition=>({...definition,status:'loading'}));
 const ready=Promise.allSettled(entries.map(entry=>showroomAssets.model(entry.url).then(gltf=>{
  const model=gltf.scene;model.name=entry.name;model.position.set(...entry.position);model.rotation.y=entry.rotationY||0;
  model.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});
  root.add(model);model.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(model);entry.size=bounds.getSize(new T.Vector3()).toArray().map(v=>+v.toFixed(3));entry.status='loaded';onLoad(entry);
 }).catch(error=>{entry.status='failed';entry.error=String(error);})));
 return {root,ready,
  blocks(position){return entries.some(entry=>entry.status==='loaded'&&Math.hypot(position.x-entry.position[0],position.z-entry.position[2])<entry.radius+.25);},
  inspect:()=>entries.map(({name,url,status,size,error})=>({name,url,status,size,error}))};
};
