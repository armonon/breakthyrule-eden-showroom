const decode=s=>{const b=Buffer.from(s,'base64');return new Int16Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
const encode=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64');

// Movement owns translation. Retain only local compression for body actions and
// periodic bob for climbing loops; otherwise the authored rise stacks on physics.
export function processClip(THREE,clip,policy,boneCount){
 const out={...clip},hip=decode(clip.hip),q=decode(clip.q),last=clip.n-1;
 if(policy==='flat')hip.fill(0);
 else if(policy==='cycle'){
  const start=hip[0],drift=hip[last]-start;
  for(let f=0;f<=last;f++)hip[f]=Math.round(hip[f]-start-drift*f/last);
 }else if(policy!=='body')throw Error('Unknown root-motion policy: '+policy);
 if(clip.loop){
  // The runtime interpolates to n-1 then wraps to zero. Close that seam with a
  // short eased correction over the tail, retaining the source's whole cycle.
  const span=Math.min(last,Math.max(2,Math.round(clip.fps*.16))),from=last-span;
  const a=new THREE.Quaternion(),b=new THREE.Quaternion(),values=[];
  for(let f=from+1;f<=last;f++){
   const t=(f-from)/span,k=t*t*(3-2*t);
   for(let i=0;i<boneCount;i++){
    const p=(f*boneCount+i)*4,z=i*4;
    a.fromArray(q,p).normalize();b.fromArray(q,z).normalize();a.slerp(b,k).toArray(values);
    for(let c=0;c<4;c++)q[p+c]=Math.round(values[c]*32767);
   }
   hip[f]=Math.round(hip[f]*(1-k)+hip[0]*k);
  }
 }
 out.q=encode(q);out.hip=encode(hip);out.rootMotion=policy;
 return out;
}

export function mergeLibrary(lib,baked){
 if(JSON.stringify(lib.bones)!==JSON.stringify(baked.bones))throw Error('Bone list changed: rebake the complete library.');
 for(const [name,source] of Object.entries(baked.sources)){
  if(lib.sources[name]&&JSON.stringify(lib.sources[name])!==JSON.stringify(source)){
   const retained=Object.entries(lib.clips).some(([id,c])=>c.src===name&&!baked.clips[id]);
   if(retained)throw Error('Cannot change the source space for retained clips: '+name);
  }
 }
 return {...lib,sources:{...lib.sources,...baked.sources},clips:{...lib.clips,...baked.clips}};
}
