'use strict';
// Footsteps and landings, synthesised with Web Audio (no audio files): grass is a soft low brush, stone a crisp tap,
// brick a tap with more grit; a landing is a low thud plus a short burst of the surface. Shares the garden sound
// toggle's setting (localStorage 'eden-effects-muted', button #garden-effects).
(function(root){
 root.createFootsteps=function(){
  let context=null,noise=null,lastStep=0;
  const muted=()=>{try{return localStorage.getItem('eden-effects-muted')==='1';}catch{return false;}};
  function ready(){
   if(muted())return null;
   try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;context ||= new Audio();if(context.state==='suspended')context.resume().catch(()=>{});}catch{return null;}
   if(context.state!=='running')return null;
   if(!noise){noise=context.createBuffer(1,Math.ceil(context.sampleRate*.4),context.sampleRate);const d=noise.getChannelData(0);let seed=12345;for(let i=0;i<d.length;i++){seed=(seed*1664525+1013904223)>>>0;d[i]=seed/2147483648-1;}}
   return context;
  }
  // Unlocking needs a real user gesture.
  const unlock=event=>{if(event.isTrusted)ready();};
  document.addEventListener('pointerdown',unlock,true);document.addEventListener('keydown',unlock,true);
  const SURFACES={
   grass:{freq:900,q:.7,decay:.11,gain:.07,type:'lowpass',click:0},
   stone:{freq:2600,q:1.1,decay:.055,gain:.09,type:'bandpass',click:.05},
   brick:{freq:1700,q:.9,decay:.075,gain:.1,type:'bandpass',click:.035},
   wood:{freq:520,q:1.4,decay:.09,gain:.1,type:'bandpass',click:.06}
  };
  function burst(ac,surface,when,level,length=1){
   const s=SURFACES[surface]||SURFACES.grass,src=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();
   src.buffer=noise;src.playbackRate.value=.85+Math.random()*.3;filter.type=s.type;filter.frequency.value=s.freq*(.9+Math.random()*.2);filter.Q.value=s.q;
   const peak=s.gain*level,decay=s.decay*length;gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(peak,when+.006);gain.gain.exponentialRampToValueAtTime(.0005,when+decay);
   src.connect(filter);filter.connect(gain);gain.connect(ac.destination);src.start(when,Math.random()*.25,decay+.05);
   if(s.click){const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=s.freq*.55;g.gain.setValueAtTime(s.click*level,when);g.gain.exponentialRampToValueAtTime(.0001,when+.025);o.connect(g);g.connect(ac.destination);o.start(when);o.stop(when+.03);}
  }
  return {
   // speed in m/s: louder and brighter when running.
   step(surface,speed=3.4){const ac=ready();if(!ac)return;const t=ac.currentTime;if(t-lastStep<.16)return;lastStep=t;burst(ac,surface,t,Math.min(1.4,.55+speed*.12));},
   // strength 0..1 from the fall.
   land(surface,strength=.5){
    const ac=ready();if(!ac)return;const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
    o.type='sine';o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(42,t+.16);
    g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.32*strength+.08,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.22);
    o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.25);burst(ac,surface,t,.9+strength,1.6);lastStep=t;
   },
   // Slides scrape the surface for their whole length.
   slide(surface,duration=.7){const ac=ready();if(!ac)return;burst(ac,surface,ac.currentTime,1.1,duration/.08);}
  };
 };
})(window);
