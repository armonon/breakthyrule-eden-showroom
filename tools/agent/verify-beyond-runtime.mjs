// Targeted runtime checks kept separate from the five-minute performance sample.
import fs from 'node:fs';
import {openPage,sleep} from './headless-chrome.mjs';
const p=await openPage(),out={};const ev=s=>p.evaluate(s);
async function wait(s){for(let i=0;i<240;i++){if(await ev(s))return;await sleep(500);}throw Error('Timed out: '+s);}
try{
 await p.goto('http://127.0.0.1:8790/showroom.html');await p.ready();await sleep(12000);
 out.assist=await ev(`(()=>{const old=edenSettings.get('aimAssist');edenSettings.set('aimAssist','off');const r={runtime:breakThyRuleShowroom.combat().inspect().aimAssist,saved:JSON.parse(localStorage.getItem('eden-settings')).aimAssist};edenSettings.set('aimAssist',old);return r;})()`);
 await ev('breakThyRuleShowroom.teleport(10,-62)');await wait("breakThyRuleShowroom.worlds().world()==='beyond'&&!breakThyRuleShowroom.worlds().loading()");await ev('breakThyRuleShowroom.battle()._debug.night();breakThyRuleShowroom.battle()._debug.god()');await sleep(1500);
 out.fallback=await ev(`(()=>{edenBaked.set({enabled:false});const live=edenBaked.inspect();edenBaked.set({enabled:true});return{live,baked:edenBaked.inspect()};})()`);
 out.respawn=await ev(`(()=>{const B=breakThyRuleShowroom.battle(),b=B._debug.bots.find(b=>b.alive);window.testRespawn=b;const r={uuid:b.model.root.uuid,id:b.id};B._debug.damage(b,10000,B._debug.player,{kind:'fall'});return r;})()`);
 await sleep(12000);out.respawn.after=await ev('({alive:testRespawn.alive,uuid:testRespawn.model.root.uuid,down:testRespawn.model.motion.downAmount(),hp:testRespawn.hp})');
 if(!out.respawn.after.alive||out.respawn.uuid!==out.respawn.after.uuid||out.respawn.after.down!==0)throw Error('Rig did not revive in place');
 await ev('breakThyRuleShowroom.combat()._debug.explodeAt(17,-62)');await sleep(4000);out.combatProblems=[...p.problems];
 await p.goto('http://127.0.0.1:8790/expedition.html');await sleep(1500);await wait('window.breakThyRuleExpedition?.getState().ready');await sleep(2000);
 out.expedition=await ev('({state:breakThyRuleExpedition.getState(),bake:edenBaked.inspect()})');out.problems=p.problems;
 fs.writeFileSync('docs/beyond-bake/runtime-checks.json',JSON.stringify(out,null,2));console.log(JSON.stringify({assist:out.assist,respawn:out.respawn,expedition:out.expedition.state.ready,problems:out.problems}));
}catch(e){fs.writeFileSync('docs/beyond-bake/runtime-checks.json',JSON.stringify({...out,error:String(e),problems:p.problems},null,2));throw e;}finally{await p.close();}
