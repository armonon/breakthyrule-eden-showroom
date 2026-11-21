// Other visitors drawn smoothly from uneven network packets (visitor-smoothing.js), compared with the old "chase the
// latest packet" smoothing on the same packet stream.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const scope={};scope.window=scope;vm.runInNewContext(readFileSync(new URL('../../visitor-smoothing.js',import.meta.url),'utf8'),scope);
const {createVisitorSmoothing}=scope;

// A visitor walking at 3 m/s; packets every ~50 ms with uneven arrival and an occasional late or dropped one.
function packets(seconds=6){const out=[];let t=0,seed=7;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 while(t<seconds){t+=.05;const late=rnd()<.08?.18:0;if(rnd()<.05)continue;out.push({arrive:t+.03+rnd()*.05+late,x:3*t,z:0,yaw:0});}
 return out.sort((a,b)=>a.arrive-b.arrive);}
// Frame-to-frame change in drawn speed (m/s per frame) at 60 fps: smaller is smoother.
function roughness(positions){let sum=0,worst=0;for(let i=2;i<positions.length;i++){const v1=(positions[i]-positions[i-1])*60,v0=(positions[i-1]-positions[i-2])*60,j=Math.abs(v1-v0);sum+=j;worst=Math.max(worst,j);}return {mean:sum/(positions.length-2),worst};}

test('without server times, visitors still move at least as smoothly as before, at the right pace',()=>{
 const stream=packets(),smooth=createVisitorSmoothing(),out={x:0,z:0,yaw:0};let old=0,latest=0,k=0;const a=[],b=[];
 for(let f=0;f<60*6;f++){const now=f/60;while(k<stream.length&&stream[k].arrive<=now){smooth.add(stream[k].arrive,stream[k].x,stream[k].z,stream[k].yaw);latest=stream[k].x;k++;}
  old+=(latest-old)*(1-Math.exp(-10/60));if(f>60){a.push(old);if(smooth.draw(now,out))b.push(out.x);}}
 const before=roughness(a),after=roughness(b);
 assert.ok(after.mean<before.mean,`mean speed change per frame ${after.mean.toFixed(2)} vs ${before.mean.toFixed(2)} m/s`);
 // drawn a little behind, but at the right pace
 const pace=(b.at(-1)-b[0])/((b.length-1)/60);assert.ok(Math.abs(pace-3)<.15,`walks at ${pace.toFixed(2)} m/s`);
});

test("with the server's pose times, visitors move smoothly even through bunched-up packets",()=>{
 // the server stamps each pose when it takes it (a little upstream jitter); snapshots then reach us unevenly
 const stream=packets().map(p=>({...p,at:(p.x/3+.02+Math.abs(Math.sin(p.x*7))*.012)*1000+5e6})),smooth=createVisitorSmoothing(),out={x:0,z:0,yaw:0};let old=0,latest=0,k=0;const a=[],b=[];
 for(let f=0;f<60*6;f++){const now=f/60;while(k<stream.length&&stream[k].arrive<=now){smooth.add(stream[k].arrive,stream[k].x,stream[k].z,stream[k].yaw,stream[k].at);latest=stream[k].x;k++;}
  old+=(latest-old)*(1-Math.exp(-10/60));if(f>60){a.push(old);if(smooth.draw(now,out))b.push(out.x);}}
 const before=roughness(a),after=roughness(b);
 assert.ok(after.mean<before.mean*.35,`mean speed change per frame ${after.mean.toFixed(2)} vs ${before.mean.toFixed(2)} m/s`);
 const pace=(b.at(-1)-b[0])/((b.length-1)/60);assert.ok(Math.abs(pace-3)<.15,`walks at ${pace.toFixed(2)} m/s`);
});

test('a teleport snaps instead of sliding across the map',()=>{
 const s=createVisitorSmoothing(),out={x:0,z:0,yaw:0};s.add(0,0,0,0);s.add(.05,.1,0,0);s.add(.1,40,0,0);s.sample(.5,out);
 assert.ok(out.x>39,'at the new place');
});

test('a late packet extrapolates briefly, then holds still',()=>{
 const s=createVisitorSmoothing(),out={x:0,z:0,yaw:0};for(let i=0;i<10;i++)s.add(i*.05,i*.15,0,0);
 s.sample(.45+s.delay()+.1,out);assert.ok(out.x>1.35&&out.x<1.8,`carries on a little: ${out.x.toFixed(2)}`);
 s.sample(.45+s.delay()+3,out);const held=out.x;s.sample(.45+s.delay()+4,out);assert.equal(out.x,held,'then waits');
});

test('turning takes the short way round',()=>{
 const s=createVisitorSmoothing(),out={x:0,z:0,yaw:0};s.add(0,0,0,3.1);s.add(.1,0,0,-3.1);s.sample(.05+s.delay(),out);
 assert.ok(Math.abs(Math.abs(out.yaw)-Math.PI)<.1,`through pi, not through zero: ${out.yaw.toFixed(2)}`);
});
