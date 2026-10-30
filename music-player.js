'use strict';
window.createGardenMusic=function({requestDraw=()=>{},onOpen=()=>{}}={}){
 const apiBase=window.showroomDeployment?.musicApi||'/api/music/';
 const preview=window.showroomDeployment?.mode==='preview'&&!window.showroomDeployment?.musicApi;
 const hosted=Boolean(window.showroomDeployment?.musicApi);
 const $=id=>document.getElementById(id),dialog=$('music-dialog'),audio=$('garden-audio');
 let state=null,received=0,connected=false,listening=false,busy=false,uploading=false,timer,heartbeat=0,lastQueue='',localVolume=.65;
 let playingPromise=false,attempt=0,failedEntry=null,latency=0,distanceGain=1;
 let liveNotice='',liveSession=null;
 const liveAudio=$('garden-live-audio');
 const live=window.createLiveMusic({audio:liveAudio,onStatus(message){liveNotice=message;render();},onChange(){render();requestDraw();}});
 const studio=window.createStemDeckPanel({onOpen(){dialog.close();onOpen();requestDraw();},onClose:requestDraw,onSoundDesk:open});
 const sourcePosition=new THREE.Vector3(window.showroomAmphitheaterPosition.x,1.3,window.showroomAmphitheaterPosition.z);
 const format=seconds=>{seconds=Math.max(0,Math.floor(seconds||0));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
 function icon(button,name,label){button.innerHTML='<i data-lucide="'+name+'"></i>';button.setAttribute('aria-label',label);button.title=label;window.lucide?.createIcons();}
 function position(){return state?.current?Math.min(state.current.duration,state.position+(state.playing?(performance.now()-received)/1000+latency:0)):0;}
 function render(){
  const mine=connected&&state?.ownsDeck;
  const onAir=Boolean(state?.live||live.publishing);
  $('music-live-status').textContent=liveNotice||(onAir?'Live set / '+(live.publishing?'Broadcasting':listening?'Listening':'Sound off'):'Off air');
  $('music-live').disabled=!live.publishing&&(!mine||state?.liveSupported===false||!live.supported||!$('music-rights').checked||onAir);
  $('music-live').querySelector('span').textContent=live.publishing?'End live set':'Go live';
  $('music-live').title=live.supported?'Broadcast StemDeck tab audio':'Tab audio sharing requires a supported desktop browser such as Chrome or Edge';
  $('music-connection').textContent=preview?'Internet audio awaiting setup':connected?(state.liveSupported===false?'Internet audio awaiting relay setup':state.owner?state.owner.name+' on the decks':'Decks available'):'Sound desk offline';
  $('music-track').textContent=onAir?'Sattari StemDeck live':state?.current?.title||'Nothing playing';
  $('music-credit').textContent=onAir?(state?.owner?.name||'DJ')+' / '+(state?.live?.listeners||0)+' listening':state?.current?'Shared by '+state.current.uploader:'The amphitheater';
  $('music-listen').setAttribute('aria-pressed',String(listening));
  $('music-listen').querySelector('span').textContent=listening?'Listening':'Listen';
  $('music-listen').disabled=!connected;
  $('music-connect').textContent=mine?'Disconnect decks':state?.owner?'Decks occupied':state?.canConnect?'Connect to speakers':'Sign in / create character';
  $('music-connect').disabled=busy||!connected||state?.liveSupported===false||Boolean(state?.owner&&!mine);
  $('music-upload').disabled=!mine||uploading||!state?.uploadSupported||!$('music-rights').checked;
  $('music-play').disabled=onAir||!mine||busy||!state?.current;
  $('music-skip').disabled=onAir||!mine||busy||!state?.current;
  $('music-seek').disabled=onAir||!mine||!state?.current||busy;
  $('music-seek').max=state?.current?.duration||1;
  if(document.activeElement!==$('music-seek'))$('music-seek').value=position();
  $('music-elapsed').textContent=format(position());$('music-duration').textContent=format(state?.current?.duration);
  const desired=state?.playing?'pause':'play';if($('music-play').dataset.icon!==desired){icon($('music-play'),desired,state?.playing?'Pause room music':'Play room music');$('music-play').dataset.icon=desired;}
  $('music-queue-count').textContent=(state?.queue.length||0)+' / '+(state?.queueLimit||12);
  const queueKey=JSON.stringify([state?.queue,mine,busy]);
  if(queueKey!==lastQueue){lastQueue=queueKey;$('music-queue').replaceChildren();
   for(const track of state?.queue||[]){const li=document.createElement('li'),name=document.createElement('span'),duration=document.createElement('small'),remove=document.createElement('button');name.textContent=track.title;duration.textContent=format(track.duration);remove.className='icon-button';remove.disabled=!mine||busy;remove.title='Remove '+track.title;remove.setAttribute('aria-label',remove.title);remove.innerHTML='<i data-lucide="x"></i>';remove.onclick=()=>command('remove',{entryId:track.entryId});li.append(name,duration,remove);$('music-queue').append(li);}window.lucide?.createIcons();
  }
  $('music-empty').hidden=Boolean(state?.queue.length);
  $('music-upload-format').textContent=hosted?'Live sets / up to 50 minutes':state&&!state.uploadSupported?'Audio validation unavailable':'MP3 / WAV / OGG · 40 MB · 20 min';
  $('music-upload').hidden=hosted;
  if(hosted){
   for(const selector of ['.music-timeline','.music-queue-heading','#music-queue','#music-empty','#music-play','#music-skip'])dialog.querySelector(selector).hidden=true;
   dialog.querySelector('.music-rights').hidden=!mine;
  }
 }
 async function synchronize(){
  live.update(connected?state:null,listening);
  if(state?.live||live.publishing){audio.pause();return;}
  if(!listening||!connected||!state?.current){audio.pause();return;}
  const track=state.current;
  if(audio.dataset.entry!==track.entryId){audio.pause();attempt++;playingPromise=false;failedEntry=null;audio.dataset.entry=track.entryId;audio.src=track.url;audio.load();}
  if(audio.readyState>=1&&Number.isFinite(audio.duration)){
   const target=Math.min(position(),Math.max(0,audio.duration-.03));
   if(Math.abs(audio.currentTime-target)>.65)audio.currentTime=target;
  }
  if(!state.playing){audio.pause();return;}
  if(audio.paused&&!playingPromise&&failedEntry!==track.entryId){
   const currentAttempt=++attempt;playingPromise=true;
   try{await audio.play();}
   catch(error){if(currentAttempt!==attempt||error.name==='AbortError')return;listening=false;$('music-error').textContent=error.name==='NotAllowedError'?'Tap Listen to enable sound.':'This browser could not play the track. Try MP3 or WAV.';render();}
   finally{if(currentAttempt===attempt)playingPromise=false;}
   if(!listening||!connected||!state?.playing)audio.pause();
  }
 }
 function accept(data,sent=performance.now()){
  if(state&&data.epoch===state.epoch&&data.serverTime<state.serverTime)return;
  state=data;received=performance.now();latency=Math.min(.5,(received-sent)/2000);connected=true;
  if(liveSession!==(data.live?.id||null)){liveSession=data.live?.id||null;liveNotice='';}
  render();synchronize();requestDraw();
 }
 async function json(url,options={}){const response=await fetch(url,{cache:'no-store',...options,signal:options.signal||AbortSignal.timeout(8000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Sound desk unavailable.');return result;}
 async function command(action,extra={}){
  if(busy)return;busy=true;$('music-error').textContent='';render();const sent=performance.now();
  try{accept(await json(apiBase+'control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,epoch:state?.epoch,revision:state?.revision,...extra})}),sent);}
  catch(error){$('music-error').textContent=error.message;}
  finally{busy=false;render();}
 }
 async function poll(){
  const sent=performance.now();
  try{accept(await json(apiBase+'state'),sent);
   if(state.ownsDeck&&performance.now()-heartbeat>10000&&!busy){heartbeat=performance.now();await command('heartbeat');}
  }catch(error){connected=false;audio.pause();live.update(null,false);$('music-connection').textContent='Reconnecting to the sound desk';render();}
  timer=setTimeout(poll,document.hidden?3000:1200);
 }
 function open(){studio.close();onOpen();render();if(!dialog.open)dialog.showModal();}
 function openDeck(){studio.open();}
 $('music-stemdeck').onclick=openDeck;
 $('open-music').onclick=open;$('music-prompt').onclick=openDeck;$('close-music').onclick=()=>dialog.close();
 $('music-live').onclick=async()=>{liveNotice='';if(live.publishing)await live.stop();else if(state?.ownsDeck&&$('music-rights').checked){audio.pause();liveAudio.pause();listening=false;await live.start();}try{accept(await json(apiBase+'state'));}catch(error){$('music-error').textContent=error.message;}};
 dialog.addEventListener('close',requestDraw);
 $('music-connect').onclick=()=>{if(!state?.canConnect){dialog.close();$('character-launcher').click();return;}command(state.ownsDeck?'release':'claim');};
 $('music-listen').onclick=()=>{listening=!listening;if(failedEntry)audio.load();failedEntry=null;$('music-error').textContent='';if(listening){if(liveAudio.srcObject)liveAudio.play().catch(()=>{});synchronize();}else{attempt++;playingPromise=false;audio.pause();live.update(state,false);}render();};
 $('music-play').onclick=()=>command(state.playing?'pause':'play');
 $('music-skip').onclick=()=>command('skip');
 $('music-seek').onchange=()=>command('seek',{position:Math.min(Number($('music-seek').value),Math.max(0,(state.current?.duration||1)-.1))});
 $('music-volume').oninput=()=>{localVolume=Number($('music-volume').value)/100;audio.volume=liveAudio.volume=localVolume*distanceGain;$('music-volume-value').textContent=Math.round(localVolume*100)+'%';};
 $('music-rights').onchange=render;
 $('music-upload').onclick=()=>$('music-files').click();
 $('music-files').onchange=async()=>{
  const files=[...$('music-files').files];$('music-files').value='';if(!files.length||uploading)return;
  if(!state?.ownsDeck||!$('music-rights').checked)return;
  uploading=true;render();
  try{
   if(files.length>5)throw Error('Choose up to five tracks at a time.');
   for(const file of files){
    if(!/\.(mp3|wav|ogg)$/i.test(file.name)||file.size>40*1024*1024||!file.size)throw Error('Choose MP3, WAV, or OGG files smaller than 40 MB.');
    $('music-error').textContent='Uploading '+file.name+'...';
    const sent=performance.now();accept(await json('/api/music/upload?rights=1&name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(90000)}),sent);
   }
   $('music-error').textContent='Added to the queue.';
  }catch(error){$('music-error').textContent=error.message;}
  finally{uploading=false;render();}
 };
 audio.addEventListener('loadedmetadata',synchronize);
 audio.addEventListener('error',()=>{if(audio.dataset.entry){failedEntry=audio.dataset.entry;$('music-error').textContent='Audio unavailable. Retry listening, or ask the DJ to skip this track.';}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){synchronize();requestDraw();}});
 if(preview)render();else poll();
 return {open,openDeck,update(camera){const distance=camera.position.distanceTo(sourcePosition);distanceGain=Math.max(0,Math.min(1,(38-distance)/22));audio.volume=liveAudio.volume=localVolume*distanceGain;if(dialog.open)render();},
  inspect(){return {connected,listening,playing:Boolean(state?.playing||state?.live),live:live.inspect(),current:state?.current?.title||null,position:position(),audioTime:audio.currentTime,paused:audio.paused,volume:audio.volume,ownsDeck:Boolean(state?.ownsDeck),revision:state?.revision};},
  get playing(){return Boolean(connected&&(state?.playing||state?.live));}
 };
};
