import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {openPage,sleep} from './headless-chrome.mjs';
const [url='http://127.0.0.1:8794/showroom.html',out='/private/tmp/museum-mobile']=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});const p=await openPage({width:844,height:390,deviceScaleFactor:3,mobile:true}),visits=[];
const wait=async(expr,timeout=30000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await p.evaluate(expr))return;await sleep(100);}throw Error('Timed out: '+expr);};
try{
 await p.goto(url);await p.ready();await p.evaluate('window.S=breakThyRuleShowroom;window.losses=0;S.renderer().domElement.addEventListener("webglcontextlost",()=>losses++);');
 // Retain the actual arena resources before entering the museum, as in a real session.
 await p.evaluate(`document.getElementById('battle-launch').click()`);await wait(`S.battle().active()&&!S.worlds().loading()`,180000);
 await p.evaluate(`S.battle()._debug.god();S.battle().exit()`);await wait(`!S.worlds().loading()&&!S.battle().active()`);
 for(let visit=0;visit<3;visit++){
  await p.evaluate(`S.go('wall',true)`);await wait(`S.worlds().loading()`);
  await wait(`!S.worlds().loading()`);await wait(`S.museum().exhibition()?.inspect().loaded>0`);
  await sleep(1500);if(!visit)await wait(`!S.getState().rackLoading`,120000);
  const state=await p.evaluate(`({art:S.museum().exhibition().inspect(),statues:S.museum().sculptures().inspect(),rack:{loaded:S.getState().garments,total:S.getState().rackTotal},memory:{...S.renderer().info.memory},losses,contextLost:S.renderer().getContext().isContextLost(),arena:S.battle().active(),momentum:S._player().movement.momentum()})`);
  assert.ok(state.art.loaded<=8);assert.ok(state.art.maxTextureWidth<=768);assert.ok(state.art.maxConcurrent<=1);assert.ok(state.statues.loaded<=3);assert.equal(state.contextLost,false);assert.equal(state.losses,0);assert.equal(state.arena,false);assert.equal(state.momentum,0);
  if(!visit)await p.shot(path.join(out,'museum.jpg'));
  await p.evaluate(`S.go('spawn',true)`);await wait(`S.museum().exhibition().inspect().loaded===0&&S.museum().sculptures().inspect().loaded===0`);
  await sleep(1500);state.afterExit=await p.evaluate('({...S.renderer().info.memory})');visits.push(state);console.log('PASS museum visit',visit+1,JSON.stringify({loaded:state.art.loaded,models:state.statues.loaded,rack:state.rack,memory:state.memory,afterExit:state.afterExit}));
 }
 const errors=p.problems.filter(s=>s.startsWith('EXC'));assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({physicalDevice:false,visits,errors},null,2)+'\n');
}catch(error){console.error(p.problems);await p.shot(path.join(out,'failure.jpg'));throw error;}finally{await p.close();}
