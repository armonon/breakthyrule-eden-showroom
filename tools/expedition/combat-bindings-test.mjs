import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');
function fixture(context='combat'){
 const listeners=new Map(),windows=new Map(),nodes=new Map();
 const canvas={tagName:'CANVAS',closest:()=>null},document={hidden:false,pointerLockElement:canvas,querySelector:()=>null,addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);}};
 const s={console,document,localStorage:{getItem:()=>null,setItem(){}},addEventListener(type,fn){windows.set(type,fn);},canvas,renderer:{domElement:canvas},counts:{fire:0,bash:0,detonate:0,reload:0,lock:0,frames:0,punch:0,heal:0,loot:0},q:selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:true,textContent:''});return nodes.get(selector);}};
 s.window=s;s.root=s;vm.createContext(s);vm.runInContext(read('game-bindings.js'),s);s.edenControls.setContext(()=>context);
 const event=(key,code,type='keydown',extra={})=>({key,code,type,target:canvas,repeat:false,preventDefault(){this.defaultPrevented=true;},...extra});
 const dispatch=e=>{for(const fn of listeners.get(e.type)||[])fn(e);};
 return {s,document,nodes,listeners,event,dispatch,windowEvent:type=>windows.get(type)?.(),set:(action,code)=>assert.equal(s.edenControls.set(action,0,code).ok,true)};
}
function combat(){
 const f=fixture(),source=read('combat.js'),start=source.indexOf('  function inputKey(e)'),end=source.indexOf('  /* ------------------------------------------------------------ lifecycle */',start);
 assert.ok(start>=0&&end>start);
 vm.runInContext(`let armed=true,locked=true,touchMode=false,current={id:'pistol'},previous='pump',buttons={left:false,right:false},pendingFire=false,shiftHeld=false,zoomTarget=0;
 const o={canAct:()=>true,setThird:()=>{}}; const setting=()=> 'hold',zoomable=()=>true; function requestFrame(){counts.frames++;} function requestLock(){counts.lock++;} function bash(){counts.bash++;} function detonate(){counts.detonate++;} function reload(){counts.reload++;} function slotIds(){return ['pistol','pump'];} function equip(id){current={id};} function holster(){armed=false;}`,f.s);
 vm.runInContext(source.slice(start,end),f.s);
 f.state=()=>JSON.parse(vm.runInContext('JSON.stringify({armed,locked,buttons,pendingFire,shiftHeld,zoomTarget,current})',f.s));
 return f;
}

test('actual combat input handlers use rebound fire, aim, reload and slots; raw keys stop firing',()=>{
 const f=combat();f.set('fire','KeyZ');f.set('aim','KeyU');f.set('reload','KeyL');f.set('weapon1','KeyI');
 f.s.onKey(f.event('z','KeyZ'));assert.equal(f.state().buttons.left,true);assert.equal(f.state().pendingFire,true);
 f.s.onKeyUp(f.event('z','KeyZ','keyup',{ctrlKey:true}));assert.equal(f.state().buttons.left,false,'release works with changed modifiers');
 f.s.onKey(f.event('u','KeyU'));assert.equal(f.state().buttons.right,true);assert.equal(f.state().zoomTarget,1);
 f.document.querySelector=()=>({});f.s.onKeyUp(f.event('u','KeyU','keyup'));assert.equal(f.state().zoomTarget,0,'opening a dialog cannot trap aim');f.document.querySelector=()=>null;
 f.s.onKey(f.event('r','KeyR'));assert.equal(f.s.counts.reload,0);f.s.onKey(f.event('l','KeyL'));assert.equal(f.s.counts.reload,1);
 f.s.onKey(f.event('i','KeyI'));assert.equal(f.state().armed,false,'remapped current slot holsters');
});
test('combat guards repeats, editing, dialogs and modifiers; mouse bridge does not duplicate effects',()=>{
 const f=combat();f.set('fire','KeyZ');
 for(const extra of [{repeat:true},{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true},{target:{tagName:'INPUT'}},{target:{tagName:'BUTTON'}},{target:{tagName:'DIV',isContentEditable:true}}])f.s.onKey(f.event('z','KeyZ','keydown',extra));
 assert.equal(f.state().buttons.left,false);f.document.querySelector=()=>({});f.s.onKey(f.event('z','KeyZ'));assert.equal(f.state().buttons.left,false);f.document.querySelector=()=>null;
 f.s.onMouseDown(f.event('',null,'mousedown',{button:0}));assert.equal(f.state().buttons.left,false,'raw mouse is owned by the mapping bridge');
 vm.runInContext('locked=false',f.s);f.s.onMouseDown(f.event('',null,'mousedown',{button:0}));assert.equal(f.s.counts.lock,1,'first click still requests pointer lock');
 f.s.onKey(f.event('z','KeyZ'));assert.equal(f.state().buttons.left,false,'keyboard attack requires engaged controls');
 vm.runInContext('locked=true',f.s);f.s.onKey(f.event('z','KeyZ'));f.s.releaseInputs();assert.equal(f.state().buttons.left,false);assert.equal(f.state().pendingFire,false);
});
test('actual arena listeners support rebound attacks, blocking and score release',()=>{
 const f=fixture('arena'),source=read('arena.js'),start=source.indexOf(" canvas.addEventListener('mousedown'"),end=source.indexOf(' function setWeapon(next)',start);
 f.s.canvas.addEventListener=(type,fn)=>{f.listeners.set('canvas:'+type,[fn]);};
 vm.runInContext("let active=true,locked=true,dead=false,weapon='sword',blocking=false;function attack(){counts.fire++;}function setWeapon(v){weapon=v;}function renderScores(){}",f.s);vm.runInContext(source.slice(start,end),f.s);
 f.set('fire','KeyZ');f.set('aim','KeyU');f.set('scores','KeyL');
 f.dispatch(f.event('z','KeyZ'));assert.equal(f.s.counts.fire,1);f.dispatch(f.event('z','KeyZ','keydown',{repeat:true}));assert.equal(f.s.counts.fire,1);
 f.dispatch(f.event('u','KeyU'));assert.equal(vm.runInContext('blocking',f.s),true);f.dispatch(f.event('u','KeyU','keyup'));assert.equal(vm.runInContext('blocking',f.s),false);
 f.dispatch(f.event('l','KeyL'));assert.equal(f.s.q('.arena-scores').hidden,false);f.document.querySelector=()=>({});f.dispatch(f.event('l','KeyL','keyup'));assert.equal(f.s.q('.arena-scores').hidden,true);
 f.document.querySelector=()=>null;f.dispatch(f.event('u','KeyU'));f.windowEvent('blur');assert.equal(vm.runInContext('blocking',f.s),false);
});
test('actual battle listeners remap loot, heal and scores without consuming editing input',()=>{
 const f=fixture('battle'),source=read('battle-arena.js'),start=source.indexOf("   document.addEventListener('keydown'"),end=source.indexOf('\n  }',start);
 f.s.hud={el:{querySelector:f.s.q},update(){}};
 vm.runInContext('let active=true;function interact(){counts.loot++;}function useHeal(){counts.heal++;}',f.s);vm.runInContext(source.slice(start,end),f.s);
 f.set('loot','KeyL');f.set('heal','KeyU');f.set('scores','KeyZ');
 f.dispatch(f.event('f','KeyF'));assert.equal(f.s.counts.loot,0);f.dispatch(f.event('l','KeyL'));assert.equal(f.s.counts.loot,1);
 f.dispatch(f.event('u','KeyU'));assert.equal(f.s.counts.heal,1);f.dispatch(f.event('u','KeyU','keydown',{target:{tagName:'TEXTAREA'}}));assert.equal(f.s.counts.heal,1);
 f.dispatch(f.event('z','KeyZ'));assert.equal(f.s.q('.ar-board').hidden,false);f.dispatch(f.event('z','KeyZ','keyup'));assert.equal(f.s.q('.ar-board').hidden,true);
});
test('body punch uses its walk binding and does not collide with battle loot',()=>{
 const f=fixture('walk'),source=read('player-body.js'),start=source.indexOf('  function onKey(event)'),end=source.indexOf("  document.addEventListener('keydown',onKey)",start);
 vm.runInContext('const model={root:{visible:true}},enabled=()=>true,canPunch=()=>true,api={punch(){counts.punch++;}};',f.s);vm.runInContext(source.slice(start,end),f.s);
 f.set('gardenPunch','KeyU');f.s.onKey(f.event('f','KeyF'));assert.equal(f.s.counts.punch,0);f.s.onKey(f.event('u','KeyU'));assert.equal(f.s.counts.punch,1);
 f.s.edenControls.setContext(()=> 'battle');f.s.onKey(f.event('f','KeyF'));assert.equal(f.s.counts.punch,1);
});
