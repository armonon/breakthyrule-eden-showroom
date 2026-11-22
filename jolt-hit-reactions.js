// Active-ragdoll hit reactions (Jolt) for characters that are standing and animated: the match bots.
//
// A blow starts the character's 14-body Jolt rig (ragdoll-jolt.js) from its current pose with an impulse centred on
// where it was hit (head, chest, arm or leg). Joint motors then drive every body back toward the pose the animation
// system is producing that frame, and a spring holds the pelvis to the animated pelvis, so the character staggers,
// twists and recovers physically while it keeps walking, aiming and turning. Motor strength starts low (the blow wins)
// and rises over a fraction of a second (the body wins), more slowly after a heavier blow. A blow that drives the pelvis far from where the animation
// wants it is a lost balance: the rig hands over, with its current pose, to the existing knockdown ragdoll
// (character-motion.js). A recovered body blends back into the animation over a quarter of a second.
//
// Client only: the match bots are local. The authoritative server never loads this file.
import {createJoltWorld,createRagdoll} from './ragdoll-jolt.js?v=20261121-push2';
const STEP=1/60,TILE=2;
// How far (metres) the pelvis may be driven off its animated spot before balance is lost: a light hit has to shove a
// body a long way to drop it, a sniper round or a blast very little.
const fallAt=strength=>Math.min(.65,Math.max(.3,.75-.17*strength));
const ZONE_HEIGHT={head:1.62,chest:1.25,arm:1.3,leg:.55};
const smooth=k=>k*k*(3-2*k);

// walls(): building footprints [x, z, width, depth] the bodies must not pass into (taller than anyone).
export async function createHitReactions({T,groundY=()=>0,walls=()=>[],max=3,onFall=()=>{}}={}){
 const world=await createJoltWorld();
 const rigs=new Map(),active=new Map(),tiles=new Map(),blocks=new Map();let acc=0,last=null,stats={hits:0,falls:0,recovered:0};
 // A character can swap its skeleton (a placeholder replaced by the full model), so a rig belongs to a skeleton.
 const rigFor=model=>{let e=rigs.get(model);if(e&&e.skeleton!==model.skeleton){e.rig.dispose();e=null;}if(!e){e={rig:createRagdoll(world,T,model),skeleton:model.skeleton};rigs.set(model,e);}return e.rig;};
 // Ground under each reacting body: 2 m tiles around it, added as needed and cleared when nobody is reacting. The
 // character's own feet are the truth for the floor it stands on (the measured terrain can disagree on platforms and
 // steps); a neighbouring tile follows the measured ground only when that is within a step of the feet.
 function ground(p){
  const cx=Math.floor(p.x/TILE),cz=Math.floor(p.z/TILE);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
   const x=(cx+dx+.5)*TILE,z=(cz+dz+.5)*TILE,measured=dx||dz?groundY(x,z):NaN,h=Number.isFinite(measured)&&Math.abs(measured-p.y)<.25?measured:p.y;
   const key=(cx+dx)+','+(cz+dz)+','+Math.round(h*10);if(tiles.has(key))continue;tiles.set(key,world.box([x,h-.5,z],[TILE/2,.5,TILE/2]));}
  // Buildings within reach of a falling body.
  const W=walls();for(let i=0;i<W.length;i++){const [x,z,w,d]=W[i];if(blocks.has(i)||!(w>0&&d>0))continue;
   if(Math.max(Math.abs(p.x-x)-w/2,Math.abs(p.z-z)-d/2)<3.5)blocks.set(i,world.box([x,p.y+2.5,z],[w/2,3,d/2]));}
 }
 function clearTiles(){for(const t of tiles.values())t.remove();tiles.clear();for(const b of blocks.values())b.remove();blocks.clear();}
 const standing=model=>!!model?.root?.parent&&!!model.byName?.['upperleg01.L']&&!(model.motion?.downAmount?.()>0);
 // Per-body impulse: strongest at the struck height, a share through the whole body, a little downward at the hit.
 function impulseFor(model,direction,strength,zone){
  const dir=direction.clone().setY(0);if(dir.lengthSq()<1e-6)dir.set(0,0,1);dir.normalize();
  const scale=model.root.scale.y||1,at=(ZONE_HEIGHT[zone]||1.2)*scale;
  return y=>{const w=Math.exp(-(((y-at)/(.38*scale))**2));return dir.clone().multiplyScalar(strength*(.35+2.3*w)).add(new T.Vector3(0,-.35*strength*w,0));};
 }
 function end(model,{fallen=false}={}){
  const s=active.get(model);if(!s)return;active.delete(model);
  if(!s.blend)s.rig.end();
  if(!active.size){clearTiles();acc=0;}
 }
 const api={
  // A blow on a standing character. direction: the way the blow travels; strength: about 0.6 for a light hit,
  // 1.5 to 2.5 for a heavy one; zone: head, chest, arm or leg. Returns false if the body cannot react (down, or busy).
  // velocity: how fast the character is already moving (a running body keeps running as it takes the blow).
  hit(model,{direction,strength=1,zone='chest',velocity=null}={}){
   if(!standing(model)||!direction)return false;
   let s=active.get(model);const impulse=impulseFor(model,direction,strength,zone);stats.hits++;
   if(s&&!s.blend){s.rig.push(impulse);s.k=Math.max(.2,s.k-.25*strength);s.t=Math.min(s.t,.15);s.strength=Math.max(s.strength,strength);return true;}
   if(s)end(model);
   if(active.size>=max){const oldest=[...active.entries()].sort((a,b)=>b[1].t-a[1].t)[0];if(oldest)api.release(oldest[0]);}
   const rig=rigFor(model);model.root.updateMatrixWorld(true);ground(model.root.getWorldPosition(new T.Vector3()));
   rig.start({impulse,velocity:velocity?new T.Vector3(velocity.x,0,velocity.z):null,dt:STEP,active:true});
   s={rig,skeleton:model.skeleton,root:model.root.getWorldPosition(new T.Vector3()),tv:new T.Vector3(),t:0,k:Math.max(.12,Math.min(.7,.8-.26*strength)),strength,blend:null,off:0};active.set(model,s);
   return true;
  },
  reacting:model=>active.has(model),
  // Call once a frame after every reacting character has been animated (its bones hold this frame's target pose).
  update(dt){
   if(!active.size)return;
   for(const [model,s] of [...active])if(model.skeleton!==s.skeleton||!s.blend&&!standing(model))end(model); // knockdown, death or a new skeleton took over   // the knockdown ragdoll or a death took over
   // The animated root's own velocity, for the pelvis spring's damping.
   for(const [model,s] of active)if(!s.blend&&dt>0){const p=model.root.getWorldPosition(new T.Vector3());s.tv.copy(p).sub(s.root).divideScalar(dt).setY(0);s.root.copy(p);}
   acc+=Math.min(Math.max(dt,0),.1);
   const live=[...active].filter(([,s])=>!s.blend);
   while(acc>=STEP){acc-=STEP;
    for(const [model,s] of live){s.k=Math.min(1,s.k+STEP*1.6/Math.max(1,s.strength));ground(model.root.getWorldPosition(new T.Vector3()));s.off=s.rig.drive(s.k,s.tv);s.peak=Math.max(s.peak||0,s.off);}
    if(live.length)world.step(STEP);
   }
   for(const [model,s] of [...active]){
    s.t+=dt;
    if(s.blend){if(model.skeleton!==s.skeleton){end(model);continue;}
     s.blend.t+=dt;const k=smooth(Math.min(1,s.blend.t/.25));
     model.skeleton.bones.forEach((b,i)=>b.quaternion.slerpQuaternions(s.blend.q[i],b.quaternion.clone(),k));
     model.byName.root?.position.lerpVectors(s.blend.root,model.byName.root.position.clone(),k);
     if(k>=1){active.delete(model);if(!active.size)clearTiles();}
     continue;
    }
    s.rig.apply();model.root.updateMatrixWorld(true);
    if(s.off>fallAt(s.strength)){
     // Lost balance: the knockdown ragdoll takes the body from exactly this pose, falling the way it was moving.
     last={fell:true,peak:+s.peak.toFixed(2),strength:s.strength};
     const v=s.rig.velocity().setY(0),speed=v.length();end(model);stats.falls++;
     model.motion?.knockdown?.(speed>.05?v.normalize():new T.Vector3(0,0,1),Math.min(3,Math.max(1.4,speed*.9)));onFall(model);
    }
    else if(s.t>.35+.25*s.strength&&(s.rig.maxSpeed()<1.6||s.t>1.5)){
     s.blend={t:0,q:model.skeleton.bones.map(b=>b.quaternion.clone()),root:model.byName.root?.position.clone()||new T.Vector3()};
     s.rig.end();stats.recovered++;last={fell:false,peak:+(s.peak||0).toFixed(2),strength:s.strength};
    }
   }
  },
  release(model){const s=active.get(model);if(!s)return;if(!s.blend){s.rig.apply();s.blend={t:0,q:model.skeleton.bones.map(b=>b.quaternion.clone()),root:model.byName.root?.position.clone()||new T.Vector3()};s.rig.end();}},
  forget(model){end(model);const e=rigs.get(model);if(e){e.rig.dispose();rigs.delete(model);}},
  clear(){for(const model of [...active.keys()])end(model);clearTiles();},
  inspect:()=>({active:[...active.values()].map(s=>({t:+s.t.toFixed(2),k:+s.k.toFixed(2),off:+s.off.toFixed(2),peak:+(s.peak||0).toFixed(2),strength:s.strength,blend:!!s.blend})),last,rigs:rigs.size,tiles:tiles.size,walls:blocks.size,...stats}),
  dispose(){api.clear();for(const e of rigs.values())e.rig.dispose();rigs.clear();world.dispose();}
 };
 return api;
}
