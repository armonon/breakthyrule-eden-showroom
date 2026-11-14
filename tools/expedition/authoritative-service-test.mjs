import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createInputExpeditionService} from '../../server/expedition-authority.mjs';
import {loadExpeditionRuntime} from '../../server/expedition-runtime.mjs';
const runtime=await loadExpeditionRuntime();
const user=i=>({id:'physical-user-'+i,name:'Physics '+i,character:{version:1,character:['boulevard','harbor','midnight','coast','riviera','marina'][i],height:145+i*13}});
test('six authenticated selected rigs use input authority and resume live ragdolls after service restart',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eden-authority-test-'));let now=100,wall=2000,service;
 const users=Array.from({length:6},(_,i)=>user(i)),credentials=[],options={runtime,storageDir:directory,clock:()=>now,wallClock:()=>wall};
 const send=(i,action,extra={})=>service.command({action,...extra,token:credentials[i].token,generation:credentials[i].generation,connectionEpoch:credentials[i].connectionEpoch},{user:users[i]});
 try{service=await createInputExpeditionService(options);assert.equal(service.available().protocolVersion,2);assert.equal(service.available().physicalCharacters,true);
  await assert.rejects(()=>service.command({action:'create'}),/Sign in/);assert.equal(service.stats().physicalActors,0);
  for(let i=0;i<6;i++){credentials[i]=await service.command({action:i?'join':'create',code:credentials[0]?.code},{user:users[i]});await send(i,'ready');}
  assert.equal(service.stats().physicalActors,6);await send(0,'start');await assert.rejects(()=>send(0,'pose',{seq:1,pose:{x:100,y:0,z:0,yaw:0,pitch:0}}),/sequenced inputs/);
  for(let n=0;n<150;n++){
   if(n%3===0)for(let i=0;i<6;i++){const anchor=credentials[i].selfInput.anchorTick;await send(i,'inputs',{frames:Array.from({length:3},(_,k)=>({seq:n+k,tick:anchor+n+k,heldMask:n<36?17:0,edges:n+k===32?1:0,yaw:Math.PI,pitch:0,actions:n+k===40?[{action:'bail'}]:[]}))});}
   now+=1/60;wall+=1/60;service.tick();
  }
  let before=await send(0,'sync');assert.equal(before.players.filter(p=>p.physical?.phase==='ragdoll').length,6);assert.ok(before.players.every(p=>p.characterRevision));
  const old=credentials[0].connectionEpoch;credentials[0]=await send(0,'resume');await assert.rejects(()=>service.command({action:'sync',token:credentials[0].token,generation:credentials[0].generation,connectionEpoch:old},{user:users[0]}),/replaced/);
  const stale={...credentials[0]};before=await send(0,'sync');service.close();service=null;now=10;wall+=1;
  service=await createInputExpeditionService(options);assert.equal(service.stats().physicalActors,6);
  for(let i=0;i<6;i++)credentials[i]=await send(i,'resume');const after=await send(0,'sync');
  assert.deepEqual(after.players.map(p=>p.physical),before.players.map(p=>p.physical),'restart preserves articulation and recovery phase');
  assert.deepEqual(after.players.map(p=>[p.x,p.y,p.z]),before.players.map(p=>[p.x,p.y,p.z]),'restart does not stand or teleport bodies');
  await assert.rejects(()=>service.command({action:'inputs',token:stale.token,generation:stale.generation,connectionEpoch:stale.connectionEpoch,frames:[]},{user:users[0]}),/replaced/);
  for(let n=0;n<240;n++){
   if(n%3===0)for(let i=0;i<6;i++){const anchor=credentials[i].selfInput.anchorTick;await send(i,'inputs',{frames:Array.from({length:3},(_,k)=>({seq:n+k,tick:anchor+n+k,heldMask:0,edges:0,yaw:Math.PI,pitch:0,actions:n+k===100?[{action:'bail'}]:[]}))});}
   now+=1/60;wall+=1/60;service.tick();
  }
  const standing=await send(0,'sync');assert.ok(standing.players.every(p=>p.physical===null),'six bodies safely recover');
 }finally{service?.close();fs.rmSync(directory,{recursive:true,force:true});}
});
