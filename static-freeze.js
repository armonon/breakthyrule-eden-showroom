'use strict';
// Stops Three recomposing the local matrix of world objects that never move.
//
// Every frame Three rebuilds each object's matrix from its position, rotation and scale (matrixAutoUpdate) and
// multiplies it into the world matrix: thousands of buildings, props and batches in Eden and Beyond Eden that have
// not moved since they were placed. Twice a second this looks over the named world roots: an object whose transform
// has stayed put for three seconds is frozen (its matrix composed once, then left alone); a frozen object found moved
// is thawed at once (so something that starts moving is at most half a second behind). Objects that already manage
// their own matrix (matrixAutoUpdate false when first seen) are never touched.
(function(root){
 function createStaticFreeze(T,scene,names,{settle=3,every=.5}={}){
  const seen=new WeakMap(),own=new WeakSet(),tracked=new Set();let next=0,lastScan=-1,stats={frozen:0,thawed:0,tracked:0};
  const snap=(o,s)=>{const p=o.position,q=o.quaternion,c=o.scale;s[0]=p.x;s[1]=p.y;s[2]=p.z;s[3]=q.x;s[4]=q.y;s[5]=q.z;s[6]=q.w;s[7]=c.x;s[8]=c.y;s[9]=c.z;};
  const same=(o,s)=>{const p=o.position,q=o.quaternion,c=o.scale;return s[0]===p.x&&s[1]===p.y&&s[2]===p.z&&s[3]===q.x&&s[4]===q.y&&s[5]===q.z&&s[6]===q.w&&s[7]===c.x&&s[8]===c.y&&s[9]===c.z;};
  function rescan(){
   tracked.clear();
   for(const child of scene.children){if(!names.includes(child.name))continue;
    child.traverse(o=>{if(o===child)return;if(!seen.has(o)){if(!o.matrixAutoUpdate){own.add(o);seen.set(o,null);return;}const s=new Float64Array(10);snap(o,s);seen.set(o,{s,since:null,frozen:false});}
     if(!own.has(o))tracked.add(o);});}
   stats.tracked=tracked.size;
  }
  // A hidden world (the museum, the library, the amphitheater while you are in Beyond Eden) is not drawn, but Three
  // still walked it and recomposed every matrix in it each frame. Its root now skips that while hidden and refreshes
  // the whole subtree the frame it shows again. A forced call (someone asking for exact matrices) still goes through.
  const keepWalking=new Set(['Player body']);
  function skipHidden(o){if(o.__skipHidden||o.isCamera||keepWalking.has(o.name))return;o.__skipHidden=true;let stale=false;const base=o.updateMatrixWorld;
   o.updateMatrixWorld=function(force){if(!this.visible&&!force){stale=true;return;}if(stale){stale=false;force=true;}return base.call(this,force);};}
  return {
   update(time){
    const t=time/1000;if(t<next)return;next=t+every;
    for(const child of scene.children)skipHidden(child);
    if(lastScan<0||t-lastScan>2){lastScan=t;rescan();}
    for(const o of tracked){const e=seen.get(o);if(!e)continue;
     if(e.frozen){if(!same(o,e.s)){o.matrixAutoUpdate=true;e.frozen=false;e.since=t;snap(o,e.s);stats.thawed++;}continue;}
     if(!same(o,e.s)){snap(o,e.s);e.since=t;continue;}
     if(e.since===null)e.since=t;
     if(t-e.since>=settle){o.updateMatrix();o.matrixAutoUpdate=false;e.frozen=true;stats.frozen++;}}
   },
   inspect:()=>({...stats,frozenNow:[...tracked].filter(o=>seen.get(o)?.frozen).length})
  };
 }
 root.createStaticFreeze=createStaticFreeze;
})(window);
