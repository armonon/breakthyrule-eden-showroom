import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../game-bindings.js',import.meta.url),'utf8');
function setup(saved={},fail=false){const store=new Map(Object.entries(saved)),listeners=new Map(),globalListeners=new Map(),events=[];let modal=false;
 const canvas={tagName:'CANVAS',closest:s=>s==='#scene canvas'?canvas:null,dispatchEvent:e=>{events.push(e);}};
 class KeyboardEvent{constructor(type,options){Object.assign(this,{type},options);}}
 const document={pointerLockElement:canvas,querySelector:()=>modal,addEventListener:(type,fn)=>listeners.set(type,fn)};
 const context={document,KeyboardEvent,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');store.set(k,v);}},addEventListener:(type,fn)=>globalListeners.set(type,fn)};context.window=context;vm.runInNewContext(source,context);
 const event=(code,type='keydown',extra={})=>({type,code,key:code.startsWith('Key')?code.slice(3).toLowerCase():code==='Space'?' ':code,...extra});
 return {api:context.edenControls,event,events,store,document,canvas,context,modal:value=>{modal=value;},pointer(type,button,extra={}){listeners.get(type)?.({type,button,pointerType:'mouse',target:canvas,preventDefault(){},...extra});},blur:()=>globalListeners.get('blur')()};}
test('all supported game contexts have complete conflict-free defaults and defensive copies',()=>{const s=setup();for(const context of ['expedition','walk','combat','battle','arena','fists']){s.api.setContext(()=>context);const used=new Set();for(const action of s.api.actions.filter(a=>a.contexts.includes(context))){for(const binding of s.api.get()[action.id]){assert.ok(!used.has(binding),context+' duplicate '+binding);used.add(binding);assert.equal(s.api.action(s.event(binding)),action.id);}}}const copy=s.api.get();copy.forward[0]='KeyZ';assert.equal(s.api.get().forward[0],'KeyW');});
test('custom movement, jump and bail persist and old physical bindings stop acting',()=>{const s=setup();assert.equal(s.api.set('forward',0,'KeyI').ok,true);assert.equal(s.api.set('jump',0,'Mouse3').ok,true);assert.equal(s.api.set('bail',0,'KeyN').ok,true);assert.equal(s.api.key(s.event('KeyI')),'w');assert.equal(s.api.key(s.event('KeyW')),'');assert.equal(s.api.key(s.event('Mouse3')),' ');assert.equal(s.api.action(s.event('KeyN')),'bail');const next=setup(Object.fromEntries(s.store));assert.deepEqual(JSON.parse(JSON.stringify(next.api.get())),JSON.parse(JSON.stringify(s.api.get())));});
test('conflicting binding is rejected without overwriting; context-separated inputs can coexist',()=>{const s=setup();const before=JSON.stringify(s.api.get());assert.match(s.api.set('back',0,'KeyW').message,/Move forward/);assert.equal(JSON.stringify(s.api.get()),before);assert.equal(s.api.set('bail',0,'KeyH').ok,true,'heal H is in another context');s.api.setContext(()=> 'battle');assert.equal(s.api.action(s.event('KeyH')),'heal');s.api.setContext(()=> 'expedition');assert.equal(s.api.action(s.event('KeyH')),'bail');});
test('reserved browser keys, invalid storage and duplicate slots are safe',()=>{const s=setup();for(const key of ['Escape','MetaLeft','F5','Tab','bogus'])assert.equal(s.api.set('forward',0,key).ok,false,key);assert.equal(s.api.set('forward',1,'KeyW').ok,false);const bad=s.api.get();bad.back=['KeyW'];assert.equal(setup({'eden-game-bindings-v1':JSON.stringify(bad)}).api.get().back[0],'KeyS');for(const bad of ['{','null','[]'])assert.equal(setup({'eden-game-bindings-v1':bad}).api.get().forward[0],'KeyW');});
test('multiple physical inputs retain held movement until the last release; events are stable for all consumers',()=>{const s=setup();const first=s.event('KeyW');assert.equal(s.api.key(first),'w');assert.equal(s.api.key(first),'w');assert.equal(s.api.key(s.event('ArrowUp')),'w');assert.equal(s.api.key(s.event('KeyW','keyup')),'');const release=s.event('ArrowUp','keyup');assert.equal(s.api.key(release),'w');assert.equal(s.api.key(release),'w');});
test('touch remains semantic after desktop remapping and does not inherit browser modifiers',()=>{const s=setup();s.api.set('interact',0,'KeyI');assert.equal(s.api.key(s.event('KeyE')),'');assert.equal(s.api.key(s.event('KeyE','keydown',{edenTouchAction:true})),'e');assert.equal(s.api.action(s.event('KeyE','keydown',{edenTouchAction:true})),'interact');});
test('mouse pointer bridge survives cancelled compatibility events, releases correctly, ignores touch and dialogs',()=>{const s=setup();s.pointer('pointerdown',0,{defaultPrevented:true});assert.equal(s.events.at(-1).edenMappedKey,'g');assert.equal(s.events.at(-1).type,'keydown');s.pointer('pointerup',0);assert.equal(s.events.at(-1).type,'keyup');const count=s.events.length;s.pointer('pointerdown',0,{pointerType:'touch'});s.modal(true);s.pointer('pointerdown',0);s.modal(false);s.document.pointerLockElement=null;s.pointer('pointerdown',0);assert.equal(s.events.length,count,'first unlocked click only acquires mouse look');});
test('mouse and keyboard alternatives share hold state and releases do not get stuck',()=>{const s=setup();s.api.set('forward',1,'Mouse3');assert.equal(s.api.key(s.event('KeyW')),'w');s.pointer('pointerdown',3);assert.equal(s.events.at(-1).edenMappedKey,'w');const count=s.events.length;s.pointer('pointerup',3);assert.equal(s.events.length,count,'W remains held');assert.equal(s.api.key(s.event('KeyW','keyup')),'w');s.pointer('pointerdown',3);s.blur();const after=s.events.length;s.pointer('pointerup',3);assert.equal(s.events.length,after,'blur clears the bridge');});
test('legacy bail migration, reset and denied storage remain usable',()=>{const s=setup({'eden-expedition-preferences-v1':'{"bailKey":"n"}'},true);assert.equal(s.api.get().bail[0],'KeyN');let changes=0;const off=s.api.onChange(()=>changes++);const result=s.api.set('bail',0,'KeyH');assert.equal(result.ok,true);assert.equal(result.saved,false);assert.equal(s.api.get().bail[0],'KeyH');s.api.reset();assert.equal(s.api.get().bail[0],'KeyB');assert.equal(changes,2);off();s.api.reset();assert.equal(changes,2);});

test('standalone Ctrl/Alt bindings allow held crouch movement only under gameplay pointer lock',()=>{const s=setup();assert.equal(s.api.set('crouch',0,'ControlLeft').ok,true);const down=s.event('ControlLeft','keydown',{ctrlKey:true});assert.equal(s.api.blockedModifiers(down),false);assert.equal(s.api.key(down),'c');const walk=s.event('KeyW','keydown',{ctrlKey:true});assert.equal(s.api.blockedModifiers(walk),false);s.document.pointerLockElement=null;assert.equal(s.api.blockedModifiers(walk),true,'browser shortcuts outside gameplay remain native');assert.equal(s.api.blockedModifiers(s.event('KeyW','keydown',{metaKey:true})),true);});

test('mouse chord mask changes fire while aiming and release each action independently',()=>{
 const s=setup();s.api.setContext(()=> 'combat');
 s.pointer('pointerdown',2,{buttons:2,pointerId:1});
 s.pointer('pointermove',0,{buttons:3,pointerId:1});
 s.pointer('pointermove',-1,{buttons:3,pointerId:1});
 s.pointer('pointermove',0,{buttons:2,pointerId:1});
 s.pointer('pointerup',2,{buttons:0,pointerId:1});
 assert.deepEqual(s.events.map(e=>[e.type,e.edenMappedKey]),[['keydown','aim'],['keydown','fire'],['keyup','fire'],['keyup','aim']]);
});
test('cancel and lost capture release the whole mouse chord even with button minus one',()=>{
 for(const type of ['pointercancel','lostpointercapture']){
  const s=setup();s.api.setContext(()=> 'combat');s.pointer('pointerdown',0,{buttons:1,pointerId:9});s.pointer('pointermove',2,{buttons:3,pointerId:9});s.pointer(type,-1,{buttons:0,pointerId:9});
  assert.deepEqual(s.events.slice(-2).map(e=>[e.type,e.edenMappedKey]),[['keyup','fire'],['keyup','aim']]);
  const count=s.events.length;s.pointer('pointerup',0,{buttons:0,pointerId:9});assert.equal(s.events.length,count,'late release cannot repeat an action');
 }
});
test('mouse aiming and firing work while a remapped Ctrl crouch is held',()=>{
 const s=setup();s.api.setContext(()=> 'combat');s.api.set('crouch',0,'ControlLeft');s.api.key(s.event('ControlLeft','keydown',{ctrlKey:true}));
 s.pointer('pointerdown',2,{buttons:2,ctrlKey:true});s.pointer('pointermove',0,{buttons:3,ctrlKey:true});
 assert.deepEqual(s.events.map(e=>e.edenMappedKey),['aim','fire']);
});
test('unlocked press and UI-origin drag cannot turn into a held combat action after locking',()=>{
 const s=setup();s.api.setContext(()=> 'combat');s.document.pointerLockElement=null;s.pointer('pointerdown',0,{buttons:1});s.document.pointerLockElement=s.canvas;s.pointer('pointermove',-1,{buttons:1});assert.equal(s.events.length,0);
 s.pointer('pointerup',0,{buttons:0});s.pointer('pointerdown',0,{buttons:1});assert.equal(s.events.at(-1).edenMappedKey,'fire');s.blur();assert.equal(s.events.at(-1).type,'keyup');
 const count=s.events.length;s.pointer('pointerdown',0,{buttons:1,target:{tagName:'BUTTON'}});s.pointer('pointermove',-1,{buttons:1});assert.equal(s.events.length,count,'dragging from a UI control cannot begin firing');
});
