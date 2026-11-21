'use strict';
(function(root){
 // Persist physical inputs, then translate them to the established gameplay keys.
 // Touch controls send semantic actions and intentionally bypass desktop bindings.
 const STORAGE='eden-game-bindings-v1',ALL=['walk','combat','battle','arena','fists','expedition','horror'];
 const actions=[],add=(id,label,key,inputs,contexts=ALL)=>actions.push({id,label,key,inputs,contexts});
 add('forward','Move forward / climb','w',['KeyW','ArrowUp']);add('back','Move back / drop','s',['KeyS','ArrowDown']);
 add('left','Move left / shimmy','a',['KeyA','ArrowLeft']);add('right','Move right / shimmy','d',['KeyD','ArrowRight']);
 add('jump','Jump / vault / climb',' ',['Space']);add('sprint','Sprint / steady scope','shift',['ShiftLeft','ShiftRight']);
 add('crouch','Crouch / slide / dive / drop','c',['KeyC']);add('view','First / third person','view',['KeyK']);
 add('shoulder','Swap camera shoulder','v',['KeyV']);add('wave','Wave / emote','t',['KeyT']);
 add('help','Controls help','?',['Slash']);add('menu','Play menu','menu',['KeyP']);
 add('interact','Interact / collect / ring bell','e',['KeyE'],['walk','expedition']);
 add('flashlight','Flashlight','f',['KeyF'],['expedition']);add('flare','Fire flare','g',['KeyG','Mouse0'],['expedition']);
 add('reload','Reload','r',['KeyR'],['expedition','combat','battle','walk','horror']);
 add('bail','Bail / get up','b',['KeyB'],['expedition']);add('journal','Page journal','j',['KeyJ'],['expedition']);
 add('chat','Chat','chat',['Enter'],['walk','combat','fists','expedition']);
 add('useTarget','Use object under cursor','use',['Mouse0'],['walk']);add('ambience','Mute garden ambience','m',['KeyM'],['walk','fists']);
 add('punch','Punch / jab','f',['KeyF','Mouse0'],['fists']);add('haymaker','Haymaker','g',['KeyG'],['fists']);add('block','Block','q',['KeyQ','Mouse2'],['fists']);
 add('gardenPunch','Punch','f',['KeyF'],['walk']);
 add('fire','Fire / attack','fire',['Mouse0'],['combat','battle','arena','horror']);add('aim','Aim / block / alternate fire','aim',['Mouse2'],['combat','battle','arena','horror']);
 add('swap','Previous weapon / swap','q',['KeyQ'],['walk','combat','battle','arena','horror']);
 add('holster','Holster weapon','x',['KeyX','Digit0'],['walk','combat','battle','horror']);add('bash','Melee bash (hold: slam)','b',['KeyB'],['combat','battle','horror']);add('guard','Block (tap just before a hit: parry)','z',['KeyZ','Mouse4'],['combat','battle','horror']);
 add('detonate','Detonate C4','g',['KeyG'],['combat','battle','horror']);
 for(let n=1;n<=7;n++)add('weapon'+n,'Weapon slot '+n,String(n),['Digit'+n],n<=2?['walk','combat','battle','arena','horror']:['walk','combat','battle','horror']);
 add('chapterInteract','Take story ticket / enter garment lab','chapter',['KeyF'],['horror']);
 add('loot','Interact / pick up loot','f',['KeyF'],['battle']);add('heal','Heal','h',['KeyH'],['battle']);add('scores','Scores','tab',['Tab'],['battle','arena']);
 const byId=new Map(actions.map(a=>[a.id,a])),copy=v=>Object.fromEntries(Object.entries(v).map(([k,a])=>[k,[...a]])),defaults=()=>Object.fromEntries(actions.map(a=>[a.id,[...a.inputs]]));
 const overlap=(a,b)=>a.contexts.some(c=>b.contexts.includes(c));
 const valid=(code,id)=>typeof code==='string'&&(/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Backquote|Minus|Equal|Numpad[0-9]|Numpad(Add|Subtract|Multiply|Divide|Decimal|Enter)|Mouse[0-4])$/.test(code)||code==='Tab'&&id==='scores');
 function conflict(value,id,code){const action=byId.get(id);return actions.find(a=>a.id!==id&&overlap(a,action)&&value[a.id]?.includes(code));}
 function validate(raw){const value=defaults();if(!raw||typeof raw!=='object'||Array.isArray(raw))return value;
  // Validate the whole proposed map before conflict resolution so swaps survive reload.
  for(const a of actions)if(Array.isArray(raw[a.id])&&raw[a.id].length>=1&&raw[a.id].length<=2&&raw[a.id].every(c=>valid(c,a.id))&&new Set(raw[a.id]).size===raw[a.id].length)value[a.id]=[...raw[a.id]];
  // A malformed/conflicting saved map must never make movement or an action unreachable.
  if(actions.some(a=>value[a.id].some(c=>conflict(value,a.id,c))))return defaults();return value;
 }
 let bindings=defaults();try{const raw=root.localStorage?.getItem(STORAGE);if(raw)bindings=validate(JSON.parse(raw));else{const old=JSON.parse(root.localStorage?.getItem('eden-expedition-preferences-v1')||'null');if(old?.bailKey==='n')bindings.bail=['KeyN'];}}catch{}
 let context=()=> 'expedition';const subscribers=new Set(),pressed=new Map(),eventCache=new WeakMap();
 const rawKey=e=>typeof e.key==='string'?e.key.toLowerCase():'';
 function code(e){if(e.edenInputCode)return e.edenInputCode;if(e.code)return e.code;const k=rawKey(e);if(/^[a-z]$/.test(k))return 'Key'+k.toUpperCase();if(/^[0-9]$/.test(k))return 'Digit'+k;return {' ':'Space',shift:'ShiftLeft',control:'ControlLeft',alt:'AltLeft',enter:'Enter',tab:'Tab',arrowup:'ArrowUp',arrowdown:'ArrowDown',arrowleft:'ArrowLeft',arrowright:'ArrowRight','?':'Slash','/':'Slash','`':'Backquote'}[k]||'';}
 function action(e){if(e.edenTouchAction||e.edenMappedKey)return actions.find(a=>a.key===(e.edenMappedKey||rawKey(e))&&a.contexts.includes(context()))?.id||null;const physical=code(e);return actions.find(a=>a.contexts.includes(context())&&bindings[a.id].includes(physical))?.id||null;}
 function blockedModifiers(e){if(e.metaKey||e.isComposing)return true;const physical=code(e);for(const [down,prefix] of [[e.ctrlKey,'Control'],[e.altKey,'Alt']])if(down){if(physical.startsWith(prefix)&&action(e))continue;const held=[prefix+'Left',prefix+'Right'].some(c=>pressed.has(c));if(!root.document?.pointerLockElement||!held||!action(e))return true;}return false;}
 function key(e){if(e.edenMappedKey)return e.edenMappedKey;if(e.edenTouchAction)return rawKey(e);if(eventCache.has(e))return eventCache.get(e);
  const physical=code(e),up=e.type==='keyup';let result;
  if(up&&pressed.has(physical)){result=pressed.get(physical);pressed.delete(physical);if([...pressed.values()].includes(result))result='';}
  else{result=byId.get(action(e))?.key||'';if(!up&&result)pressed.set(physical,result);}
  eventCache.set(e,result);return result;
 }
 const label=code=>({Space:'Space',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',AltLeft:'Left Alt',AltRight:'Right Alt',Mouse0:'Left mouse',Mouse1:'Middle mouse',Mouse2:'Right mouse',Mouse3:'Mouse 4',Mouse4:'Mouse 5',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Slash:'/',Backquote:'`'})[code]||code.replace(/^Key|^Digit/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
 function publish(){pressed.clear();let saved=true;try{root.localStorage?.setItem(STORAGE,JSON.stringify(bindings));}catch{saved=false;}for(const fn of subscribers)fn(saved);return saved;}
 function set(id,slot,input){if(!byId.has(id)||![0,1].includes(slot))return {ok:false,message:'Unknown control.'};if(!input&&slot===1){bindings[id]=bindings[id].slice(0,1);return {ok:true,saved:publish()};}
  if(!valid(input,id))return {ok:false,message:'That key is reserved for browser navigation. Choose a letter, number, arrow, Shift, Space or mouse button.'};
  const other=conflict(bindings,id,input);if(other)return {ok:false,message:label(input)+' is already used by '+other.label+'. Change that binding first.'};
  if(bindings[id].some((c,i)=>c===input&&i!==slot))return {ok:false,message:'That input is already assigned to this action.'};
  const next=[...bindings[id]];next[slot]=input;bindings[id]=next;return {ok:true,saved:publish()};
 }
 // A closed native dialog may retain aria-modal. Only a visible, open modal
 // owns input; keeping the museum reader mounted must not disable combat.
 function modalOpen(){
  const doc=root.document;if(!doc)return false;
  if(doc.querySelector?.('dialog[open]'))return true;
  for(const el of doc.querySelectorAll?.('[aria-modal="true"]:not(dialog)')||[]){
   if(el.closest?.('[hidden],[aria-hidden="true"]'))continue;
   if(el.checkVisibility?el.checkVisibility({visibilityProperty:true}):el.getClientRects?.().length)return true;
  }
  return false;
 }
 const api=root.edenControls={actions:actions.map(a=>({...a,inputs:[...a.inputs],contexts:[...a.contexts]})),get:()=>copy(bindings),set,blockedModifiers,modalOpen,reset(){bindings=defaults();publish();},key,action,code,label,
  hint:id=>(bindings[id]||[]).map(label).join(' / '),setContext:fn=>{context=fn;pressed.clear();},context:()=>context(),onChange(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},clear:()=>pressed.clear()};
 // Convert bound mouse buttons once, without manufacturing pointer-lock or trust.
 // Native mouse-look still receives its motion, and a first click still acquires focus.
 const doc=root.document,mousePointers=new Map(),buttonMasks=[1,4,2,8,16];
 function mouseEdge(e,button,up){const physical='Mouse'+button;
  if(!up&&(blockedModifiers({code:physical,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,isComposing:e.isComposing})||modalOpen()||e.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target?.tagName)))return;
  if(!up&&!doc.pointerLockElement&&!e.target?.closest?.('#scene canvas'))return;
  const id=actions.find(a=>a.contexts.includes(context())&&bindings[a.id].includes(physical))?.id,k=up?pressed.get(physical):byId.get(id)?.key;if(!k)return;
  if(!up&&!doc.pointerLockElement&&['fire','aim','g','use','f'].includes(k))return;
  if(up)pressed.delete(physical);else pressed.set(physical,k);if(up&&[...pressed.values()].includes(k))return;
  e.preventDefault?.();const event=new root.KeyboardEvent(up?'keyup':'keydown',{key:k,bubbles:true,cancelable:true});Object.defineProperty(event,'edenMappedKey',{value:k});Object.defineProperty(event,'edenInputCode',{value:physical});(doc.pointerLockElement||e.target||doc).dispatchEvent(event);
 }
 // Chord changes (aim + fire) arrive as pointermove, not a second pointerdown.
 // Reconcile the complete button mask, including releases while another stays down.
 function mouse(e,cancel=false){
  if(e.pointerType&&e.pointerType!=='mouse'&&e.pointerType!=='pen')return;
  const id=e.pointerId??'mouse',previous=mousePointers.get(id),before=previous?.buttons||0;
  if(!previous&&e.type!=='pointerdown')return;
  const mask=buttonMasks[e.button]||0,after=cancel?0:Number.isInteger(e.buttons)?e.buttons:e.type==='pointerdown'?before|mask:before&~mask;
  if(after)mousePointers.set(id,{buttons:after,target:e.target||previous?.target});else mousePointers.delete(id);
  for(let button=0;button<buttonMasks.length;button++){const bit=buttonMasks[button];if((before&bit)&&!(after&bit))mouseEdge(e,button,true);}
  if(!cancel)for(let button=0;button<buttonMasks.length;button++){const bit=buttonMasks[button];if(!(before&bit)&&(after&bit))mouseEdge(e,button,false);}
 }
 function releaseMouse(){for(const [pointerId,pointer] of mousePointers)mouse({pointerId,pointerType:'mouse',type:'pointercancel',target:pointer.target},true);mousePointers.clear();}
 if(doc?.addEventListener){for(const type of ['pointerdown','pointermove','pointerup'])doc.addEventListener(type,e=>mouse(e));for(const type of ['pointercancel','lostpointercapture'])doc.addEventListener(type,e=>mouse(e,true));doc.addEventListener('pointerlockchange',()=>{if(!doc.pointerLockElement)releaseMouse();});doc.addEventListener('visibilitychange',()=>{releaseMouse();pressed.clear();});root.addEventListener?.('blur',()=>{releaseMouse();pressed.clear();});}
 subscribers.add(()=>mousePointers.clear());
})(typeof window==='object'?window:globalThis);
