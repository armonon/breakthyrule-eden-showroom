import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as T from 'three';

const base=new URL('../../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,base),'utf8');
const appSource=read('app.js'),worldSource=read('worlds.js');
function goSource(source){const at=source.indexOf('function go(view,instant=false){'),end=source.indexOf('\nfunction freeView()',at);assert.ok(at>=0&&end>at);return source.slice(at,end);}
class Element{
 constructor(){this.style={};this.hidden=false;const classes=new Set();this.classList={add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:c=>classes.has(c),toggle:(c,on=!classes.has(c))=>(on?classes.add(c):classes.delete(c),on)};/* real class state: worlds.js hides its loading screen once it carries 'out' */this.nodes=new Map();}
 setAttribute(){}append(){}prepend(){}addEventListener(){}remove(){}
 querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
 pause(){}play(){return Promise.resolve();}
}
function scope(appSource){
 const scene=new T.Scene(),museum=new T.Group(),beyond=new T.Group();
 museum.name='Museum (inside)';beyond.name='Beyond Eden / the old civilization';scene.add(museum,beyond);
 const marks=[];
 const s={T,console,performance,Promise,Image:Element,document:{createElement:()=>new Element(),body:new Element()},
  matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener(){},
  innerWidth:1280,innerHeight:720,requestAnimationFrame:fn=>setImmediate(()=>fn(performance.now())),
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,20)),clearTimeout,
  expedition:{active:()=>false},battle:{active:()=>false},combat:{leaveRange(){},holster(){}},
  followResident:null,stage:new Element(),playerBail:{cancel(){}},state:{ready:false,view:'spawn'},keys:new Set(),walkVelocity:new T.Vector3(),
  markView(){marks.push({view:s.state.view,world:s.worlds.world(),visible:museum.visible});}
 };
 s.window=s;vm.createContext(s);vm.runInContext(worldSource,s,{filename:'worlds.js'});
 s.worlds=s.createWorlds({T,scene,renderer:{compileAsync:async()=>{},compile(){},render(){},getRenderTarget:()=>null,setRenderTarget(){},getContext:()=>({finish(){}}),shadowMap:{needsUpdate:false}},camera:new T.PerspectiveCamera(),requestDraw(){}});
 vm.runInContext('let edenNavigation=0;\n'+goSource(appSource),s,{filename:'app-go.js'});
 return {s,museum,beyond,marks};
}


test('museum navigation restores Eden before changing the camera destination',async()=>{
 const {s,museum,beyond,marks}=scope(appSource);
 await s.worlds.enter('beyond',{min:0});
 await s.go('wall');
 assert.equal(s.worlds.world(),'eden');assert.equal(museum.visible,true);assert.equal(beyond.visible,false);
 assert.deepEqual(marks,[{view:'wall',world:'eden',visible:true}]);
});
test('museum navigation waits for a busy world transition to finish',async()=>{
 const {s,museum,marks}=scope(appSource);
 const transition=s.worlds.enter('beyond',{min:0}),navigation=s.go('wall');
 await Promise.all([transition,navigation]);
 assert.equal(s.worlds.world(),'eden');assert.equal(museum.visible,true);
 assert.deepEqual(marks,[{view:'wall',world:'eden',visible:true}]);
});
test('a newer garden destination supersedes stale queued museum navigation',async()=>{
 const {s,museum,marks}=scope(appSource);
 const transition=s.worlds.enter('beyond',{min:0}),first=s.go('wall'),last=s.go('library');
 await Promise.all([transition,first,last]);
 assert.equal(s.worlds.world(),'eden');assert.equal(museum.visible,true);
 assert.deepEqual(marks,[{view:'library',world:'eden',visible:true}]);
});
