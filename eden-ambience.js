'use strict';
// Synthesised soundscape (no audio files), one bed per place, all through the room echo (eden-acoustics.js):
//   garden     wind that comes in gusts, leaves rustling with each gust, birdsong by day (and a flock calling as it
//              passes overhead, panned to where you see it), a cricket chorus, frogs and now and then an owl at night
//   courtyard  softer wind, a distant low rumble of the district, fewer crickets
//   museum     the hum of the building and its air handling
//   blackbox   almost nothing: a faint high room tone, so your own steps ring out
//   stone      a cold low draught and water dripping somewhere in the dark
// Plus the Fight Night crowd, bell and chime. Footsteps live in footsteps.js. Starts on the first tap or key press, as
// browsers require. Continuous layers are a handful of looping nodes; calls (birds, frogs, drips) are short-lived notes.
window.createEdenAmbience=function({reduced=false}={}){
 const PLACES={
  garden:   {wind:1, tone:1,  rustle:1,  birds:1,  crickets:1,  frogs:1, owl:1, rumble:0,  hum:0, air:0,  room:0, drip:0},
  courtyard:{wind:.6,tone:.8, rustle:.25,birds:.35,crickets:.45,frogs:0, owl:.4,rumble:1,  hum:0, air:0,  room:0, drip:0},
  museum:   {wind:0, tone:1,  rustle:0,  birds:0,  crickets:0,  frogs:0, owl:0, rumble:0,  hum:1, air:1,  room:0, drip:0},
  blackbox: {wind:0, tone:1,  rustle:0,  birds:0,  crickets:0,  frogs:0, owl:0, rumble:0,  hum:0, air:0,  room:1, drip:0},
  stone:    {wind:.4,tone:.45,rustle:0,  birds:0,  crickets:0,  frogs:0, owl:0, rumble:.3, hum:0, air:.5, room:0, drip:1}
 };
 const LEVEL=.55;
 let ctx=null,master=null,started=false,muted=false,place='garden',nightLevel=0,crowdTarget=0;
 let layers=null,meter=null,lastBed=-1,gust=.5,nextGust=0,nextBird=0,nextFrog=0,nextOwl=0,nextDrip=0,nextFlockCall=0;
 try{muted=localStorage.getItem('eden-ambience-muted')==='1';}catch{}
 const R=Math.random;
 function noiseBuffer(seconds,brown=false){const b=ctx.createBuffer(1,ctx.sampleRate*seconds,ctx.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<d.length;i++){const w=R()*2-1;if(brown){l=(l+.02*w)/1.02;d[i]=l*3.5;}else d[i]=w;}return b;}
 const bus=(to=master)=>{const g=ctx.createGain();g.gain.value=0;g.connect(to);return g;};
 const panner=(value,to)=>{if(!ctx.createStereoPanner)return to;const p=ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,value));p.connect(to);return p;};
 function loop(buffer,type,frequency,q,to){const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=frequency;f.Q.value=q;const g=bus(to);src.connect(f).connect(g);src.start(0,R()*buffer.duration);return {filter:f,gain:g};}
 // A cricket: a high tone gated by two square waves, one for the pulses inside a chirp, one for the chirps themselves.
 function cricketVoice(to,freq,pulse,rate,pan){
  const o=ctx.createOscillator();o.frequency.value=freq;const a=ctx.createGain(),b=ctx.createGain();a.gain.value=b.gain.value=.5;
  for(const [gate,hz] of [[a,pulse],[b,rate]]){const l=ctx.createOscillator(),depth=ctx.createGain();l.type='square';l.frequency.value=hz;depth.gain.value=.5;l.connect(depth).connect(gate.gain);l.start();}
  o.connect(a).connect(b).connect(panner(pan,to));o.start();
 }
 function start(){
  if(started)return;started=true;
  try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch{return;}
  master=ctx.createGain();master.gain.value=muted?0:LEVEL;master.connect(window.edenAcoustics?.input(ctx)||ctx.destination);
  const brown=noiseBuffer(6,true),white=noiseBuffer(4);
  layers={
   wind:loop(brown,'lowpass',420,.7),
   rustle:loop(white,'bandpass',3200,.6),
   crowd:loop(white,'bandpass',700,.9),
   rumble:loop(brown,'lowpass',110,.7),
   air:loop(brown,'lowpass',260,.5),
   room:loop(white,'bandpass',5200,2.5),
   hum:bus(),crickets:bus(),birds:bus(),night:bus()
  };
  for(const [hz,g] of [[60,.5],[120,.28],[180,.12],[240,.05]]){const o=ctx.createOscillator(),v=ctx.createGain();o.frequency.value=hz*(1+R()*.002);v.gain.value=g;o.connect(v).connect(layers.hum);o.start();}
  if(!reduced)for(const [f,p,r,pan] of [[4400,46,1.7,-.6],[4700,52,2.3,.5],[4150,41,1.25,.1]])cricketVoice(layers.crickets,f,p,r,pan);
  else cricketVoice(layers.crickets,4400,46,1.7,0);
  layers.birds.gain.value=layers.night.gain.value=1;
 }
 for(const type of ['pointerdown','keydown'])window.addEventListener(type,start,{once:true,passive:true});

 // One sung note: a glide from f0 to f1 with a quick attack.
 function note(t,f0,f1,dur,gain,to,type='sine'){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+Math.min(.012,dur*.3));g.gain.linearRampToValueAtTime(0,t+dur);o.connect(g).connect(to);o.start(t);o.stop(t+dur+.02);}
 // Four kinds of song so the garden is not one bird on repeat: a trill, a slow whistle, a warble, a sharp chip.
 function song(t,pan,gain){const to=panner(pan,layers.birds),k=R();
  if(k<.3){const f=3000+R()*2000,n=6+(R()*8|0),s=.05+R()*.03;for(let i=0;i<n;i++)note(t+i*s,f,f*1.15,s*.7,gain,to);}
  else if(k<.55){let f=1800+R()*1200;const n=2+(R()*2|0),up=R()<.5;for(let i=0;i<n;i++){note(t+i*.32,f,f*(up?1.25:.8),.24,gain*.8,to);f*=.9+R()*.25;}}
  else if(k<.85){const n=5+(R()*6|0);for(let i=0;i<n;i++){const f=2200+R()*2800;note(t+i*.09,f,f*(.8+R()*.5),.08,gain*.7,to);}}
  else for(let i=0;i<2;i++)note(t+i*.07,4600,3500,.035,gain,to);}
 function frog(t,pan,gain){const to=panner(pan,layers.night),f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=650+R()*300;f.Q.value=4;f.connect(to);
  const base=90+R()*60,n=2+(R()<.3?1:0);for(let i=0;i<n;i++)note(t+i*.14,base*1.25,base,.09,gain,f,'sawtooth');}
 function owl(t,pan){const to=panner(pan,layers.night),f=380+R()*40;note(t,f,f*.96,.42,.05,to);note(t+.75,f*.98,f*.93,.2,.035,to);note(t+1.05,f,f*.9,.5,.045,to);}
 function drip(t,pan){const to=panner(pan,master),f=900+R()*700;note(t,f,f*2.4,.045,.05*(.4+R()*.6),to);}
 function tone(from,to,dur,gain,delay=0,type='sine'){if(!ctx)return;const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(master);o.start(t);o.stop(t+dur+.05);}

 // Pan (-1 left .. 1 right) of a world point for a listener at `from` looking along `facing`.
 function panOf(from,facing,x,z){if(!facing)return R()*1.6-.8;const dx=x-from.x,dz=z-from.z,d=Math.hypot(dx,dz)||1,fl=Math.hypot(facing.x,facing.z)||1;return (dx*-facing.z/fl+dz*facing.x/fl)/d;}
 const set=(param,value,tau)=>param.setTargetAtTime(value,ctx.currentTime,tau);
 const targets={};
 return {
  // position: the listener; night 0..1; place: garden | courtyard | museum | blackbox | stone (default: the acoustic space);
  // facing: the camera's forward vector (for panning); flock: world position of the bird flock overhead, or null.
  update(position,{night=0,theater=null,place:where=null,facing=null,flock=null}={}){
   if(!ctx||!position)return;const t=ctx.currentTime;nightLevel=night;
   place=PLACES[where]?where:PLACES[window.edenAcoustics?.space?.()]?window.edenAcoustics.space():'garden';const p=PLACES[place],day=1-Math.min(1,night*1.6);
   if(ctx.state==='suspended')ctx.resume().catch(()=>{});
   // Gusts: a new strength every few seconds; wind, its tone and the leaves all follow it.
   if(t>nextGust){gust=reduced?.5:.15+R()*.85;nextGust=t+3+R()*6;}
   if(t-lastBed>.25){lastBed=t;
    targets.wind=p.wind*(.03+.06*gust)*(1+.35*night);targets.rustle=p.rustle*(.003+.035*gust*gust);targets.rumble=p.rumble*(.035+.04*night);
    targets.hum=p.hum*.018;targets.air=p.air*.03;targets.room=p.room*.004;targets.crickets=p.crickets*.011*Math.max(0,night*1.4-.4);
    set(layers.wind.gain.gain,targets.wind,1.4);set(layers.wind.filter.frequency,(260+420*gust)*p.tone,1.6);
    set(layers.rustle.gain.gain,targets.rustle,1.1);set(layers.rustle.filter.frequency,2400+1800*gust,1.2);
    for(const k of ['rumble','air','room'])set(layers[k].gain.gain,targets[k],.8);set(layers.hum.gain,targets.hum,.8);set(layers.crickets.gain,targets.crickets,1.5);
    const nearTheater=theater?Math.max(0,1-Math.hypot(position.x-theater.x,position.z-theater.z)/22):0;
    set(layers.crowd.gain.gain,crowdTarget*(.05+.1*nearTheater)+.004*nearTheater,.6);set(layers.crowd.filter.frequency,600+300*Math.sin(t*.9),.4);
   }
   // Birdsong by day, all around; louder and quicker while a flock is crossing, from where the flock is.
   if(p.birds&&day>.2&&t>nextBird){song(t,R()*1.8-.9,(.03+R()*.045)*p.birds*day);nextBird=t+(reduced?3:1.1)+R()*3.5/p.birds;}
   if(flock&&p.birds&&day>.2&&t>nextFlockCall){const d=Math.hypot(flock.x-position.x,flock.y-position.y,flock.z-position.z);
    const k=Math.min(1,28/d);if(k>.12)for(let i=0;i<4;i++)note(t,4300+R()*900,3200+R()*600,.035+R()*.03,.05*k*k*day,panner(panOf(position,facing,flock.x,flock.z),layers.birds));
    nextFlockCall=t+.12+R()*.3;}
   if(p.frogs&&night>.5&&t>nextFrog){const pan=R()*1.8-.9;frog(t,pan,.045*night);if(R()<.4)frog(t+.5+R()*.5,-pan,.03*night);nextFrog=t+1.5+R()*4.5;}
   if(p.owl&&night>.6&&t>nextOwl){if(nextOwl)owl(t,R()*1.6-.8);nextOwl=t+18+R()*25;}
   if(p.drip&&t>nextDrip){if(nextDrip)drip(t,R()*1.6-.8);nextDrip=t+1.8+R()*5;}
  },
  setCrowd(level){crowdTarget=level;if(level&&ctx)for(let i=0;i<6;i++)tone(300+R()*200,200,.4,.03,i*.07,'sawtooth');},
  bell(){for(let i=0;i<3;i++){tone(1180,1170,1.4,.12,i*.35);tone(2360,2350,.9,.04,i*.35);}},
  chime(){for(let i=0;i<4;i++)tone(880*1.19**i,880*1.19**i,.6,.06,i*.1);},
  setMuted(value){muted=!!value;try{localStorage.setItem('eden-ambience-muted',muted?'1':'0');}catch{}if(master)master.gain.value=muted?0:LEVEL;},
  get muted(){return muted;},
  start,
  // Loudness of the whole bed (0..1 RMS), for checks.
  level(){if(!ctx)return 0;if(!meter){meter=ctx.createAnalyser();meter.fftSize=2048;master.connect(meter);}const d=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;return Math.sqrt(s/d.length);},
  inspect:()=>({started,muted,state:ctx?.state||null,crowd:crowdTarget,place,night:+nightLevel.toFixed(2),gust:+gust.toFixed(2),layers:Object.fromEntries(Object.entries(targets).map(([k,v])=>[k,+v.toFixed(4)]))})
 };
};
