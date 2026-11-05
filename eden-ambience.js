'use strict';
// Synthesised garden soundscape (no audio files): wind, birdsong by day, crickets at night and a crowd
// that swells for Fight Night (footsteps live in footsteps.js). Starts on the first tap or key press, as browsers require.
window.createEdenAmbience=function({reduced=false}={}){
 let ctx=null,master=null,wind=null,windGain=null,crowdGain=null,crowdFilter=null,crickets=null,started=false,muted=false;
 let crowdTarget=0,nightLevel=0,nextBird=0,nextCricket=0,stepDistance=0,last=null;
 try{muted=localStorage.getItem('eden-ambience-muted')==='1';}catch{}
 function noiseBuffer(seconds,brown=false){const b=ctx.createBuffer(1,ctx.sampleRate*seconds,ctx.sampleRate),d=b.getChannelData(0);let l=0;for(let i=0;i<d.length;i++){const w=Math.random()*2-1;if(brown){l=(l+.02*w)/1.02;d[i]=l*3.5;}else d[i]=w;}return b;}
 function loop(buffer,filterType,frequency,q=.7){const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;const f=ctx.createBiquadFilter();f.type=filterType;f.frequency.value=frequency;f.Q.value=q;const g=ctx.createGain();g.gain.value=0;src.connect(f).connect(g).connect(master);src.start();return {src,filter:f,gain:g};}
 function start(){
  if(started)return;started=true;
  try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch{return;}
  master=ctx.createGain();master.gain.value=muted?0:.55;master.connect(ctx.destination);
  wind=loop(noiseBuffer(6,true),'lowpass',420);windGain=wind.gain;
  const crowd=loop(noiseBuffer(4),'bandpass',700,.9);crowdGain=crowd.gain;crowdFilter=crowd.filter;
 }
 for(const type of ['pointerdown','keydown'])window.addEventListener(type,start,{once:true,passive:true});
 function chirp(t,base){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';const n=2+Math.floor(Math.random()*4);g.gain.setValueAtTime(0,t);
  for(let i=0;i<n;i++){const s=t+i*.11;o.frequency.setValueAtTime(base*(1+Math.random()*.3),s);o.frequency.exponentialRampToValueAtTime(base*(1.4+Math.random()*.5),s+.07);g.gain.linearRampToValueAtTime(.05,s+.01);g.gain.linearRampToValueAtTime(0,s+.09);}
  const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;if(pan){pan.pan.value=Math.random()*1.6-.8;o.connect(g).connect(pan).connect(master);}else o.connect(g).connect(master);o.start(t);o.stop(t+n*.11+.1);}
 function cricket(t){for(let k=0;k<3;k++){const o=ctx.createOscillator(),g=ctx.createGain();o.type='square';o.frequency.value=4300+Math.random()*300;const s=t+k*.09;g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(.006,s+.01);g.gain.linearRampToValueAtTime(0,s+.05);o.connect(g).connect(master);o.start(s);o.stop(s+.06);}}
 function step(t,soft){const src=ctx.createBufferSource();src.buffer=noiseBuffer(.12);const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=soft?700:1500;const g=ctx.createGain();g.gain.setValueAtTime(soft?.07:.1,t);g.gain.exponentialRampToValueAtTime(.001,t+.11);src.connect(f).connect(g).connect(master);src.start(t);}
 function tone(from,to,dur,gain,delay=0,type='sine'){if(!ctx)return;const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+dur);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g).connect(master);o.start(t);o.stop(t+dur+.05);}
 return {
  // position: the visitor's feet; night: 0..1; onRoad: brick surface
  update(position,{night=0,onRoad=false,theater=null}={}){
   if(!ctx||!position)return;const t=ctx.currentTime;nightLevel=night;
   windGain.gain.setTargetAtTime(.05+.05*night+(reduced?0:.02*Math.sin(t*.13)),t,.8);wind.filter.frequency.setTargetAtTime(380+160*Math.sin(t*.07),t,1);
   const nearTheater=theater?Math.max(0,1-Math.hypot(position.x-theater.x,position.z-theater.z)/22):0;
   crowdGain.gain.setTargetAtTime(crowdTarget*(.05+.1*nearTheater)+.004*nearTheater,t,.6);crowdFilter.frequency.setTargetAtTime(600+300*Math.sin(t*.9),t,.4);
   if(!reduced&&night<.6&&t>nextBird&&position.z>-21){chirp(t,2200+Math.random()*1800);nextBird=t+1.5+Math.random()*5;}
   if(night>.4&&t>nextCricket){cricket(t);nextCricket=t+.35+Math.random()*.9;}
  },
  setCrowd(level){crowdTarget=level;if(level&&ctx)for(let i=0;i<6;i++)tone(300+Math.random()*200,200,.4,.03,i*.07,'sawtooth');},
  bell(){for(let i=0;i<3;i++){tone(1180,1170,1.4,.12,i*.35);tone(2360,2350,.9,.04,i*.35);}},
  chime(){for(let i=0;i<4;i++)tone(880*1.19**i,880*1.19**i,.6,.06,i*.1);},
  setMuted(value){muted=!!value;try{localStorage.setItem('eden-ambience-muted',muted?'1':'0');}catch{}if(master)master.gain.value=muted?0:.55;},
  get muted(){return muted;},
  inspect:()=>({started,muted,state:ctx?.state||null,crowd:crowdTarget})
 };
};
