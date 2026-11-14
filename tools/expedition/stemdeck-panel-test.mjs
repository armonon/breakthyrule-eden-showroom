import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../stemdeck-panel.js',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map(),timers=new Map(),calls=[];let timer=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,open:false,src:'',textContent:'',onclick:null,onload:null,onerror:null,listeners:new Map(),showModal(){this.open=true;},close(){this.open=false;this.listeners.get('close')?.();},addEventListener(n,f){this.listeners.set(n,f);},removeEventListener(n){this.listeners.delete(n);},removeAttribute(){}});return nodes.get(id);};
 const window={},context={window,document:{getElementById:node},location:{href:'http://127.0.0.1:58525/showroom'},URL,AbortController,setTimeout(f){const id=++timer;timers.set(id,f);return id;},clearTimeout(id){timers.delete(id);},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({url:'/studio'})};}};
 vm.runInNewContext(source,context);
 return {window,node,timers,calls,context,flush:async()=>{for(let i=0;i<10;i++)await Promise.resolve();}};
}
test('embedded Studio accepts only the exact first-party document route',()=>{
 const f=fixture(),base='https://example.com/showroom?exhibit=procession';
 for(const path of ['/studio','/studio/','https://example.com/studio'])assert.equal(f.window.stemDeckURL(path,base),'https://example.com/studio');
 for(const path of ['https://evil.example/studio','https://user:pass@example.com/studio','/studio?redirect=external','/studio#secret','/studio/other','javascript:alert(1)','data:text/html,hello','//evil.example/studio','/showroom'])assert.throws(()=>f.window.stemDeckURL(path,base));
});
test('document readiness preserves the same editor across quick close/reopen',async()=>{
 const f=fixture(),panel=f.window.createStemDeckPanel();panel.open();await f.flush();
 assert.equal(panel.inspect().phase,'loading');assert.equal(f.node('stemdeck-frame').hidden,true);
 assert.equal(f.calls[1].options.redirect,'error');f.node('stemdeck-frame').onload();
 assert.equal(panel.inspect().phase,'document-loaded');assert.equal(f.timers.size,0);
 panel.close();panel.open();await f.flush();assert.equal(f.calls.length,2);assert.equal(f.node('stemdeck-frame').src,'http://127.0.0.1:58525/studio');
 panel.dispose();assert.equal(f.node('stemdeck-frame').onload,null);
});
test('a stuck Studio document times out and retry ignores stale load callbacks',async()=>{
 const f=fixture(),panel=f.window.createStemDeckPanel();panel.open();await f.flush();const stale=f.node('stemdeck-frame').onload;
 [...f.timers.values()][0]();assert.equal(panel.inspect().phase,'error');assert.equal(f.node('stemdeck-retry').hidden,false);
 f.node('stemdeck-retry').onclick();await f.flush();stale();assert.equal(panel.inspect().phase,'loading');
 f.node('stemdeck-frame').onload();assert.equal(panel.inspect().phase,'document-loaded');assert.equal(f.calls.length,4);
});
test('a failing preflight never embeds an error or redirected document',async()=>{
 const f=fixture();f.context.fetch=async()=>({ok:false});const panel=f.window.createStemDeckPanel();panel.open();await f.flush();
 assert.equal(panel.inspect().phase,'error');assert.equal(f.node('stemdeck-frame').src,'');assert.equal(f.timers.size,0);
});
