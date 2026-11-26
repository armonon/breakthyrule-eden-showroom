'use strict';
// Fewer draw calls for still, many-part objects (an altar of candles and thorns, a door of panels and straps, a
// chest): the opaque meshes under a root that share a material are joined into one mesh per material, in the root's
// space. Each joined mesh is one draw instead of dozens. Transparent, skinned, instanced, multi-material and morphing
// meshes are left alone, and so is anything filter() rejects (animated parts). Children of a joined mesh are kept
// (moved up to the root where they were).
//
// mergeStatic(T, root, {filter, into}): into=true with a Mesh root joins same-material children into the root's own
// geometry (code that holds the root, such as a door leaf that flies off when smashed, keeps working).
(function(root){
 const keyOf=m=>m.material.uuid+'|'+m.receiveShadow+'|'+m.renderOrder+'|'+m.layers.mask;
 const names=g=>Object.keys(g.attributes).sort().join(',');
 function joinable(m){
  return m.isMesh&&!m.isSkinnedMesh&&!m.isInstancedMesh&&!Array.isArray(m.material)&&m.material&&!m.material.transparent&&
   !(m.geometry.morphAttributes&&Object.keys(m.geometry.morphAttributes).length)&&!m.userData.keepSeparate&&m.geometry.attributes.position;
 }
 // Geometries (already in the target space) with the same attribute names, joined into one indexed geometry.
 function join(T,list){
  const attrs=Object.keys(list[0].attributes),out=new T.BufferGeometry();let vertices=0,indices=0;
  for(const g of list){vertices+=g.attributes.position.count;indices+=g.index?g.index.count:g.attributes.position.count;}
  for(const a of attrs){const first=list[0].attributes[a],size=first.itemSize,arr=new Float32Array(vertices*size);let o=0;
   for(const g of list){const at=g.attributes[a];for(let i=0;i<at.count;i++)for(let k=0;k<size;k++)arr[o++]=at.getComponent(i,k);}
   out.setAttribute(a,new T.BufferAttribute(arr,size,first.normalized));}
  const idx=vertices>65535?new Uint32Array(indices):new Uint16Array(indices);let o=0,base=0;
  for(const g of list){const n=g.attributes.position.count;if(g.index)for(let i=0;i<g.index.count;i++)idx[o++]=g.index.getX(i)+base;else for(let i=0;i<n;i++)idx[o++]=i+base;base+=n;}
  out.setIndex(new T.BufferAttribute(idx,1));out.computeBoundingBox();out.computeBoundingSphere();return out;
 }
 function mergeStatic(T,rootObj,{filter=null,into=false}={}){
  rootObj.updateMatrixWorld(true);const inv=new T.Matrix4().copy(rootObj.matrixWorld).invert(),groups=new Map();
  rootObj.traverse(m=>{if(m===rootObj&&!into)return;if(m===rootObj)return;if(!joinable(m)||(filter&&!filter(m)))return;
   const k=keyOf(m);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(m);});
  let joined=0,removed=0;
  for(const [k,list] of groups){
   const self=into&&rootObj.isMesh&&joinable(rootObj)&&keyOf(rootObj)===k;
   if(list.length<(self?1:2))continue;
   const sig=names((self?rootObj:list[0]).geometry),use=list.filter(m=>names(m.geometry)===sig);if(use.length<(self?1:2))continue;
   const geos=use.map(m=>m.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv,m.matrixWorld)));
   if(self)geos.unshift(rootObj.geometry.clone());
   const g=join(T,geos);geos.forEach(x=>x.dispose());
   if(self){rootObj.geometry=g;rootObj.castShadow=rootObj.castShadow||use.some(m=>m.castShadow);}
   else{const first=use[0],mesh=new T.Mesh(g,first.material);mesh.name='Joined: '+(first.material.name||first.name||'parts');mesh.castShadow=use.some(m=>m.castShadow);mesh.receiveShadow=first.receiveShadow;mesh.renderOrder=first.renderOrder;mesh.layers.mask=first.layers.mask;mesh.userData={...first.userData};mesh.frustumCulled=use.every(m=>m.frustumCulled);rootObj.add(mesh);}
   for(const m of use){for(const c of [...m.children])rootObj.attach(c);m.parent?.remove(m);removed++;}
   joined++;
  }
  return {joined,removed};
 }
 root.mergeStatic=mergeStatic;
})(window);
