import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function setup(renderer,options={}){const scope={window:{},AbortController,DOMException,performance,setTimeout,clearTimeout};vm.runInNewContext(readFileSync(new URL('../../render-warmup.js',import.meta.url),'utf8'),scope);return scope.window.createRenderWarmup(renderer,{}, {},options);}
const model=material=>({traverse(fn){fn({material});},updateMatrixWorld(){}});
test('warmup deduplicates shared texture versions, shader uniforms and simultaneous model preparation',async()=>{
 let uploads=0,compiles=0;const texture={isTexture:true,version:1},m=model({map:texture,uniforms:{map:{value:texture}}}),warm=setup({initTexture(){uploads++;},async compileAsync(){compiles++;}},{yieldTask:async()=>{}});
 await Promise.all([warm.prepare(m),warm.prepare(m)]);assert.equal(uploads,1);assert.equal(compiles,1);
 await warm.prepare(model({uniforms:{map:{value:texture}}}));assert.equal(uploads,1);texture.version++;await warm.prepare(m);assert.equal(uploads,2);assert.equal(warm.inspect().models,3);
});
test('warmup timeout bounds a stalled texture yield and permits a later retry',async()=>{
 let stuck=true;const m=model({map:{isTexture:true,version:1}}),warm=setup({initTexture(){},compile(){}},{yieldTask:()=>stuck?new Promise(()=>{}):Promise.resolve(),timeoutMs:20});
 await assert.rejects(warm.prepare(m),/timed out/);assert.equal(warm.inspect().models,0);stuck=false;await warm.prepare(m);assert.equal(warm.inspect().models,1);
});
test('warmup abort rejects immediately while compilation is pending and ignores late completion',async()=>{
 let finish;const controller=new AbortController(),warm=setup({initTexture(){},compileAsync:()=>new Promise(r=>finish=r)},{signal:controller.signal});const pending=warm.prepare(model({}));controller.abort();await assert.rejects(pending,{name:'AbortError'});finish();await new Promise(r=>setTimeout(r,0));assert.equal(warm.inspect().models,0);
});

test('avatar preparation waits for decoded images before uploading and compiling',async()=>{
 const texture={isTexture:true,version:0,image:null},events=[];let yields=0;
 const model={traverse:fn=>fn({material:{map:texture}}),updateMatrixWorld(){}};
 const warm=setup({initTexture(t){assert.ok(t.image?.width);events.push('upload');},compileAsync:async()=>events.push('compile')},{yieldTask:async()=>{if(++yields===3){texture.image={width:64,height:64};texture.version=1;}}});
 await warm.prepare(model,{waitForImages:true});assert.deepEqual(events,['upload','compile']);assert.ok(yields>=3);assert.equal(warm.inspect().textures,1);
});
