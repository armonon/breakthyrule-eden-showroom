import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx=vm.createContext({console,performance,URL,TextDecoder,TextEncoder,location:{href:'file:///headless/'}});ctx.window=ctx;
for(const file of ['assets/three.min.js','combat-query.js'])vm.runInContext(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),ctx);
const T=ctx.THREE;
const box=(x,y,z)=>{const m=new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshBasicMaterial({side:T.DoubleSide}));m.position.set(x,y,z);m.updateMatrixWorld(true);return m;};
const ray=(x=0,y=0,z=0,dx=0,dy=0,dz=-1)=>new T.Raycaster(new T.Vector3(x,y,z),new T.Vector3(dx,dy,dz).normalize(),.02,100);
const shown=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
function compare(query,r,objects){const expected=r.intersectObjects(objects.filter(shown),false)[0]||null,actual=query.hit(r,objects);assert.equal(actual?.object,expected?.object);if(expected){assert.ok(Math.abs(actual.distance-expected.distance)<1e-6);assert.ok(actual.point.distanceTo(expected.point)<1e-6);assert.equal(actual.faceIndex,expected.faceIndex);}assert.equal(r.far,100);}
test('nearest query matches exact triangle hits on scaled, rotated and moving scenery',()=>{
 const query=ctx.createNearestSceneryQuery(T),near=box(0,0,-6),far=box(0,0,-18);near.rotation.y=.4;near.scale.set(-1,2,.7);near.updateMatrixWorld(true);
 for(let x=-3;x<=3;x+=.25)compare(query,ray(x),[far,near]);
 near.position.x=12;near.updateMatrixWorld(true);compare(query,ray(),[far,near]);
 near.geometry=new T.SphereGeometry(2,16,12);near.position.x=0;near.updateMatrixWorld(true);compare(query,ray(),[far,near]);
});
test('inside bounds, near clips, hidden parents, layers and instanced scenery remain correct',()=>{
 const query=ctx.createNearestSceneryQuery(T),inside=box(0,0,0),far=box(0,0,-5),parent=new T.Group();parent.add(inside);parent.updateMatrixWorld(true);
 compare(query,ray(),[inside,far]);parent.visible=false;compare(query,ray(),[inside,far]);parent.visible=true;inside.layers.set(3);compare(query,ray(),[inside,far]);
 const instanced=new T.InstancedMesh(far.geometry,far.material,2);instanced.setMatrixAt(0,new T.Matrix4().makeTranslation(0,0,-4));instanced.setMatrixAt(1,new T.Matrix4().makeTranslation(3,0,-4));instanced.updateMatrixWorld(true);compare(query,ray(),[far,instanced]);
});
test('a nearby wall prunes triangle tests for distant detailed buildings without altering occlusion',()=>{
 const query=ctx.createNearestSceneryQuery(T),objects=Array.from({length:30},(_,i)=>box(0,0,-5-i*3));
 compare(query,ray(),objects.reverse());assert.equal(query.inspect().triangleTests,1);
 const r=ray();r.far=2;assert.equal(query.hit(r,objects),null);assert.equal(r.far,2);
});
