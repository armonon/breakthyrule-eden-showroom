import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as T from 'three';
const source=name=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
function warmer(){
 const timers=[],idles=[],uploads=[],scene=new T.Scene(),document={hidden:false};let allowed=true;
 const scope={console,performance:{now:()=>0},document,setTimeout:fn=>timers.push(fn),requestIdleCallback:fn=>idles.push(fn)};scope.window=scope;
 vm.runInNewContext(source('prewarm.js'),scope);
 const renderer={properties:{get:()=>({})},initTexture:t=>uploads.push(t),compileAsync:()=>{throw Error('hidden compilation must not occur');}};
 const w=scope.createPrewarm({T,renderer,scene,camera:new T.Camera(),canRun:()=>allowed});
 const tick=(spare=10)=>{timers.shift()?.();idles.shift()?.({timeRemaining:()=>spare,didTimeout:spare===0});};
 return {w,scene,document,uploads,timers,idles,tick,allow:v=>allowed=v};
}
test('idle preparation uploads only visible-world textures and coalesces rescans',()=>{
 const f=warmer(),shown=new T.Texture({width:4,height:4}),hidden=new T.Texture({width:4,height:4});
 f.scene.add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({map:shown})));
 const room=new T.Group();room.visible=false;room.add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({map:hidden})));f.scene.add(room);
 f.w.start();for(let i=0;i<50;i++)f.w.rescan();assert.equal(f.w.inspect().queued,1);
 for(let i=0;i<4;i++)f.tick();assert.deepEqual(f.uploads,[shown]);assert.equal(f.w.inspect().compiled,0);
 room.visible=true;f.w.rescan();for(let i=0;i<4;i++)f.tick();assert.deepEqual(f.uploads,[shown,hidden]);
});
test('timed-out idle callbacks, player input and hidden tabs never force background work',()=>{
 const f=warmer();let ran=0;f.w.start();f.w.add(()=>ran++);f.tick();f.tick(0);assert.equal(ran,0);
 f.allow(false);f.tick();assert.equal(ran,0);f.allow(true);f.document.hidden=true;f.tick();assert.equal(ran,0);
 f.document.hidden=false;for(let i=0;i<5;i++)f.tick();assert.equal(ran,1);f.w.stop();f.w.add(()=>ran++);f.tick();assert.equal(ran,1);
});
test('async warm-up tasks finish before later work starts',async()=>{
 const f=warmer();let release,second=false;f.w.start();f.w.add(()=>{second=true;});f.w.add(()=>new Promise(r=>release=r));
 for(let i=0;i<5;i++)f.tick();assert.equal(second,false);release();await new Promise(r=>setImmediate(r));
 for(let i=0;i<5;i++)f.tick();assert.equal(second,true);
});
test('rack preparation preserves geometry and upload orientation while bounding texture size',async()=>{
 const uploaded=[],scope={setTimeout,document:{createElement:()=>({getContext:()=>({drawImage(){}})})}};scope.window=scope;vm.runInNewContext(source('world-model-prep.js'),scope);
 const geometry=new T.BoxGeometry(),image={width:4096,height:2048},texture=new T.Texture(image),mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({map:texture}));let compiled=false;
 await scope.prepareWorldModel(T,mesh,{renderer:{initTexture:t=>uploaded.push(t),compileAsync:async()=>{compiled=true;}},camera:new T.Camera(),scene:new T.Scene()});
 assert.equal(mesh.geometry,geometry);assert.deepEqual([texture.image.width,texture.image.height],[1024,512]);assert.equal(texture.flipY,true);assert.deepEqual(uploaded,[texture]);assert.ok(compiled);
});
test('failed texture resize retains the usable original map',async()=>{
 const scope={setTimeout,document:{createElement:()=>({getContext:()=>null})}};scope.window=scope;vm.runInNewContext(source('world-model-prep.js'),scope);
 const image={width:2048,height:2048},texture=new T.Texture(image),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({map:texture}));
 await scope.prepareWorldModel(T,mesh,{renderer:{initTexture(){}},camera:new T.Camera(),scene:new T.Scene()});assert.equal(texture.image,image);
});
function portal(){
 let now=1000,fail=false;const scope={performance:{now:()=>now},matchMedia:()=>({matches:false})};scope.window=scope;vm.runInNewContext(source('pocket-worlds.js'),scope);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.1,100),draws=[];let target=null;
 const renderer={shadowMap:{needsUpdate:true},getDrawingBufferSize:v=>v.set(800,800),getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},render(){draws.push({target,visible:scene.children.filter(c=>c.visible).map(c=>c.name)});if(fail)throw Error('lost context');}};
 const world=scope.createPocketWorlds(T,scene,renderer,camera),p=world.place({name:'Room',position:new T.Vector3(),offset:new T.Vector3(1000,0,0),width:3,height:4,beyond:1,behind:1});
 camera.position.set(-12,2,0);camera.lookAt(0,2,0);camera.updateMatrixWorld();
 return {world,p,camera,renderer,draws,target:()=>target,time:t=>now=t,fail:()=>{fail=true;}};
}
test('portal passes reveal only their destination, then restore hidden interiors and targets',()=>{
 const f=portal();f.world.render();assert.equal(f.p.far.visible,false);assert.ok(f.draws[0].visible.includes('Room (inside)'));assert.equal(f.target(),null);assert.equal(f.renderer.shadowMap.needsUpdate,true);
 assert.equal(f.draws[0].target.width,400);f.world.render();assert.equal(f.draws.length,1,'stationary view reuses the last portal frame');
 f.time(1040);f.world.render();assert.equal(f.draws.length,2);f.camera.position.set(1002,2,0);f.camera.lookAt(1000,2,0);f.world.render();assert.equal(f.p.far.visible,true);assert.ok(!f.draws.at(-1).visible.includes('Room (inside)'));
});
test('a failed portal render still restores render target, visibility and shadow state',()=>{
 const f=portal();f.fail();assert.throws(()=>f.world.render(),/lost context/);assert.equal(f.p.far.visible,false);assert.equal(f.target(),null);assert.equal(f.renderer.shadowMap.needsUpdate,true);
});
