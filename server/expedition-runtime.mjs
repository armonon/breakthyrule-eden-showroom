import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createJoltWorld} from '../ragdoll-jolt.js';
import {normalizeCharacter} from './character.mjs';
export const simulationFiles=['assets/three.min.js','assets/night-pathfinding.js','assets/roof-heights.js','night-layout.json','character-schema.json','expedition-world.js','movement-state.js','player-motion.js','parkour-grips.js','parkour.js','player-movement.js','expedition-controller.js','expedition-inputs.js','solo-expedition.js','character-rocketbox.js','character-motion.js','character-anim.js','assets/anim/clips.json','ragdoll-jolt.js','jolt-state.js','player-bail.js','expedition-pose.js','server/expedition-actor.mjs','server/character.mjs','server/expedition-runtime.mjs','server/expedition-authority.mjs','server/expedition.mjs','expedition-actor.js','assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.js','assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.wasm'];
const ids=['boulevard','harbor','midnight','coast','riviera','marina','garden','sunset'];
const base=new URL('../',import.meta.url),sha=data=>crypto.createHash('sha256').update(data).digest('hex');
export function expeditionRevision(){const files=[...simulationFiles,...ids.map(id=>'assets/characters/'+id+'/mesh.bin')].map(path=>({path,sha256:sha(fs.readFileSync(new URL(path,base)))}));return {version:2,worldRevision:sha(JSON.stringify(files)),files};}
export async function loadExpeditionRuntime(){
 const revision=expeditionRevision(),clips=JSON.parse(fs.readFileSync(new URL('assets/anim/clips.json',base),'utf8'));
 const scope=vm.createContext({console,structuredClone,performance,URL,TextEncoder,TextDecoder,atob,setTimeout,clearTimeout,AbortController,location:{href:base.href},fetch:async url=>{
  if(String(url).split('?')[0]!=='/assets/anim/clips.json')throw Error('Unexpected headless asset request.');return {ok:true,json:async()=>structuredClone(clips)};
 }});scope.window=scope;
 for(const file of ['assets/three.min.js','assets/night-pathfinding.js','assets/roof-heights.js','expedition-world.js','movement-state.js','player-motion.js','parkour-grips.js','parkour.js','player-movement.js','expedition-controller.js','expedition-inputs.js','solo-expedition.js','character-rocketbox.js','character-anim.js','character-motion.js','expedition-pose.js'])vm.runInContext(fs.readFileSync(new URL(file,base),'utf8'),scope,{filename:file});
 await scope.GardenAnim.load();if(!scope.GardenAnim.ready())throw Error('Authoritative animation library is unavailable.');
 const headers=new Map();for(const id of ids){const buffer=fs.readFileSync(new URL('assets/characters/'+id+'/mesh.bin',base)),length=buffer.readUInt32LE(0);if(length>512000||length+4>buffer.length)throw Error('Invalid character header.');const header=JSON.parse(buffer.subarray(4,length+4).toString('utf8'));
  if(!Array.isArray(header.bones)||header.bones.length>128||!Number.isFinite(header.eyeY)||!Number.isFinite(header.hipY))throw Error('Invalid character skeleton.');
  const names=new Set();header.bones.forEach((b,i)=>{if(typeof b.name!=='string'||names.has(b.name)||!Number.isInteger(b.parent)||b.parent< -1||b.parent>=i||!Array.isArray(b.position)||b.position.length!==3||![0,1,2].every(k=>Number.isFinite(b.position[k])))throw Error('Invalid character joint.');names.add(b.name);});headers.set(id,header);
 }
 const moduleURL=new URL('assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.js',base).href,wasmBinary=fs.readFileSync(new URL('assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.wasm',base));
 const T=scope.THREE,layout=JSON.parse(fs.readFileSync(new URL('night-layout.json',base),'utf8'));
 function characterRig(value){const appearance=normalizeCharacter(value),id=scope.GardenCharacterRocketbox.idFor(appearance),header=headers.get(id),root=new T.Group();root.scale.setScalar(appearance.height/175);root.userData.characterStyle='rocketbox';
  const rig=scope.GardenCharacterRocketbox.buildRig(T,header,appearance,root),model={root,...rig,characterId:id,appearance,height:appearance.height/100};
  model.motion=scope.GardenCharacterMotion.create(T,model,{canonical:true});model.motion.animate(0);model.root.updateMatrixWorld(true);
  model.rigRevision=sha(JSON.stringify({id,header,appearance,source:revision.files.find(f=>f.path==='character-rocketbox.js').sha256}));
  model.dispose=()=>{scope.GardenCharacterMotion.bodies.delete(model);model.skeleton.dispose();model.root.clear();};return model;
 }
 return {scope,T,layout,revision,characterRig,physicsWorld:()=>createJoltWorld({moduleURL,moduleOptions:{wasmBinary}}),createEngine:options=>scope.createSoloExpedition({layout,controlled:true,worldRevision:revision.worldRevision,...options})};
}
