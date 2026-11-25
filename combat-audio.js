'use strict';
// Recorded CC0 layers. AudioBufferSourceNodes are one-shot by Web Audio design;
// decoded buffers and 48 gain/filter/panner channels are retained and bounded.
// In the Beyond Eden night world (beyond-audio.js, when loaded) the channels run through its bus: space reverb sends,
// walls that muffle, slap-backs off facades and the body-cam microphone. Elsewhere that bus is a plain wire.
(function(root){
 root.createCombatAudio=function({camera,T,url='/assets/audio/combat/'}){
  let ctx,output,loading=null,ready=false,failed=0,played=0,dropped=0,beyond=null,link=null;
  const groups=new Map(),buffers=new Map(),last=new Map(),channels=[],right=new T.Vector3(),delta=new T.Vector3();
  function load(context,destination){
   if(loading)return loading;ctx=context;output=destination;
   beyond=root.beyondAudio||null;try{link=beyond?.attach?.(ctx,destination,{camera})||null;}catch{link=null;}const out=link?.input||output;
   for(let i=0;i<48;i++){const gain=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=ctx.createStereoPanner();filter.type='lowpass';gain.connect(filter).connect(pan).connect(out);let send=null;if(link){send=ctx.createGain();send.gain.value=0;pan.connect(send).connect(link.send);}channels.push({gain,filter,pan,send,until:0,source:null});}
   loading=(async()=>{const r=await fetch(url+'manifest.json');if(!r.ok)throw Error('audio manifest '+r.status);const manifest=await r.json();const files=[...new Set(Object.values(manifest.groups).flat())];let cursor=0;
    await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){const name=files[cursor++];try{const r=await fetch(url+name);if(!r.ok)throw Error(r.status);buffers.set(name,await ctx.decodeAudioData(await r.arrayBuffer()));}catch{failed++;}}}));
    for(const [key,names]of Object.entries(manifest.groups)){const available=names.filter(n=>buffers.has(n));if(available.length)groups.set(key,available);}ready=groups.size>0;return ready;
   })().catch(e=>{failed++;console.warn('Recorded audio unavailable; using procedural fallback.',e);return false;});return loading;
  }
  // Beyond only: send = reverb amount, lowpass = a ceiling on the channel filter, pan = fixed pan (an echo's wall),
  // raw = no wall test (reflections), optional = dropped first when channels run short.
  function play(key,{time=ctx?.currentTime||0,pos=null,gain=1,delay=0,pitch=1,travel=false,send=null,lowpass=null,pan:fixedPan=null,raw=false,optional=false}={}){
   const names=groups.get(key);if(!names?.length||!ctx)return false;if(ctx.state!=='running')return true;
   let i=Math.floor(Math.random()*names.length);if(names.length>1&&i===last.get(key))i=(i+1+Math.floor(Math.random()*(names.length-1)))%names.length;last.set(key,i);
   const inBeyond=!!link&&beyond.active();if(optional&&channels.reduce((n,c)=>n+(c.until>ctx.currentTime?1:0),0)>34){dropped++;return true;}
   const buffer=buffers.get(names[i]),c=channels.find(c=>c.until<=ctx.currentTime);if(!c){dropped++;return true;}
   let distance=0,pan=0;if(pos){delta.copy(pos).sub(camera.position);distance=delta.length();right.set(1,0,0).applyQuaternion(camera.quaternion);pan=distance>.01?Math.max(-1,Math.min(1,delta.dot(right)/distance))*.9:0;}
   const rate=pitch*(.96+Math.random()*.08),at=Math.max(ctx.currentTime,time)+delay+(travel?distance/343:0);
   let cutoff=Math.max(800,18000/(1+distance*.06)),wet=0;
   if(inBeyond){const v=raw?null:beyond.voice(pos);if(v){gain*=v.gain;cutoff=Math.min(cutoff,v.lowpass);}wet=send??v?.send??.2;if(lowpass)cutoff=Math.min(cutoff,lowpass);if(fixedPan!=null)pan=fixedPan;}
   c.until=at+buffer.duration/rate+.02;c.gain.gain.setValueAtTime(gain/(1+distance*.075),at);c.filter.frequency.setValueAtTime(cutoff,at);c.pan.pan.setValueAtTime(pan,at);if(c.send)c.send.gain.setValueAtTime(wet,at);
   const source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;source.connect(c.gain);c.source=source;
   source.onended=()=>{source.disconnect();if(c.source===source)c.source=null;};source.start(at);played++;return true;
  }
  function shot(kind,time,pos=null){if(link&&beyond.active())return beyondShot(kind,time,pos);const distant=pos&&camera.position.distanceToSquared(pos)>625;if(!play(kind+(distant?'-distant':'-shot'),{time,pos,gain:distant?.9:1,travel:!!pos}))return false;
   play(kind+'-tail',{time,pos,gain:.13,delay:.09,travel:!!pos});if(!distant)play(kind+'-mechanical',{time,pos,gain:.18,delay:.04,travel:!!pos});return true;}
  // Beyond: a louder close crack, the facades answering (slap-backs), a longer tail and the report rolling back.
  function beyondShot(kind,time,pos){
   const p=beyond.shotPlan(kind,pos),travel=!!pos;if(!play(kind+(p.distant?'-distant':'-shot'),{time,pos,gain:p.crack.gain,travel,send:p.crack.send}))return false;
   play(kind+'-tail',{time,pos,gain:p.tail.gain,delay:p.tail.delay,travel,send:p.tail.send});if(p.mech)play(kind+'-mechanical',{time,pos,gain:.18,delay:.04,travel,send:.1});
   for(const s of p.slaps)play(kind+'-shot',{time,pos,gain:s.gain,delay:s.delay,pitch:.94,travel,send:s.send,lowpass:s.lowpass,pan:s.pan,raw:true,optional:true});
   if(p.far)play(kind+'-distant',{time,pos,gain:p.far.gain,delay:p.far.delay,travel,send:p.far.send,lowpass:p.far.lowpass,optional:true});return true;}
  let capture=null;
  function startCapture(){if(!ctx||!root.MediaRecorder)return false;const destination=ctx.createMediaStreamDestination(),chunks=[];output.connect(destination);const recorder=new MediaRecorder(destination.stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();capture={recorder,destination,chunks};return true;}
  async function stopCapture(){if(!capture)return null;const c=capture;capture=null;await new Promise(r=>{c.recorder.onstop=r;c.recorder.stop();});output.disconnect(c.destination);return new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(new Blob(c.chunks,{type:c.recorder.mimeType}));});}
  return {load,play,shot,startCapture,stopCapture,inspect:()=>({ready,failed,beyond:!!link&&beyond.active(),buffers:buffers.size,groups:groups.size,channels:channels.length,active:channels.filter(c=>c.until>(ctx?.currentTime||0)).length,played,dropped}),dispose(){for(const c of channels){try{c.source?.stop();}catch{}c.gain.disconnect();c.filter.disconnect();c.pan.disconnect();c.send?.disconnect();}buffers.clear();groups.clear();}};
 };
})(window);
