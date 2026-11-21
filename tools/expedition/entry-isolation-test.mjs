import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';

const base=new URL('../../',import.meta.url),read=name=>readFileSync(new URL(name,base),'utf8');
const forbidden=/\/(?:products\/|rack-models\/|residents\/|library(?:[/.?-]|$)|librarian-|stemdeck|studio|museum|collection\.js|garment|assets\/props\/|assets\/eden-hero\/|assets\/flora\/flowers)/;
function scope(){
 const requests=[],models=[],canvasContext=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),measureText:()=>({width:20})},{get:(o,key)=>o[key]??(()=>{})});
 class TextureLoader{load(url,onLoad){requests.push(url);const map=new THREE.Texture({width:64,height:64});if(onLoad)queueMicrotask(()=>onLoad(map));return map;}}
 const T={...THREE,TextureLoader};
 const s={console,performance,structuredClone,queueMicrotask,document:{createElement:()=>({width:0,height:0,getContext:()=>canvasContext})},showroomAssets:{model(url){models.push(url);return Promise.resolve({scene:new T.Group()});}}};s.window=s;vm.createContext(s);
 for(const file of ['assets/roof-heights.js','expedition-world.js','eden-flora.js','pyramid-gathering.js','road-pyramid.js','night-district.js','night-road.js','expedition-scene.js'])vm.runInContext(read(file),s,{filename:file});
 return {s,T,requests,models};
}
test('entry manifest has only shared game dependencies and all controller UI ids',()=>{
 const html=read('expedition.html'),scripts=[...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m=>m[1]);
 assert.ok(!scripts.some(path=>forbidden.test(path)));assert.ok(!scripts.includes('/app.js'));assert.ok(!html.includes('/products/'));
 for(const path of scripts)assert.ok(existsSync(new URL(path.slice(1),base)),path+' exists');
 for(const path of ['/expedition.js','/solo-expedition.js','/player-movement.js','/parkour.js','/player-body.js','/night-district.js'])assert.ok(scripts.includes(path),'reuses '+path);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'unique ids');
 for(const id of new Set([...read('expedition.js').matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1])))assert.ok(ids.includes(id),'controller target '+id);
});
test('woodland-only construction uses original tree/fern geometry without Eden-only requests',()=>{
 const {s,T,requests,models}=scope(),root=new T.Group();
 const flora=s.createEdenFlora(T,root,{bark:new T.MeshStandardMaterial(),forestOnly:true});
 assert.equal(root.children.length,0,'no garden orchard or scenery constructed');assert.equal(models.length,0,'no garden model requests');
 assert.deepEqual(requests.sort(),['/assets/eden-textures/foliage/broadleaf-card.webp','/assets/eden-textures/foliage/cypress-card-v2.webp','/assets/eden-textures/foliage/fern-card.webp'].sort());
 assert.equal(flora.forest.trees.length,3);for(const tree of flora.forest.trees){assert.ok(tree.wood.attributes.position.count>10);assert.ok(tree.foliage.attributes.position.count>10);}assert.ok(flora.forest.fern.geometry.attributes.position.count>10);
});
test('real entry scene loads five original landmark GLBs with no showroom assets',async()=>{
 const {s,T,requests,models}=scope(),scene=new T.Scene(),layout=JSON.parse(read('night-layout.json'));
 const game=s.createExpeditionScene(T,scene,{layout,reduced:true,mobile:true});await game.ready;
 const camera=new T.PerspectiveCamera();camera.position.set(...[layout.spawn[0],1.75,layout.spawn[1]]);
 // Models stream sequentially and preparation adds promise turns. Observe readiness,
 // rather than assuming one completed model per update or exactly five requests.
 for(let i=0;i<100&&!game.requiredLandmarks.every(id=>game.district.inspect().models[id]==='model');i++){game.update(i,camera);await new Promise(resolve=>setImmediate(resolve));}
 assert.deepEqual(Array.from(game.requiredLandmarks),['temple','observatory','playhouse','hotel','gardens']);
 const loaded=game.district.inspect().models;for(const id of game.requiredLandmarks)assert.equal(loaded[id],'model',id+' is actual GLB');
 assert.ok(models.includes('/assets/night/moon-temple.glb'));assert.ok(models.includes('/assets/night/egyptian-gardens.glb'),'out-of-range core art is prepared before entry');
 assert.ok(![...requests,...models].some(path=>forbidden.test(path)),'no showroom-only asset requests');
 assert.equal(game.authority.floorAt(11.7,-24),0);assert.ok(game.district.walls.length>0);assert.ok(game.district.routes.length>0,'shared elevated routes retained');
});
test('disposed district releases late GLB instead of attaching it to a departed world',async()=>{
 const {s,T}=scope(),scene=new T.Scene(),layout=JSON.parse(read('night-layout.json'));let finish;
 s.showroomAssets.model=()=>new Promise(resolve=>{finish=resolve;});
 const game=s.createExpeditionScene(T,scene,{layout,reduced:true,mobile:true});await game.ready;const camera=new T.PerspectiveCamera();camera.position.set(11.7,1.75,-24);game.update(0,camera);
 assert.equal(typeof finish,'function');game.district.dispose();
 const late=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());late.add(mesh);let released=0;mesh.geometry.addEventListener('dispose',()=>released++);finish({scene:late});await Promise.resolve();await Promise.resolve();
 assert.equal(late.parent,null);assert.equal(released,1);assert.notEqual(game.district.inspect().models.temple,'model');
});
test('entry readiness, failure, cleanup and input use shared systems',()=>{
 const source=read('expedition-entry.js');
 assert.ok(source.includes("models[id]==='fallback'"));assert.ok(source.includes('loaded===garden.requiredLandmarks.length&&body.inspect().ready'));
 for(const text of ['bail?.dispose()','body?.dispose()','touch?.dispose?.()','footsteps?.dispose?.()','observer?.disconnect()','lifetime.abort()','renderer?.forceContextLoss()','garden?.district.dispose?.()','canPunch:()=>false','preferences.isBailKey(event)','physicsBoxesForWorld(world,p)','effects:p','pitch:Math.atan2'])assert.ok(source.includes(text),text);
 assert.ok(source.includes("if(event.persisted&&disposed)location.reload()"),'back cache rebuilds released resources');
});
