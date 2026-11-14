// Controller contract tests use lightweight DOM/Three doubles; live rendering is tested separately.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const base=new URL('../../',import.meta.url);
class Vector {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}copy(v){Object.assign(this,{x:v.x,y:v.y,z:v.z});return this;}addScaledVector(v,n){this.x+=v.x*n;this.y+=v.y*n;this.z+=v.z*n;return this;}}
class Light {constructor(){this.position=new Vector();this.intensity=0;}}
function setup({correct=null}={}){
 const elements=new Map(),listeners=new Map(),intervals=new Map();let timer=0,now=100000;
 const element=id=>{if(!elements.has(id))elements.set(id,{id,hidden:false,disabled:false,open:false,value:'',textContent:'',scrollHeight:0,scrollTop:0,clientHeight:0,attributes:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){},append(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},click(){if(!this.disabled)return this.onclick?.();}});return elements.get(id);};
 const document={getElementById:element,createElement:()=>element('generated-'+elements.size),querySelector:()=>[...elements.values()].find(e=>e.open)||null,addEventListener:(name,fn)=>listeners.set(name,fn),body:{classList:{add(){},remove(){}},style:{setProperty(){}}}};
 element('night-chat').hidden=true;
 const camera={position:new Vector(),getWorldDirection:v=>v.copy({x:0,y:0,z:-1})};
 const scene={lights:[],add(...lights){this.lights.push(...lights);}};
 const context=vm.createContext({document,structuredClone,performance:{now:()=>now},matchMedia:()=>({matches:false}),location:{search:''},URLSearchParams,AbortSignal,AbortController,console,
  setInterval:(fn,ms)=>{intervals.set(++timer,{fn,ms});return timer;},clearInterval:id=>intervals.delete(id),addEventListener(){},showroomDeployment:{mode:'preview'}});
 context.window=context;
 for(const path of ['assets/night-pathfinding.js','expedition-world.js','solo-expedition.js','expedition.js'])vm.runInContext(readFileSync(new URL(path,base),'utf8'),context);
 const controller=context.createExpedition({T:{SpotLight:Light,PointLight:Light,Object3D:Light,Vector3:Vector,MathUtils:{clamp:(x,a,b)=>Math.min(b,Math.max(a,x))}},scene,camera,
  garden:{district:{setState(){}},pyramid:{setPages(){}}},getPose:()=>({x:camera.position.x,z:camera.position.z,yaw:Math.PI}),
  correct,place:(x,z)=>camera.position.copy({x,y:1.75,z}),stopMoving(){},requestDraw(){},returnHome(){},
  layout:{bounds:[-20,40,-110,-20],spawn:[11.7,-81],exit:[11.7,-110],landmarks:[{id:'temple',name:'Moon Temple',x:11.7,z:-94,w:16,d:20}],pages:[{id:0,title:'Test',site:'temple',sockets:[[11.7,-81]]}]}});
 return {controller,element,scene,camera,intervals,advance(seconds){for(let i=0;i<seconds*60;i++){now+=1000/60;for(const timer of intervals.values())timer.fn();}},key:(key,options={})=>listeners.get('keydown')({key,repeat:false,target:{tagName:'BODY'},preventDefault(){},...options}),update:()=>controller.update(100,1/60)};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('original controller uses deliberate E/mobile bell interaction and G/mobile flare with input guards',async()=>{
 const f=setup();await f.element('night-solo').click();f.update();
 assert.equal(f.controller.inspect().mode,'browser-solo');assert.equal(f.controller.inspect().state.huntStarted,false);
 assert.equal(f.element('night-action').hidden,false);assert.match(f.element('night-action-label').textContent,/Ring temple bell/);
 assert.equal(f.element('night-flare').disabled,true);
 f.key('e',{repeat:true});await flush();assert.equal(f.controller.inspect().state.huntStarted,false);
 f.key('g');await flush();assert.equal(f.controller.inspect().state.players[0].flares,3);
 await f.element('night-action').click();f.advance(3.2);f.update();assert.equal(f.controller.inspect().state.huntStarted,true);
 assert.equal(f.element('night-flare').disabled,false);
 f.element('night-journal').showModal();f.key('g');await flush();assert.equal(f.controller.inspect().state.players[0].flares,3);f.element('night-journal').close();
 f.key('g',{target:{tagName:'INPUT'}});f.key('g',{repeat:true});await flush();assert.equal(f.controller.inspect().state.players[0].flares,3);
 f.key('f');assert.equal(f.element('night-flash').attributes['aria-pressed'],'false');
 f.key('g');await flush();f.update();assert.equal(f.controller.inspect().state.players[0].flares,2);assert.equal(f.element('night-flare').disabled,true);assert.ok(f.scene.lights.at(-1).intensity>0);
 f.controller.leave();assert.equal(f.controller.active(),false);assert.equal(f.scene.lights.at(-1).intensity,0);assert.equal(f.intervals.size,0);
 await f.element('night-solo').click();f.update();assert.equal(f.controller.inspect().state.players[0].flares,3);assert.equal(f.controller.inspect().state.huntStarted,false);
 f.key('e');await flush();f.advance(3.2);f.update();assert.equal(f.controller.inspect().state.huntStarted,true);
 await f.element('night-flare').click();assert.equal(f.controller.inspect().state.players[0].flares,2);
});

test('authority corrections use physical correction hook instead of forcing a placement',async()=>{
 const corrections=[];const f=setup({correct:p=>corrections.push(p)});await f.element('night-solo').click();f.camera.position.x=999;f.advance(.2);await flush();assert.ok(corrections.length>0);assert.equal(f.camera.position.x,999,'host owns the correction; controller must not cancel physical state via place');assert.ok(corrections.every(p=>p.x<100));f.controller.leave();
});
