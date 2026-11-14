import crypto from 'node:crypto';
import {createExpeditionPhysicalActor} from '../expedition-actor.js';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export const encodePhysics=bytes=>({length:bytes.length,sha256:hash(bytes),data:Buffer.from(bytes).toString('base64')});
export function decodePhysics(p){if(!p||!Number.isSafeInteger(p.length)||p.length<1||p.length>16*1024*1024||typeof p.data!=='string'||p.data.length!==Math.ceil(p.length/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.data))throw Error('Invalid physical character bytes.');const bytes=Buffer.from(p.data,'base64');if(bytes.length!==p.length||hash(bytes)!==p.sha256)throw Error('Damaged physical character checkpoint.');return bytes;}
// Asset loading/WASM compilation finishes before admission, never inside a tick.
export async function prepareExpeditionActor(runtime,appearance){
 const model=runtime.characterRig(appearance);let physics;
 try{physics=await runtime.physicsWorld();}catch(error){model.dispose();throw error;}
 let attached=false,disposed=false;
 return {dispose(){if(disposed||attached)return;disposed=true;physics.dispose();model.dispose();},attach({controller,world}){
  if(attached||disposed)throw Error('Character physics resources are already in use.');
  const actor=createExpeditionPhysicalActor({T:runtime.T,model,physics,controller,world,createPose:runtime.scope.createExpeditionPose,worldRevision:runtime.revision.worldRevision,encodePhysics,decodePhysics});attached=true;return actor;
 }};
}
