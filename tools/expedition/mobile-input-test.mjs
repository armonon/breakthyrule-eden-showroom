import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileFixture} from './mobile-dom-fixture.mjs';

function shared(){const f=mobileFixture('touch-controls.js'),events=[],looks=[],moves=[],crouches=[];let active=true,expedition=true,armed=false,available={fire:true,reload:true},resets=0;const combat={armed:()=>armed,touchFire:on=>events.push(['fire',on]),setTouch(){}};
 for(const type of ['keydown','keyup'])f.document.addEventListener(type,e=>events.push([type,e.key,e.edenTouchAction===true]));
 const controls=f.root.createTouchControls({look:(...v)=>looks.push(v),combat:()=>combat,third:()=>events.push(['view']),visible:()=>active,armed:()=>armed,expedition:()=>expedition,actions:()=>available,move:(...v)=>moves.push(v),jump:()=>{events.push(['jump']);return()=>events.push(['jumpUp']);},crouch:v=>crouches.push(v),onReset:()=>resets++});
 return {...f,controls,events,looks,moves,crouches,q:s=>controls.element.querySelector(s),set(v){if('active'in v)active=v.active;if('expedition'in v)expedition=v.expedition;if('armed'in v)armed=v.armed;if('available'in v)available=v.available;},resets:()=>resets};}
function eden(){const f=mobileFixture('eden-mobile.js'),events=[],moves=[],looks=[];let active=true,ready=true,blocked=false;const controls=f.root.createEdenMobile({host:f.document.body,ready:()=>ready,active:()=>active,blocked:()=>blocked,look:(...v)=>looks.push(v),move:(...v)=>moves.push(v),jump:()=>events.push('jump'),jumpUp:()=>events.push('jumpUp'),crouch:v=>events.push(['crouch',v]),view:()=>events.push('view'),isThird:()=>false,tap:()=>events.push('tap'),stop:()=>events.push('stop')});return {...f,controls,events,moves,looks,q:s=>f.document.querySelector(s),set(v){if('active'in v)active=v.active;if('ready'in v)ready=v.ready;if('blocked'in v)blocked=v.blocked;}};}

test('separate fingers can move, look and crouch; unrelated pointer releases cannot steal ownership',()=>{
 const f=shared(),stick=f.q('.tc-stick'),pad=f.q('.tc-look'),crouch=f.q('.tc-slide');
 f.emit(stick,'pointerdown',{pointerId:1,clientY:-8});f.emit(pad,'pointerdown',{pointerId:2});f.emit(crouch,'pointerdown',{pointerId:3});f.emit(pad,'pointermove',{pointerId:2,clientX:76,clientY:46});
 assert.equal(f.controls.inspect().keys.includes('w'),true);assert.equal(f.controls.inspect().keys.includes('Shift'),true);assert.equal(f.looks.length,1);{const [dx,dy]=f.looks[0];assert.ok(Math.abs(dx/dy+2)<1e-9,'look keeps the drag direction');assert.ok(Math.hypot(dx,dy)>Math.hypot(20,10)&&Math.hypot(dx,dy)<Math.hypot(20,10)*4,'touch look is amplified within bounds');}assert.equal(f.crouches.at(-1),true);
 f.emit(stick,'pointerup',{pointerId:9});assert.equal(f.controls.inspect().stick,true);
 f.emit(stick,'pointercancel',{pointerId:1});f.emit(pad,'lostpointercapture',{pointerId:2});f.emit(crouch,'pointerup',{pointerId:3});assert.deepEqual([...f.controls.inspect().keys],[]);assert.equal(f.controls.inspect().look,false);assert.equal(f.controls.inspect().actions,0);assert.equal(f.crouches.at(-1),false);assert.equal(stick.captures.size,0);
});
test('touch actions retain canonical semantics after desktop remapping',()=>{const f=shared();for(const [selector,key]of [['.tc-fire','g'],['.tc-use','e'],['.tc-reload','r']]){f.emit(f.q(selector),'pointerdown');f.emit(f.q(selector),'pointerup');assert.deepEqual(f.events.filter(e=>e[1]===key),[['keydown',key,true],['keyup',key,true]]);}});
test('hiding an unavailable held action releases it immediately',()=>{const f=shared();f.emit(f.q('.tc-fire'),'pointerdown');f.set({available:{fire:false,reload:true}});f.tick();assert.equal(f.q('.tc-fire').hidden,true);assert.equal(f.controls.inspect().actions,0);assert.equal(f.events.filter(e=>e[0]==='keyup'&&e[1]==='g').length,1);});
test('unarmed shared controls do not stack unusable aim, reload and melee buttons',()=>{const f=shared();f.set({expedition:false,armed:false});f.tick();for(const selector of ['.tc-aim','.tc-reload','.tc-melee'])assert.equal(f.q(selector).hidden,true,selector);assert.equal(f.q('.tc-fire').hidden,false);});
test('mode changes release the original action and interruption paths release all held input',()=>{for(const interruption of ['blur','pagehide','orientationchange','visibilitychange']){const f=shared();f.emit(f.q('.tc-stick'),'pointerdown',{clientY:0});f.emit(f.q('.tc-fire'),'pointerdown',{pointerId:2});f.emit(f.q('.tc-slide'),'pointerdown',{pointerId:3});if(interruption==='visibilitychange'){f.document.hidden=true;f.emit(f.document,interruption);}else if(interruption==='visualViewport')f.emit(f.root.visualViewport,'resize');else f.emit(f.root,interruption);assert.deepEqual([...f.controls.inspect().keys],[],interruption);assert.equal(f.controls.inspect().actions,0,interruption);assert.equal(f.crouches.at(-1),false,interruption);}
 const f=shared();f.emit(f.q('.tc-fire'),'pointerdown');f.set({expedition:false,armed:true});f.tick();assert.ok(f.events.some(e=>e[0]==='keyup'&&e[1]==='g'));assert.equal(f.controls.inspect().actions,0);
});
test('opening a dialog while moving and firing releases input before the next timer tick',()=>{const f=shared();f.emit(f.q('.tc-stick'),'pointerdown',{clientY:0});f.emit(f.q('.tc-fire'),'pointerdown',{pointerId:2});const dialog=new f.Node('dialog');dialog.open=true;f.document.body.append(dialog);f.mutate();assert.deepEqual([...f.controls.inspect().keys],[]);assert.equal(f.controls.inspect().actions,0);assert.equal(f.controls.element.hidden,true);});
test('Eden gates new input immediately when readiness or the active world changes',()=>{for(const state of [{active:false},{ready:false},{blocked:true}]){const f=eden();f.set(state);f.emit(f.q('.em-jump'),'pointerdown');assert.equal(f.events.includes('jump'),false,JSON.stringify(state));}});
// iOS resizes the viewport whenever its address bar slides; a held finger must survive that (it used to drop the stick
// mid-drag and leave it dead until the finger lifted). Rotation still releases everything.
test('a viewport resize keeps held fingers on the shared and Eden controls',()=>{
 for(const resize of ['resize','visualViewport']){
  const f=shared();f.emit(f.q('.tc-stick'),'pointerdown',{clientY:0});f.emit(f.q('.tc-slide'),'pointerdown',{pointerId:3});
  if(resize==='visualViewport')f.emit(f.root.visualViewport,'resize');else f.emit(f.root,resize);
  assert.ok(f.controls.inspect().keys.includes('w'),resize+' keeps the stick');assert.equal(f.controls.inspect().actions,1,resize+' keeps a held button');
  const e=eden();e.emit(e.q('.em-stick'),'pointerdown',{clientY:0});
  if(resize==='visualViewport')e.emit(e.root.visualViewport,'resize');else e.emit(e.root,resize);
  assert.ok(e.controls.inspect().keys.includes('w'),'Eden '+resize+' keeps the stick');
 }
});
test('Eden supports simultaneous movement/look/crouch and releases on rotation, viewport changes and disposal',()=>{for(const interruption of ['orientationchange','dispose']){const f=eden();f.emit(f.q('.em-stick'),'pointerdown',{clientY:0});f.emit(f.q('.em-look'),'pointerdown',{pointerId:2});f.emit(f.q('.em-look'),'pointermove',{pointerId:2,clientX:80});f.emit(f.q('.em-crouch'),'pointerdown',{pointerId:3});assert.equal(f.controls.inspect().keys.includes('w'),true);assert.deepEqual(f.looks,[[24,0]]);if(interruption==='dispose')f.controls.dispose();else if(interruption==='visualViewport')f.emit(f.root.visualViewport,'resize');else f.emit(f.root,interruption);assert.deepEqual([...f.controls.inspect().keys],[],interruption);assert.equal(f.controls.inspect().look,false);assert.deepEqual(f.events.at(-2),['crouch',false]);}});
test('an interrupted Eden button press cannot strand secondary-finger activation',()=>{const f=eden(),button=f.q('.em-view');f.emit(button,'pointerdown',{pointerId:1});f.emit(f.root,'blur');f.emit(button,'pointerdown',{pointerId:2,isPrimary:false});f.emit(button,'pointerup',{pointerId:2,isPrimary:false});assert.equal(f.events.filter(e=>e==='view').length,1);});
test('an Eden tap released outside its button is cancelled and later fingers still work',()=>{const f=eden(),button=f.q('.em-view');f.emit(button,'pointerdown',{pointerId:1});f.emit(f.document,'pointerup',{pointerId:1});f.emit(button,'pointerdown',{pointerId:2,isPrimary:false});f.emit(button,'pointerup',{pointerId:2,isPrimary:false});assert.equal(f.events.filter(e=>e==='view').length,1);});
test('assistive button clicks fire once and release held actions; disposal detaches listeners',()=>{const f=shared(),button=f.q('.tc-slide');f.emit(button,'click',{detail:0});assert.deepEqual(f.crouches.slice(-2),[true,false]);assert.equal(f.controls.inspect().actions,0);f.emit(f.q('.tc-fire'),'pointerdown');f.controls.dispose();assert.equal(f.controls.inspect().actions,0);const n=f.crouches.length;f.emit(button,'pointerdown');assert.equal(f.crouches.length,n);});
test('both joysticks walk inside the circle, sprint only outside, and return to walking',()=>{
 for(const [make,selector,sprint]of [[shared,'.tc-stick','Shift'],[eden,'.em-stick','shift']]){const f=make(),stick=f.q(selector);f.emit(stick,'pointerdown',{clientY:16});assert.equal(f.controls.inspect().keys.includes('w'),true);assert.equal(f.controls.inspect().keys.includes(sprint),false,'inside circle walks');f.emit(stick,'pointermove',{clientY:0});assert.equal(f.controls.inspect().keys.includes(sprint),false,'on boundary still walks');f.emit(stick,'pointermove',{clientY:-1});assert.equal(f.controls.inspect().keys.includes(sprint),true,'outside circle sprints');f.emit(stick,'pointermove',{clientY:16});assert.equal(f.controls.inspect().keys.includes(sprint),false,'return inside releases sprint');assert.equal(f.controls.inspect().keys.includes('w'),true);f.emit(stick,'pointerup');assert.deepEqual([...f.controls.inspect().keys],[]);}
 assert.equal(eden().q('.em-run'),null,'outside-circle sprint replaces the separate Run toggle');
});
test('shared held Jump release callback runs exactly once on release or interruption',()=>{
 for(const end of ['pointerup','pointercancel','lostpointercapture','blur','dispose']){const f=shared(),button=f.q('.tc-jump');f.emit(button,'pointerdown',{pointerId:4});assert.deepEqual(f.events.filter(e=>e[0].startsWith('jump')),[['jump']]);if(end==='dispose')f.controls.dispose();else f.emit(end==='blur'?f.root:button,end,{pointerId:4});f.emit(button,'pointerup',{pointerId:4});assert.deepEqual(f.events.filter(e=>e[0].startsWith('jump')),[['jump'],['jumpUp']],end);}
 const f=shared();f.emit(f.q('.tc-jump'),'click',{detail:0});assert.deepEqual(f.events.filter(e=>e[0].startsWith('jump')),[['jump'],['jumpUp']]);
});
test('Eden held Jump calls jumpUp exactly once on release or interruption',()=>{
 for(const end of ['pointerup','pointercancel','lostpointercapture','blur','dispose']){const f=eden(),button=f.q('.em-jump');f.emit(button,'pointerdown',{pointerId:4});assert.deepEqual(f.events.filter(e=>typeof e==='string'&&e.startsWith('jump')),['jump']);if(end==='dispose')f.controls.dispose();else f.emit(end==='blur'?f.root:button,end,{pointerId:4});f.emit(button,'pointerup',{pointerId:4});assert.deepEqual(f.events.filter(e=>typeof e==='string'&&e.startsWith('jump')),['jump','jumpUp'],end);}
 const f=eden();f.emit(f.q('.em-jump'),'click',{detail:0});assert.deepEqual(f.events.filter(e=>typeof e==='string'&&e.startsWith('jump')),['jump','jumpUp']);
});
// Phones: a new finger takes over looking (a look finger iOS never released cannot block it), a tap inside the dead
// zone does not move the view, and holstering (a mode change) keeps the look finger alive.
test('a new finger takes over looking, taps do not nudge the view, and mode changes keep the look finger',()=>{
 const f=shared(),pad=f.q('.tc-look');
 f.emit(pad,'pointerdown',{pointerId:1,clientX:50,clientY:50});f.emit(pad,'pointermove',{pointerId:1,clientX:52,clientY:51});assert.equal(f.looks.length,0,'inside the dead zone');
 f.emit(pad,'pointerdown',{pointerId:2,clientX:100,clientY:100});f.emit(pad,'pointermove',{pointerId:1,clientX:90,clientY:50});assert.equal(f.looks.length,0,'the old finger no longer looks');
 f.emit(pad,'pointermove',{pointerId:2,clientX:130,clientY:100});assert.equal(f.looks.length,1,'the new finger looks');
 f.set({expedition:false,armed:true});f.tick();f.emit(pad,'pointermove',{pointerId:2,clientX:150,clientY:100});assert.equal(f.looks.length,2,'look survives a mode change');assert.equal(f.controls.inspect().look,true);
});
