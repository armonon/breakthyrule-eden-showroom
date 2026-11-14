'use strict';
window.createExpedition=function({T,scene,camera,garden,getPose,place,stopMoving,requestDraw,returnHome,layout,onAction=()=>{},preferences=()=>null,entryUrl=null,correct=null,getCharacter=()=>window.GardenPlayerCharacter}){
 const $=id=>document.getElementById(id),dialog=$('night-dialog'),hud=$('night-hud'),avatars=new Map();
 let token=null,state=null,available=false,busy=false,seq=0,controller=null,streamTask=null,streamTime=0,poseTimer=0,poseBusy=false,lastSnapshot=0,nearest=null,autoPrompt=false,spectated=null,flashOn=true,soundOn=false,audio=null,osc=null,gain=null,disposed=false,browserSolo=null,soloTimer=0;
 let sharedWorldCache=null,suspended=false,roomVersion=null;
 let generation=0,requestAbort=new AbortController();const eventAbort=new AbortController();
 const STORAGE_KEY="eden-expedition-session-v2";
 function remember(value){try{if(value)sessionStorage.setItem(STORAGE_KEY,JSON.stringify({token:value,generation:roomVersion||undefined}));else sessionStorage.removeItem(STORAGE_KEY);}catch{}}
 function savedToken(){try{const raw=sessionStorage.getItem(STORAGE_KEY);if(!raw)return null;try{const saved=JSON.parse(raw);return typeof saved.token==='string'?saved:null;}catch{return {token:raw,generation:null};}}catch{return null;}}
 let checking=!entryUrl&&window.showroomDeployment?.mode!=='preview';
 const flash=new T.SpotLight(0xe4e9d9,0,24,.43,.65,1.4);flash.target=new T.Object3D();scene.add(flash,flash.target);
 const flareLight=new T.PointLight(0xff8940,0,18,2);scene.add(flareLight);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const player=()=>state?.players.find(p=>p.id===state.selfId);
 const active=()=>!!token;
 const live=()=>!!state&&['playing','exploration','countdown','hunt'].includes(state.phase)&&player()?.status==='alive';
 const exploring=()=>live()&&state.huntStarted===false;
 const nearBell=()=>{const p=getPose();return exploring()&&!state.countdownUntil&&state.bell&&p&&Math.hypot(p.x-state.bell.x,(p.y||0)-(state.bell.y||0),p.z-state.bell.z)<2.4;};
 const connected=()=>!!token&&performance.now()-streamTime<4000;
 function errors(text){$('night-error').textContent=text;}
 async function api(data){const pose=['flare','reload','collect','ring-bell'].includes(data.action)?getPose():null;if(pose)data={...data,pose:{...pose,flash:flashOn},seq:++seq};if(browserSolo)return browserSolo.command(data);const response=await fetch('/api/expedition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,token,generation:roomVersion||undefined}),signal:AbortSignal.any([AbortSignal.timeout(8000),requestAbort.signal])});const result=await response.json();if(!response.ok)throw new Error(result.error||'The expedition service is unavailable.');return result;}
 function open(){if(entryUrl){location.assign(entryUrl);return;}if(!available&&!checking&&window.showroomDeployment?.mode!=='preview')probeService();stopMoving();errors('');if(!dialog.open)dialog.showModal();renderLobby();}
 function renderLobby(){
  $('night-create').disabled=$('night-join').disabled=!available||busy||!!token;
  $('night-join-code').disabled=!available||busy||!!token;
  $('night-solo').disabled=checking||(!available&&!window.createSoloExpedition)||busy||!!token;
  $('night-service').textContent=checking?'Connecting...':available?'EXPEDITION SERVICE / 1-6 PLAYERS':'SOLO EXPEDITION / MULTIPLAYER NOT CONNECTED';
  $('night-room').hidden=!token;$('night-entry').hidden=!!token;
  $('night-start').hidden=!state||state.phase!=='lobby'||state.host!==state.selfId;
  const ready=$('night-ready');if(ready){ready.hidden=!state||state.solo||state.huntStarted||!!state.countdownUntil;ready.textContent=player()?.ready?'Ready ✓':'Ready up';ready.disabled=busy;}
  $('night-start').disabled=busy||!!state?.players.some(p=>p.status==='alive'&&!p.ready);
  $('night-code').textContent=state?state.code:'';
  $('night-resume').hidden=!state||state.phase==='lobby';
  if(state){$('night-party').replaceChildren(...state.players.map(p=>{const li=document.createElement('li');li.textContent=p.name+(p.id===state.host?' / Leader':'')+(p.id===state.selfId?' / You':'')+(p.ready?' / Ready':' / Not ready')+(p.connected===false?' / Reconnecting':'');return li;}));}
 }
 function destroyAvatars(){for(const entry of avatars.values())GardenCharacter.dispose(entry);avatars.clear();}
 function receive(value){
  if(!token)return;
  if(roomVersion&&value.generation&&value.generation!==roomVersion)return;
  if(value.generation)roomVersion=value.generation;
  if(state&&value.serverTime<state.serverTime)return;
  const old=state,oldStatus=player()?.status;const {token:privateToken,...snapshot}=value;state=snapshot;streamTime=performance.now();lastSnapshot=streamTime;
  garden.district.setState(state);garden.pyramid.setPages(state.collected.length);hud.hidden=false;document.body.classList.add('in-expedition');
  $('night-count').textContent=String(state.collected.length).padStart(2,'0')+' / 08';
  $('night-event').textContent=state.message;
  $('night-chat-open').hidden=state.solo;
  if(JSON.stringify(old?.chat)!==JSON.stringify(state.chat)){
   const log=$('night-chat-log'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<50;
   log.replaceChildren(...(state.chat||[]).map(m=>{const li=document.createElement('li'),name=document.createElement('strong'),text=document.createElement('span');name.textContent=m.name;text.textContent=m.text;li.append(name,text);return li;}));if(atBottom)log.scrollTop=log.scrollHeight;
   if(old&&$('night-chat').hidden&&(state.chat||[]).length)$('night-chat-open').classList.add('unread');
  }
  $('night-phase').textContent=state.phase==='lobby'?'GATHERING':state.countdownUntil?'HUNT IN '+Math.max(0,Math.ceil(state.countdownUntil-state.serverTime))+'s':state.huntStarted===false?'EXPLORE / RING THE TEMPLE BELL':state.collected.length===8?'REACH THE PYRAMID':'THE LOST PAGES';
  const self=player();if(!self)return;
  const previousSelf=old?.players.find(p=>p.id===state.selfId);
  if(previousSelf&&self.flareFiredAt!=null&&self.flareFiredAt!==previousSelf.flareFiredAt)onAction('flare');
  if(self.reloadUntil&&self.reloadUntil!==previousSelf?.reloadUntil)onAction('reload');
  else if(previousSelf?.reloadUntil&&!self.reloadUntil)onAction('reload-end');
  if(old?.phase==='lobby'&&state.phase==='playing'){dialog.close();place(self.x,self.z,self.x,self.z-5,self.y||0);}
  const present=new Set();
  for(const p of state.players){if(p.id===state.selfId||p.status!=='alive')continue;present.add(p.id);let a=avatars.get(p.id);if(!a){a=GardenCharacter.create(T,p.character,!p.character);scene.add(a.root);a.root.position.set(p.x,p.y||0,p.z);avatars.set(p.id,a);}a.target=new T.Vector3(p.x,p.y||0,p.z);a.yaw=p.yaw;}
  for(const [id,a] of avatars)if(!present.has(id)){GardenCharacter.dispose(a);avatars.delete(id);}
  const ended=state.phase==='won'||state.phase==='lost',out=self.status!=='alive';
  $('night-outcome').hidden=!(ended||out);
  $('night-outcome-title').textContent=self.status==='escaped'?'You reached the ceremony':self.status==='caught'?'The Attendant found you':self.status==='lost'?'Contact lost':state.phase==='won'?'The ceremony has begun':'No one returned';
  $('night-spectate').hidden=ended||self.status==='escaped'||!state.players.some(p=>p.status==='alive'&&p.id!==state.selfId);
  if(out&&oldStatus!==self.status){stopMoving();if(self.status==='escaped')place(11.7,-117,11.7,-133);else spectate();}
  if(ended)stopMoving();
  // Only correct a meaningful disagreement, not normal in-flight movement prediction.
  const pose=getPose();if(live()&&pose&&self.seq>=seq-2&&(self.poseRejected||Math.hypot(pose.x-self.x,pose.z-self.z)>2.4||Math.abs((pose.y||0)-(self.y||0))>1.4)){if(correct)correct(self);else place(self.x,self.z,self.x+Math.sin(self.yaw)*5,self.z+Math.cos(self.yaw)*5,self.y||0);}
  if(dialog.open)renderLobby();
  if(JSON.stringify(old?.collected)!==JSON.stringify(state.collected))renderJournal();
  requestDraw();
 }
 async function stream(){
  if(streamTask||!token||browserSolo||suspended)return;
  const ticket=token,epoch=generation;controller=new AbortController();const signal=controller.signal;
  streamTask=(async()=>{while(token===ticket&&generation===epoch&&!signal.aborted){try{const r=await fetch('/api/expedition/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:ticket,generation:roomVersion||undefined}),signal});if(!r.ok)throw new Error('Stream unavailable');const reader=r.body.getReader(),decoder=new TextDecoder();let pending='';while(token===ticket&&generation===epoch){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true});let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(line&&token===ticket&&generation===epoch)receive(JSON.parse(line));}}}catch(error){if(signal.aborted)break;$('night-connection').textContent='Reconnecting...';}if(token===ticket&&generation===epoch&&!signal.aborted)await new Promise(resolve=>setTimeout(resolve,1200));}})();
  try{await streamTask;}finally{streamTask=null;if(token&&!browserSolo&&!suspended)stream();}
 }
 async function join(action){
  if(busy||token)return;const ticket=++generation;requestAbort.abort();requestAbort=new AbortController();busy=true;state=null;roomVersion=null;renderLobby();errors('');
  try{
   if(action==='solo'&&window.createSoloExpedition)browserSolo=window.createSoloExpedition({layout,roofs:window.edenRoofs});
   const data=await api({action,code:$('night-join-code').value.trim(),...(browserSolo?{name:window.GardenPlayerName||undefined,character:getCharacter()||undefined}:{})});if(ticket!==generation)return;
   token=data.token;roomVersion=data.generation||null;seq=0;flashOn=true;if(!browserSolo)remember(token);$('night-flash').setAttribute('aria-pressed','true');receive(data);
   const p=player();place(p.x,p.z,p.x,p.z-5,p.y||0);
   if(browserSolo)soloTimer=setInterval(()=>{if(browserSolo&&token)receive(browserSolo.tick());},100);else stream();
   if(data.phase!=='lobby')dialog.close();poseTimer=setInterval(sendPose,120);
  }catch(error){if(ticket===generation){if(!token)browserSolo=null;errors(error.message);}}
  finally{if(ticket===generation){busy=false;renderLobby();}}
 }
 async function resumeSaved(){
  const saved=savedToken();if(!saved||token||busy||!available)return;
  const ticket=++generation;token=saved.token;roomVersion=saved.generation;busy=true;state=null;
  try{const data=await api({action:'resume'});if(ticket!==generation||disposed)return;receive(data);seq=(player()?.seq||0)+1;stream();poseTimer=setInterval(sendPose,120);const p=player();place(p.x,p.z,p.x,p.z-5,p.y||0);}
  catch(error){if(ticket===generation&&!disposed){token=null;remember(null);errors('Previous room could not be resumed: '+error.message);}}
  finally{if(ticket===generation){busy=false;renderLobby();}}
 }
 async function sendPose(){if(!token||poseBusy)return;poseBusy=true;const ticket=token,epoch=generation;try{const pose=getPose();if(!pose)return;const result=await api({action:'pose',seq:++seq,pose:{...pose,flash:flashOn}});if(token===ticket&&generation===epoch)receive(result);}catch(error){if(token===ticket&&generation===epoch){$('night-connection').textContent=error.message;if(performance.now()-lastSnapshot>12000){$('night-outcome').hidden=false;$('night-outcome-title').textContent='Connection lost';stopMoving();}}}finally{if(generation===epoch)poseBusy=false;}}
 function leave(){const oldToken=token,wasBrowserSolo=!!browserSolo;generation++;requestAbort.abort();requestAbort=new AbortController();busy=false;poseBusy=false;remember(null);onAction('leave');token=null;controller?.abort();clearInterval(poseTimer);clearInterval(soloTimer);browserSolo=null;state=null;nearest=null;stopMoving();destroyAvatars();garden.district.setState(null);garden.pyramid.setPages(0);hud.hidden=true;$('night-action').hidden=true;$('night-chat').hidden=true;$('night-chat-input').value='';$('night-chat-open').classList.remove('unread');document.body.classList.remove('in-expedition');document.body.style.setProperty('--night-threat','0');flash.intensity=0;flareLight.intensity=0;if(gain)gain.gain.setTargetAtTime(0,audio.currentTime,.15);if(dialog.open)dialog.close();if($('night-journal').open)$('night-journal').close();if(oldToken&&!wasBrowserSolo)navigator.sendBeacon('/api/expedition',new Blob([JSON.stringify({action:'leave',token:oldToken})],{type:'application/json'}));autoPrompt=true;renderLobby();}
 function spectate(){const list=state?.players.filter(p=>p.status==='alive'&&p.id!==state.selfId)||[];if(!list.length)return;const index=list.findIndex(p=>p.id===spectated);spectated=list[(index+1)%list.length].id;}
 async function collect(){
  if(!live()||busy)return;
  const bell=nearBell();if(!bell&&(!nearest||exploring()))return;
  const pageId=nearest?.id;if(bell)onAction('interact');
  busy=true;const ticket=token,epoch=generation;
  try{const result=await api(bell?{action:'ring-bell'}:{action:'collect',page:nearest.id});if(token===ticket&&generation===epoch){const newlyCollected=!bell&&!state.collected.includes(pageId)&&result.collected.includes(pageId);receive(result);if(newlyCollected)onAction('pickup');}}
  catch(error){if(token===ticket&&generation===epoch)$('night-event').textContent=error.message;}finally{if(generation===epoch)busy=false;}
 }
 async function fireFlare(){
  if(!live()||exploring()||busy)return;
  busy=true;const ticket=token,epoch=generation;
  try{const result=await api({action:'flare',aimAssist:preferences()?.aimAssist===true});if(token===ticket&&generation===epoch)receive(result);}
  catch(error){if(token===ticket&&generation===epoch)$('night-event').textContent=error.message;}finally{if(generation===epoch)busy=false;}
 }
 async function roomAction(action,extra={}){if(!token||busy)return;busy=true;const ticket=token,epoch=generation;try{const result=await api({action,...extra});if(token===ticket&&generation===epoch){receive(result);if(action==='reset-exploration'){const p=player();place(p.x,p.z,p.x,p.z-5,p.y||0);}}}catch(error){if(token===ticket&&generation===epoch)$('night-event').textContent=error.message;}finally{if(generation===epoch)busy=false;renderLobby();}}
 function renderJournal(){const entries=layout.pages.filter(p=>state?.collected.includes(p.id));$('night-journal-list').replaceChildren(...entries.map(p=>{const item=document.createElement('li'),title=document.createElement('h3'),body=document.createElement('p');title.textContent=String(p.id+1).padStart(2,'0')+' / '+p.title;body.textContent=p.text;item.append(title,body);return item;}));$('night-journal-empty').hidden=!!entries.length;}
 function sound(){soundOn=!soundOn;$('night-sound').setAttribute('aria-pressed',String(soundOn));if(soundOn&&!audio){audio=new AudioContext();osc=audio.createOscillator();gain=audio.createGain();osc.type='sine';osc.frequency.value=48;gain.gain.value=0;osc.connect(gain).connect(audio.destination);osc.start();}audio?.resume().catch(()=>{});if(!soundOn&&gain)gain.gain.setTargetAtTime(0,audio.currentTime,.15);}
 $('night-launch').onclick=open;$('night-close').onclick=()=>dialog.close();$('night-solo').onclick=()=>join('solo');$('night-create').onclick=()=>join('create');$('night-join-form').onsubmit=e=>{e.preventDefault();join('join');};
 $('night-start').onclick=()=>roomAction('start');
 $('night-resume').onclick=()=>dialog.close();$('night-return').onclick=$('night-abandon').onclick=()=>{leave();returnHome();};$('night-spectate').onclick=spectate;
 $('night-retry').onclick=()=>{leave();returnHome();open();};
 $('night-chat-open').onclick=()=>{stopMoving();$('night-chat').hidden=!$('night-chat').hidden;$('night-chat-open').classList.remove('unread');if(!$('night-chat').hidden)$('night-chat-input').focus();};$('night-chat-close').onclick=()=>{$('night-chat').hidden=true;$('night-chat-open').focus();};$('night-chat').onfocusin=stopMoving;
 $('night-chat-form').onsubmit=async e=>{e.preventDefault();const input=$('night-chat-input'),text=input.value.trim();if(!text||!token)return;$('night-chat-send').disabled=true;const ticket=token,epoch=generation;try{const result=await api({action:'chat',text,nonce:crypto.randomUUID()});if(token===ticket&&generation===epoch){receive(result);if(input.value.trim()===text)input.value='';}}catch(error){$('night-event').textContent=error.message;}finally{$('night-chat-send').disabled=false;}};
 if($('night-reset'))$('night-reset').onclick=()=>roomAction('reset-exploration');
 if($('night-ready'))$('night-ready').onclick=()=>roomAction('ready',{ready:!player()?.ready});if($('night-reload'))$('night-reload').onclick=()=>roomAction('reload');$('night-action').onclick=collect;if($('night-flare'))$('night-flare').onclick=fireFlare;$('night-flash').onclick=()=>{flashOn=!flashOn;$('night-flash').setAttribute('aria-pressed',String(flashOn));};$('night-sound').onclick=sound;
 $('night-journal-open').onclick=()=>{stopMoving();renderJournal();$('night-journal').showModal();};$('night-journal-close').onclick=()=>$('night-journal').close();
 document.addEventListener('keydown',e=>{if(!token||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.ctrlKey||e.metaKey)return;if(e.key.toLowerCase()==='e'&&!e.repeat){e.preventDefault();collect();}if(e.key.toLowerCase()==='f'&&!e.repeat)$('night-flash').click();if(e.key.toLowerCase()==='g'&&!e.repeat){e.preventDefault();fireFlare();}if(e.key.toLowerCase()==='r'&&!e.repeat){e.preventDefault();roomAction('reload');}},{signal:eventAbort.signal});
 window.addEventListener('pagehide',()=>{if(disposed)return;suspended=true;if(browserSolo)leave();else{controller?.abort();clearInterval(poseTimer);remember(token);}},{signal:eventAbort.signal});
 window.addEventListener('pageshow',event=>{if(disposed)return;suspended=false;if(event.persisted&&token&&!browserSolo){clearInterval(poseTimer);poseTimer=setInterval(sendPose,120);stream();roomAction('sync');requestDraw();}},{signal:eventAbort.signal});
 let probeAttempts=0,probeTimer=null;
 async function probeService(){
  if(disposed)return;checking=true;renderLobby();probeAttempts++;
  try{const response=await fetch('/api/expedition',{signal:AbortSignal.timeout(15000)});const data=response.ok?await response.json():null;available=!!data?.available;}
  catch{available=false;}
  finally{checking=false;if(disposed)return;renderLobby();if(available)resumeSaved();else if(probeAttempts<4){clearTimeout(probeTimer);probeTimer=setTimeout(probeService,2000);}}
 }
 if(entryUrl||window.showroomDeployment?.mode==='preview')renderLobby();else probeService();

 return {active,leave,open,live,dispose({preserveSession=false}={}){if(disposed)return;if(preserveSession&&!browserSolo)remember(token);else leave();disposed=true;suspended=true;eventAbort.abort();clearTimeout(probeTimer);requestAbort.abort();controller?.abort();clearInterval(poseTimer);clearInterval(soloTimer);audio?.close().catch(()=>{});scene.remove?.(flash,flash.target,flareLight);destroyAvatars();},interrupt:reason=>roomAction("interrupt",{reason}),world:()=>browserSolo?.world||(sharedWorldCache??=window.createExpeditionWorld?.({layout,roofs:window.edenRoofs})),
  canMove:()=>!token||(live()&&connected()),
  constrain(next,previous){if(!token&&next.z< -24){next.copy(previous);if(!autoPrompt){autoPrompt=true;open();}return next;}if(token){if(!live()||!connected())return next.copy(previous);next.x=T.MathUtils.clamp(next.x,layout.bounds[0],layout.bounds[1]);next.z=T.MathUtils.clamp(next.z,layout.bounds[2],layout.bounds[3]);}return next;},
  update(time,dt){if(!token||!state){if(camera.position.z> -18)autoPrompt=false;return;}const self=player();$('night-connection').textContent=connected()?(state.solo?'SOLO':'PARTY '+state.players.length+' / 6'):'Reconnecting...';
   if(self&&self.status!=='alive'&&self.status!=='escaped'){const p=state.players.find(p=>p.id===spectated&&p.status==='alive');if(p)place(p.x,p.z,p.x+Math.sin(p.yaw)*5,p.z+Math.cos(p.yaw)*5,p.y||0);}
   for(const a of avatars.values()){const distance=a.root.position.distanceTo(a.target);a.root.position.lerp(a.target,1-Math.exp(-10*dt));a.root.rotation.y+=Math.atan2(Math.sin(a.yaw-a.root.rotation.y),Math.cos(a.yaw-a.root.rotation.y))*(1-Math.exp(-10*dt));a.animate(time,distance>.025?Math.sin(time*8)*.3:0,0);}
   const w=state.watcher,distance=Math.hypot(camera.position.x-w.x,camera.position.z-w.z),threat=live()&&!exploring()?Math.max(self?.dread||0,1-distance/14):0;
   document.body.style.setProperty('--night-threat',String(Math.max(0,threat)*.65));
   $('night-danger').textContent=threat>.7?'HE IS CLOSE':threat>.25?'YOU ARE NOT ALONE':'';
   const direction=new T.Vector3();camera.getWorldDirection(direction);flash.position.copy(camera.position);flash.target.position.copy(camera.position).addScaledVector(direction,10);flash.intensity=flashOn&&live()?20:0;
   if(gain){gain.gain.setTargetAtTime(soundOn&&live()&&!document.hidden ? .009+Math.max(0,threat)*.035 : 0,audio.currentTime,.3);osc.frequency.setTargetAtTime(44+Math.max(0,threat)*22,audio.currentTime,.3);}
   const now=state.serverTime+(performance.now()-lastSnapshot)/1000;
   const flareAge=self?.flareFiredAt==null?Infinity:Math.max(0,now-self.flareFiredAt);
   flareLight.position.copy(camera.position).addScaledVector(direction,1.5);
   // A brief, smoothly fading light rather than a flashing screen overlay.
   flareLight.intensity=live()?Math.max(0,1-flareAge/(reduced?.35:.8))*12:0;
   const flareButton=$('night-flare');
   if(flareButton){
    flareButton.hidden=!live();
    const cooldown=Math.max(0,Math.ceil((self?.flareReadyAt||0)-now));
    flareButton.disabled=!live()||exploring()||busy||!(self?.magazine??self?.flares)||cooldown>0||!!self?.reloadUntil;
    flareButton.textContent='G · '+(self?.magazine??self?.flares??0)+' loaded · '+(self?.reserve??0)+' reserve'+(self?.reloadUntil?' · reloading':cooldown?' · '+cooldown+'s':'');
    flareButton.setAttribute('aria-label','Fire nonlethal flare. '+(self?.flares??0)+' remaining'+(cooldown?', ready in '+cooldown+' seconds':''));
   }
   const viewButton=$('night-view');if(viewButton)viewButton.hidden=!live();
   const bail=$('night-bail');if(bail){bail.hidden=!live();const key=(preferences()?.bailKey||'b').toUpperCase();bail.textContent=key+(getPose()?.mode==='ragdoll'?' · Get up':' · Bail');bail.title='Manual bail / recover ('+key+')';}
   const reset=$('night-reset');if(reset){reset.hidden=!state.solo||!exploring();reset.disabled=busy||!!state.countdownUntil;}
   const reload=$('night-reload');if(reload){reload.hidden=!live();reload.disabled=busy||exploring()||!!self?.reloadUntil||!(self?.reserve>0)||self?.magazine>=2;}
   const pose=getPose()||camera.position;
   nearest=live()&&!exploring()?state.pages.filter(p=>!state.collected.includes(p.id)).find(p=>Math.hypot(p.x-pose.x,(p.y||0)-(pose.y||0),p.z-pose.z)<2.4):null;
   const bell=nearBell();
   $('night-action').hidden=(!nearest&&!bell)||!!document.querySelector('dialog[open]')||!$('night-chat').hidden;if(bell)$('night-action-label').textContent='Ring temple bell · Begin hunt';else if(nearest)$('night-action-label').textContent='Take '+nearest.title;
   const landmark=layout.landmarks.find(s=>Math.abs(camera.position.x-s.x)<s.w/2+3&&Math.abs(camera.position.z-s.z)<s.d/2+3);
   $('night-location').textContent=landmark?.name||'The Processional Road';
  },
  inspect:()=>({available,mode:browserSolo?'browser-solo':available?'server':'solo-ready',active:active(),connected:connected(),state,avatars:avatars.size,nearest:nearest?.id})
 };
};
