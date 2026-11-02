'use strict';
// PLAY: one place for every game in the garden (expeditions, the battle, the firing range, the jester, the online
// arena) instead of a launch button each in the footer, plus a controls card that opens on "?" and highlights the
// controls for whatever the visitor is doing right now.
//
// Host hooks (app.js): createPlayMenu({nav, after, stage, items:[{id,title,text,keys,run,available,note}],
//                                      context:()=>'walk'|'armed'|'range'|'battle'|'arena'|'fists'|'expedition',
//                                      onOpen, onClose})
window.createPlayMenu=function({nav,after,stage,items,context=()=>'walk',onOpen=()=>{},onClose=()=>{}}){
 const button=document.createElement('button');button.id='play-launch';button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.textContent='PLAY';
 (after||nav.lastElementChild).after(button);

 const menu=document.createElement('dialog');menu.id='play-menu';menu.setAttribute('aria-labelledby','play-menu-title');
 menu.innerHTML=`<header><div><small>BREAK THY RULE</small><h2 id="play-menu-title">Play</h2></div><button type="button" class="icon-button play-close" aria-label="Close" title="Close">×</button></header>
  <div class="play-items"></div>
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
 function open(){render();if(!menu.open){onOpen();menu.showModal();button.setAttribute('aria-expanded','true');}}
 menu.addEventListener('close',()=>{button.setAttribute('aria-expanded','false');onClose();});
 menu.addEventListener('click',event=>{if(event.target===menu)menu.close();});
 menu.querySelector('.play-close').onclick=()=>menu.close();
 button.onclick=open;

 // Controls card.
 const SECTIONS=[
  ['walk','Getting around',[['Click the scene','look with the mouse'],['Esc','free the cursor'],['W A S D','walk'],['Shift','sprint'],['Space','jump'],['Hold C','crouch'],['Shift + C','slide'],['Click','use what is under the dot'],['E','open the hidden door (near the sign)'],['F','punch'],['Drag (touch)','look around']]],
  ['armed','Weapons',[['1 – 7','draw a weapon'],['Wheel','next / previous weapon'],['Click','fire'],['Right click','melee bash'],['R','reload'],['G','detonate C4'],['X, 0 or the same number','put it away'],['Esc','release the mouse']]],
  ['fists','Fist fight with the jester',[['F or click','jab, then cross'],['G','haymaker'],['Hold Q','block'],['Double-tap A / D','dodge to the side'],['Walk away','he goes back to dancing']]],
  ['battle','Battle',[['Shield','recharges after 4 s without damage'],['F','open chests, pick up loot'],['H','heal'],['1 – 7','your weapons'],['Double-tap A / D','dodge'],['Shift + C','slide into cover'],['Stay in the light','the night closes in']]],
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
