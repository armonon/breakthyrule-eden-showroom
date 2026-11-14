import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const base=new URL('../../',import.meta.url),context=vm.createContext({structuredClone,performance});context.window=context;
for(const file of ['assets/night-pathfinding.js','expedition-world.js','solo-expedition.js'])vm.runInContext(readFileSync(new URL(file,base),'utf8'),context);
const layout={bounds:[-40,40,-110,40],spawn:[0,0],exit:[0,-110],landmarks:[{id:'temple',x:0,z:-30,w:12,d:12,h:7}],pages:Array.from({length:8},(_,id)=>({id,title:'Page '+id,site:'temple',sockets:[[id,0],[id,2],[id,4],[id,6]]}))};
const make=options=>context.createSoloExpedition({layout,roofs:{},clock:()=>10,...options});
test('same uint32 seed deterministically replays sockets, retries and recorded schema',()=>{
  for(const seed of [0,123456,0xffffffff]){
    const a=make({seed}),b=make({seed}),first=a.command({action:'solo'}),second=b.command({action:'solo'});
    assert.deepEqual(first.pages,second.pages);assert.equal(first.layoutSeed,seed);assert.equal(first.worldVersion,a.world.version);assert.equal(first.protocolVersion,1);
    a.command({action:'leave'});assert.deepEqual(a.command({action:'solo'}).pages,first.pages);
  }
  assert.notDeepEqual(make({seed:1}).command({action:'solo'}).pages,make({seed:2}).command({action:'solo'}).pages);
});
test('default seed is recorded and replayable; custom random keeps compatibility and records null',()=>{
  const generated=make({}).command({action:'solo'});assert.ok(Number.isInteger(generated.layoutSeed));
  assert.deepEqual(make({seed:generated.layoutSeed}).command({action:'solo'}).pages,generated.pages);
  const custom=make({seed:123,random:()=>0}).command({action:'solo'});assert.equal(custom.layoutSeed,null);assert.ok(custom.pages.every(p=>p.z===0));
  assert.equal(make({seed:7}).command({action:'solo',seed:999}).layoutSeed,7);
  for(const seed of [-1,4294967296,NaN,Infinity,.5,'3',null])assert.throws(()=>make({seed}),/unsigned 32-bit/);
});
test('checkpoint preserves seed/version; legacy schema restores and incompatible versions fail closed',()=>{
  const game=make({seed:42});const initial=game.command({action:'solo'}),cp=game.exportCheckpoint(),restored=make({seed:999});
  const state=restored.restoreCheckpoint(cp);assert.equal(state.layoutSeed,42);assert.deepEqual(state.pages,initial.pages);assert.equal(state.worldVersion,game.world.version);
  const bad=structuredClone(cp);bad.room.worldVersion=999;assert.throws(()=>restored.restoreCheckpoint(bad),/Incompatible/);assert.equal(restored.snapshot().layoutSeed,42);
  const legacy=structuredClone(cp);delete legacy.room.layoutSeed;delete legacy.room.worldVersion;delete legacy.room.protocolVersion;
  assert.equal(restored.restoreCheckpoint(legacy).layoutSeed,null);assert.deepEqual(restored.snapshot().pages,initial.pages);
});
