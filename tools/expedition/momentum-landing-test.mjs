import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as T from 'three';
const source=readFileSync(new URL('../../battle-arena.js',import.meta.url),'utf8');
function fixture({charge=1,speed=8,clear=true,alive=true}={}){
 const player={alive:true},hits=[],b={alive,name:'Test opponent',root:{position:new T.Vector3()},reaction:.2,fireT:0,model:{motion:{downAmount:()=>0,knockdown:(dir,strength)=>hits.push({dir:dir.toArray(),strength})}}};
 const movement={airborne:false,momentum:charge,velocity:new T.Vector3(speed,0,0)};
 const s={T,player,bots:[b],phase:'live',clock:10,o:{movement:()=>movement},los:()=>clear,damage:(target,amount)=>hits.push({amount}),disarm:()=>null,announce(){},chime(){}};
 vm.createContext(s);vm.runInContext(source.slice(source.indexOf('  function landingCrossing('),source.indexOf('  /* ---------------------------------------------------------------- lifecycle */')),s);
 const step=(x,y,z=0,air=true,dt=1/60)=>{movement.airborne=air;s.updateMomentumLanding(new T.Vector3(x,y,z),dt);};
 return {s,player,b,hits,movement,step,jump(z=0){step(-2,0,z,false);step(-1.6,.4,z);step(-.3,2,z);step(.1,1.3,z);}};
}
test('charged descending jump knocks down one opponent once, with damage and forward impulse',()=>{
 const f=fixture();f.jump();assert.equal(f.player.stomps,1);assert.equal(f.hits[0].amount,24);assert.deepEqual(f.hits[1].dir,[1,0,0]);assert.equal(f.hits[1].strength,2.4);
 f.step(.1,1.6);f.step(.1,1.3);assert.equal(f.player.stomps,1);
 f.step(0,0,0,false);f.jump();assert.equal(f.player.stomps,1,'victim cooldown prevents repeated takedowns');
});
test('uncharged, slow, missed, obstructed and dead targets do not trigger a takedown',()=>{
 for(const opts of [{charge:.7},{speed:4},{clear:false},{alive:false}]){const f=fixture(opts);f.jump();assert.equal(f.hits.length,0);}
 const miss=fixture();miss.jump(1.2);assert.equal(miss.hits.length,0);
 const ascending=fixture();ascending.step(0,0,0,false);ascending.step(0,1.3);ascending.step(0,2);assert.equal(ascending.hits.length,0);
 const walk=fixture();walk.step(-1,0,0,false);walk.step(0,0,0,false);assert.equal(walk.hits.length,0);
});
test('swept feet hit the shoulder plane, but a teleport or stalled frame cannot hit',()=>{
 const f=fixture(),from=new T.Vector3(-.5,2,0),to=new T.Vector3(.5,1,0);
 assert.ok(f.s.landingCrossing(from,to,new T.Vector3()));
 f.step(0,0,0,false);f.step(0,2);f.step(0,1,0,true,.3);assert.equal(f.hits.length,0);
 const teleport=fixture();teleport.step(0,0,0,false);teleport.step(0,5);teleport.step(0,1);assert.equal(teleport.hits.length,0);
});
