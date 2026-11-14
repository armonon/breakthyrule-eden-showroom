import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createExpeditionService,loadExpeditionEngine} from './expedition.mjs';
import {normalizeCharacter} from './character.mjs';

test('durable restart preserves identity, character, inventory and pages with hashed tokens',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eden-rooms-'));
  let service,now=100,wall=1000;const engines=[],factory=loadExpeditionEngine();
  const options={storageDir:directory,clock:()=>now,wallClock:()=>wall,createEngine:options=>{const e=factory(options);engines.push(e);return e;}};
  const user={id:'test-account',name:'Temporary Test',character:normalizeCharacter({version:1,shirtColor:'#123456'})};
  try{
    service=createExpeditionService(options);
    const host=service.command({action:'create'},{user});
    const peer={id:'test-peer',name:'Temporary Peer',character:{version:1}};
    const guest=service.command({action:'join',code:host.code},{user:peer});
    service.command({action:'ready',token:host.token},{user});service.command({action:'ready',token:guest.token},{user:peer});
    service.command({action:'start',token:host.token},{user});
    // Seed a progressed state through the trusted engine API, never a network command.
    const cp=engines[0].exportCheckpoint();cp.room.collected=cp.room.pages.slice(0,2).map(p=>p.id);
    cp.room.players[0].magazine=1;cp.room.players[0].reserve=1;cp.room.players[0].flares=2;
    engines[0].restoreCheckpoint(cp);
    service.close();service=null;
    const disk=fs.readFileSync(path.join(directory,'rooms.json'),'utf8');
    assert.ok(!disk.includes(host.token));assert.ok(!disk.includes(guest.token));
    assert.match(JSON.parse(disk).rooms[0].members[0].tokenHash,/^[a-f0-9]{64}$/);
    assert.equal(fs.statSync(path.join(directory,'rooms.json')).mode&0o777,0o600);
    now=0;wall+=5;service=createExpeditionService(options);
    assert.throws(()=>service.command({action:'resume',token:host.token,generation:'stale'},{user}),{status:409});
    assert.throws(()=>service.subscribe(host.token,user,()=>{},()=>{},()=>true,'stale'),{status:409});
    assert.throws(()=>service.command({action:'resume',token:host.token,generation:host.generation}),{status:401});
    const resumed=service.command({action:'resume',token:host.token,generation:host.generation},{user});
    const p=resumed.players.find(p=>p.id===host.selfId);
    assert.equal(resumed.selfId,host.selfId);assert.equal(resumed.generation,host.generation);
    assert.deepEqual(p.character,user.character);assert.equal(p.magazine,1);assert.equal(p.reserve,1);
    assert.equal(resumed.collected.length,2);assert.equal(resumed.phase,'playing');
    assert.equal(service.command({action:'resume',token:guest.token,generation:guest.generation},{user:peer}).selfId,guest.selfId);
    service.close();service=null;wall+=61;now=0;service=createExpeditionService(options);
    assert.deepEqual(service.stats(),{rooms:0,players:0});
    assert.throws(()=>service.command({action:'resume',token:guest.token,generation:guest.generation},{user:peer}),{status:401});
  }finally{service?.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('exclusive storage ownership and corrupt checkpoints fail closed',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eden-lock-'));let service;
  try{
    service=createExpeditionService({storageDir:directory});
    assert.throws(()=>createExpeditionService({storageDir:directory}),/locked/);
    service.close();service=null;
    fs.writeFileSync(path.join(directory,'rooms.json'),'invalid json');
    assert.throws(()=>createExpeditionService({storageDir:directory}),SyntaxError);
    assert.equal(fs.existsSync(path.join(directory,'writer.lock')),false);
    fs.writeFileSync(path.join(directory,'writer.lock'),JSON.stringify({pid:99999999,host:'old',owner:'stale'}));
    assert.throws(()=>createExpeditionService({storageDir:directory}),/locked/);
  }finally{service?.close();fs.rmSync(directory,{recursive:true,force:true});}
});
