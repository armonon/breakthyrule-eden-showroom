import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const repo=new URL('../../',import.meta.url);
class Target {
  listeners=new Map();
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  fire(type,extra={}){const e={type,button:0,pointerId:1,pointerType:'touch',isPrimary:true,buttons:1,clientX:50,clientY:50,preventDefault(){},target:this,...extra};for(const fn of this.listeners.get(type)||[])fn(e);this['on'+type]?.(e);return e;}
}
class Element extends Target {
  constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.style={};this.hidden=false;this.open=false;this.attributes={};this.nodes=new Map();this.captured=new Set();const classes=new Set();this.classList={add:(...c)=>c.forEach(v=>classes.add(v)),remove:(...c)=>c.forEach(v=>classes.delete(v)),contains:v=>classes.has(v),toggle:(c,on)=>{on=on??!classes.has(c);on?classes.add(c):classes.delete(c);return on;}};}
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  querySelector(s){if(!this.nodes.has(s)){const n=new Element();n.selector=s;this.nodes.set(s,n);}return this.nodes.get(s);}
  querySelectorAll(){return [];}
  getBoundingClientRect(){return {x:0,y:0,left:0,top:0,width:100,height:100,right:100,bottom:100};}
  setPointerCapture(i){this.captured.add(i);}
  hasPointerCapture(i){return this.captured.has(i);}
  releasePointerCapture(i){this.captured.delete(i);}
  remove(){}
  showModal(){this.open=true;}
  close(){this.open=false;this.fire('close');}
}
function setup(name,{directJump=true,jumpHandler=null}={}){
  const win=new Target(),document=new Target(),body=new Element('body'),media=new Target(),timers=new Map(),changes=[],keyboard=[],jumps=[];
  media.matches=true;document.body=body;document.hidden=false;document.createElement=t=>new Element(t);document.querySelector=()=>null;document.querySelectorAll=()=>[];document.getElementById=()=>null;document.dispatchEvent=e=>keyboard.push(e);
  let timer=0,blocked=false,expedition=false;
  const scope=vm.createContext(Object.assign(win,{document,matchMedia:()=>media,AbortController,console,performance:{now:()=>10000},MutationObserver:class{observe(){}disconnect(){}},KeyboardEvent:class{constructor(type,o){this.type=type;Object.assign(this,o);}},setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id),setTimeout:()=>++timer,clearTimeout(){}}));scope.window=scope;
  vm.runInContext(fs.readFileSync(new URL(name,repo),'utf8'),scope,{filename:name});
  const move=(key,on)=>changes.push({key:key.toLowerCase(),on});
  const common={host:body,look(){},move,...(directJump?{jump:on=>{jumps.push(on);jumpHandler?.(on);}}:{}),crouch(){},third(){},visible:()=>true,armed:()=>false,combat:()=>null,expedition:()=>expedition};
  const api=name==='eden-mobile.js'?scope.createEdenMobile({...common,ready:()=>true,active:()=>true,blocked:()=>blocked,view(){},isThird:()=>false,tap:()=>true,stop(){}}):scope.createTouchControls(common);
  const ui=body.children.find(e=>e.id===(name==='eden-mobile.js'?'eden-mobile-hud':'touch-controls')),stick=ui.querySelector(name==='eden-mobile.js'?'.em-stick':'.tc-stick');
  const sync=()=>{for(const fn of timers.values())fn();};
  return {api,ui,stick,win,document,changes,keyboard,jumps,sync,setBlocked:v=>blocked=v,setExpedition:v=>expedition=v,keys:()=>[...api.inspect().keys].map(k=>k.toLowerCase())};
}
for(const file of ['eden-mobile.js','touch-controls.js']){
 test(file+': outside-circle sprint, pointer ownership and interruption release',()=>{
  const f=setup(file),s=f.stick;
  assert.ok(!/class="em-run"/.test(f.ui.innerHTML),'no separate sprint toggle');
  s.fire('pointerdown');s.fire('pointermove',{clientY:20});assert.ok(f.keys().includes('w'));assert.ok(!f.keys().includes('shift'),'inside circle walks');
  s.fire('pointermove',{clientY:-10});assert.ok(f.keys().includes('shift'),'outside circle sprints');
  s.fire('pointerdown',{pointerId:2,clientX:90});s.fire('pointermove',{pointerId:2,clientY:80});assert.ok(f.keys().includes('shift'),'second pointer cannot steal stick');
  s.fire('pointermove',{clientY:25});assert.ok(f.keys().includes('w'));assert.ok(!f.keys().includes('shift'),'returning inside walks again');
  s.fire('pointermove',{clientY:-10});s.fire('pointercancel');assert.deepEqual(f.keys(),[],'cancel releases sprint and walking');
  s.fire('pointerdown');s.fire('pointermove',{clientX:110});assert.ok(f.keys().includes('d'));assert.ok(f.keys().includes('shift'),'outside-circle sideways input carries sprint');
  f.win.fire('blur');assert.deepEqual(f.keys(),[],'focus loss clears movement');
  s.fire('pointerdown');s.fire('pointermove',{clientY:-10});f.document.hidden=true;f.document.fire('visibilitychange');assert.deepEqual(f.keys(),[],'hidden document clears held input');f.document.hidden=false;f.document.fire('visibilitychange');
  s.fire('pointerdown');s.fire('pointermove',{clientY:-10});
  if(file==='eden-mobile.js'){f.setBlocked(true);f.sync();assert.deepEqual(f.keys(),[],'menu/modal interruption releases movement');}
  else{f.setExpedition(true);f.sync();assert.deepEqual(f.keys(),[],'switching gameplay mode releases movement');const use=f.ui.querySelector('.tc-use');use.fire('pointerdown');use.fire('pointerup');assert.ok(f.keyboard.some(e=>e.type==='keydown'&&e.key==='e'),'solo interaction uses E');f.setExpedition(false);f.sync();use.fire('pointerdown');use.fire('pointerup');assert.ok(f.keyboard.some(e=>e.type==='keydown'&&e.key==='f'),'story/open-match interaction uses F');}
  f.api.dispose();
 });
 test(file+': jump remains held until the owning finger releases or input is interrupted',()=>{
  const f=setup(file),jump=f.ui.querySelector(file==='eden-mobile.js'?'.em-jump':'.tc-jump');
  jump.fire('pointerdown');assert.deepEqual(f.jumps,[true]);
  jump.fire('pointerdown',{pointerId:2});jump.fire('pointerup',{pointerId:2});assert.deepEqual(f.jumps,[true],'another finger cannot release the held jump');
  jump.fire('pointerup');assert.deepEqual(f.jumps,[true,false]);
  for(const interrupt of [()=>jump.fire('pointercancel'),()=>jump.fire('lostpointercapture'),()=>f.win.fire('blur'),()=>{f.document.hidden=true;f.document.fire('visibilitychange');}]){
   const count=f.jumps.length;jump.fire('pointerdown');assert.equal(f.jumps.at(-1),true);interrupt();assert.deepEqual(f.jumps.slice(count),[true,false]);f.document.hidden=false;f.document.fire('visibilitychange');
  }
  const count=f.jumps.length;jump.fire('click',{detail:0});assert.deepEqual(f.jumps.slice(count),[true,false],'assistive activation performs a complete tap');
  jump.fire('pointerdown');f.api.dispose();assert.equal(f.jumps.at(-1),false,'disposing controls releases jump');
 });
}
test('touch jump keyboard fallback pairs Space press with release',()=>{
 const f=setup('touch-controls.js',{directJump:false}),jump=f.ui.querySelector('.tc-jump');
 jump.fire('pointerdown');jump.fire('pointercancel');assert.deepEqual(f.keyboard.map(e=>[e.type,e.key,e.code]),[['keydown',' ','Space'],['keyup',' ','Space']]);f.api.dispose();
});
test('actual solo entry touch callback holds Space and releases without a second jump',()=>{
 const entry=fs.readFileSync(new URL('expedition-entry.js',repo),'utf8'),line=entry.split('\n').find(line=>line.trimStart().startsWith('jump(pressed=true){')),keys=new Set();let jumps=0,blocked=false;
 const scope=vm.createContext({ready:true,modalOpen:()=>blocked,bail:null,keys,movement:{jump(){assert.ok(keys.has('space'));jumps++;}},requestDraw(){}});
 assert.ok(line,'entry exposes a held-jump callback');vm.runInContext('globalThis.actions=({'+line.trim()+'});',scope);
 const f=setup('touch-controls.js',{jumpHandler:scope.actions.jump}),jump=f.ui.querySelector('.tc-jump');
 jump.fire('pointerdown');assert.equal(jumps,1);assert.ok(keys.has('space'));blocked=true;jump.fire('pointerup');assert.equal(jumps,1);assert.equal(keys.has('space'),false,'release works even if a modal opened');
 blocked=false;jump.fire('pointerdown');assert.equal(jumps,2);f.win.fire('blur');assert.equal(jumps,2);assert.equal(keys.has('space'),false);f.api.dispose();
});
test('mobile controls retain translucent glass styles',()=>{
 const css=fs.readFileSync(new URL('eden-mobile.css',repo),'utf8')+fs.readFileSync(new URL('touch-controls.css',repo),'utf8');
 assert.ok(css.includes('backdrop-filter'),'restored controls use translucent glass');
});
