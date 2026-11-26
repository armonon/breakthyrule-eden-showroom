'use strict';
// Exact mesh hits, ordered by a cheap world-space bound. Once a close surface
// is hit, distant detailed buildings never need a triangle test for that ray.
// Big static meshes (merged batches whose bound spans the map) get a bounding-volume tree over their triangles,
// built once per geometry, so a ray tests only the few triangles near its path instead of every one.
window.createNearestSceneryQuery=function(T){
 const bounds=new WeakMap(),candidates=[],hits=[],point=new T.Vector3();
 let queries=0,tested=0,treeTests=0,treesBuilt=0;
 const BIG=600,LEAF=8,trees=new WeakMap();
 // Tree over one geometry's triangles (local space): flat arrays of node boxes; leaves hold triangle ranges.
 function buildTree(geometry){
  const pos=geometry.attributes.position,index=geometry.index,n=(index?index.count:pos.count)/3|0;
  const tri=new Uint32Array(n),cx=new Float32Array(n),cy=new Float32Array(n),cz=new Float32Array(n),lo=new Float32Array(n*3),hi=new Float32Array(n*3);
  const v=i=>index?index.getX(i):i;
  for(let t=0;t<n;t++){tri[t]=t;let a=Infinity,b=Infinity,c=Infinity,d=-Infinity,e=-Infinity,f=-Infinity;
   for(let k=0;k<3;k++){const i=v(t*3+k),x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);if(x<a)a=x;if(y<b)b=y;if(z<c)c=z;if(x>d)d=x;if(y>e)e=y;if(z>f)f=z;}
   lo[t*3]=a;lo[t*3+1]=b;lo[t*3+2]=c;hi[t*3]=d;hi[t*3+1]=e;hi[t*3+2]=f;cx[t]=(a+d)/2;cy[t]=(b+e)/2;cz[t]=(c+f)/2;}
  const box=[],left=[],right=[],start=[],count=[];
  function node(s,e){const id=start.length;start.push(s);count.push(e-s);left.push(-1);right.push(-1);
   let a=Infinity,b=Infinity,c=Infinity,d=-Infinity,f=-Infinity,g=-Infinity;
   for(let i=s;i<e;i++){const t=tri[i]*3;if(lo[t]<a)a=lo[t];if(lo[t+1]<b)b=lo[t+1];if(lo[t+2]<c)c=lo[t+2];if(hi[t]>d)d=hi[t];if(hi[t+1]>f)f=hi[t+1];if(hi[t+2]>g)g=hi[t+2];}
   box.push(a,b,c,d,f,g);
   if(e-s>LEAF){const ax=d-a>=f-b&&d-a>=g-c?0:f-b>=g-c?1:2,C=ax===0?cx:ax===1?cy:cz,mid=ax===0?(a+d)/2:ax===1?(b+f)/2:(c+g)/2;
    let i=s,j=e-1;while(i<=j){if(C[tri[i]]<mid)i++;else{const tmp=tri[i];tri[i]=tri[j];tri[j]=tmp;j--;}}
    if(i===s||i===e)i=(s+e)>>1;
    left[id]=node(s,i);right[id]=node(i,e);}
   return id;}
  node(0,n);treesBuilt++;
  return {tri,box:new Float32Array(box),left:Int32Array.from(left),right:Int32Array.from(right),start:Uint32Array.from(start),count:Uint32Array.from(count),index,pos};
 }
 const inv=new T.Matrix4(),lray=new T.Ray(),A=new T.Vector3(),B=new T.Vector3(),C=new T.Vector3(),hitP=new T.Vector3(),best=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3(),stack=[];
 function slab(o,d,box,i,far){let t0=0,t1=far;for(let k=0;k<3;k++){const inv=1/d[k],a=(box[i+k]-o[k])*inv,b=(box[i+3+k]-o[k])*inv;const lo=a<b?a:b,hi=a<b?b:a;if(lo>t0)t0=lo;if(hi<t1)t1=hi;if(t0>t1)return false;}return true;}
 // Nearest hit on a big mesh through its tree, in the shape Raycaster gives (distance, point, face.normal, object).
 function treeHit(object,raycaster){
  const geometry=object.geometry;let tree=trees.get(geometry);if(!tree){tree=buildTree(geometry);trees.set(geometry,tree);}
  inv.copy(object.matrixWorld).invert();lray.copy(raycaster.ray).applyMatrix4(inv);
  const o=[lray.origin.x,lray.origin.y,lray.origin.z],d=[lray.direction.x,lray.direction.y,lray.direction.z];
  // Local far: the world far mapped through the object's scale.
  const sc=object.matrixWorld.getMaxScaleOnAxis()||1;let far=raycaster.far/sc*1.001,found=-1;
  const side=[].concat(object.material)[0]?.side,v=i=>tree.index?tree.index.getX(i):i;
  stack.length=0;stack.push(0);
  while(stack.length){const id=stack.pop();if(!slab(o,d,tree.box,id*6,far))continue;
   const k=tree.left[id];if(k>=0){stack.push(k,tree.right[id]);continue;}
   for(let i=tree.start[id],e=i+tree.count[id];i<e;i++){const t=tree.tri[i];treeTests++;
    A.fromBufferAttribute(tree.pos,v(t*3));B.fromBufferAttribute(tree.pos,v(t*3+1));C.fromBufferAttribute(tree.pos,v(t*3+2));
    const p=lray.intersectTriangle(A,B,C,side===T.FrontSide,hitP);if(!p)continue;const dist=p.distanceTo(lray.origin);if(dist<far){far=dist;found=t;best.copy(p);}}}
  if(found<0)return null;
  A.fromBufferAttribute(tree.pos,v(found*3));B.fromBufferAttribute(tree.pos,v(found*3+1));C.fromBufferAttribute(tree.pos,v(found*3+2));
  const normal=ab.subVectors(B,A).cross(ac.subVectors(C,A)).normalize().clone();
  const pw=best.clone().applyMatrix4(object.matrixWorld),distance=pw.distanceTo(raycaster.ray.origin);
  if(distance<raycaster.near||distance>raycaster.far)return null;
  return {distance,point:pw,object,face:{a:v(found*3),b:v(found*3+1),c:v(found*3+2),normal,materialIndex:0},faceIndex:found};
 }
 const useTree=o=>!o.isSkinnedMesh&&!o.isInstancedMesh&&!o.morphTargetInfluences&&o.geometry?.attributes?.position&&((o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3>BIG)&&!Array.isArray(o.material);
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
   try{for(const candidate of candidates){if(candidate.near>raycaster.far)break;tested++;
    if(useTree(candidate.object)){const h=treeHit(candidate.object,raycaster);if(h&&(!nearest||h.distance<nearest.distance)){nearest=h;raycaster.far=h.distance;}continue;}
    hits.length=0;raycaster.intersectObject(candidate.object,false,hits);
    for(const hit of hits)if(hit.distance<=raycaster.far&&(!nearest||hit.distance<nearest.distance)){nearest=hit;raycaster.far=hit.distance;}
   }}finally{raycaster.far=far;}
   return nearest;
  },
  inspect:()=>({queries,triangleTests:tested,treeTriangleTests:treeTests,treesBuilt})
 };
};
