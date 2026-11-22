'use strict';
(function(root){
// Eden exploration owns its touch input. Combat/expedition keep their existing adapter.
root.createEdenMobile=function({host,ready,active,blocked,look,move,jump,jumpUp=null,crouch,view,isThird,tap,stop}){
 const media=matchMedia('(max-width: 760px), (pointer: coarse)'),abort=new AbortController(),signal=abort.signal;
 const listen=(node,event,fn,options={})=>node.addEventListener(event,fn,{...options,signal});
 const icon=(path)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const icons={menu:icon('<path d="M4 6h16M4 12h16M4 18h16"/>'),bag:icon('<path d="M5 7h14l1 14H4L5 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),jump:icon('<path d="m6 10 6-6 6 6M12 4v12M5 20h14"/>'),crouch:icon('<circle cx="15" cy="5" r="2"/><path d="m12 10-4 5 7 1 2 5M12 10l4 2h4M8 15l-4 5"/>'),view:icon('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 1-3h6l1 3"/><circle cx="12" cy="13" r="3"/>'),use:icon('<circle cx="12" cy="12" r="7"/><path d="M12 9v6M9 12h6"/>')};
 const ui=document.createElement('div');ui.id='eden-mobile-hud';ui.hidden=true;
 ui.innerHTML=`<div class="em-top"><a class="em-brand" href="/" aria-label="Return to Break Thy Rule website"><small>BREAK THY RULE</small><strong>EDEN</strong></a><div class="em-top-actions"><button type="button" data-command="shop" aria-label="Shop garment photos">${icons.bag}<span>Shop</span></button><button type="button" data-command="menu" aria-haspopup="dialog" aria-expanded="false">${icons.menu}<span>Menu</span></button></div></div><div class="em-place" aria-live="off"></div><div class="em-look" aria-hidden="true"></div><span class="em-reticle" aria-hidden="true"></span><div class="em-controls" role="group" aria-label="Eden touch controls"><button type="button" class="em-fight" data-command="fight" aria-label="Show fight controls" aria-pressed="false">${icon('<path d="m6 3 15 15-3 3L3 6V3h3ZM18 3l3 3-6 6M3 18l6-6M2 16l6 6M16 2l6 6"/>')}<span>Fight</span></button><div class="em-stick" role="group" aria-label="Movement joystick. Drag inside the circle to walk; outside it to sprint."><span class="em-ring"></span><i></i><span class="em-stick-label">MOVE</span></div><button type="button" class="em-jump" aria-label="Jump">${icons.jump}<span>Jump</span></button><button type="button" class="em-crouch" aria-label="Hold to crouch; slide while running">${icons.crouch}<span>Crouch</span></button><button type="button" class="em-view" aria-label="Switch to third-person view" aria-pressed="false">${icons.view}<span>View</span></button><button type="button" class="em-use" aria-label="Interact with the object in the center of the view">${icons.use}<span>Interact</span></button></div><p class="em-tip">Left stick: walk · Outside circle: sprint<br>Drag to look · Tap a piece to explore it</p><p class="em-feedback" role="status" hidden></p>`;
 host.append(ui);
 const q=s=>ui.querySelector(s),menuButton=q('[data-command="menu"]'),stick=q('.em-stick'),nub=stick.querySelector('i'),pad=q('.em-look'),controls=q('.em-controls'),feedback=q('.em-feedback');
 const sheet=document.createElement('dialog');sheet.id='eden-mobile-menu';sheet.setAttribute('aria-labelledby','eden-mobile-title');
 sheet.innerHTML='<header><div><small>YOUR GARDEN</small><h2 id="eden-mobile-title">Explore Eden</h2></div><button type="button" class="em-close" aria-label="Close Eden menu">×</button></header><div class="em-menu-body"><section><h3>Go somewhere</h3><div class="em-destinations"></div></section><section><h3>Make yourself at home</h3><div class="em-shortcuts"></div></section><section class="em-museum" hidden><h3>Inside the museum</h3><div class="em-museum-actions"></div></section><section class="em-how"><h3>Move naturally</h3><p>Drag the left stick inside its circle to walk. Drag outside the circle to sprint; bring it back inside to walk. Drag the world to look around and tap a piece to open it.</p><p>Jump clears low obstacles. Hold Crouch to duck; use it while running to slide. View switches your camera.</p></section><a class="em-home" href="/">Back to the website ↗</a></div>';
 document.body.append(sheet);controls.hidden=true;pad.hidden=true;q('.em-reticle').hidden=true;
 let mobile=false,enabled=false,playing=false,disposed=false,stickId=null,lookId=null,lookPoint=null,fight=false,origin=null,held=new Set(),hintTimer=0,feedbackTimer=0,hintDismissed=false;
 const releases=new Map(),pendingTaps=new Map();
 const capture=(node,id)=>{try{node.setPointerCapture(id);}catch{}};
 const releaseCapture=(node,id)=>{try{if(id!==null&&node.hasPointerCapture(id))node.releasePointerCapture(id);}catch{}};
 function inform(text){feedback.textContent=text;feedback.hidden=false;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>feedback.hidden=true,2200);}
 function dismissTip(){if(hintDismissed)return;hintDismissed=true;clearTimeout(hintTimer);hintTimer=setTimeout(()=>q('.em-tip').hidden=true,2500);}
 // Re-sent while the finger moves, so a key the game refused (not ready yet, a menu closing) is picked up again.
 function setMovement(x,y,sprint=false){const next=new Set();if(y<-.23)next.add('w');if(y>.23)next.add('s');if(x<-.23)next.add('a');if(x>.23)next.add('d');if(sprint&&next.size)next.add('shift');
  for(const k of held)if(!next.has(k))move(k,false);for(const k of next)move(k,true);const was=held.has('shift');held=next;if(was!==next.has('shift')){stick.classList.toggle('running',next.has('shift'));stick.querySelector('.em-stick-label').textContent=next.has('shift')?'SPRINTING':'MOVE';}
 }
 function releaseStick(){const id=stickId;stickId=null;origin=null;nub.style.transform='';setMovement(0,0);stick.classList.remove('engaged');releaseCapture(stick,id);}
 function releaseLook(){const id=lookId;lookId=null;lookPoint=null;releaseCapture(pad,id);}
 function releaseFight(){for(const button of document.querySelectorAll('#fight-pad button'))button.onpointercancel?.();document.body.classList.remove('eden-mobile-fight');}
 function reset(){releaseFight();releaseStick();releaseLook();for(const release of [...releases.values()])release();releases.clear();for(const tap of [...pendingTaps.values()])tap.cancel();crouch(false);stop();}
 function canInput(){return !disposed&&playing&&media.matches&&ready()&&active()&&!blocked()&&!sheet.open&&!document.hidden;}
 function begin(){if(!canInput()){reset();return false;}dismissTip();return true;}
 listen(stick,'pointerdown',e=>{if(stickId!==null||e.button!==0||!begin())return;e.preventDefault();stickId=e.pointerId;const rect=stick.getBoundingClientRect();origin=stickOrigin();stick.classList.add('engaged');capture(stick,e.pointerId);updateStick(e);});
 // Sprint starts once the finger leaves the circle and holds until it comes clearly back inside (hysteresis), so a
 // thumb resting on the edge does not flicker between walk and sprint.
 function stickOrigin(){const rect=stick.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,r:rect.width*.36,sprintRadius:rect.width/2,walkRadius:rect.width*.42};}
 function updateStick(e){if(e.pointerId!==stickId||!origin)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){releaseStick();return;}e.preventDefault();let x=e.clientX-origin.x,y=e.clientY-origin.y;const r=Math.hypot(x,y),sprint=r>(held.has('shift')?origin.walkRadius:origin.sprintRadius);if(r>origin.r){x*=origin.r/r;y*=origin.r/r;}nub.style.transform=`translate(${x}px,${y}px)`;setMovement(x/origin.r,y/origin.r,sprint);}
 listen(stick,'pointermove',updateStick);for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(stick,event,e=>{if(e.pointerId===stickId)releaseStick();});
 listen(pad,'pointerdown',e=>{if(lookId!==null||e.button!==0||!begin())return;e.preventDefault();lookId=e.pointerId;lookPoint={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:performance.now(),dragged:false};capture(pad,e.pointerId);});
 listen(pad,'pointermove',e=>{if(e.pointerId!==lookId||!lookPoint)return;if(!canInput()||(e.pointerType==='mouse'&&!(e.buttons&1))){releaseLook();return;}e.preventDefault();const p=lookPoint,dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;if(Math.hypot(p.x-p.startX,p.y-p.startY)>7)p.dragged=true;if(p.dragged)look(dx,dy);});
 listen(pad,'pointerup',e=>{if(e.pointerId!==lookId)return;const p=lookPoint;releaseLook();if(p&&!p.dragged&&performance.now()-p.time<400&&canInput())tap({clientX:e.clientX,clientY:e.clientY,pointerType:'touch'});});
 for(const event of ['pointercancel','lostpointercapture'])listen(pad,event,e=>{if(e.pointerId===lookId)releaseLook();});
 function hold(selector,down,up=()=>{}){const b=q(selector);let pointer=null;
  const end=()=>{if(pointer===null)return;const id=pointer;pointer=null;b.classList.remove('on');releases.delete(b);up();releaseCapture(b,id);};
  listen(b,'pointerdown',e=>{if(pointer!==null||e.button!==0||!begin())return;e.preventDefault();pointer=e.pointerId;releases.set(b,end);capture(b,pointer);b.classList.add('on');down();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(b,event,e=>{if(e.pointerId===pointer)end();});
  // Native keyboard / assistive activation does not leave a held action behind.
  listen(b,'click',e=>{if(e.detail===0&&begin()){down();up();}});
 }
 let releaseJump=null;
 hold('.em-jump',()=>{const release=jump(true);releaseJump=typeof release==='function'?release:jumpUp||(()=>jump(false));},()=>{const release=releaseJump;releaseJump=null;release?.();});hold('.em-crouch',()=>crouch(true),()=>crouch(false));
 activate(q('.em-view'),()=>{if(canInput()){view();updateView();dismissTip();}});
 activate(q('.em-use'),()=>{if(!canInput())return;const rect=host.getBoundingClientRect();if(!tap({clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,pointerType:'touch'}))inform('Move closer, or tap the piece you want to explore.');});
 function activate(button,fn){let press=null,suppressUntil=0;
  const clearPress=()=>{press=null;pendingTaps.delete(button);},cancel=()=>{clearPress();suppressUntil=performance.now()+500;};
  button.onpointerdown=e=>{if(e.pointerType==='touch'&&press===null){press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};pendingTaps.set(button,{id:e.pointerId,cancel});}};
  button.onpointermove=e=>{if(press?.id===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10)press.moved=true;};
  button.onpointercancel=cancel;
  button.onpointerup=e=>{if(press?.id!==e.pointerId)return;const moved=press.moved;clearPress();if(moved){suppressUntil=performance.now()+500;return;}if(e.pointerType==='touch'&&!e.isPrimary){e.preventDefault();suppressUntil=performance.now()+500;fn();}};
  button.onclick=e=>{if(e.detail===0||performance.now()>=suppressUntil)fn();};
 }
 // A scrolling or interrupted finger can finish outside its original button.
 // Keep only current presses, so rebuilding menu rows does not retain old buttons.
 for(const type of ['pointerup','pointercancel'])listen(document,type,e=>{for(const tap of [...pendingTaps.values()])if(tap.id===e.pointerId)tap.cancel();});
 function updateView(){const third=!!isThird();q('.em-view').setAttribute('aria-pressed',String(third));q('.em-view').setAttribute('aria-label',third?'Switch to first-person view':'Switch to third-person view');}
 function command(id){reset();if(sheet.open)sheet.close();const original=document.getElementById(id);if(original&&!original.disabled)original.click();}
 const placeItems=[['spawn','The garden','Back to the apple tree'],['library-view','Library','Books under the tree'],['approach','The vault','Browse the collection'],['wall-view','Museum','Art & The Daily Apple'],['amphitheater-view','Amphitheater','Music in the garden'],['battle-launch','Beyond Eden arena','Pistols, parkour & open match'],['play-launch','More modes','Explore beyond Eden']];
 const shortItems=[['character-launcher','Your character'],['social-launcher','Garden chat'],['open-library','Read a book'],['open-residents','Meet residents'],['garden-effects','Garden sound'],['play-launch','Camera settings'],['controls-help','Controls & help']];
 function fillItems(selector,items){const row=sheet.querySelector(selector);row.replaceChildren(...items.map(([id,label,note])=>{const b=document.createElement('button');b.type='button';const original=document.getElementById(id);b.dataset.command=id;b.disabled=!original||original.disabled;const title=document.createElement('strong');title.textContent=label;b.append(title);if(note){const small=document.createElement('small');small.textContent=note;b.append(small);}if(id==='garden-effects'&&original)b.setAttribute('aria-pressed',original.getAttribute('aria-pressed')||'false');activate(b,()=>{command(id);if(label==='Camera settings'){const settings=document.querySelector('#play-menu .play-settings');if(settings)settings.open=true;}});return b;}));}
 function openMenu(){reset();fillItems('.em-destinations',placeItems);fillItems('.em-shortcuts',shortItems);const originals=[...document.querySelectorAll('#lost-eden-tools button')],section=sheet.querySelector('.em-museum');section.hidden=!originals.length;sheet.querySelector('.em-museum-actions').replaceChildren(...originals.map(original=>{const b=document.createElement('button');b.type='button';b.textContent=original.textContent;b.disabled=original.disabled;activate(b,()=>{sheet.close();original.click();});return b;}));if(!sheet.open)sheet.showModal();menuButton.setAttribute('aria-expanded','true');sync();}
 activate(q('[data-command="fight"]'),()=>{if(!canInput())return;fight=!fight;releaseFight();sync();});
 activate(menuButton,openMenu);activate(q('[data-command="shop"]'),()=>command('view-product'));activate(sheet.querySelector('.em-close'),()=>sheet.close());
 listen(sheet,'click',e=>{if(e.target===sheet){const r=sheet.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)sheet.close();}});
 listen(sheet,'close',()=>{menuButton.setAttribute('aria-expanded','false');reset();sync();});
 function sync(){if(disposed)return;const nextMobile=media.matches,nextEnabled=nextMobile&&active(),nextPlaying=nextEnabled&&ready()&&!blocked()&&!sheet.open&&!document.hidden;
  if(nextMobile!==mobile){mobile=nextMobile;document.body.classList.toggle('eden-mobile',mobile);}
  if(nextEnabled!==enabled){enabled=nextEnabled;document.body.classList.toggle('eden-mobile-explore',enabled);ui.hidden=!enabled;if(!enabled&&sheet.open)sheet.close();}
  if(playing!==nextPlaying){playing=nextPlaying;controls.hidden=!playing;pad.hidden=!playing;q('.em-reticle').hidden=!playing;if(!playing)reset();}
  document.body.classList.toggle('eden-mobile-fight',nextPlaying&&fight);const fightButton=q('[data-command="fight"]');fightButton.disabled=!nextPlaying;fightButton.setAttribute('aria-pressed',String(fight));fightButton.setAttribute('aria-label',fight?'Hide fight controls':'Show fight controls');
  ui.classList.toggle('is-blocked',!nextPlaying);q('[data-command="shop"]').disabled=!ready();
  const title=document.querySelector('.world-caption h1')?.textContent||'Garden of Eden';if(q('.em-place').textContent!==title)q('.em-place').textContent=title;updateView();
 }
 listen(document,'visibilitychange',()=>{reset();sync();});listen(window,'blur',reset);listen(window,'pagehide',reset);listen(window,'orientationchange',reset);
 // iOS resizes the viewport when its address bar slides during play: keep the held finger, just re-measure the stick.
 const remeasure=()=>{if(stickId!==null)origin=stickOrigin();};listen(window,'resize',remeasure);listen(document,'btr:page-visibility',()=>{reset();sync();});listen(media,'change',()=>{reset();sync();});
 if(root.visualViewport)listen(root.visualViewport,'resize',remeasure);
 // Menus and chat release movement immediately, including a finger held offscreen.
 const observer=new MutationObserver(()=>{if((blocked()||sheet.open)&&playing){playing=false;reset();controls.hidden=true;pad.hidden=true;q('.em-reticle').hidden=true;ui.classList.add('is-blocked');}});
 observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});const socialPanel=document.getElementById('social-panel');if(socialPanel)observer.observe(socialPanel,{attributes:true,attributeFilter:['hidden']});
 const timer=setInterval(sync,180);sync();
 return {reset,inspect:()=>({mobile,enabled,playing,keys:[...held],stick:stickId!==null,look:lookId!==null,run:held.has('shift'),fight}),dispose(){if(disposed)return;disposed=true;clearInterval(timer);clearTimeout(hintTimer);clearTimeout(feedbackTimer);observer.disconnect();abort.abort();reset();sheet.remove();ui.remove();document.body.classList.remove('eden-mobile','eden-mobile-explore','eden-mobile-fight');}};
};
})(window);
