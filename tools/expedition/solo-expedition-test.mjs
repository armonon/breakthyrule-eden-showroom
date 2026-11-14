// Run: node --test tools/expedition/solo-expedition-test.mjs
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const base=new URL('../../',import.meta.url);
const context=vm.createContext({structuredClone,performance});
vm.runInContext(readFileSync(new URL('assets/night-pathfinding.js',base),'utf8'),context);
vm.runInContext(readFileSync(new URL('expedition-world.js',base),'utf8'),context);
vm.runInContext(readFileSync(new URL('solo-expedition.js',base),'utf8'),context);
const actualLayout=JSON.parse(readFileSync(new URL('night-layout.json',base),'utf8'));
function fixture(layout=actualLayout){
 let now=100,seq=0;
 const game=context.createSoloExpedition({layout,clock:()=>now,random:()=>0});
 game.command({action:'solo'});
 return {game,advance(seconds){for(let left=seconds;left>1e-8;){const step=Math.min(.1,left);now+=step;left-=step;game.tick();}return game.snapshot();},
  pose(x,z,yaw=Math.PI){now+=.1;return game.command({action:'pose',seq:++seq,pose:{x,z,yaw}});},
  walkTo(x,z){const path=game.pathBetween([game.snapshot().players[0].x,game.snapshot().players[0].z],[x,z]);for(const point of [...path,[x,z]]){let p=game.snapshot().players[0];let distance=Math.hypot(point[0]-p.x,point[1]-p.z);while(distance>.01){const step=Math.min(.5,distance);this.pose(p.x+(point[0]-p.x)/distance*step,p.z+(point[1]-p.z)/distance*step);const next=game.snapshot().players[0];assert.ok(Math.hypot(next.x-p.x,next.z-p.z)>.001,'route remains traversable');p=next;distance=Math.hypot(point[0]-p.x,point[1]-p.z);}}}
 };
}
function closeLayout({blocked=false,far=false}={}){
 return {bounds:[-20,40,-110,-20],spawn:[11.7,far?-60:-81],exit:[11.7,-110],
  landmarks:[{id:'temple',x:11.7,z:far?-72.5:blocked?-86.5:-94,w:16,d:far?20:blocked?10:20}],
  pages:[{id:0,title:'Test page',site:'temple',sockets:[[11.7,-81]]}]};
}
function ring(f){f.game.command({action:'ring-bell'});return f.advance(3.1);}
const flare=f=>f.game.command({action:'flare'});
test('actual world stays safe indefinitely until deliberate nearby bell interaction',()=>{
 const f=fixture(),initial=f.game.snapshot();
 assert.equal(f.advance(120).huntStarted,false);
 assert.deepEqual(f.game.snapshot().watcher,initial.watcher);
 assert.equal(f.game.snapshot().elapsed,0);
 assert.throws(()=>ring(f),/closer/);
 assert.throws(()=>f.game.command({action:'collect',page:0}),/bell/);
 assert.throws(()=>flare(f),/reserved/);
 f.walkTo(-12,-32.5);
 const started=ring(f);assert.equal(started.huntStarted,true);assert.equal(started.elapsed,0);
 assert.throws(()=>ring(f),/already/);
 const before=f.advance(13);assert.equal(before.watcher.state,'waiting');
 const after=f.advance(2);assert.notEqual(after.watcher.state,'waiting');
 assert.ok(Math.hypot(after.watcher.x-initial.watcher.x,after.watcher.z-initial.watcher.z)>0);
});
test('flare repels without damage, consumes one charge and enforces cooldown',()=>{
 const f=fixture(closeLayout());ring(f);
 const initial=f.game.snapshot();const fired=flare(f);
 assert.equal(fired.players[0].flares,2);assert.equal(fired.watcher.state,'repelled');
 assert.equal('health' in fired.watcher,false);
 assert.throws(()=>flare(f),/cooling/);assert.equal(f.game.snapshot().players[0].flares,2);
 const after=f.advance(.5);assert.ok(Math.hypot(after.watcher.x-after.players[0].x,after.watcher.z-after.players[0].z)>Math.hypot(initial.watcher.x-initial.players[0].x,initial.watcher.z-initial.players[0].z));
 assert.equal(after.players[0].status,'alive');
 f.advance(6.1);flare(f);f.game.command({action:'reload'});f.advance(1.6);flare(f);
 assert.equal(f.game.snapshot().players[0].flares,0);assert.throws(()=>flare(f),/No flares/);
 f.advance(5);assert.notEqual(f.game.snapshot().watcher.state,'repelled');
});
test('flare misses when facing away and does not disable the watcher permanently',()=>{
 const f=fixture(closeLayout());ring(f);f.pose(11.7,-81,0);
 assert.notEqual(flare(f).watcher.state,'repelled');assert.equal(f.game.snapshot().players[0].flares,2);
 assert.notEqual(f.advance(15).watcher.state,'repelled');
});
test('flare cannot affect the watcher through a temple wall',()=>{
 const layout=closeLayout({blocked:true});layout.spawn=[8.7,-79.5];layout.landmarks[0].x=8.7;
 const f=fixture(layout);f.pose(8.7,-79.5,Math.atan2(3,-2.5));ring(f);
 assert.notEqual(flare(f).watcher.state,'repelled');
 assert.equal(f.game.snapshot().players[0].flares,2);
});
test('flare range is limited even with a clear sightline',()=>{
 const layout=closeLayout({far:true});layout.landmarks[0].x=11.7;
 const f=fixture(layout);ring(f);assert.notEqual(flare(f).watcher.state,'repelled');
});
test('leaving and retrying clears hunt, flare and cooldown state',()=>{
 const f=fixture(closeLayout());ring(f);flare(f);f.game.command({action:'leave'});
 assert.equal(f.game.snapshot(),null);assert.equal(f.game.tick(),null);
 const fresh=f.game.command({action:'solo'});assert.equal(fresh.huntStarted,false);assert.equal(fresh.players[0].flares,3);assert.equal(fresh.players[0].flareFiredAt,null);assert.equal(fresh.players[0].flareReadyAt,0);
});
test('snapshots cannot mutate the authoritative session',()=>{
 const f=fixture(),snapshot=f.game.snapshot();snapshot.huntStarted=true;snapshot.players[0].flares=100;
 assert.equal(f.game.snapshot().huntStarted,false);assert.equal(f.game.snapshot().players[0].flares,3);
});
