import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as T from 'three';

const root=new URL('../../',import.meta.url);
const sources=['character-motion.js','player-body.js'].map(name=>readFileSync(new URL(name,root),'utf8'));
const level=new T.Vector3(0,1.75,-5),down=new T.Vector3(0,-8,-1),anchor=new T.Vector3(0,1.75,0);
const all={cameraEffects:true,speedFov:true},off={cameraEffects:false,speedFov:false};

async function setup(){
 const camera=new T.PerspectiveCamera(60,1,.05,100),scene=new T.Scene(),group=new T.Group(),neck=new T.Bone();
 camera.position.copy(anchor);group.add(neck);
 // A loaded body without animation isolates camera ownership from gait/IK.
 const model={root:group,byName:{neck01:neck},motion:{tune:{},downAmount:()=>0,airborne(){},touch(){},guard(){},update(){}}};
 const scope={document:{addEventListener(){},removeEventListener(){}},localStorage:{length:0},addEventListener(){},removeEventListener(){},
  fetch:async()=>({json:async()=>({})}),GardenCharacter:{load:async()=>{},create:()=>model,dispose(){group.removeFromParent();}}};
 scope.window=scope;for(const source of sources)vm.runInNewContext(source,scope);
 const body=scope.createPlayerBody({T,scene,camera});
 const update=(options={})=>body.update(1/60,{aim:level,position:anchor,effects:all,...options});
 update();await new Promise(resolve=>setImmediate(resolve));assert.equal(body.getModel(),model);
 return {camera,body,update};
}

test('master camera effects off preserves selected FOV while looking down or sprinting',async()=>{
 const {camera,body,update}=await setup();
 try{
  for(const effects of [off,{cameraEffects:false,speedFov:true}]){
   for(const aim of [level,down]){update({aim,effects,fovKick:8});assert.equal(camera.fov,60);}
  }
 }finally{body.dispose();}
});

test('speed FOV preference suppresses the speed kick while preserving enabled look-down framing',async()=>{
 const {camera,body,update}=await setup();
 try{
  update({effects:{...all,speedFov:false},fovKick:8});assert.equal(camera.fov,60);
  update({aim:down,effects:{...all,speedFov:false},fovKick:8});assert.equal(camera.fov,90);
  update({aim:down,effects:all,fovKick:8});assert.equal(camera.fov,98);
  update({aim:down,effects:null,fovKick:8});assert.equal(camera.fov,98,'legacy callers retain existing presentation');
 }finally{body.dispose();}
});

test('comfort toggles restore the original FOV without cumulative drift and respect a new host baseline',async()=>{
 const {camera,body,update}=await setup();
 try{
  for(let i=0;i<60;i++){
   update({aim:down,fovKick:8});assert.equal(camera.fov,98);
   update({aim:down,effects:off,fovKick:8});assert.equal(camera.fov,60);
   update({effects:all});assert.equal(camera.fov,60);
  }
  camera.fov=72;
  update({aim:down,effects:off,fovKick:8});assert.equal(camera.fov,72);
  update({aim:down,fovKick:8});assert.equal(camera.fov,110);
  update({aim:down,effects:off});assert.equal(camera.fov,72);
 }finally{body.dispose();}
});

test('standalone expedition FOV remains owned by the host when manageFov is false',async()=>{
 const {camera,body,update}=await setup();
 try{
  camera.fov=77;
  for(const effects of [all,off,null])for(const aim of [level,down]){
   update({aim,effects,fovKick:8,manageFov:false});assert.equal(camera.fov,77);
  }
 }finally{body.dispose();}
});
