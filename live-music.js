'use strict';
window.createLiveMusic=function({audio,onStatus=()=>{},onChange=()=>{}}){
 let credential=null,capture=null,room=null,wanted=false,starting=false,stopping=false,generation=0,ack=0,timer=null;
 const peers=new Map(),endpoint=(window.showroomDeployment?.musicApi||'/api/music/')+'live';
 let failures=0;
 const supported=Boolean(navigator.mediaDevices?.getDisplayMedia&&window.RTCPeerConnection);
 async function api(data){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Live audio unavailable.');return result;
 }
 const identity=c=>({token:c.token,peer:c.peer,session:c.session});
 const send=data=>api({...identity(credential),...data});
 function closePeers(){for(const pc of peers.values())pc.close();peers.clear();audio.pause();audio.srcObject=null;}
 async function stop(notify=true){
  const previous=credential;generation++;credential=null;ack=0;clearTimeout(timer);closePeers();
  const stream=capture;capture=null;stream?.getTracks().forEach(t=>t.stop());
  if(notify&&previous){try{await api({...identity(previous),action:'leave'});}catch(error){onStatus(error.message);}}
  onChange();
 }
 async function description(pc,type){
  await pc.setLocalDescription(await (type==='offer'?pc.createOffer():pc.createAnswer()));
  if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',change);reject(Error('Audio connection timed out.'));},7000);
   function change(){if(pc.iceGatheringState==='complete'){clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',change);resolve();}}
   pc.addEventListener('icegatheringstatechange',change);change();
  });
  return pc.localDescription.toJSON();
 }
 function connection(id){
  const pc=new RTCPeerConnection({iceServers:credential?.iceServers||[],iceTransportPolicy:credential?.iceTransportPolicy||'all'});peers.set(id,pc);
  pc.ontrack=e=>{if(!capture&&wanted){audio.srcObject=new MediaStream([e.track]);audio.play().catch(()=>onStatus('Tap Listen again to enable live sound.'));}};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed')onStatus('Live audio connection failed. Reconnect to listen.');};
  return pc;
 }
 async function loop(version){
  if(!credential||version!==generation)return;
  if(credential.endsAt&&Date.now()>=credential.endsAt){onStatus('This 50-minute set has ended. Start a new set to continue.');await stop();return;}
  try{
   const result=await send({action:'poll',ack});if(version!==generation)return;
   failures=0;
   if(capture){
    for(const [id,pc] of peers)if(!result.peers.includes(id)){pc.close();peers.delete(id);}
    for(const id of result.peers){
     if(peers.has(id))continue;
     const pc=connection(id);for(const track of capture.getAudioTracks())pc.addTrack(track,capture);
     // Gathering ICE for one listener must not delay the host heartbeat or other listeners.
     (async()=>{
      const offer=await description(pc,'offer');if(version!==generation||peers.get(id)!==pc)return;
      for(const sender of pc.getSenders()){const params=sender.getParameters();if(params.encodings?.length){params.encodings[0].maxBitrate=128000;await sender.setParameters(params);}}
      await send({action:'send',to:id,description:offer});
     })().catch(()=>{if(version===generation)onStatus('A listener could not connect. They can tap Listen to reconnect.');});
    }
   }
   for(const event of result.events){
    if(version!==generation)return;
    if(event.description.type==='offer'&&!capture){
     closePeers();const pc=connection(event.from);await pc.setRemoteDescription(event.description);
     const answer=await description(pc,'answer');if(version!==generation)return;
     await send({action:'send',to:event.from,description:answer});
    }else if(event.description.type==='answer'&&capture){
     const pc=peers.get(event.from);if(pc?.signalingState==='have-local-offer')await pc.setRemoteDescription(event.description);
    }
    ack=event.seq;
   }
   if(version===generation)timer=setTimeout(()=>loop(version),900);
  }catch(error){if(version===generation){onStatus(error.message);if(++failures<3)timer=setTimeout(()=>loop(version),1500);else await stop();}}
 }
 async function join(){
  if(credential||starting||!room?.live||!wanted||room.ownsDeck||stopping)return;
  starting=true;const version=generation,session=room.live.id;
  try{
   const next=await api({action:'join',session});
   if(version!==generation||!wanted||room?.live?.id!==session){await api({...identity(next),action:'leave'});return;}
   credential=next;ack=0;failures=0;loop(generation);
  }catch(error){onStatus(error.message);}
  finally{starting=false;}
 }
 async function start(){
  if(starting||capture||!supported)return;
  starting=true;let selected=null;const version=generation;
  try{
   // A user gesture opens the browser picker. Never request microphone audio.
   selected=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,systemAudio:'exclude',selfBrowserSurface:'include',surfaceSwitching:'exclude'});
   if(version!==generation)throw Error('Live connection cancelled.');
   if(selected.getVideoTracks()[0]?.getSettings().displaySurface!=='browser')throw Error('Select the garden or StemDeck browser tab, not a window or screen.');
   if(!selected.getAudioTracks().length)throw Error('No tab audio was shared. Select the garden tab for the embedded studio and enable tab audio in the browser picker.');
   const next=await api({action:'start',rights:true});
   if(version!==generation){await api({...identity(next),action:'leave'});throw Error('Live connection cancelled.');}
   credential=next;capture=selected;selected=null;ack=0;failures=0;
   capture.getVideoTracks().forEach(t=>t.stop());
   capture.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>stop()));
   audio.pause();audio.srcObject=null;onStatus('');onChange();loop(generation);
  }catch(error){selected?.getTracks().forEach(t=>t.stop());onStatus(error.name==='NotAllowedError'?'Tab sharing cancelled.':error.message);}
  finally{starting=false;onChange();}
 }
 window.addEventListener('pagehide',()=>{
  if(credential)fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...identity(credential),action:'leave'}),keepalive:true}).catch(()=>{});
  stop(false);
 });
 return {supported,start,stop,
  update(state,listening){
   room=state;wanted=listening;
   if(capture){if(!state?.ownsDeck){stopping=true;stop().finally(()=>{stopping=false;});}return;}
   if(credential&&(!wanted||!state?.live||state.live.id!==credential.session)){
    stopping=true;stop().finally(()=>{stopping=false;join();});
   }else join();
  },
  inspect(){return {publishing:Boolean(capture),connected:Boolean(credential),peers:peers.size,receiving:Boolean(audio.srcObject),states:[...peers.values()].map(pc=>pc.connectionState)};},
  get publishing(){return Boolean(capture);}
 };
};
