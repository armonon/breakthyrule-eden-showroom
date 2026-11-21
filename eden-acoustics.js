'use strict';
// Room acoustics for the game's synthesised sounds (footsteps, punches, melee hits). Each AudioContext gets a small rig:
// dry signal straight out, plus a convolution reverb whose impulse response is generated here (decaying, slightly
// darkened stereo noise, no audio files) for the space you are in: a short slap outdoors, a long bright tail in the
// white black-box world, a marble hall in the museum, a stone courtyard at night. Changing space fades the tail out,
// swaps it and fades back in, so nothing clicks.
window.edenAcoustics=(()=>{
 const SPACES={
  garden:{decay:.5,wet:.06,tone:7000},     // open air: a hint of ground and hedge reflections
  courtyard:{decay:1.1,wet:.12,tone:4200}, // the night district: stone facades on every side
  blackbox:{decay:2.8,wet:.3,tone:6500},   // the white world: a huge hard, empty room
  museum:{decay:2.1,wet:.24,tone:5200},    // marble halls
  stone:{decay:1.6,wet:.22,tone:3200}      // temple and pyramid interiors
 };
 const rigs=new Map();let space='garden',enabled=true;
 function impulse(ctx,{decay,tone}){
  const length=Math.ceil(ctx.sampleRate*decay),buffer=ctx.createBuffer(2,length,ctx.sampleRate);
  // one-pole low-pass: the tail loses its highs as it decays, like real air and soft surfaces
  const k=Math.exp(-2*Math.PI*tone/ctx.sampleRate);
  for(let c=0;c<2;c++){const d=buffer.getChannelData(c);let seed=c?7919:104729,lp=0;
   for(let i=0;i<length;i++){seed=(seed*1664525+1013904223)>>>0;const white=seed/2147483648-1,t=i/length;lp=lp*k+white*(1-k);d[i]=lp*Math.pow(1-t,2.2)*Math.exp(-3*t);}}
  return buffer;
 }
 function rig(ctx){
  let r=rigs.get(ctx);if(r)return r;
  const input=ctx.createGain(),convolver=ctx.createConvolver(),wet=ctx.createGain(),buffers={};
  input.connect(ctx.destination);input.connect(convolver);convolver.connect(wet);wet.connect(ctx.destination);
  r={input,convolver,wet,buffers,space:null};rigs.set(ctx,r);apply(r,true);return r;
 }
 function apply(r,instant=false){
  const ctx=r.input.context,target=SPACES[space]||SPACES.garden,t=ctx.currentTime;
  if(r.space===space&&!instant){r.wet.gain.setTargetAtTime(enabled?target.wet:0,t,.1);return;}
  r.space=space;r.buffers[space]??=impulse(ctx,target);
  if(instant){r.convolver.buffer=r.buffers[space];r.wet.gain.value=enabled?target.wet:0;return;}
  r.wet.gain.cancelScheduledValues(t);r.wet.gain.setTargetAtTime(0,t,.05);
  setTimeout(()=>{if(r.space!==space)return;r.convolver.buffer=r.buffers[space];r.wet.gain.setTargetAtTime(enabled?target.wet:0,ctx.currentTime,.15);},180);
 }
 return {
  // The node a sound should connect to instead of ctx.destination.
  input(ctx){try{return rig(ctx).input;}catch{return ctx.destination;}},
  // garden | courtyard | blackbox | museum | stone
  setSpace(name){if(!SPACES[name]||name===space)return;space=name;for(const r of rigs.values())apply(r);},
  setEnabled(value){enabled=!!value;for(const r of rigs.values())apply(r,true);},
  space:()=>space,
  inspect:()=>({space,enabled,contexts:rigs.size})
 };
})();
