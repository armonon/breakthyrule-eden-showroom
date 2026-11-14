import test from 'node:test';import assert from 'node:assert/strict';
import {loadExpeditionRuntime} from '../../server/expedition-runtime.mjs';
import {prepareExpeditionActor} from '../../server/expedition-actor.mjs';
const runtime=await loadExpeditionRuntime(),{T,scope,layout}=runtime,clone=v=>JSON.parse(JSON.stringify(v));
async function make(){const character={version:1,character:'midnight',height:193,shoulders:1.18},world=scope.createExpeditionWorld({layout,roofs:scope.edenRoofs});let actor;
 const controller=scope.createExpeditionController({T,world,layout,character,worldRevision:runtime.revision.worldRevision,canMove:()=>!actor?.active,effect:e=>actor?.action(e.kind,e.args)}),prepared=await prepareExpeditionActor(runtime,character);actor=prepared.attach({controller,world});
 return {controller,actor,step(f={heldMask:0,edges:0,yaw:Math.PI,pitch:0}){controller.step(f);actor.step(controller.tick);},dispose:()=>actor.dispose()};
}
const observe=a=>({pose:a.actor.pose(),public:a.actor.publicState(),inspect:a.actor.inspect()});
for(const phase of ['falling','settled','recovering'])test(`canonical selected actor checkpoint continues through ${phase} and get-up`,async()=>{
 const a=await make();let b;
 try{for(let i=0;i<40;i++)a.step({heldMask:17,edges:i===35?1:0,yaw:Math.PI,pitch:0});assert.equal(a.actor.action('bail'),true);
  for(let i=0;i<(phase==='falling'?8:360);i++)a.step();
  if(phase==='recovering'){a.actor.action('bail');for(let i=0;i<19;i++)a.step();assert.equal(a.actor.inspect().bail.state,'recovering');}
  const saved={controller:clone(a.controller.captureState()),actor:clone(a.actor.captureState())},expected=[];
  for(let i=0;i<240;i++){if(i===140)a.actor.action('bail');a.step();expected.push(observe(a));}
  a.dispose();b=await make();b.controller.restoreState(saved.controller);b.actor.restoreState(saved.actor);
  for(let i=0;i<240;i++){if(i===140)b.actor.action('bail');b.step();assert.deepEqual(observe(b),expected[i],`${phase} continuation ${i}`);}
 }finally{a.dispose();b?.dispose();}
});
