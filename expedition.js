'use strict';
window.createExpedition=function({T,scene,camera,garden,getPose,place,stopMoving,requestDraw,returnHome,layout}){
 const $=id=>document.getElementById(id),dialog=$('night-dialog'),hud=$('night-hud'),avatars=new Map();
 let token=null,state=null,available=false,busy=false,seq=0,controller=null,streamTask=null,streamTime=0,poseTimer=0,poseBusy=false,lastSnapshot=0,nearest=null,autoPrompt=false,spectated=null,flashOn=true,soundOn=false,audio=null,osc=null,gain=null,disposed=false,browserSolo=null,soloTimer=0;
 let checking=window.showroomDeployment?.mode!=='preview';
 const flash=new T.SpotLight(0xe4e9d9,0,24,.43,.65,1.4);flash.target=new T.Object3D();scene.add(flash,flash.target);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const player=()=>state?.players.find(p=>p.id===state.selfId);
 const active=()=>!!token;
 const live=()=>!!state&&state.phase==='playing'&&player()?.status==='alive';
 const connected=()=>!!token&&performance.now()-streamTime<4000;
 function errors(text){$('night-error').textContent=text;}
 async function api(data){if(browserSolo)return browserSolo.command(data);const response=await fetch('/api/expedition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,token}),signal:AbortSignal.timeout(8000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'The expedition service is unavailable.');return result;}
 function open(){stopMoving();errors('');if(!dialog.open)dialog.showModal();renderLobby();}
 function renderLobby(){
  $('night-create').disabled=$('night-join').disabled=!available||busy||!!token;
  $('night-join-code').disabled=!available||busy||!!token;
  $('night-solo').disabled=checking||(!available&&!window.createSoloExpedition)||busy||!!token;
  $('night-service').textContent=checking?'Connecting...':available?'EXPEDITION SERVICE / 1-6 PLAYERS':'SOLO EXPEDITION / MULTIPLAYER NOT CONNECTED';
  $('night-room').hidden=!token;$('night-entry').hidden=!!token;
  $('night-start').hidden=!state||state.phase!=='lobby'||state.host!==state.selfId;
  $('night-code').textContent=state?state.code:'';
  $('night-resume').hidden=!state||state.phase==='lobby';
  if(state){$('night-party').replaceChildren(...state.players.map(p=>{const li=document.createElement('li');li.textContent=p.name+(p.id===state.host?' / Leader':'')+(p.id===state.selfId?' / You':'');return li;}));}
 }
 function destroyAvatars(){for(const entry of avatars.values())GardenCharacter.dispose(entry);avatars.clear();}
 function receive(value){
  if(!token)return;
  if(state&&value.serverTime<state.serverTime)return;
  const old=state,oldStatus=player()?.status;state=value;streamTime=performance.now();lastSnapshot=streamTime;
  garden.district.setState(state);garden.pyramid.setPages(state.collected.length);hud.hidden=false;document.body.classList.add('in-expedition');
  $('night-count').textContent=String(state.collected.length).padStart(2,'0')+' / 08';
  $('night-event').textContent=state.message;
  $('night-chat-open').hidden=state.solo;
  if(JSON.stringify(old?.chat)!==JSON.stringify(state.chat)){
   const log=$('night-chat-log'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<50;
   log.replaceChildren(...(state.chat||[]).map(m=>{const li=document.createElement('li'),name=document.createElement('strong'),text=document.createElement('span');name.textContent=m.name;text.textContent=m.text;li.append(name,text);return li;}));if(atBottom)log.scrollTop=log.scrollHeight;
   if(old&&$('night-chat').hidden&&(state.chat||[]).length)$('night-chat-open').classList.add('unread');
  }
  $('night-phase').textContent=state.phase==='lobby'?'GATHERING':state.collected.length===8?'REACH THE PYRAMID':'THE LOST PAGES';
  const self=player();if(!self)return;
  if(old?.phase==='lobby'&&state.phase==='playing'){dialog.close();place(self.x,self.z,self.x,self.z-5);}
  const present=new Set();
  for(const p of state.players){if(p.id===state.selfId||p.status!=='alive')continue;present.add(p.id);let a=avatars.get(p.id);if(!a){a=GardenCharacter.create(T,p.character,!p.character);scene.add(a.root);a.root.position.set(p.x,0,p.z);avatars.set(p.id,a);}a.target=new T.Vector3(p.x,0,p.z);a.yaw=p.yaw;}
  for(const [id,a] of avatars)if(!present.has(id)){GardenCharacter.dispose(a);avatars.delete(id);}
  const ended=state.phase==='won'||state.phase==='lost',out=self.status!=='alive';
  $('night-outcome').hidden=!(ended||out);
  $('night-outcome-title').textContent=self.status==='escaped'?'You reached the ceremony':self.status==='caught'?'The Attendant found you':self.status==='lost'?'Contact lost':state.phase==='won'?'The ceremony has begun':'No one returned';
  $('night-spectate').hidden=ended||self.status==='escaped'||!state.players.some(p=>p.status==='alive'&&p.id!==state.selfId);
  if(out&&oldStatus!==self.status){stopMoving();if(self.status==='escaped')place(11.7,-117,11.7,-133);else spectate();}
  if(ended)stopMoving();
  // Only correct a meaningful disagreement, not normal in-flight movement prediction.
  const pose=getPose();if(live()&&pose&&self.seq>=seq-2&&Math.hypot(pose.x-self.x,pose.z-self.z)>2.4)place(self.x,self.z,self.x+Math.sin(self.yaw)*5,self.z+Math.cos(self.yaw)*5);
  if(dialog.open)renderLobby();
  if(JSON.stringify(old?.collected)!==JSON.stringify(state.collected))renderJournal();
  requestDraw();
 }
 async function stream(){
  if(streamTask||!token||browserSolo)return;
  const ticket=token;controller=new AbortController();const signal=controller.signal;
  streamTask=(async()=>{while(token===ticket&&!signal.aborted){try{const r=await fetch('/api/expedition/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:ticket}),signal});if(!r.ok)throw new Error('Stream unavailable');const reader=r.body.getReader(),decoder=new TextDecoder();let pending='';while(token===ticket){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line&&token===ticket)receive(JSON.parse(line));}}}catch(error){if(signal.aborted)break;$('night-connection').textContent='Reconnecting...';}if(token===ticket&&!signal.aborted)await new Promise(resolve=>setTimeout(resolve,1200));}})();
  try{await streamTask;}finally{streamTask=null;if(token&&token!==ticket)stream();}
 }
 async function join(action){if(busy||token)return;busy=true;renderLobby();errors('');try{if(action==='solo'&&!available)browserSolo=window.createSoloExpedition({layout});const data=await api({action,code:$('night-join-code').value.trim()});token=data.token;seq=0;flashOn=true;$('night-flash').setAttribute('aria-pressed','true');receive(data);const p=player();place(p.x,p.z,p.x,p.z-5);if(browserSolo)soloTimer=setInterval(()=>{if(browserSolo&&token)receive(browserSolo.tick());},100);else stream();if(data.phase==='playing')dialog.close();poseTimer=setInterval(sendPose,120);}catch(error){if(!token)browserSolo=null;errors(error.message);}finally{busy=false;renderLobby();}}
 async function sendPose(){if(!token||poseBusy)return;poseBusy=true;const ticket=token;try{const pose=getPose();if(!pose)return;const result=await api({action:'pose',seq:++seq,pose:{...pose,flash:flashOn}});if(token===ticket)receive(result);}catch(error){if(token===ticket){$('night-connection').textContent=error.message;if(performance.now()-lastSnapshot>12000){$('night-outcome').hidden=false;$('night-outcome-title').textContent='Connection lost';stopMoving();}}}finally{poseBusy=false;}}
 function leave(){const oldToken=token,wasBrowserSolo=!!browserSolo;token=null;controller?.abort();clearInterval(poseTimer);clearInterval(soloTimer);browserSolo=null;state=null;nearest=null;stopMoving();destroyAvatars();garden.district.setState(null);garden.pyramid.setPages(0);hud.hidden=true;$('night-action').hidden=true;$('night-chat').hidden=true;$('night-chat-input').value='';$('night-chat-open').classList.remove('unread');document.body.classList.remove('in-expedition');document.body.style.setProperty('--night-threat','0');flash.intensity=0;if(gain)gain.gain.setTargetAtTime(0,audio.currentTime,.15);if(dialog.open)dialog.close();if($('night-journal').open)$('night-journal').close();if(oldToken&&!wasBrowserSolo)navigator.sendBeacon('/api/expedition',new Blob([JSON.stringify({action:'leave',token:oldToken})],{type:'application/json'}));autoPrompt=true;renderLobby();}
 function spectate(){const list=state?.players.filter(p=>p.status==='alive'&&p.id!==state.selfId)||[];if(!list.length)return;const index=list.findIndex(p=>p.id===spectated);spectated=list[(index+1)%list.length].id;}
 async function collect(){if(!nearest||!live()||busy)return;busy=true;try{receive(await api({action:'collect',page:nearest.id}));}catch(error){$('night-event').textContent=error.message;}finally{busy=false;}}
 function renderJournal(){const entries=layout.pages.filter(p=>state?.collected.includes(p.id));$('night-journal-list').replaceChildren(...entries.map(p=>{const item=document.createElement('li'),title=document.createElement('h3'),body=document.createElement('p');title.textContent=String(p.id+1).padStart(2,'0')+' / '+p.title;body.textContent=p.text;item.append(title,body);return item;}));$('night-journal-empty').hidden=!!entries.length;}
 function sound(){soundOn=!soundOn;$('night-sound').setAttribute('aria-pressed',String(soundOn));if(soundOn&&!audio){audio=new AudioContext();osc=audio.createOscillator();gain=audio.createGain();osc.type='sine';osc.frequency.value=48;gain.gain.value=0;osc.connect(gain).connect(audio.destination);osc.start();}audio?.resume().catch(()=>{});if(!soundOn&&gain)gain.gain.setTargetAtTime(0,audio.currentTime,.15);}
 $('night-launch').onclick=open;$('night-close').onclick=()=>dialog.close();$('night-solo').onclick=()=>join('solo');$('night-create').onclick=()=>join('create');$('night-join-form').onsubmit=e=>{e.preventDefault();join('join');};
 $('night-start').onclick=async()=>{if(busy)return;busy=true;try{receive(await api({action:'start'}));dialog.close();}catch(error){errors(error.message);}finally{busy=false;}};
 $('night-resume').onclick=()=>dialog.close();$('night-return').onclick=$('night-abandon').onclick=()=>{leave();returnHome();};$('night-spectate').onclick=spectate;
 $('night-retry').onclick=()=>{leave();returnHome();open();};
 $('night-chat-open').onclick=()=>{stopMoving();$('night-chat').hidden=!$('night-chat').hidden;$('night-chat-open').classList.remove('unread');if(!$('night-chat').hidden)$('night-chat-input').focus();};$('night-chat-close').onclick=()=>{$('night-chat').hidden=true;$('night-chat-open').focus();};$('night-chat').onfocusin=stopMoving;
 $('night-chat-form').onsubmit=async e=>{e.preventDefault();const input=$('night-chat-input'),text=input.value.trim();if(!text||!token)return;$('night-chat-send').disabled=true;const ticket=token;try{const result=await api({action:'chat',text,nonce:crypto.randomUUID()});if(token===ticket){receive(result);if(input.value.trim()===text)input.value='';}}catch(error){$('night-event').textContent=error.message;}finally{$('night-chat-send').disabled=false;}};
 $('night-action').onclick=collect;$('night-flash').onclick=()=>{flashOn=!flashOn;$('night-flash').setAttribute('aria-pressed',String(flashOn));};$('night-sound').onclick=sound;
 $('night-journal-open').onclick=()=>{stopMoving();renderJournal();$('night-journal').showModal();};$('night-journal-close').onclick=()=>$('night-journal').close();
 document.addEventListener('keydown',e=>{if(!token||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.ctrlKey||e.metaKey)return;if(e.key.toLowerCase()==='e'){e.preventDefault();collect();}if(e.key.toLowerCase()==='f'&&!e.repeat)$('night-flash').click();});
 window.addEventListener('pagehide',leave);
 if(window.showroomDeployment?.mode==='preview')renderLobby();
 else fetch('/api/expedition',{signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).then(data=>{available=!!data?.available;checking=false;renderLobby();}).catch(()=>{checking=false;renderLobby();});
 if(new URLSearchParams(location.search).get('night')==='1')open();
 return {active,leave,open,live,
  canMove:()=>!token||(live()&&connected()),
  constrain(next,previous){if(!token&&next.z< -24){next.copy(previous);if(!autoPrompt){autoPrompt=true;open();}return next;}if(token){if(!live()||!connected())return next.copy(previous);next.x=T.MathUtils.clamp(next.x,layout.bounds[0],layout.bounds[1]);next.z=T.MathUtils.clamp(next.z,layout.bounds[2],layout.bounds[3]);}return next;},
  update(time,dt){if(!token){if(camera.position.z> -18)autoPrompt=false;return;}const self=player();$('night-connection').textContent=connected()?(state.solo?'SOLO':'PARTY '+state.players.length+' / 6'):'Reconnecting...';
   if(self&&self.status!=='alive'&&self.status!=='escaped'){const p=state.players.find(p=>p.id===spectated&&p.status==='alive');if(p)place(p.x,p.z,p.x+Math.sin(p.yaw)*5,p.z+Math.cos(p.yaw)*5);}
   for(const a of avatars.values()){const distance=a.root.position.distanceTo(a.target);a.root.position.lerp(a.target,1-Math.exp(-10*dt));a.root.rotation.y+=Math.atan2(Math.sin(a.yaw-a.root.rotation.y),Math.cos(a.yaw-a.root.rotation.y))*(1-Math.exp(-10*dt));a.animate(time,distance>.025?Math.sin(time*8)*.3:0,0);}
   const w=state.watcher,distance=Math.hypot(camera.position.x-w.x,camera.position.z-w.z),threat=live()?Math.max(self?.dread||0,1-distance/14):0;
   document.body.style.setProperty('--night-threat',String(Math.max(0,threat)*.65));
   $('night-danger').textContent=threat>.7?'HE IS CLOSE':threat>.25?'YOU ARE NOT ALONE':'';
   const direction=new T.Vector3();camera.getWorldDirection(direction);flash.position.copy(camera.position);flash.target.position.copy(camera.position).addScaledVector(direction,10);flash.intensity=flashOn&&live()?20:0;
   if(gain){gain.gain.setTargetAtTime(soundOn&&live()&&!document.hidden ? .009+Math.max(0,threat)*.035 : 0,audio.currentTime,.3);osc.frequency.setTargetAtTime(44+Math.max(0,threat)*22,audio.currentTime,.3);}
   nearest=live()?state.pages.filter(p=>!state.collected.includes(p.id)).find(p=>Math.hypot(p.x-camera.position.x,p.z-camera.position.z)<2.4):null;
   $('night-action').hidden=!nearest||!!document.querySelector('dialog[open]')||!$('night-chat').hidden;if(nearest)$('night-action-label').textContent='Take '+nearest.title;
   const landmark=layout.landmarks.find(s=>Math.abs(camera.position.x-s.x)<s.w/2+3&&Math.abs(camera.position.z-s.z)<s.d/2+3);
   $('night-location').textContent=landmark?.name||'The Processional Road';
  },
  inspect:()=>({available,mode:browserSolo?'browser-solo':available?'server':'solo-ready',active:active(),connected:connected(),state,avatars:avatars.size,nearest:nearest?.id})
 };
};
