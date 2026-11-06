'use strict';
// PLAY: one place for every game in the garden (expeditions, the battle, the firing range, the jester, the online
// arena) instead of a launch button each in the footer, plus a controls card that opens on "?" and highlights the
// controls for whatever the visitor is doing right now.
//
// Host hooks (app.js): createPlayMenu({nav, after, stage, items:[{id,title,text,keys,run,available,note}],
//                                      context:()=>'walk'|'armed'|'range'|'battle'|'arena'|'fists'|'expedition',
//                                      onOpen, onClose})
// Settings shared by app.js and combat.js (read live, saved on this device).
window.edenSettings=(()=>{
 const DEFAULTS={sens:1,adsSens:1,fov:70,invertY:false,shoulder:'right',aim:'wheel'};let v={...DEFAULTS};
 try{Object.assign(v,JSON.parse(localStorage.getItem('eden-settings')||'{}'));}catch{}
 const subs=new Set();
 return {DEFAULTS,get:k=>v[k],all:()=>({...v}),set(k,val){v[k]=val;try{localStorage.setItem('eden-settings',JSON.stringify(v));}catch{}subs.forEach(f=>f(k,val));},reset(){v={...DEFAULTS};try{localStorage.removeItem('eden-settings');}catch{}subs.forEach(f=>f());},on(f){subs.add(f);}};
})();
window.createPlayMenu=function({nav,after,stage,items,graphics=null,context=()=>'walk',onOpen=()=>{},onClose=()=>{}}){
 const button=document.createElement('button');button.id='play-launch';button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.textContent='PLAY';
 (after||nav.lastElementChild).after(button);

 const menu=document.createElement('dialog');menu.id='play-menu';menu.setAttribute('aria-labelledby','play-menu-title');
 menu.innerHTML=`<header><div><small>BREAK THY RULE</small><h2 id="play-menu-title">Play</h2></div><button type="button" class="icon-button play-close" aria-label="Close" title="Close">×</button></header>
  <div class="play-items"></div>
  <details class="play-settings"><summary>SETTINGS</summary><div class="play-settings-grid"></div></details>
  <div class="play-graphics" hidden><span>GRAPHICS</span><div class="play-graphics-options" role="group" aria-label="Graphics quality"></div><small>Lower it if things feel slow.</small></div>
  <footer><button type="button" class="play-controls">CONTROLS <kbd>?</kbd></button><span>Press <kbd>Esc</kbd> to leave any game.</span></footer>`;
 document.body.append(menu);
 const list=menu.querySelector('.play-items');
 function render(){
  list.replaceChildren(...items.map(item=>{
   const ok=item.available?.()??true,card=document.createElement('button');card.type='button';card.className='play-item';card.dataset.id=item.id;card.disabled=!ok;
   card.innerHTML=`<strong></strong><span class="play-text"></span><span class="play-keys"></span>`;
   card.querySelector('strong').textContent=item.title;card.querySelector('.play-text').textContent=ok?item.text:(item.note||item.text);card.querySelector('.play-keys').textContent=ok?item.keys||'':'';
   card.onclick=()=>{menu.close();item.run();};return card;
  }));
 }
 function renderGraphics(){
  if(!graphics)return;const box=menu.querySelector('.play-graphics'),row=box.querySelector('.play-graphics-options');box.hidden=false;
  row.replaceChildren(...graphics.levels.map(l=>{const b=document.createElement('button');b.type='button';b.textContent=l.label;b.setAttribute('aria-pressed',String(graphics.get()===l.id));b.onclick=()=>{graphics.set(l.id);renderGraphics();};return b;}));
 }
 // Settings: look sensitivity, aiming sensitivity, field of view, invert Y, third-person shoulder, how to aim.
 const S=window.edenSettings;
 function renderSettings(){
  const box=menu.querySelector('.play-settings-grid');box.replaceChildren();
  const row=(label,input,out)=>{const l=document.createElement('label');l.className='ps-row';const t=document.createElement('span');t.textContent=label;l.append(t,input);if(out)l.append(out);box.append(l);};
  const range=(key,label,min,max,step,fmt)=>{const i=document.createElement('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=S.get(key);const o=document.createElement('output');o.textContent=fmt(S.get(key));i.oninput=()=>{S.set(key,+i.value);o.textContent=fmt(+i.value);};row(label,i,o);};
  const choice=(key,label,opts)=>{const g=document.createElement('div');g.className='ps-choice';for(const [val,txt] of opts){const b=document.createElement('button');b.type='button';b.textContent=txt;b.setAttribute('aria-pressed',String(S.get(key)===val));b.onclick=e=>{e.preventDefault();S.set(key,val);renderSettings();};g.append(b);}row(label,g);};
  range('sens','LOOK SENSITIVITY',.3,2.5,.05,v=>v.toFixed(2)+'×');
  range('adsSens','AIMING SENSITIVITY',.3,2,.05,v=>v.toFixed(2)+'×');
  range('fov','FIELD OF VIEW',60,100,1,v=>v+'°');
  choice('invertY','INVERT Y',[[false,'OFF'],[true,'ON']]);
  choice('shoulder','THIRD-PERSON SHOULDER',[['right','RIGHT'],['left','LEFT']]);
  choice('aim','AIM WITH',[['wheel','WHEEL / PINCH'],['hold','HOLD RIGHT MOUSE']]);
  const reset=document.createElement('button');reset.type='button';reset.className='ps-reset';reset.textContent='RESET';reset.onclick=()=>{S.reset();renderSettings();};box.append(reset);
  const note=document.createElement('small');note.textContent=S.get('aim')==='hold'?'Hold right mouse to aim; B is melee.':'Wheel or pinch to aim; right mouse is melee.';box.append(note);
 }
 function open(){render();renderGraphics();renderSettings();if(!menu.open){onOpen();menu.showModal();button.setAttribute('aria-expanded','true');}}
 menu.addEventListener('close',()=>{button.setAttribute('aria-expanded','false');onClose();});
 menu.addEventListener('click',event=>{if(event.target===menu)menu.close();});
 menu.querySelector('.play-close').onclick=()=>menu.close();
 button.onclick=open;

 // Controls card.
 const SECTIONS=[
  ['walk','Getting around',[['Click the scene','look with the mouse'],['Esc','free the cursor'],['W A S D','walk'],['Shift','sprint'],['Space','jump'],['Hold C','crouch'],['Shift + tap C','slide'],['Shift + hold C','dolphin dive'],['Wheel out / in','third / first person'],['T','emote: wave, cheer, clap, dance, nod'],['V','swap shoulder (third person)'],['Jump into something low','vault over it'],['Hold a direction landing a dive','roll'],['Click','use what is under the dot'],['E','open the hidden door (near the sign)'],['F','punch'],['Drag (touch)','look around']]],
  ['armed','Weapons',[['1 – 7 or Q','draw / swap weapon'],['Wheel in or pinch','zoom: aim down the sights'],['Wheel out','third person'],['Shift (scoped)','hold your breath to steady the sniper'],['B','melee (when right mouse aims)'],['Click','fire'],['Right click','melee bash'],['R','reload'],['G','detonate C4'],['X, 0 or the same number','put it away'],['Esc','release the mouse']]],
  ['parkour','Parkour (beyond the door)',[['Run + jump at a wall','climb it, or run up it and grab the top'],['Jump beside a tall wall','wall-run; jump again to kick off'],['In the air into a ledge','grab it (hold W to climb straight up)'],['Hanging: A / D','shimmy'],['Hanging: W or Space','climb up'],['Hanging: S or C','let go'],['Hanging: Space + A / D','leap to the next ledge'],['Hanging: Space + S','kick off backwards'],['Walk off an edge holding C','catch it and hang'],['Jump across a gap','guided onto the roof or ledge'],['C just before landing','roll out of a long fall'],['Crates beside every building','the way up to the roofs']]],
  ['fists','Fist fight with the jester',[['F or click','jab, then cross'],['G','haymaker'],['Hold Q','block'],['Double-tap A / D','dodge to the side'],['Walk away','he goes back to dancing']]],
  ['battle','Open match',[['Goal','find the 8 lost pages (walk over them)'],['Moon Temple','opens at night: deliver pages for points'],['Most pages','you get pinged to everyone'],['Die at night','your soul is taken to the pyramid'],['Hidden door','walk through to play, back through to rest'],['Tab','scores'],['Shield','recharges after 4 s without damage'],['F','open chests, pick up loot'],['H','heal'],['1 – 7','your weapons'],['Double-tap A / D','dodge'],['Slide or dive into someone','tackle: they drop their weapon'],['F on a gun in the air','catch it'],['Dodge as a bot charges','it misses and falls'],['Melee a downed bot','finisher (double damage)'],['Charge through a door','smash it open'],['Wheel or pinch','zoom in; out for third person']]],
  ['arena','Online arena',[['Click','lock the mouse'],['1 / 2 or Q','sword / crossbow'],['Click','attack'],['Hold right click','block'],['Tab','scores']]],
  ['expedition','Beyond Eden',[['W A S D','walk'],['E','collect a page'],['F','flash']]]
 ];
 const card=document.createElement('dialog');card.id='controls-card';card.setAttribute('aria-labelledby','controls-title');
 card.innerHTML=`<header><div><small>BREAK THY RULE</small><h2 id="controls-title">Controls</h2></div><button type="button" class="icon-button play-close" aria-label="Close" title="Close">×</button></header><div class="controls-grid"></div><footer><span>Press <kbd>?</kbd> any time to open this card.</span></footer>`;
 document.body.append(card);
 const grid=card.querySelector('.controls-grid');
 grid.append(...SECTIONS.map(([id,title,rows])=>{const s=document.createElement('section');s.dataset.context=id;const h=document.createElement('h3');h.textContent=title;const dl=document.createElement('dl');
  for(const [k,v] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd);}s.append(h,dl);return s;}));
 function openControls(){
  const now=context();for(const s of grid.children)s.classList.toggle('current',s.dataset.context===now);
  const current=grid.querySelector('.current');if(current)grid.prepend(current);
  if(menu.open)menu.close();if(!card.open){onOpen();card.showModal();}
 }
 card.addEventListener('close',onClose);card.addEventListener('click',event=>{if(event.target===card)card.close();});
 card.querySelector('.play-close').onclick=()=>card.close();
 menu.querySelector('.play-controls').onclick=openControls;
 // "?" from anywhere except text fields; the help chip on the stage does the same for touch and mouse.
 document.addEventListener('keydown',event=>{
  if(event.key!=='?'||event.ctrlKey||event.metaKey||event.altKey||event.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
  if(document.querySelector('dialog[open]:not(#controls-card):not(#play-menu)'))return;
  event.preventDefault();if(card.open)card.close();else{if(document.pointerLockElement)document.exitPointerLock();openControls();}
 });
 const help=document.createElement('button');help.id='controls-help';help.type='button';help.className='icon-button';help.textContent='?';help.title='Controls (?)';help.setAttribute('aria-label','Controls');help.onclick=openControls;stage.after(help);

 // One-off tip banner (first battle, first range visit...), dismissed by time or a click.
 const tip=document.createElement('div');tip.id='play-tip';tip.setAttribute('role','status');tip.hidden=true;document.body.append(tip);let tipTimer=0;
 tip.onclick=()=>{tip.hidden=true;};
 function hint(key,text,ms=7000){
  try{const seen=JSON.parse(localStorage.getItem('play-tips')||'{}');if(seen[key]>=2)return;seen[key]=(seen[key]||0)+1;localStorage.setItem('play-tips',JSON.stringify(seen));}catch{}
  tip.textContent=text;tip.hidden=false;clearTimeout(tipTimer);tipTimer=setTimeout(()=>{tip.hidden=true;},ms);
 }
 return {open,openControls,hint,isOpen:()=>menu.open||card.open,button};
};
