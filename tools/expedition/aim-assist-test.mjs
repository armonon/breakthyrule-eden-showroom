import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as T from 'three';
const source=readFileSync(new URL('../../combat.js',import.meta.url),'utf8');
function fixture(level='high'){
 const camera=new T.PerspectiveCamera();camera.position.set(0,1.7,0);camera.updateMatrixWorld();
 const targets=[],scope={T,camera,armed:true,current:{id:'pistol',range:60},zoomable:()=>true,
  o:{aimTargets:()=>targets},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t,
  worldHits:()=>null,window:{edenSettings:{get:()=>level,on(){}}},
  // Shots and assist start at the chest lens (combat.js lensPosition/aimForward); here the camera stands in for it.
  lensPosition:v=>v.copy(camera.position),aimForward:v=>camera.getWorldDirection(v),lastTime:0};
 vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('  const ASSIST_BASE='),source.indexOf('  // Each enemy keeps a voice')),scope);
 return {scope,targets,scan(){scope.lastTime+=1;/* past the line-of-sight cache: every scan looks again */scope.assistScan();return vm.runInContext('({target:assist.target,angle:assist.angle,friction:assist.friction,magnet:ASSIST.magnet,cone:ASSIST.cone})',scope);},
  target(x,z=-10){const t={c:{},chest:new T.Vector3(x,1.7,z),head:new T.Vector3(x,1.9,z)};targets.push(t);return t;}};
}
test('high and medium acquire a near miss beyond the former narrow cone; off is truly off',()=>{
 for(const level of ['medium','high']){const f=fixture(level),target=f.target(.75),hit=f.scan();assert.equal(hit.target,target);assert.ok(hit.angle<hit.cone);assert.ok(hit.magnet>=.9);assert.ok(hit.friction<.85);}
 const f=fixture('off');f.target(.1);const hit=f.scan();assert.equal(hit.target,null);assert.equal(hit.friction,1);
});
test('occluded nearest target cannot steal assist from a visible target',()=>{
 const f=fixture(),hidden=f.target(.1),visible=f.target(.6);f.scope.worldHits=(origin,dir)=>dir.x<.03?{distance:3}:null;
 assert.equal(f.scan().target,visible);assert.notEqual(f.scan().target,hidden);
 f.scope.worldHits=()=>({distance:3});assert.equal(f.scan().target,null);
});
test('assist stays on a selected nearby opponent instead of switching on tiny angle changes',()=>{
 const f=fixture(),a=f.target(.4),b=f.target(.6);assert.equal(f.scan().target,a);
 b.chest.x=.36;b.head.x=.36;assert.equal(f.scan().target,a);
 a.chest.x=4;a.head.x=4;assert.equal(f.scan().target,b);
});
test('targets behind or outside pistol range never attract the aim',()=>{
 const f=fixture();f.target(0,10);f.target(0,-61);f.target(4,-10);assert.equal(f.scan().target,null);
});
