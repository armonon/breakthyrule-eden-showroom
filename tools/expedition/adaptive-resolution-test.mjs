import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../eden-quality.js',import.meta.url),'utf8');
function setup(options={}){
 const scope={window:{},devicePixelRatio:2};vm.runInNewContext(source,scope);
 const ratios=[],floors=[];const q=scope.window.createAdaptiveResolution({setPixelRatio:r=>ratios.push(r)},{max:1.25,onFloor:()=>floors.push(true),...options});
 let now=0;return {q,ratios,floors,run(ms,n=1200){for(let i=0;i<n;i++){now+=ms;q.frame(now,true);}}};
}
test('fixed 60fps budget responds to stable 20/25/33/50ms workloads rather than learning them as display rate',()=>{
 for(const ms of [20,25,1000/30,50]){const t=setup({targetFps:60});t.run(ms);assert.equal(t.q.inspect().pixelRatio,.75,ms+'ms lowers resolution');assert.ok(t.floors.length>0,ms+'ms sheds effects at floor');assert.equal(t.q.inspect().targetFps,60);}
});
test('stable 60fps does not reduce desktop resolution',()=>{const t=setup({targetFps:60});t.run(1000/60);assert.equal(t.q.inspect().pixelRatio,1.25);assert.equal(t.floors.length,0);});
test('fixed 30fps mobile budget accepts 30fps but responds to 20fps',()=>{const t=setup({targetFps:30});t.run(1000/30);assert.equal(t.q.inspect().pixelRatio,1.25);t.run(50);assert.equal(t.q.inspect().pixelRatio,.75);});
test('portrait phones, landscape phones and tablets share the mobile rendering budget',()=>{
 const scope={window:{}};vm.runInNewContext(source,scope);
 for(const [width,coarse] of [[390,true],[844,true],[1366,true],[760,false]]){
  const profile=scope.window.edenRenderProfile({width,coarse,dpr:3});
  assert.equal(profile.mobile,true);assert.equal(profile.antialias,false);assert.equal(profile.max,1);assert.equal(profile.targetFps,60);
  const t=setup(profile);t.run(1000/30,420);assert.equal(t.q.inspect().pixelRatio,.5,'persistent 30 fps triggers a lower mobile cost, not a learned 30 Hz display');
 }
 const desktop=scope.window.edenRenderProfile({width:1280,coarse:false,dpr:2});assert.equal(desktop.mobile,false);assert.equal(desktop.antialias,true);assert.equal(desktop.max,1.5);
});
test('mobile resolution stays crisp at 60fps and responds within a few seconds when frames stay late',()=>{
 const scope={window:{}};vm.runInNewContext(source,scope);const profile=scope.window.edenRenderProfile({width:390,coarse:true,dpr:3});
 const smooth=setup(profile);smooth.run(1000/60,600);assert.equal(smooth.q.inspect().pixelRatio,1);
 const slow=setup(profile);slow.run(1000/30,140);assert.ok(slow.q.inspect().pixelRatio<1);slow.q.pause();slow.run(1000/60,1);assert.ok(slow.q.inspect().pixelRatio>=.5);
});
test('isolated mobile loading hitches do not leave the scene at a blurry resolution',()=>{
 const scope={window:{}};vm.runInNewContext(source,scope);const t=setup(scope.window.edenRenderProfile({width:390,coarse:true,dpr:3}));
 t.run(1000/60,300);for(let i=0;i<12;i++){t.run(100,1);t.run(1000/60,119);}assert.equal(t.q.inspect().pixelRatio,1);
});
test('optional target preserves legacy inferred-refresh behavior',()=>{const t=setup();t.run(1000/30);assert.equal(t.q.inspect().pixelRatio,1.25);assert.equal(t.q.inspect().targetFps,null);});
test('stable recovery has hysteresis and respects the configured ceiling',()=>{const t=setup({targetFps:60});t.run(50);assert.equal(t.q.inspect().pixelRatio,.75);t.run(1000/60,60);assert.equal(t.q.inspect().pixelRatio,.75);t.run(1000/60,(t.q.inspect().climbWaitS*2+10)*60);assert.equal(t.q.inspect().pixelRatio,1.25);t.q.setMax(1);assert.equal(t.q.inspect().pixelRatio,1);t.run(1000/60);assert.equal(t.q.inspect().pixelRatio,1);});
test('pause clears average and resume does not treat idle gap as slow frame',()=>{const t=setup({targetFps:60});t.run(1000/60,500);t.q.pause();assert.equal(t.q.inspect().frameMs,0);t.run(10000,1);t.run(1000/60,10);assert.equal(t.q.inspect().pixelRatio,1.25);});
test('recovery requires fresh uninterrupted stability after renewed pressure at minimum resolution',()=>{
 const t=setup({targetFps:60});t.run(50);t.run(1000/60,(t.q.inspect().climbWaitS-5)*60);assert.equal(t.q.inspect().pixelRatio,.75);t.run(50,65);t.run(1000/60,180);assert.equal(t.q.inspect().pixelRatio,.75);t.run(1000/60,(t.q.inspect().climbWaitS+1)*60);assert.ok(t.q.inspect().pixelRatio>.75);
});
test('every expedition preset retains the intended post-processing style',()=>{
 const entry=readFileSync(new URL('../../expedition-entry.js',import.meta.url),'utf8'),line=entry.split('\n').find(l=>l.includes('function setGraphics(value)')),settings={};
 const set=vm.runInNewContext('let graphics;'+line+';setGraphics;', {devicePixelRatio:1,post:{set:p=>Object.assign(settings,p)},quality:{setMax(){}},lighting:{set(){}},renderer:{shadowMap:{}},localStorage:{setItem(){}}});
 for(const preset of ['low','high','medium','low']){set(preset);assert.equal(settings.enabled,true);for(const key of ['grain','flare','glare','rays','bloom'])assert.ok(settings[key]>0,key+' preserved on '+preset);}
});
