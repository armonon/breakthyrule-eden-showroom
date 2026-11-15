'use strict';
// Recorded CC0 layers. AudioBufferSourceNodes are one-shot by Web Audio design;
// decoded buffers and 48 gain/filter/panner channels are retained and bounded.
(function(root){
 root.createCombatAudio=function({camera,T,url='/assets/audio/combat/'}){
  let ctx,output,loading=null,ready=false,failed=0,played=0,dropped=0;
  const groups=new Map(),buffers=new Map(),last=new Map(),channels=[],right=new T.Vector3(),delta=new T.Vector3();
  function load(context,destination){
   if(loading)return loading;ctx=context;output=destination;
   for(let i=0;i<48;i++){const gain=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=ctx.createStereoPanner();filter.type='lowpass';gain.connect(filter).connect(pan).connect(output);channels.push({gain,filter,pan,until:0,source:null});}
   loading=(async()=>{const r=await fetch(url+'manifest.json');if(!r.ok)throw Error('audio manifest '+r.status);const manifest=await r.json();const files=[...new Set(Object.values(manifest.groups).flat())];let cursor=0;
    await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){const name=files[cursor++];try{const r=await fetch(url+name);if(!r.ok)throw Error(r.status);buffers.set(name,await ctx.decodeAudioData(await r.arrayBuffer()));}catch{failed++;}}}));
    for(const [key,names]of Object.entries(manifest.groups)){const available=names.filter(n=>buffers.has(n));if(available.length)groups.set(key,available);}ready=groups.size>0;return ready;
   })().catch(e=>{failed++;console.warn('Recorded audio unavailable; using procedural fallback.',e);return false;});return loading;
  }
  function play(key,{time=ctx?.currentTime||0,pos=null,gain=1,delay=0,pitch=1,travel=false}={}){
   const names=groups.get(key);if(!names?.length||!ctx)return false;if(ctx.state!=='running')return true;
   let i=Math.floor(Math.random()*names.length);if(names.length>1&&i===last.get(key))i=(i+1+Math.floor(Math.random()*(names.length-1)))%names.length;last.set(key,i);
   const buffer=buffers.get(names[i]),c=channels.find(c=>c.until<=ctx.currentTime);if(!c){dropped++;return true;}
   let distance=0,pan=0;if(pos){delta.copy(pos).sub(camera.position);distance=delta.length();right.set(1,0,0).applyQuaternion(camera.quaternion);pan=distance>.01?Math.max(-1,Math.min(1,delta.dot(right)/distance))*.9:0;}
   const rate=pitch*(.96+Math.random()*.08),at=Math.max(ctx.currentTime,time)+delay+(travel?distance/343:0);
   c.until=at+buffer.duration/rate+.02;c.gain.gain.setValueAtTime(gain/(1+distance*.075),at);c.filter.frequency.setValueAtTime(Math.max(800,18000/(1+distance*.06)),at);c.pan.pan.setValueAtTime(pan,at);
   const source=ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;source.connect(c.gain);c.source=source;
   source.onended=()=>{source.disconnect();if(c.source===source)c.source=null;};source.start(at);played++;return true;
  }
  function shot(kind,time,pos=null){const distant=pos&&camera.position.distanceToSquared(pos)>625;if(!play(kind+(distant?'-distant':'-shot'),{time,pos,gain:distant?.9:1,travel:!!pos}))return false;
   play(kind+'-tail',{time,pos,gain:.13,delay:.09,travel:!!pos});if(!distant)play(kind+'-mechanical',{time,pos,gain:.18,delay:.04,travel:!!pos});return true;}
  let capture=null;
  function startCapture(){if(!ctx||!root.MediaRecorder)return false;const destination=ctx.createMediaStreamDestination(),chunks=[];output.connect(destination);const recorder=new MediaRecorder(destination.stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();capture={recorder,destination,chunks};return true;}
  async function stopCapture(){if(!capture)return null;const c=capture;capture=null;await new Promise(r=>{c.recorder.onstop=r;c.recorder.stop();});output.disconnect(c.destination);return new Promise(r=>{const reader=new FileReader();reader.onload=()=>r(reader.result);reader.readAsDataURL(new Blob(c.chunks,{type:c.recorder.mimeType}));});}
  return {load,play,shot,startCapture,stopCapture,inspect:()=>({ready,failed,buffers:buffers.size,groups:groups.size,channels:channels.length,active:channels.filter(c=>c.until>(ctx?.currentTime||0)).length,played,dropped}),dispose(){for(const c of channels){try{c.source?.stop();}catch{}c.gain.disconnect();c.filter.disconnect();c.pan.disconnect();}buffers.clear();groups.clear();}};
 };
})(window);
