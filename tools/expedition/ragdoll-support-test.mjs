import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const dir='../..';
const text=fs.readFileSync(path.join(__dirname,dir,'player-bail.js'),'utf8').replace(/^import .*;$/m,'').replace(/^export /gm,'');
const c={};vm.createContext(c);vm.runInContext(text,c);
test('low measured forecourt floors exist in the ragdoll collision world',()=>{
 const field={cell:1,minX:0,minZ:0,cols:2,rows:2,h:[.15,.15,.15,.15]};
 const boxes=c.physicsBoxesForWorld({boxes:[],surfaces:[{field}]},{x:1,z:1});
 assert.equal(boxes.length,1);assert.equal(boxes[0].top,.15);assert.equal(boxes[0].minX,0);assert.equal(boxes[0].maxX,2);assert.equal(boxes[0].maxZ,2);
});
test('roof slabs remain hollow and zero ground is left to terrain tiles',()=>{
 const field={cell:1,minX:0,minZ:0,cols:3,rows:1,h:[0,4,4]};
 const boxes=c.physicsBoxesForWorld({boxes:[],surfaces:[{field}]},{x:1,z:0});
 assert.equal(boxes.length,1);assert.equal(boxes[0].minX,1);assert.equal(boxes[0].bottom,3.8);assert.equal(boxes[0].top,4);
});
test('get-up across a low entrance step uses the highest support underfoot',()=>{
 let standY=null;
 const spot=c.recoverySpot({pelvis:{x:0,y:.4,z:0},floorAt:x=>x>0?.15:0,canStand:(x,z,y)=>{standY=y;return true;}});
 assert.equal(spot.y,.15);assert.equal(standY,.15);
});
test('step support does not permit getting up at a cliff or under a low ceiling',()=>{
 assert.equal(c.recoverySpot({pelvis:{x:0,y:4.3,z:0},floorAt:x=>x>0?0:4,canStand:()=>true}),null);
 assert.equal(c.recoverySpot({pelvis:{x:0,y:.4,z:0},floorAt:()=>.15,canStand:()=>false}),null);
 assert.equal(c.recoverySpot({pelvis:{x:0,y:2,z:0},floorAt:()=>0,canStand:()=>true}),null);
});
test('a partly upright resting body needs actual capsule contact to recover',()=>{
 const options={pelvis:{x:0,y:.95,z:0},floorAt:()=>0,canStand:()=>true};
 assert.equal(c.recoverySpot(options),null);
 assert.equal(c.recoverySpot({...options,supportPoints:[{point:{x:.1,y:.08,z:0},radius:.08}]}).y,0);
 assert.equal(c.recoverySpot({...options,supportPoints:[{point:{x:.1,y:.3,z:0},radius:.08}]}),null);
 assert.equal(c.recoverySpot({...options,supportPoints:[{point:{x:1,y:.08,z:0},radius:.08}]}),null);
});
