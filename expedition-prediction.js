'use strict';
(function(root){
root.createExpeditionPrediction=function({controller,onCorrection=()=>{},leadTicks=6}){
 let anchorTick=null,lastServerTick=-1,lastFinalizedSeq=-1,lastAppliedSeq=-1;
 const history=new Map(),outbound=new Map();
 const lead=Math.max(1,Math.min(30,Math.floor(leadTicks)));
 const neutral=()=>{const p=controller.readPose();return {heldMask:0,edges:0,yaw:p.yaw,pitch:p.pitch,actions:[]};};
 function accept(snapshot){const self=snapshot?.selfInput,tick=snapshot?.simulationTick;
  if(!self||!Number.isSafeInteger(tick)||self.controller?.tick!==tick||!Number.isSafeInteger(self.anchorTick)||self.anchorTick<0||!Number.isSafeInteger(self.lastFinalizedSeq)||self.lastFinalizedSeq< -1||!Number.isSafeInteger(self.lastAppliedSeq)||self.lastAppliedSeq< -1||self.lastAppliedSeq>self.lastFinalizedSeq)throw Error('Invalid movement acknowledgement.');
  if(tick<lastServerTick)return false;
  const reset=anchorTick!==self.anchorTick;
  if(!reset&&tick<=lastServerTick)return false;
  const before=controller.readPose(),target=reset?tick+lead-1:Math.max(tick+lead-1,Math.min(controller.tick,tick+60));
  controller.restoreState(self.controller);
  if(reset){history.clear();outbound.clear();}
  anchorTick=self.anchorTick;lastServerTick=tick;lastFinalizedSeq=self.lastFinalizedSeq;lastAppliedSeq=self.lastAppliedSeq;
  for(const [t,f] of history)if(t<=tick||f.seq<=lastFinalizedSeq)history.delete(t);
  for(const [seq,f] of outbound)if(f.tick<=tick||seq<=lastFinalizedSeq)outbound.delete(seq);
  while(controller.tick<target){const t=controller.tick+1;controller.step(history.get(t)||neutral(),t,{replay:true});}
  onCorrection(before,controller.readPose());return true;
 }
 function step(input){if(anchorTick===null||controller.tick>=lastServerTick+60)return null;
  const tick=controller.tick+1,seq=tick-anchorTick;
  const f=seq<0?neutral():{seq,tick,heldMask:input.heldMask,edges:input.edges,yaw:input.yaw,pitch:input.pitch,actions:input.actions||[]};
  controller.validateInput(f);controller.step(f,tick);
  if(seq>=0){history.set(tick,f);outbound.set(seq,f);}
  return f;
 }
 // Prioritize recent slots so delayed acknowledgements cannot starve fresh input.
 // Retain unfinalized frames for harmless retransmission until an authoritative
 // acknowledgement arrives. Three frames/request fits a 20 Hz transport.
 function batch(max=12){return [...outbound.values()].slice(-Math.max(1,Math.min(12,max)));}
 return {accept,step,batch,controller,inspect:()=>({anchorTick,lastServerTick,lastFinalizedSeq,lastAppliedSeq,predictedTick:controller.tick,pending:history.size,outbound:outbound.size})};
};
// Public actors are rendered from a delayed tick buffer. It never drives collision.
root.createExpeditionInterpolation=function({delayTicks=12,maxGapTicks=30}={}){
 const samples=[];let generation=null;
 function push(snapshot){if(!Number.isSafeInteger(snapshot.simulationTick)||!Array.isArray(snapshot.players))return;
  if(snapshot.generation!==generation){samples.length=0;generation=snapshot.generation;}
  if(samples.length&&snapshot.simulationTick<=samples.at(-1).tick)return;
  samples.push({tick:snapshot.simulationTick,players:JSON.parse(JSON.stringify(snapshot.players))});if(samples.length>32)samples.shift();
 }
 function sample(serverTick){if(!samples.length)return [];const target=serverTick-delayTicks;let a=samples[0],b=a;for(const s of samples){if(s.tick<=target)a=s;if(s.tick>=target){b=s;break;}b=s;}
  const gap=b.tick-a.tick,k=gap>0&&gap<=maxGapTicks?Math.max(0,Math.min(1,(target-a.tick)/gap)):0;
  return a.players.map(p=>{const q=b.players.find(q=>q.id===p.id);if(!q||q.status!==p.status)return {...(k===1&&q?q:p)};
   const yaw=p.yaw+Math.atan2(Math.sin(q.yaw-p.yaw),Math.cos(q.yaw-p.yaw))*k,result={...p,x:p.x+(q.x-p.x)*k,y:p.y+(q.y-p.y)*k,z:p.z+(q.z-p.z)*k,yaw,pitch:(p.pitch||0)+((q.pitch||0)-(p.pitch||0))*k};
   if(p.physical||q.physical)result.physical=root.interpolateExpeditionPhysical?.(p.physical,q.physical,k)??(k===1?q.physical:p.physical);return result;});
 }
 return {push,sample,clear(){samples.length=0;},inspect:()=>({samples:samples.length,oldest:samples[0]?.tick,newest:samples.at(-1)?.tick})};
};
})(typeof window==='object'?window:globalThis);
