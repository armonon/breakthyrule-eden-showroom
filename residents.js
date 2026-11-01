'use strict';
window.gardenResidentDefinitions = [
 {id:'violet-trickster',name:'Violet Trickster',region:'Pavilion path',assetVersion:4,offset:0,speed:.43,pause:11,moves:true,points:[[-4.6,7.2],[-4.7,5.2],[-3.4,4.8],[-2.5,6.4]]}
];

window.createGardenResidents = function(T,scene,{reduced=false,onChange=()=>{},renderer,sky}={}) {
 const start=performance.now(),epoch=Date.now()/1000,entries=new Map();
 const point=new T.Vector3(),tangent=new T.Vector3();
 let environment;
 if(renderer&&sky){
  const backdrop=new T.Scene();backdrop.add(sky.clone());
  const generator=new T.PMREMGenerator(renderer);
  environment=generator.fromScene(backdrop,0,.1,400).texture;generator.dispose();
 }
 for(const def of window.gardenResidentDefinitions){
  const curve=new T.CatmullRomCurve3(def.points.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal');
  curve.arcLengthDivisions=500;
  entries.set(def.id,{def,curve,length:curve.getLength(),root:null,mixer:null,actions:{},status:'loading',error:null,job:null,controller:null});
 }
 // Every clip stays enabled; a pose is a list of [clip, time, weight] evaluated at exact times so the
 // path routine stays in sync for every visitor while the fight brain can drive the same mixer.
 function pose(entry,layers){
  const used=new Set();
  for(const [name,time,weight] of layers){const action=entry.actions[name];if(!action)continue;used.add(name);action.time=Math.max(0,time);action.setEffectiveWeight(weight);}
  for(const [name,action] of Object.entries(entry.actions))if(!used.has(name))action.setEffectiveWeight(0);
  entry.mixer.update(0);
 }
 function pathState(entry,time){
  const duration=entry.length/entry.def.speed,cycle=duration+entry.def.pause;
  const phase=reduced?entry.def.offset%cycle:(time+entry.def.offset)%cycle,round=Math.floor((time+entry.def.offset)/cycle);
  const walking=!reduced&&phase<duration,u=Math.min(phase/duration,1);
  entry.curve.getPointAt(u,point);entry.curve.getTangentAt(u,tangent);
  return {position:point.clone(),yaw:Math.atan2(tangent.x,tangent.z),walking,phase,duration,round};
 }
 function updateEntry(entry,time){
  if(!entry.root||entry.controller?.active)return;
  const state=pathState(entry,time),{phase,duration}=state;
  entry.root.position.copy(state.position);entry.root.rotation.set(0,state.yaw,0);
  const weight=state.walking?Math.min(1,phase/.35,(duration-phase)/.35):0;
  const rest=phase-duration,dance=entry.actions.Breakdance&&!reduced&&state.round%2===0?entry.actions.Breakdance.getClip().duration:0;
  const rock=entry.actions.Toprock&&!reduced&&state.round%2===1?Math.min(6,entry.def.pause-1):0;
  let special=null,specialWeight=0,specialTime=0;
  if(rest>0&&dance&&rest<dance+.4){special='Breakdance';specialTime=Math.min(rest,dance-.01);specialWeight=Math.min(1,rest/.35,(dance+.4-rest)/.4);}
  else if(rest>0&&rock&&rest<rock){special='Toprock';specialTime=rest;specialWeight=Math.min(1,rest/.4,(rock-rest)/.5);}
  const idle=Math.max(0,1-weight-specialWeight);
  pose(entry,[['Walk',reduced?0:phase,weight],['Idle',reduced?0:phase,idle],...(special?[[special,specialTime,specialWeight]]:[])]);
  entry.animation=special&&specialWeight>.5?special:state.walking?'Walk':'Idle';
 }
 function attachClips(entry,clips){
  for(const [name,clip] of Object.entries(clips)){
   const old=entry.actions[name];if(old){old.stop();entry.mixer.uncacheAction(old.getClip());}
   const action=entry.mixer.clipAction(clip);action.setLoop(T.LoopRepeat,Infinity);action.play();action.setEffectiveWeight(0);entry.actions[name]=action;
  }
 }
 async function load(id){
  const entry=entries.get(id);if(!entry||entry.root)return;if(entry.job)return entry.job;
  entry.status='loading';entry.error=null;onChange();
  entry.job=(async()=>{
   try{
    const gltf=await showroomAssets.model('/residents/'+id+'.glb?v='+(entry.def.assetVersion||3));
    const walk=gltf.animations.find(c=>c.name==='Walk'),idle=gltf.animations.find(c=>c.name==='Idle');
    let skins=0;gltf.scene.traverse(n=>{if(n.isSkinnedMesh)skins++;});
    if(!skins||!walk||!idle)throw new Error('Resident needs a skin and Walk / Idle clips.');
    entry.root=gltf.scene;entry.root.name=entry.def.name;
    entry.root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.frustumCulled=false;n.userData.residentId=id;
     if(entry.def.assetVersion===4&&environment)for(const material of Array.isArray(n.material)?n.material:[n.material]){material.envMap=environment;material.envMapIntensity=.85;material.needsUpdate=true;}
    }});
    entry.mixer=new T.AnimationMixer(entry.root);
    attachClips(entry,{Walk:walk,Idle:idle});
    if(entry.def.moves&&window.createJesterMoves){
     entry.moves=window.createJesterMoves(T,entry.root);attachClips(entry,entry.moves.clips);
     entry.moves.loadMixamo().then(names=>{if(names.length){attachClips(entry,Object.fromEntries(names.map(n=>[n,entry.moves.clips[n]])));onChange();}});
    }
    scene.add(entry.root);updateEntry(entry,epoch+(performance.now()-start)/1000);entry.status='ready';
   }catch(error){entry.status='error';entry.error='Model unavailable';console.warn('Garden resident unavailable:',id,error);}
   finally{entry.job=null;onChange();}
  })();return entry.job;
 }
 const now=()=>epoch+(performance.now()-start)/1000;
 return {
  ready:Promise.all([...entries.keys()].map(load)),retry:load,
  update(){const time=now();for(const entry of entries.values())updateEntry(entry,time);},
  get(id){return entries.get(id);},
  pose,
  pathState(id){const entry=entries.get(id);return entry?pathState(entry,now()):null;},
  pick(raycaster,maxDistance=Infinity){return raycaster.intersectObjects([...entries.values()].flatMap(e=>e.root?[e.root]:[]),true).find(hit=>hit.distance<maxDistance)?.object.userData.residentId;},
  inspect(){return [...entries.values()].map(e=>({id:e.def.id,name:e.def.name,region:e.def.region,assetVersion:e.def.assetVersion||3,status:e.status,error:e.error,animation:e.controller?.active?e.controller.animation:e.animation,mode:e.controller?.active?e.controller.mode:'path',clips:Object.keys(e.actions),mixamo:e.moves?Object.entries(e.moves.meta).filter(([,m])=>m.source==='mixamo').map(([n])=>n):[],position:e.root?.position.toArray(),yaw:e.root?.rotation.y}));}
 };
};
