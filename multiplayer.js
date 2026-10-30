'use strict';
window.createGardenMultiplayer=function({T,scene,camera,getPose,enter,lookAt,requestDraw,stopMoving,inExpedition=()=>false}){
 const $=id=>document.getElementById(id),avatars=new Map();
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const hosted=!!window.showroomDeployment?.socialApi,preview=window.showroomDeployment?.mode==='preview'&&!hosted;
 const apiBase=window.showroomDeployment?.socialApi||'/api/social/',connectionId=crypto.randomUUID();
 let user=null,selfId=null,timer=0,running=false,failures=0,generation=0,register=true,lastId=0,unread=0,firstSnapshot=true,people=[],messages=[],muted=new Set(),selected=null,pendingChat=null,spawned=false;
 let characterAuth=null;
 let nightSuspended=false;
 const icons=()=>window.lucide?.createIcons();
 async function api(action,data){
  if(preview)throw new Error('Accounts and shared rooms are not enabled on this public preview.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),['register','login'].includes(action)?60000:10000);
  try{
   const response=await fetch(apiBase+action,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify({...data,connectionId}),signal:controller.signal});
   const result=await response.json();if(!response.ok){const error=new Error(result.error||'The garden could not connect.');error.status=response.status;throw error;}return result;
  }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw new Error('Connection lost. Reconnecting...');throw error;}
  finally{clearTimeout(timeout);}
 }
 function iconButton(name,label,click){const b=document.createElement('button');b.className='icon-button';b.type='button';b.title=label;b.setAttribute('aria-label',label);const i=document.createElement('i');i.dataset.lucide=name;b.append(i);b.onclick=click;return b;}
 const editor=window.createCharacterEditor({T,stopMoving,preview,draftOwner:()=>user?.id||'guest',save:async character=>{
  if(preview)throw new Error('Character saving is not enabled on this public preview. Your draft is still here.');
  if(!user)await new Promise((resolve,reject)=>{characterAuth={resolve,reject};$('social-auth-error').textContent='';$('social-auth').showModal();stopMoving();});
  const result=await api('character',{character});setUser(result.user);showPanel();
 }});
 const canInteract=()=>!!user?.character;
 function gate(){if(preview){editor.open(null);return;}if(!user){$('social-auth').showModal();stopMoving();}else editor.open(user.character);}
 function accountUI(){
  const active=canInteract();$('social-account-name').textContent=user?user.name+(active?'':' / Ghost'):'Guest / Ghost';
  $('social-message').disabled=!active;$('social-send').disabled=!active;$('social-wave').disabled=!active;$('social-gate').hidden=active;
  $('social-gate').textContent=user?'Create your character':'Create an account';$('social-logout').hidden=!user;
  $('character-launch-label').textContent=active?'Edit character':user?'Create character':'Become a character';
  if(preview){$('social-gate').disabled=true;$('social-gate').textContent='Accounts unavailable in preview';$('social-wave').disabled=true;}
  $('social-delete').hidden=!hosted||!user;
 }
 function destroyAvatar(a){GardenCharacter.dispose(a);}
 function clearAvatars(){for(const a of avatars.values())destroyAvatar(a);avatars.clear();requestDraw();}
 function avatar(person){
  const model=GardenCharacter.create(T,person.character,person.ghost),root=model.root;root.name='Visitor: '+person.name;root.userData.visitorId=person.id;
  const label=document.createElement('canvas');label.width=512;label.height=96;const ctx=label.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,512,96);ctx.fillStyle='#22372d';ctx.font='500 30px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(person.name,256,48,470);
  const labelMap=new T.CanvasTexture(label);labelMap.colorSpace=T.SRGBColorSpace;
  const name=new T.Sprite(new T.SpriteMaterial({map:labelMap,depthTest:true,toneMapped:false}));name.scale.set(1.1/root.scale.x,.21/root.scale.y,1);name.position.y=(model.height+.2)/root.scale.y;root.add(name);
  root.position.set(person.x,.02,person.z);root.rotation.y=person.yaw;scene.add(root);
  return {...model,signature:JSON.stringify([person.ghost,person.character,person.name]),target:new T.Vector3(person.x,.02,person.z),yaw:person.yaw,wave:0,moving:0};
 }
 function setConnected(live,label){$('social-dot').classList.toggle('live',live&&!preview);$('social-status').textContent=preview?'Public preview / shared room offline':label;$('social-launch-label').textContent=preview?'Public preview':(canInteract()?'':'Ghost / ')+(live?people.length+' in the garden':failures?'Reconnecting':'Connecting');}
 function renderPeople(){
  $('social-people').replaceChildren(...people.map(p=>{
   const li=document.createElement('li');li.classList.toggle('selected',selected===p.id);li.dataset.userId=p.id;
   const dot=document.createElement('span');dot.className='person-swatch';dot.style.background=p.color;
   const name=document.createElement('span');name.className='person-name';name.textContent=p.name+(p.id===selfId?' (you)':'');name.classList.toggle('muted',muted.has(p.id));li.append(dot,name);
   if(p.id!==selfId){li.append(iconButton('scan-eye','Look at '+p.name,()=>{const latest=people.find(person=>person.id===p.id);if(latest)lookAt(latest);selected=p.id;renderPeople();}));if(!p.ghost)li.append(iconButton(muted.has(p.id)?'volume-2':'volume-x',(muted.has(p.id)?'Unmute ':'Mute ')+p.name,()=>{muted.has(p.id)?muted.delete(p.id):muted.add(p.id);try{localStorage.setItem('eden-muted-'+(user?.id||'guest'),JSON.stringify([...muted]));}catch{}renderPeople();renderMessages();}));}return li;
  }));$('social-people-tab').textContent='Visitors ('+people.length+')';icons();
 }
 function renderMessages(){
  const log=$('social-messages'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<55;
  log.replaceChildren(...messages.filter(m=>!muted.has(m.userId)).map(m=>{
   const li=document.createElement('li');li.classList.toggle('own',m.userId===user?.id);li.dataset.messageId=m.id;
   const who=document.createElement('strong'),time=document.createElement('time'),text=document.createElement('p');who.textContent=m.name;time.textContent=new Date(m.time*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});text.textContent=m.text;if(m.kind==='wave')text.className='wave-message';li.append(who,time,text);return li;
  }));if(atBottom)log.scrollTop=log.scrollHeight;$('social-empty').hidden=messages.some(m=>!muted.has(m.userId))||$('social-messages').hidden;
 }
 function snapshot(data){
  selfId=data.selfId;user=data.user;accountUI();
  const signature=JSON.stringify(data.people.map(p=>[p.id,p.name,p.color]));const previous=JSON.stringify(people.map(p=>[p.id,p.name,p.color]));people=data.people;if(signature!==previous)renderPeople();
  const ids=new Set();for(const p of people){if(p.id===selfId)continue;ids.add(p.id);let a=avatars.get(p.id);const signature=JSON.stringify([p.ghost,p.character,p.name]);if(a&&a.signature!==signature){destroyAvatar(a);a=null;}if(!a){a=avatar(p);avatars.set(p.id,a);}a.target.set(p.x,.02,p.z);a.yaw=p.yaw;a.wave=p.wave;}
  for(const [id,a] of avatars)if(!ids.has(id)){destroyAvatar(a);avatars.delete(id);}
  const nextId=data.messages.at(-1)?.id||0;if(JSON.stringify(data.messages)!==JSON.stringify(messages)||firstSnapshot){if(!firstSnapshot&&$('social-panel').hidden)unread+=data.messages.filter(m=>m.id>lastId&&m.userId!==selfId&&!muted.has(m.userId)).length;messages=data.messages;lastId=nextId;firstSnapshot=false;renderMessages();}
  $('social-unread').hidden=!unread;$('social-unread').textContent=String(unread);setConnected(true,'Live room / '+people.length+' online');requestDraw();
 }
 async function poll(){
  if(preview||document.hidden)return;
  if(inExpedition()){if(!nightSuspended){nightSuspended=true;leave();clearAvatars();}timer=setTimeout(poll,500);return;}nightSuspended=false;
  if(running)return;const epoch=generation;running=true;
  try{const pose=getPose();if(!pose){timer=setTimeout(poll,500);return;}const data=await api('sync',{pose:document.hidden?null:pose});if(epoch!==generation)return;if(failures)$('social-error').textContent='';snapshot(data);failures=0;}
  catch(error){if(epoch!==generation)return;failures++;setConnected(false,'Reconnecting...');if(failures>3)clearAvatars();if(error.status===401){setUser(null);$('social-error').textContent='Your session ended. Sign in again.';return;}$('social-error').textContent=error.message;}
  finally{running=false;clearTimeout(timer);if(!document.hidden)timer=setTimeout(poll,failures?Math.min(15000,1000*2**failures):hosted?900:400);}
 }
 function setUser(value){
  generation++;clearTimeout(timer);user=value;failures=0;people=[];messages=[];lastId=0;firstSnapshot=true;unread=0;pendingChat=null;$('social-message').value='';clearAvatars();muted=new Set();
  try{muted=new Set(JSON.parse(localStorage.getItem('eden-muted-'+(user?.id||'guest'))||'[]'));}catch{}
  if(!spawned){spawned=true;enter();}timer=setTimeout(poll,50);$('social-move').hidden=false;setConnected(false,'Connecting...');
  accountUI();renderMessages();renderPeople();$('social-unread').hidden=true;
 }
 function showPanel(tab='chat'){$('social-panel').hidden=false;unread=0;$('social-unread').hidden=true;switchTab(tab);}
 function switchTab(tab){const chat=tab==='chat';$('social-messages').hidden=!chat;$('social-people').hidden=chat;$('social-chat-form').hidden=!chat;$('social-chat-tab').setAttribute('aria-selected',String(chat));$('social-people-tab').setAttribute('aria-selected',String(!chat));$('social-empty').hidden=!chat||messages.some(m=>!muted.has(m.userId));if(chat)$('social-messages').scrollTop=$('social-messages').scrollHeight;}
 $('social-launcher').onclick=()=>!$('social-panel').hidden?$('social-panel').hidden=true:showPanel();
 $('character-launcher').onclick=()=>editor.open(user?.character);$('social-gate').onclick=gate;$('social-edit').onclick=gate;
 $('social-close').onclick=()=>{$('social-panel').hidden=true;$('social-launcher').focus();};
 $('social-chat-tab').onclick=()=>switchTab('chat');$('social-people-tab').onclick=()=>switchTab('people');
 $('social-auth-close').onclick=()=>$('social-auth').close();
 let recovering=false;
 function authMode(){
  $('social-auth-title').textContent=recovering?'Recover account':register?'Create an account':'Welcome back';
  $('social-auth-submit').textContent=recovering?'Reset password':register?'Create account':'Sign in';
  $('social-auth-switch').textContent=register||recovering?'Already have an account? Sign in':'Create a showroom account';
  $('social-password').autocomplete=register||recovering?'new-password':'current-password';
  $('social-recovery-field').hidden=!recovering;$('social-recovery-code').required=recovering;$('social-auth-error').textContent='';
 }
 $('social-auth-switch').onclick=()=>{register=recovering?false:!register;recovering=false;authMode();};
 $('social-recover').hidden=!hosted;$('social-recover').onclick=()=>{recovering=true;authMode();};
 const recovery=window.createGardenAccountTools({api,stopMoving,onDelete:()=>setUser(null)});
 $('social-delete').onclick=()=>recovery.remove();
 $('social-auth-form').onsubmit=async event=>{event.preventDefault();$('social-auth-submit').disabled=true;$('social-auth-error').textContent='';try{const result=await api(recovering?'recover':register?'register':'login',{name:$('social-name').value.trim(),password:$('social-password').value,recoveryCode:$('social-recovery-code').value});$('social-password').value='';$('social-recovery-code').value='';const waiting=characterAuth;characterAuth=null;setUser(result.user);$('social-auth').close();if(result.recoveryCode)await recovery.showCode(result.user.name,result.recoveryCode);recovering=false;authMode();if(waiting)waiting.resolve();else if(!result.user.character)editor.open(null);else showPanel();}catch(error){$('social-auth-error').textContent=error.message;}finally{$('social-auth-submit').disabled=false;}};
 $('social-logout').onclick=async()=>{try{await api('logout',{});setUser(null);}catch(error){$('social-error').textContent=error.message;}};
 async function send(kind){if(!canInteract()){gate();return;}const input=$('social-message'),text=input.value.trim();if(kind==='chat'&&!text)return;const button=$(kind==='chat'?'social-send':'social-wave');button.disabled=true;$('social-error').textContent='';const payload=kind==='chat'&&pendingChat?.text===text?pendingChat:{text,nonce:crypto.randomUUID()};if(kind==='chat')pendingChat=payload;try{await api(kind,payload);if(kind==='chat'){pendingChat=null;if(input.value.trim()===text)input.value='';}clearTimeout(timer);await poll();}catch(error){$('social-error').textContent=error.message;}finally{button.disabled=false;}}
 $('social-chat-form').onsubmit=event=>{event.preventDefault();send('chat');};$('social-wave').onclick=()=>send('wave');
 $('social-message').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!$('social-send').disabled)send('chat');}};
 $('social-panel').addEventListener('focusin',stopMoving);$('social-auth').addEventListener('close',()=>{stopMoving();if(characterAuth){const waiting=characterAuth;characterAuth=null;waiting.reject(new Error('Your changes are still here. Sign in when you are ready to save and enter.'));}});
 function leave(){if(!preview)navigator.sendBeacon(apiBase+'leave',new Blob([JSON.stringify({connectionId})],{type:'application/json'}));}
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(document.hidden){generation++;leave();setConnected(false,'Away from the garden');}else poll();});
 window.addEventListener('pagehide',leave);
 function fitKeyboard(){const viewport=window.visualViewport;if(!viewport)return;const panel=$('social-panel'),covered=innerHeight-viewport.height-viewport.offsetTop;panel.style.bottom=covered>100?covered+12+'px':'';panel.style.height=covered>100?Math.max(220,Math.min(430,viewport.height-32))+'px':'';}
 window.visualViewport?.addEventListener('resize',fitKeyboard);
 if(preview){setUser(null);clearTimeout(timer);}else api('me').then(result=>setUser(result.user)).catch(()=>{setUser(null);setConnected(false,'Server unavailable');});icons();
 return {
  update(time,dt){let active=false;for(const a of avatars.values()){
   a.root.visible=!inExpedition();const distance=a.root.position.distanceTo(a.target);active=active||(a.ghost&&!reducedMotion)||distance>.005||Date.now()/1000-a.wave<3;
   a.root.position.lerp(a.target,1-Math.exp(-10*dt));a.root.rotation.y+=Math.atan2(Math.sin(a.yaw-a.root.rotation.y),Math.cos(a.yaw-a.root.rotation.y))*(1-Math.exp(-10*dt));
   a.moving=T.MathUtils.lerp(a.moving,distance>.02?1:0,.18);const stride=Math.sin(time*9)*.35*a.moving;
   a.animate(a.ghost&&reducedMotion?0:time,stride,Date.now()/1000-a.wave<3);
  }return active;},
  pick(raycaster,maxDistance=Infinity){const hit=raycaster.intersectObjects([...avatars.values()].map(a=>a.root),true)[0];if(!hit||hit.distance>maxDistance)return false;let n=hit.object;while(n&&!n.userData.visitorId)n=n.parent;if(n){if(!canInteract()){gate();return true;}selected=n.userData.visitorId;showPanel('people');renderPeople();return true;}return false;},
  inspect:()=>({userId:user?.id,selfId,ghost:!canInteract(),character:user?.character,people:people.map(p=>({...p})),avatars:[...avatars.keys()],connected:!preview&&!document.hidden&&!failures&&!firstSnapshot})
 };
};
