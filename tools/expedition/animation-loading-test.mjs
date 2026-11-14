import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
const payload=JSON.parse(fs.readFileSync(path.join(root,'assets/anim/clips.json')));
function setup(fetch){
 const warnings=[];
 const c={fetch,AbortController,atob,TypeError,console:{warn:(...args)=>warnings.push(args)},setTimeout:(fn,ms)=>setTimeout(fn,ms===750?0:ms),clearTimeout};c.window=c;vm.createContext(c);
 vm.runInContext(fs.readFileSync(path.join(root,'character-anim.js'),'utf8'),c);
 return {api:c.GardenAnim,warnings};
}
test('loads all candidate clips and coalesces concurrent requests',async()=>{
 let calls=0;const {api}=setup(async()=>{calls++;return {ok:true,json:async()=>structuredClone(payload)};});
 await Promise.all([api.load(),api.load(),api.load()]);assert.equal(calls,1);assert.equal(api.ready(),true);
 for(const [id,clip] of Object.entries(payload.clips)){assert.equal(api.has(id),true);assert.equal(api.clip(id).q.length,clip.n*payload.bones.length*4);assert.equal(api.clip(id).hip.length,clip.n);}
 await api.load();assert.equal(calls,1);
});
test('transient server failure retries once without publishing partial data',async()=>{
 let calls=0;const {api,warnings}=setup(async()=>++calls===1?{ok:false,status:503}:{ok:true,json:async()=>structuredClone(payload)});
 await api.load();assert.equal(calls,2);assert.equal(api.ready(),true);assert.equal(warnings.length,0);
});
test('truncated payload retains procedural fallback and permits a later retry',async()=>{
 let broken=true,calls=0;const {api,warnings}=setup(async()=>{calls++;const data=structuredClone(payload);if(broken)data.clips.walk.q=data.clips.walk.q.slice(0,-4);return {ok:true,json:async()=>data};});
 await api.load();assert.equal(api.ready(),false);assert.equal(api.has('walk'),false);assert.equal(warnings.length,1);assert.equal(calls,1);
 broken=false;await api.load();assert.equal(api.ready(),true);assert.equal(calls,2);
});
test('missing library is not retried in a request loop',async()=>{
 let calls=0;const {api}=setup(async()=>{calls++;return {ok:false,status:404};});
 await api.load();assert.equal(calls,1);assert.equal(api.ready(),false);
});
test('transport failure is bounded and keeps the existing procedural rig usable',async()=>{
 let calls=0;const {api,warnings}=setup(async()=>{calls++;throw new TypeError('Offline');});
 await api.load();assert.equal(calls,2);assert.equal(api.ready(),false);assert.equal(warnings.length,1);
});
