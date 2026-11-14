'use strict';
(function(root){
// UI-independent client prediction and action acknowledgements. A receipt belongs
// to one tick/slot; losing an input cannot silently spend or replay a survival tool.
root.createExpeditionClient=function({controller,leadTicks=6,onCorrection=()=>{}}){
 const makePrediction=()=>root.createExpeditionPrediction({controller,leadTicks,onCorrection}),pending=[],inflight=new Map();let prediction=makePrediction(),generation=null,epoch=null,anchor=null,closed=false;
 function cancel(reason){for(const p of [...pending,...inflight.values()])p.reject(Error(reason));pending.length=0;inflight.clear();}
 function accept(snapshot){if(closed)return false;const next=snapshot.selfInput?.anchorTick;if(!Number.isSafeInteger(next))throw Error('Missing input anchor.');
  if(generation!==null&&snapshot.generation!==generation)return false;
  if(epoch!==null&&snapshot.connectionEpoch!==epoch)return false;
  const accepted=prediction.accept(snapshot);if(!accepted)return false;
  if(anchor!==null&&anchor!==next)cancel('The input connection restarted. Try the action again.');
  generation=snapshot.generation??null;epoch=snapshot.connectionEpoch??null;anchor=next;
  const receipts=snapshot.selfInput.receipts||[];for(const [key,p] of inflight){if(p.seq>snapshot.selfInput.lastFinalizedSeq)continue;inflight.delete(key);const r=receipts.find(r=>r.seq===p.seq&&r.index===p.index);if(!r)p.reject(Error('That input arrived too late. Try again.'));else if(!r.ok)p.reject(Error(r.error||'Action unavailable.'));else p.resolve(snapshot);}
  return true;
 }
 function action(value){if(closed)return Promise.reject(Error('The expedition has closed.'));if(pending.length+inflight.size>=8)return Promise.reject(Error('Wait for the current action.'));return new Promise((resolve,reject)=>pending.push({value,resolve,reject}));}
 function step(input){if(closed)return null;const actions=pending.slice(0,4),frame=prediction.step({...input,actions:actions.map(p=>p.value)});if(frame?.seq>=0){pending.splice(0,actions.length);actions.forEach((p,index)=>{p.seq=frame.seq;p.index=index;inflight.set(frame.seq+':'+index,p);});}return frame;}
 return {controller,accept,step,action,batch:max=>prediction.batch(max),inspect:()=>({...prediction.inspect(),pendingActions:pending.length,inflightActions:inflight.size}),replaceConnection(){cancel('The connection was replaced. Try again.');generation=null;epoch=null;anchor=null;prediction=makePrediction();},dispose(){if(closed)return;closed=true;cancel('The expedition has closed.');}};
};
})(typeof window==='object'?window:globalThis);
