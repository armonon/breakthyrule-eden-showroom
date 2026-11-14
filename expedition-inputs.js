'use strict';
(function(root){
// Transport-independent input scheduling. Receiving a packet never advances time.
// A missing slot is neutral, but gravity and traversal continue. Late edges cannot
// be applied retroactively. Both local solo and the room server use these slots.
root.createExpeditionInputs=function({T,world,layout,worldRevision,getRoom,applyPose,applyAction,effect=()=>{},createActor=null}){
 const actors=new Map(),LEAD=6,MAX_LEAD=60,MAX_BATCH=12;
 const fail=()=>{throw Error('Invalid expedition input batch.');};
 const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.includes(k));
 function create(player,tick,activate=true){let a;const controller=root.createExpeditionController({T,world,layout,worldRevision,character:player.character,unlocked:()=>getRoom().collected.length===getRoom().pages.length,canMove:()=>player.status==='alive'&&getRoom().phase==='playing'&&!a?.physical?.active,effect:e=>{a?.physical?.action(e.kind,e.args);effect(player.id,e);}});
  controller.reset({x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch,nextTick:tick});
  a={player,controller,queue:new Map(),anchorTick:tick+LEAD,lastFinalizedSeq:-1,lastAppliedSeq:-1,receipts:[],physical:null};if(activate&&createActor)a.physical=createActor(player,controller,world);return a;
 }
 function add(player,tick){if(actors.has(player.id))throw Error('Duplicate input actor.');actors.set(player.id,create(player,tick));}
 function frame(a,f){
  if(!keys(f,['seq','tick','heldMask','edges','yaw','pitch','actions'])||!Number.isSafeInteger(f.seq)||f.seq<0||!Number.isSafeInteger(f.tick)||f.tick!==a.anchorTick+f.seq)fail();
  a.controller.validateInput(f);
  if(!Array.isArray(f.actions)||f.actions.length>4)fail();
  for(const action of f.actions){if(!keys(action,['action','page','aimAssist'])||!['flare','reload','collect','ring-bell','interrupt','bail'].includes(action.action))fail();
   if(action.action==='collect'&&!(Number.isSafeInteger(action.page)||typeof action.page==='string'&&action.page.length<=64))fail();
   if(action.aimAssist!==undefined&&typeof action.aimAssist!=='boolean')fail();
   if(action.action!=='collect'&&action.page!==undefined||action.action!=='flare'&&action.aimAssist!==undefined)fail();
  }
  return JSON.parse(JSON.stringify(f));
 }
 function enqueue(id,frames,tick){const a=actors.get(id);if(!a||!Array.isArray(frames)||frames.length<1||frames.length>MAX_BATCH)fail();const prepared=[];let previous=-1;
  for(const value of frames){const f=frame(a,value);if(f.seq<=previous||f.tick>tick+MAX_LEAD)fail();previous=f.seq;if(f.seq<=a.lastFinalizedSeq)continue;
   const existing=a.queue.get(f.tick);if(existing&&JSON.stringify(existing)!==JSON.stringify(f))fail();prepared.push(f);
  }
  if(a.queue.size+prepared.filter(f=>!a.queue.has(f.tick)).length>MAX_LEAD)fail();
  for(const f of prepared)a.queue.set(f.tick,f);
  return {received:true,lastFinalizedSeq:a.lastFinalizedSeq,lastAppliedSeq:a.lastAppliedSeq};
 }
 function step(tick){for(const [id,a] of actors){const p=a.player,queued=a.queue.get(tick),f=p.connected?queued:null,old=a.controller.readPose();
  a.queue.delete(tick);a.lastFinalizedSeq=Math.max(a.lastFinalizedSeq,tick-a.anchorTick);
  const input=f||{heldMask:0,edges:0,yaw:old.yaw,pitch:old.pitch};a.controller.step(input,tick);const pose=a.physical?a.physical.step(tick):a.controller.readPose();
  applyPose(id,pose);if(f){a.lastAppliedSeq=f.seq;p.seq=f.seq;for(const [index,action] of f.actions.entries()){const receipt={seq:f.seq,index,action:action.action,ok:true};try{if(action.action==='bail'){if(!a.physical||p.status!=='alive'||getRoom().phase!=='playing')throw Error('Bail physics is unavailable.');a.physical.action('bail');applyPose(id,a.physical.pose());}else{applyAction(id,action,tick);a.physical?.action(action.action);}}catch(error){receipt.ok=false;receipt.error=String(error.message).slice(0,160);p.inputActionError={seq:f.seq,action:action.action,message:receipt.error};}a.receipts.push(receipt);if(a.receipts.length>32)a.receipts.shift();}}
 }}
 function clear(id){actors.get(id)?.queue.clear();}
 function resume(id,tick){const a=actors.get(id);if(!a)throw Error('Input actor not found.');a.queue.clear();a.receipts.length=0;a.anchorTick=tick+LEAD;a.lastAppliedSeq=-1;a.lastFinalizedSeq=-1;a.player.seq=-1;}
 function self(id){const a=actors.get(id);return a?{anchorTick:a.anchorTick,lastFinalizedSeq:a.lastFinalizedSeq,lastAppliedSeq:a.lastAppliedSeq,receipts:a.receipts.map(r=>({...r})),controller:a.controller.captureState()}:null;}
 function capture(){return [...actors].map(([id,a])=>({id,...self(id),queue:[...a.queue.values()],physical:a.physical?.captureState()||null}));}
 function restore(values,tick){const room=getRoom(),prepared=new Map();if(!Array.isArray(values)||values.length!==room.players.length)throw Error('Invalid input checkpoint.');
  for(const value of values){const p=room.players.find(p=>p.id===value.id);if(!p||prepared.has(p.id)||!Number.isSafeInteger(value.anchorTick)||value.anchorTick<0||!Number.isSafeInteger(value.lastFinalizedSeq)||value.lastFinalizedSeq< -1||!Number.isSafeInteger(value.lastAppliedSeq)||value.lastAppliedSeq< -1||value.lastAppliedSeq>value.lastFinalizedSeq||!Array.isArray(value.queue)||value.queue.length>MAX_LEAD)throw Error('Invalid input checkpoint actor.');
   const a=create(p,tick,false);a.controller.restoreState(value.controller);if(a.controller.tick!==tick)throw Error('Input checkpoint tick mismatch.');a.anchorTick=value.anchorTick;a.lastFinalizedSeq=value.lastFinalizedSeq;a.lastAppliedSeq=value.lastAppliedSeq;
   if(!Array.isArray(value.receipts)||value.receipts.length>32||value.receipts.some(r=>!r||!Number.isSafeInteger(r.seq)||r.seq<0||r.seq>a.lastAppliedSeq||!Number.isInteger(r.index)||r.index<0||r.index>3||typeof r.ok!=='boolean'||typeof r.action!=='string'||r.ok===false&&typeof r.error!=='string'))throw Error('Invalid input action receipts.');a.receipts=JSON.parse(JSON.stringify(value.receipts));
   for(const v of value.queue){const f=frame(a,v);if(f.tick<=tick||f.tick>tick+MAX_LEAD||a.queue.has(f.tick)||f.seq<=a.lastFinalizedSeq)throw Error('Invalid input checkpoint queue.');a.queue.set(f.tick,f);}prepared.set(p.id,a);
  }
  if(createActor)try{for(const value of values){const a=prepared.get(value.id);if(!value.physical)throw Error('Missing physical character checkpoint.');a.physical=createActor(a.player,a.controller,world);a.physical.restoreState(value.physical);}}catch(error){for(const a of prepared.values())a.physical?.dispose();throw error;}
  for(const a of actors.values())a.physical?.dispose();actors.clear();for(const [id,a] of prepared)actors.set(id,a);
 }
 return {add,enqueue,step,clear,resume,self,capture,restore,public:id=>actors.get(id)?.physical?.publicState()||null,dispose(){for(const a of actors.values())a.physical?.dispose();actors.clear();},remove(id){actors.get(id)?.physical?.dispose();actors.delete(id);},reset(id,pose){if(actors.get(id)?.physical?.active)throw Error('Cannot reset an active physical body.');actors.get(id)?.controller.reset(pose);clear(id);},get:id=>actors.get(id)?.controller};
};
})(typeof window==='object'?window:globalThis);
