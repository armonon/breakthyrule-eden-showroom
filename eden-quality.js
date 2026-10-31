'use strict';
// Adaptive resolution. Learns the display's frame interval (the shortest one seen), then lowers the render pixel
// ratio a step when frames keep arriving late and raises it again after several seconds of smooth frames. Only
// consecutive frames count, so the idle/on-demand pauses in the render loop never read as slowness.
window.createAdaptiveResolution=function(renderer,{max=Math.min(devicePixelRatio,1.5),min=.75,step=.25,onChange=()=>{}}={}){
 const RATES=[30,48,50,60,75,90,100,120,144,165,240];
 let ratio=max,vsync=1000/60,shortest=Infinity,average=0,smoothSince=0,lastChange=0,last=0,frames=0;
 renderer.setPixelRatio(ratio);
 function set(next,time){
  next=Math.max(min,Math.min(max,Math.round(next/step)*step));if(next===ratio)return;
  ratio=next;lastChange=time;smoothSince=time;average=vsync;renderer.setPixelRatio(ratio);onChange(ratio);
 }
 return {
  // Call once per rendered frame with the rAF timestamp; `consecutive` is false after an idle pause.
  frame(time,consecutive){
   if(!consecutive||!last){last=time;return;}
   const interval=time-last;last=time;if(interval<=0||interval>250)return;
   if(++frames<240)return; // ignore the first ~4 s: loading and shader compiles make every frame slow
   // Shortest interval seen, snapped to the nearest standard refresh rate (jitter must not lower the baseline).
   shortest=Math.min(shortest,Math.max(interval,4));vsync=1000/RATES.reduce((best,hz)=>Math.abs(1000/hz-shortest)<Math.abs(1000/best-shortest)?hz:best);
   average=average?average+(interval-average)*.08:interval;
   if(time-lastChange<2500)return;
   if(average>vsync*1.6)set(ratio-step,time);
   else if(average<vsync*1.25){if(!smoothSince)smoothSince=time;else if(time-smoothSince>8000&&ratio<max)set(ratio+step,time);}
   else smoothSince=0;
  },
  pause(){last=0;},
  inspect:()=>({pixelRatio:ratio,max,min,frameMs:+average.toFixed(1),vsyncMs:+vsync.toFixed(1)})
 };
};

// Static batching. Merges plain meshes that share a material (and shadow flags / attribute layout) into one mesh
// per group, removing hundreds of draw calls from hand-built scenery. Left alone: anything with userData (picking
// and interaction tags), children, skinning, instancing, morphs, multi-materials or hidden state. Materials stay
// shared, so material animation (lamp glow etc.) keeps working. `skip` stops the walk at subtrees that move.
window.mergeStaticMeshes=function(T,root,{skip=()=>false,minGroup=2}={}){
 if(!root)return {merged:0,removed:0};
 root.updateMatrixWorld(true);
 const toRoot=new T.Matrix4().copy(root.matrixWorld).invert(),groups=new Map();
 (function visit(o,visible){
  if(o!==root&&skip(o))return;const shown=visible&&o.visible;
  for(const child of o.children)visit(child,shown);
  if(o===root||!shown||!o.isMesh||o.isInstancedMesh||o.isSkinnedMesh||o.children.length||Array.isArray(o.material)||Object.keys(o.userData).length)return;
  const g=o.geometry;if(!g.attributes.position||!g.attributes.normal||Object.keys(g.morphAttributes).length||o.onBeforeRender!==T.Object3D.prototype.onBeforeRender)return;
  const key=[o.material.uuid,o.castShadow,o.receiveShadow,o.renderOrder,!!g.attributes.uv,!!g.attributes.color].join('|');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
 })(root,true);
 let merged=0,removed=0;const m=new T.Matrix4(),nm=new T.Matrix3(),v=new T.Vector3();
 for(const meshes of groups.values()){
  if(meshes.length<minGroup)continue;
  const first=meshes[0],hasUv=!!first.geometry.attributes.uv,hasColor=!!first.geometry.attributes.color,pos=[],nrm=[],uv=[],col=[],index=[];
  for(const mesh of meshes){
   const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,base=pos.length/3;
   m.multiplyMatrices(toRoot,mesh.matrixWorld);nm.getNormalMatrix(m);const flip=m.determinant()<0;
   for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);pos.push(v.x,v.y,v.z);v.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();nrm.push(v.x,v.y,v.z);
    if(hasUv)uv.push(g.attributes.uv.getX(i),g.attributes.uv.getY(i));if(hasColor)col.push(g.attributes.color.getX(i),g.attributes.color.getY(i),g.attributes.color.getZ(i));}
   const ix=g.index?g.index.array:Array.from({length:p.count},(_,i)=>i);
   for(let t=0;t+2<ix.length;t+=3){if(flip)index.push(base+ix[t],base+ix[t+2],base+ix[t+1]);else index.push(base+ix[t],base+ix[t+1],base+ix[t+2]);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(nrm,3));
  if(hasUv)geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));if(hasColor)geometry.setAttribute('color',new T.Float32BufferAttribute(col,3));
  geometry.setIndex(pos.length/3>65535?new T.Uint32BufferAttribute(index,1):new T.Uint16BufferAttribute(index,1));geometry.computeBoundingSphere();
  const batch=new T.Mesh(geometry,first.material);batch.name='Static batch: '+(first.material.name||first.name||'mesh');
  Object.assign(batch,{castShadow:first.castShadow,receiveShadow:first.receiveShadow,renderOrder:first.renderOrder});root.add(batch);
  for(const mesh of meshes)mesh.removeFromParent();merged++;removed+=meshes.length;
 }
 return {merged,removed};
};
