import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as T from 'three';

function setup(){
 const context=vm.createContext({window:{},performance});
 for(const file of ['player-motion.js','player-movement.js'])vm.runInContext(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),context);
 const motion=context.window.createPlayerMotion(),pos=new T.Vector3(0,1.75,0),aim=new T.Vector3(0,1.75,-5),velocity=new T.Vector3(),keys=new Set(['w','shift']),noop=()=>{};
 const parkour={active:()=>false,update:noop,air:noop,solid:()=>false,floorAt:()=>0,land:noop,kind:()=>null};
 const movement=context.window.createPlayerMovement({T,targetPosition:pos,targetAim:aim,walkVelocity:velocity,motion,keys,sway:{bump:noop},footsteps:{step:noop,land:noop,slide:noop},surfaceAt:()=>'',puff:noop,hitStop:noop,requestDraw:noop,obstacle:()=>false,groundHeight:()=>0,prepareWalking:noop,shiftHeight:d=>{pos.y+=d;aim.y+=d;},kick:noop,state:{ready:true},modalOpen:()=>false,fistsEngaged:()=>false,parkour:()=>parkour,pk:()=>parkour,parkourOn:()=>true,garden:{constrain:n=>n},expedition:{canMove:()=>true,constrain:n=>n}});
 const step=()=>{if(movement.needsStep())movement.move(1/60);movement.updateJump(1/60);movement.updateCrouch(1/60);movement.updateAir(1/60,velocity.length(),motion.inspect().airborne);};
 function launch(){for(let i=0;i<90;i++)step();movement.crouchHeld=true;movement.startSlide();for(let i=0;i<30&&!movement.dive;i++)step();assert.ok(movement.dive);assert.equal(motion.inspect().airborne,true);}
 return {motion,movement,keys,pos,step,launch};
}

test('dive interrupted before first airborne sample still lands and recovers',()=>{
 const f=setup();f.launch(); // updateAir has just launched the dive at the end of a frame.
 f.motion.reset(); // Same motion reset as an authoritative position correction.
 f.keys.clear();f.movement.crouchHeld=false;
 for(let i=0;i<120;i++)f.step();
 assert.equal(f.movement.dive,null);assert.equal(f.movement.state(),'ground');assert.equal(f.movement.proneT,0);
});

test('normal dive goes airborne, lands into a roll and returns to grounded movement',()=>{
 const f=setup();f.launch();let peak=0;
 for(let i=0;i<120;i++){f.step();peak=Math.max(peak,f.pos.y-1.75);}
 assert.ok(peak>.5);assert.equal(f.movement.dive,null);assert.equal(f.movement.state(),'crouch');assert.equal(f.movement.counts().rolls,1);
 f.movement.crouchHeld=false;for(let i=0;i<60;i++)f.step();assert.equal(f.movement.state(),'ground');
});
