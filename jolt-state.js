// Opaque checkpoints for the pinned Jolt build. Callers must reconstruct identical
// bodies/constraints and verify their own build, geometry and byte digest first.
// Restore is destructive: a rejected target must be discarded, never resumed.
const LIMIT=16*1024*1024;
function recorder(Jolt){const r=new Jolt.StateRecorderJS();r.SetValidating(false);r.SetIsLastPart(true);return r;}
export function captureJoltState({Jolt,system}){
 const r=recorder(Jolt),chunks=[];let length=0;
 r.ReadBytes=()=>{throw Error('Unexpected physics checkpoint read.');};r.IsEOF=()=>false;r.IsFailed=()=>false;
 r.WriteBytes=(pointer,count)=>{if(!Number.isSafeInteger(pointer)||!Number.isSafeInteger(count)||pointer<0||count<0||pointer+count>Jolt.HEAPU8.length||(length+=count)>LIMIT)throw Error('Physics checkpoint exceeds its bound.');chunks.push(Jolt.HEAPU8.slice(pointer,pointer+count));};
 try{system.SaveState(r,Jolt.EStateRecorderState_All);}finally{Jolt.destroy(r);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function restoreJoltState({Jolt,system},input){
 if(!(input instanceof Uint8Array)||!input.length||input.length>LIMIT)throw Error('Invalid physics checkpoint bytes.');
 const bytes=input.slice(),r=recorder(Jolt);let offset=0,failed=false,ok=false;
 r.WriteBytes=()=>{throw Error('Unexpected physics checkpoint write.');};r.IsEOF=()=>offset>=bytes.length;r.IsFailed=()=>failed;
 r.ReadBytes=(pointer,count)=>{if(!Number.isSafeInteger(pointer)||!Number.isSafeInteger(count)||pointer<0||count<0||pointer+count>Jolt.HEAPU8.length||offset+count>bytes.length){failed=true;throw Error('Truncated physics checkpoint.');}Jolt.HEAPU8.set(bytes.subarray(offset,offset+count),pointer);offset+=count;};
 try{ok=system.RestoreState(r);}finally{Jolt.destroy(r);}
 if(!ok||failed||offset!==bytes.length)throw Error('Physics checkpoint does not match this world.');
 return true;
}
