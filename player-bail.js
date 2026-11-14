// Manual player bail. The existing vendored Jolt solver owns the 14-body jointed rig;
// the host still owns input, camera orientation, navigation and the authoritative world.
import {createJoltWorld, createRagdoll} from './ragdoll-jolt.js?v=20261114-continuation';
const STEP = 1 / 120;
// Measured roof fields describe top surfaces, not solid buildings. Keep the space
// beneath them open, and retain explicit walls and ceiling volumes separately.
export function physicsBoxesForWorld(world, position, radius = 8) {
  const x=position.x??position[0],z=position.z??position[2];
  if(!Number.isFinite(x)||!Number.isFinite(z))return [];
  radius=Math.max(2,Math.min(16,Number.isFinite(radius)?radius:8));
  const near=b=>b.minX<=x+radius&&b.maxX>=x-radius&&b.minZ<=z+radius&&b.maxZ>=z-radius;
  const distance=b=>Math.hypot(Math.max(b.minX-x,0,x-b.maxX),Math.max(b.minZ-z,0,z-b.maxZ));
  const explicit=(world.boxes||[]).filter(near).sort((a,b)=>distance(a)-distance(b)).slice(0,512);
  const slabs=[];
  for(const surface of world.surfaces||[]){
    const F=surface.field;if(!F||!Number.isFinite(F.cell)||F.cell<=0)continue;
    const c0=Math.max(0,Math.floor((x-radius-F.minX)/F.cell)),c1=Math.min(F.cols-1,Math.floor((x+radius-F.minX)/F.cell));
    const r0=Math.max(0,Math.floor((z-radius-F.minZ)/F.cell)),r1=Math.min(F.rows-1,Math.floor((z+radius-F.minZ)/F.cell));
    let previous=new Map();
    for(let r=r0;r<=r1;r++){
      const current=new Map();
      for(let c=c0;c<=c1;){
        const h=F.h[r*F.cols+c],start=c++;
        // Walking and recovery recognize every positive measured surface. Keep
        // low forecourt steps too, or a limp body settles beneath its own floor.
        if(!Number.isFinite(h)||h<=0)continue;
        while(c<=c1&&F.h[r*F.cols+c]===h)c++;
        const key=start+':'+c+':'+h,existing=previous.get(key);
        if(existing){existing.maxZ=F.minZ+(r+1)*F.cell;current.set(key,existing);}
        else{const slab={minX:F.minX+start*F.cell,maxX:F.minX+c*F.cell,minZ:F.minZ+r*F.cell,maxZ:F.minZ+(r+1)*F.cell,top:h,bottom:h-.2};slabs.push(slab);current.set(key,slab);}
      }
      previous=current;
    }
  }
  // Priority is nearest collision geometry; locality and merging keep normal district
  // fields well below this hard bound even when many roof maps overlap.
  slabs.sort((a,b)=>distance(a)-distance(b));
  return explicit.concat(slabs.slice(0,2048-explicit.length));
}
// A partially upright limp body can be supported by its feet while its pelvis is
// high. Only the network proxy uses this support classification; rendered physics
// and get-up gating remain untouched. Never infer ground from the mode string.
export function supportedProxyFeet({pelvis,supportPoints,floorAt,radius=.28}) {
  const floor=floorAt(pelvis.x,pelvis.z,pelvis.y+.08);
  if(!Number.isFinite(floor)||pelvis.y<floor-.08||pelvis.y-floor>1.4)return null;
  // The complete player footprint must share the contact's surface. A hand across
  // a ledge cannot ground an unsupported pelvis, nor can a roof ground a body below.
  for(const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]){
    const h=floorAt(pelvis.x+dx,pelvis.z+dz,floor+.08);
    if(!Number.isFinite(h)||Math.abs(h-floor)>.08)return null;
  }
  for(const {point,radius:r} of supportPoints||[]){
    if(!point||!Number.isFinite(r)||r<0||r>.2||Math.hypot(point.x-pelvis.x,point.z-pelvis.z)>.75)continue;
    const h=floorAt(point.x,point.z,point.y+.08),bottom=point.y-r;
    if(Number.isFinite(h)&&Math.abs(h-floor)<=.08&&bottom>=h-.08&&bottom<=h+.08)return floor;
  }
  return null;
}
export function recoverySpot({pelvis, floorAt, canStand, supportPoints, height = 1.8, radius = .28}) {
  // Never stand in midair, through a roof, or sideways through a nearby wall.
  let floor = floorAt(pelvis.x, pelvis.z, pelvis.y + .08),low=floor;
  if (!Number.isFinite(floor) || pelvis.y < floor - .08) return null;
  // A limp body may come to rest kneeling or partly upright. A high pelvis is
  // safe only with measured capsule contact beneath the complete footprint.
  if(pelvis.y-floor>.68&&supportedProxyFeet({pelvis,supportPoints,floorAt,radius})===null)return null;
  for (const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]) {
    const h = floorAt(pelvis.x + dx, pelvis.z + dz, pelvis.y + .08);
    if (!Number.isFinite(h)) return null;
    floor=Math.max(floor,h);low=Math.min(low,h);
  }
  // A 15 cm entrance step is safe footing. Use the highest support, so the
  // standing feet never begin inside it; larger ledges still block recovery.
  if(floor-low>.18||pelvis.y<floor-.08)return null;
  if (!canStand(pelvis.x,pelvis.z,floor,height,radius)) return null;
  return {x:pelvis.x,y:floor,z:pelvis.z};
}
export async function createPlayerBail(options={}) {
 const world=options.world||await createJoltWorld();
 try{return createPlayerBailWithWorld({...options,world,ownsWorld:!options.world});}catch(error){if(!options.world)world.dispose();throw error;}
}
export function createPlayerBailWithWorld({T,getModel,collisionBoxes=()=>[],groundHeight=()=>0,
  floorAt=groundHeight,canStand,bodyDimensions=()=>({height:1.8,radius:.28}),canTranslate=()=>true,onStart=()=>{},onRecover=()=>{},onCancel=()=>{},
  world:providedWorld=null,ownsWorld=false,createBody=createRagdoll,recoveryPose=null}={}) {
  if(!canStand||!providedWorld)throw new Error('Player bail requires a physics world and authoritative headroom query');
  const world=providedWorld;
  let model=null,rig=null,skeleton=null,state='idle',accumulator=0,still=0,elapsed=0,recoverTime=0;
  let wantsRecovery=false,spot=null,snapshot=null,rest=null,terrainKey='',savedNeck=null;
  const solids=[],tiles=[],cameraTarget=new T.Vector3(),cameraFrom=new T.Vector3();
  const remove=list=>{for(const item of list)item.remove();list.length=0;};
  function addBox(b){
    const center=b.center||[(b.minX+b.maxX)/2,(b.bottom+b.top)/2,(b.minZ+b.maxZ)/2];
    const half=b.half||[(b.maxX-b.minX)/2,(b.top-b.bottom)/2,(b.maxZ-b.minZ)/2];
    if([...center,...half].every(Number.isFinite)&&half.every(n=>n>0))solids.push(world.box(center,half));
  }
  // Local terrain tiles follow the physics body. Roofs/ceilings/walls are explicit boxes,
  // never generated from floorAt, which would fill the space underneath elevated slabs.
  function terrain(p){
    const x=Math.floor(p.x/2),z=Math.floor(p.z/2),key=x+','+z;
    if(key===terrainKey)return;terrainKey=key;remove(tiles);
    remove(solids);for(const b of collisionBoxes(p))addBox(b);
    for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++){
      const px=(x+dx)*2+1,pz=(z+dz)*2+1,h=groundHeight(px,pz);
      if(Number.isFinite(h))tiles.push(world.box([px,h-.5,pz],[1,.5,1]));
    }
  }
  function restore(){
    if(rest)for(const s of rest){s.bone.position.copy(s.p);s.bone.quaternion.copy(s.q);}
    if(model?.byName.neck01&&savedNeck)model.byName.neck01.scale.copy(savedNeck);
  }
  function beginRecovery(){
    spot=recoverySpot({pelvis:rig.pelvis(),supportPoints:rig.supportPoints?.(),floorAt,canStand,...bodyDimensions()});if(!spot)return false;
    rig.apply();model.root.updateMatrixWorld(true);
    const capture=model.skeleton.bones.map(bone=>({bone,p:bone.getWorldPosition(new T.Vector3()),q:bone.getWorldQuaternion(new T.Quaternion())}));
    rig.end();model.root.position.set(spot.x,spot.y,spot.z);model.root.rotation.x=0;model.root.rotation.z=0;
    restore();model.root.updateMatrixWorld(true);
    const map=new Map(capture.map(s=>[s.bone,s]));
    snapshot=capture.map(s=>{const parent=map.get(s.bone.parent),q=parent?.q||s.bone.parent.getWorldQuaternion(new T.Quaternion());return {bone:s.bone,q:q.clone().invert().multiply(s.q),p:parent?null:s.bone.parent.worldToLocal(s.p.clone())};});
    cameraFrom.copy(cameraTarget);state='recovering';recoverTime=0;return true;
  }
  const api={
    get active(){return state!=='idle';},get state(){return state;},get cameraTarget(){return cameraTarget;},
    start({velocity=new T.Vector3(),dt=1/60}={}){
      if(state!=='idle')return false;
      const next=getModel();if(!next?.skeleton||!next.byName?.['upperleg01.L'])return false;
      if(next!==model||next.skeleton!==skeleton){rig?.dispose?.();model=next;skeleton=next.skeleton;rig=createBody(world,T,model);}
      rest=model.skeleton.bones.map(bone=>({bone,p:bone.position.clone(),q:bone.quaternion.clone()}));
      savedNeck=model.byName.neck01?.scale.clone();model.byName.neck01?.scale.setScalar(1);
      model.root.updateMatrixWorld(true);
      terrainKey='';terrain(model.root.position);
      // Explicit full velocity, including vertical fall speed: not a second animation delta.
      rig.start({velocity,dt,active:false});state='ragdoll';still=0;elapsed=0;accumulator=0;wantsRecovery=false;
      cameraTarget.copy(rig.pelvis()).add(new T.Vector3(0,.4,0));onStart();return true;
    },
    requestRecovery(){if(state!=='ragdoll')return false;wantsRecovery=true;return still>=.6&&beginRecovery();},
    update(dt){
      if(!api.active||!Number.isFinite(dt)||dt<=0)return;
      dt=Math.min(dt,.1);
      if(state==='recovering'){
        recoverTime+=dt;const k=Math.min(1,recoverTime/.85),ease=k*k*(3-2*k);
        restore();if(recoveryPose)recoveryPose(dt);else model.motion?.update(dt,{velocity:new T.Vector3()});
        for(const s of snapshot){s.bone.quaternion.slerpQuaternions(s.q,s.bone.quaternion.clone(),ease);if(s.p)s.bone.position.lerpVectors(s.p,s.bone.position.clone(),ease);}
        cameraTarget.lerpVectors(cameraFrom,new T.Vector3(spot.x,spot.y+1.75,spot.z),ease);
        if(k===1){restore();state='idle';remove(solids);remove(tiles);onRecover({position:[spot.x,spot.y,spot.z],velocity:[0,0,0]});}return;
      }
      accumulator+=dt;
      while(accumulator>=STEP){terrain(rig.pelvis());world.step(STEP);accumulator-=STEP;elapsed+=STEP;
        const supported=recoverySpot({pelvis:rig.pelvis(),supportPoints:rig.supportPoints?.(),floorAt,canStand,...bodyDimensions()});
        still=rig.maxSpeed()<.45&&supported?still+STEP:0;
      }
      rig.apply();const pelvis=rig.pelvis();
      const ground=floorAt(pelvis.x,pelvis.z,pelvis.y+.08);
      const eye=pelvis.clone().add(new T.Vector3(0,.4,0));if(Number.isFinite(ground))eye.y=Math.max(eye.y,ground+.3);
      cameraTarget.lerp(eye,1-Math.exp(-12*dt));
      if(wantsRecovery&&still>=.6&&elapsed>=.8)beginRecovery();
    },
    // Network reconciliation is not a get-up. Preserve every body's velocity and
    // articulation while shifting the physical root to a nearby accepted feet pose.
    correct({position}={}){
      if(state!=='ragdoll'||!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))return false;
      const before=api.pose(),delta=new T.Vector3(position[0]-before.x,position[1]-before.y,position[2]-before.z);
      if(delta.length()>8||!canTranslate(rig.supportPoints?.()||[],delta))return false;
      if(!rig.translate?.(delta))return false;
      terrainKey='';terrain(rig.pelvis());rig.apply();cameraTarget.add(delta);still=0;
      return true;
    },
    cancel(){if(!api.active)return;rig.end();restore();state='idle';snapshot=null;remove(solids);remove(tiles);onCancel();},
    pose(){
      if(!rig||state==='idle')return null;
      const p=state==='recovering'?new T.Vector3(spot.x,spot.y+.35,spot.z):rig.pelvis(),v=state==='recovering'?new T.Vector3():rig.velocity();
      const floor=floorAt(p.x,p.z,p.y+.08),supported=state==='recovering'?spot.y:supportedProxyFeet({pelvis:p,supportPoints:rig.supportPoints?.(),floorAt});
      const y=supported??Math.max(p.y-.35,Number.isFinite(floor)?floor:-Infinity);
      return {x:p.x,y,z:p.z,vx:v.x,vy:v.y,vz:v.z};
    },
    inspect:()=>({state,settled:still>=.6,recoveryRequested:wantsRecovery,elapsed,still,parts:rig?.parts||0,jointGap:state==='ragdoll'?rig.jointGap():0,speed:state==='ragdoll'?rig.maxSpeed():0}),
    captureState(){
      const save=a=>a?.map(s=>({name:s.bone.name,p:s.p?.toArray()||null,q:s.q.toArray()}))||null;
      return {version:1,state,accumulator,still,elapsed,recoverTime,wantsRecovery,spot:spot?{...spot}:null,terrainKey,
       cameraTarget:cameraTarget.toArray(),cameraFrom:cameraFrom.toArray(),savedNeck:savedNeck?.toArray()||null,rest:save(rest),snapshot:save(snapshot),rig:rig?.captureState()||null,
       root:model?{p:model.root.position.toArray(),q:model.root.quaternion.toArray(),scale:model.root.scale.toArray()}:null,
       bones:model?.skeleton.bones.map(b=>({name:b.name,p:b.position.toArray(),q:b.quaternion.toArray(),scale:b.scale.toArray()}))||null,
       solids:solids.map(b=>b.capture()),tiles:tiles.map(b=>b.capture())};
    },
    // Fresh-world restore only. Jolt's full solver checkpoint must be restored by
    // the owner immediately afterwards; these transforms are not a substitute.
    restoreState(value){
      if(rig||state!=='idle'||solids.length||tiles.length)throw Error('Restore bail into a fresh actor.');
      const tuple=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite),fail=()=>{throw Error('Invalid bail checkpoint.');};
      if(!value||value.version!==1||!['idle','ragdoll','recovering'].includes(value.state)||!['accumulator','still','elapsed','recoverTime'].every(k=>Number.isFinite(value[k])&&value[k]>=0)||value.accumulator>=STEP+.000001||typeof value.wantsRecovery!=='boolean'||typeof value.terrainKey!=='string'||value.terrainKey.length>64||!tuple(value.cameraTarget,3)||!tuple(value.cameraFrom,3)||value.savedNeck!==null&&!tuple(value.savedNeck,3))fail();
      if(value.spot!==null&&(!value.spot||!['x','y','z'].every(k=>Number.isFinite(value.spot[k]))))fail();
      if(!Array.isArray(value.solids)||value.solids.length>2048||!Array.isArray(value.tiles)||value.tiles.length>169)fail();
      const specs=[...value.solids,...value.tiles],ids=new Set();for(const b of specs){if(!b||!Number.isSafeInteger(b.id)||b.id<0||b.id>0xffffffff||ids.has(b.id)||!tuple(b.center,3)||!tuple(b.half,3)||b.half.some(n=>n<=0))fail();ids.add(b.id);}
      if(!value.rig){if(value.state!=='idle'||value.root||value.bones||value.rest||value.snapshot||specs.length)fail();return;}
      const next=getModel();if(!next?.skeleton||!next.byName?.['upperleg01.L'])fail();
      const checkBones=(a,{positions=true,scale=false}={})=>Array.isArray(a)&&a.length===next.skeleton.bones.length&&a.every((v,i)=>v.name===next.skeleton.bones[i].name&&tuple(v.q,4)&&(positions?tuple(v.p,3):v.p===null||tuple(v.p,3))&&(!scale||tuple(v.scale,3)));
      if(!value.root||!tuple(value.root.p,3)||!tuple(value.root.q,4)||!tuple(value.root.scale,3)||value.root.scale.some((v,i)=>v!==next.root.scale.toArray()[i])||!checkBones(value.bones,{scale:true})||!checkBones(value.rest)||value.snapshot!==null&&!checkBones(value.snapshot,{positions:false})||value.state==='recovering'&&(!value.spot||!value.snapshot)||!Number.isSafeInteger(value.rig.groupId))fail();
      model=next;skeleton=next.skeleton;rig=createBody(world,T,model,{groupId:value.rig.groupId});rig.restoreState(value.rig);
      model.root.position.fromArray(value.root.p);model.root.quaternion.fromArray(value.root.q);
      value.bones.forEach((v,i)=>{const b=skeleton.bones[i];b.position.fromArray(v.p);b.quaternion.fromArray(v.q);b.scale.fromArray(v.scale);});
      const read=a=>a?.map((s,i)=>({bone:skeleton.bones[i],p:s.p?new T.Vector3().fromArray(s.p):null,q:new T.Quaternion().fromArray(s.q)}))||null;
      rest=read(value.rest);snapshot=read(value.snapshot);state=value.state;accumulator=value.accumulator;still=value.still;elapsed=value.elapsed;recoverTime=value.recoverTime;wantsRecovery=value.wantsRecovery;spot=value.spot;terrainKey=value.terrainKey;
      savedNeck=value.savedNeck?new T.Vector3().fromArray(value.savedNeck):null;cameraTarget.fromArray(value.cameraTarget);cameraFrom.fromArray(value.cameraFrom);
      for(const b of value.solids)solids.push(world.box(b.center,b.half,b.id));for(const b of value.tiles)tiles.push(world.box(b.center,b.half,b.id));model.root.updateMatrixWorld(true);
    },
    dispose(){api.cancel();rig?.dispose?.();remove(solids);remove(tiles);if(ownsWorld)world.dispose?.();}
  };
  return api;
}
