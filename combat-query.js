'use strict';
// Exact mesh hits, ordered by a cheap world-space bound. Once a close surface
// is hit, distant detailed buildings never need a triangle test for that ray.
window.createNearestSceneryQuery=function(T){
 const bounds=new WeakMap(),candidates=[],hits=[],point=new T.Vector3();
 let queries=0,tested=0;
 return {
  hit(raycaster,objects){
   queries++;candidates.length=0;const far=raycaster.far,ray=raycaster.ray;let nearest=null;
   for(const object of objects){
    if(!object.layers.test(raycaster.layers))continue;
    let shown=true;for(let p=object;p;p=p.parent)if(!p.visible){shown=false;break;}if(!shown)continue;
    // Instanced bounds need per-instance handling in Three itself.
    if(object.isInstancedMesh){candidates.push({object,near:raycaster.near});continue;}
    const geometry=object.geometry;if(!geometry?.boundingBox)geometry?.computeBoundingBox();if(!geometry?.boundingBox)continue;
    let entry=bounds.get(object);if(!entry){entry={matrix:new T.Matrix4(),box:new T.Box3(),geometry:null};bounds.set(object,entry);}
    if(entry.geometry!==geometry||!entry.matrix.equals(object.matrixWorld)){entry.geometry=geometry;entry.matrix.copy(object.matrixWorld);entry.box.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);}
    const inside=entry.box.containsPoint(ray.origin),intersection=inside?point.copy(ray.origin):ray.intersectBox(entry.box,point);if(!intersection)continue;
    const near=inside?0:ray.origin.distanceTo(intersection);if(near>far)continue;candidates.push({object,near});
   }
   candidates.sort((a,b)=>a.near-b.near);
   try{for(const candidate of candidates){if(candidate.near>raycaster.far)break;hits.length=0;tested++;raycaster.intersectObject(candidate.object,false,hits);
    for(const hit of hits)if(hit.distance<=raycaster.far&&(!nearest||hit.distance<nearest.distance)){nearest=hit;raycaster.far=hit.distance;}
   }}finally{raycaster.far=far;}
   return nearest;
  },
  inspect:()=>({queries,triangleTests:tested})
 };
};
