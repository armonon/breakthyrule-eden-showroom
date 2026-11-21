'use strict';
// Direct entry to the same game, not a second gameplay implementation. Simulation,
// interactions, character, locomotion, parkour and bail all come from shared modules.
(async()=>{
 const $=id=>document.getElementById(id),stage=$('scene'),status=$('entry-loading-status');
 const lifetime=new AbortController(),listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:lifetime.signal});
 let frame=0,previous=0,disposed=false,ready=false,renderer=null,scene=null,camera=null,garden=null,expedition=null,body=null,bail=null,bailLoading=false,preferences=null,observer=null,touch=null;
 let preparingAvatar=false,third=false,thirdBlend=0,thirdSide=1,held=false,fovKick=0,hitStopUntil=0,drag=null,graphics='medium';
 const keys=new Set(),motion=window.createPlayerMotion(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const modalOpen=()=>!!document.querySelector('dialog[open]')||!$('night-chat').hidden;
 const fail=error=>{ready=false;status.textContent='The expedition could not finish loading. '+error.message;$('entry-loading').hidden=false;$('entry-loading').setAttribute('role','alert');$('entry-retry').hidden=false;document.querySelector('.entry-spinner').hidden=true;console.error(error);};
 $('entry-retry').onclick=()=>location.reload();
 function requestDraw(){if(!frame&&!disposed&&!document.hidden)frame=requestAnimationFrame(draw);}
 function stop(){keys.clear();drag=null;if(movement)movement.crouchHeld=false;walkVelocity.set(0,0,0);document.exitPointerLock?.();}
 function home(){if(disposed)return;if(!renderer){location.assign('/showroom.html');return;}status.textContent='Returning to Eden…';$('entry-loading').hidden=false;stop();expedition?.leave();dispose();location.assign('/showroom.html');}
 listen($('return-eden'),'click',event=>{event.preventDefault();home();});
 function dispose(){
  if(disposed)return;if(!renderer){disposed=true;lifetime.abort();return;}disposed=true;ready=false;cancelAnimationFrame(frame);frame=0;lifetime.abort();observer?.disconnect();
  expedition?.dispose?.({preserveSession:true});garden?.district.dispose?.();bail?.dispose();bail=null;body?.dispose();preferences?.destroy();touch?.dispose?.();footsteps?.dispose?.();
  // Release every distinct GPU resource once. A subsequent document receives fresh
  // resources, even if the browser keeps this document in its back/forward cache.
  const geometries=new Set(),materials=new Set(),textures=new Set();scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material||[])){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  for(const t of textures)t.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene?.clear();post?.dispose?.();lighting?.dispose?.();renderer?.dispose();renderer?.forceContextLoss();
 }
 // pageshow must survive the scoped listener cleanup above.
 window.addEventListener('pageshow',event=>{if(event.persisted&&disposed)location.reload();});
 window.addEventListener('pagehide',dispose);
 if(!window.THREE){fail(new Error('The graphics engine is unavailable.'));return;}
 const T=window.THREE,targetPosition=new T.Vector3(11.7,1.75,-24),targetAim=new T.Vector3(11.7,1.75,-29),walkVelocity=new T.Vector3(),aim=new T.Vector3();
 const sway=window.createCameraSway(T,{reduced}),footsteps=window.createFootsteps?.(),state={get ready(){return ready;}};
 let gripsView=null,perfHud=null;let movement=null,parkour=null,post=null,atmosphere=null,lighting=null,quality=null,warmup=null,flare=null,world=null,lastLandmarkCheck=-Infinity,lastBailLabel='';
 const groundHeight=()=>0,surfaceAt=p=>Math.abs(p.x-11.7)<2.1?'brick':'grass';
 function shiftHeight(delta){targetPosition.y+=delta;targetAim.y+=delta;}
 function place(x,z,lx=x,lz=z-5,y=0){bail?.cancel();movement?.cancelTraversal();parkour?.reset();motion.reset();walkVelocity.set(0,0,0);targetPosition.set(x,1.75+y,z);targetAim.set(lx,1.75+y,lz);camera.position.copy(targetPosition);aim.copy(targetAim);requestDraw();}
 function correctPose(p){
  if(bail?.active){const current=bail.pose();if(!current||!['x','y','z'].every(k=>Number.isFinite(p[k])))return;const delta=new T.Vector3(p.x-current.x,p.y-current.y,p.z-current.z);if(delta.length()>7.9)delta.setLength(7.9);const ok=bail.correct?.({position:[current.x+delta.x,current.y+delta.y,current.z+delta.z]});if(ok){const shift=bail.cameraTarget.clone().sub(targetPosition);targetPosition.add(shift);targetAim.add(shift);}else $('night-event').textContent='Synchronizing physical position…';requestDraw();return;}
  const velocity=motion.inspect().velocity;
  place(p.x,p.z,p.x+Math.sin(p.yaw)*5,p.z+Math.cos(p.yaw)*5,p.y||0);
  // A correction can leave the feet over a gap. Rebase free fall against the
  // actual support instead of letting the next walking update snap to ground.
  const floor=world.supportAt(p.x,p.z,(p.y||0)+.05,body.bodyDimensions().radius);
  if((p.y||0)>floor+.05)motion.set(p.y-floor,Math.min(0,velocity));
 }
 function prepareWalking(){const h=motion.inspect().height,floor=parkour.supportAt(targetPosition.x,targetPosition.z,targetPosition.y-1.75-h+.45);shiftHeight(1.75+floor+h-targetPosition.y);}
 function look(dx,dy){if(!ready||modalOpen())return;const direction=targetAim.clone().sub(targetPosition).normalize(),p=preferences.get(),s=third?p.thirdSensitivity:p.firstSensitivity,invert=window.edenSettings?.get('invertY')?-1:1;
  const yaw=Math.atan2(direction.x,-direction.z)+dx*.0025*s,pitch=T.MathUtils.clamp(Math.asin(direction.y)-dy*.0025*s*invert,-1.35,1.35);targetAim.copy(targetPosition).add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(5));requestDraw();}
 function setThird(value){third=!!value;thirdSide=window.edenSettings?.get('shoulder')==='left'?-1:1;requestDraw();}
 const getPose=()=>({x:targetPosition.x,y:targetPosition.y-1.75,z:targetPosition.z,...(bail?.active?bail.pose():{}),yaw:Math.atan2(targetAim.x-targetPosition.x,targetAim.z-targetPosition.z),pitch:Math.atan2(targetAim.y-targetPosition.y,Math.hypot(targetAim.x-targetPosition.x,targetAim.z-targetPosition.z)),mode:bail?.active?'ragdoll':movement.state(),movement:bail?.active?'ragdoll':movement.state(),vy:bail?.active?bail.pose()?.vy:motion.inspect().velocity});
 async function toggleBail(){
  if(!ready||!expedition?.live()||!expedition.canMove()||modalOpen()||bailLoading)return;
  if(bail?.active){bail.requestRecovery();requestDraw();return;}bailLoading=true;const code=expedition.inspect().state?.code;
  try{
   if(!bail){const {createPlayerBail,physicsBoxesForWorld}=await import('/player-bail.js?v=20261114-continuation');if(disposed)return;
    bail=await createPlayerBail({T,getModel:()=>body?.getModel(),bodyDimensions:()=>body.bodyDimensions(),canTranslate:(points,delta)=>world.clearance.canTranslate(points,delta),collisionBoxes:p=>physicsBoxesForWorld(world,p),groundHeight:()=>0,floorAt:(x,z,top)=>world.floorAt(x,z,top),canStand:(x,z,y,height,radius)=>world.clearance.fits({x,y,z},height,radius),
     onStart(){body.stopAnim?.('pistolReload',0);body.setPhysicsActive(true);stop();parkour.reset();movement.cancelTraversal();motion.reset();expedition?.interrupt('bail');},
     onRecover({position:[x,y,z]}){body.setPhysicsActive(false);const d=targetAim.clone().sub(targetPosition);targetPosition.set(x,y+1.75,z);targetAim.copy(targetPosition).add(d);motion.reset();walkVelocity.set(0,0,0);requestDraw();},onCancel(){body?.setPhysicsActive(false);requestDraw();}});
   }
   if(disposed){bail.dispose();bail=null;return;}
   if(expedition.active()&&expedition.inspect().state?.code===code&&expedition.canMove()){const velocity=walkVelocity.clone();velocity.y=motion.inspect().velocity;if(!bail.start({velocity,dt:1/60}))$('night-event').textContent='Your character is still loading. Try bail again in a moment.';}
  }catch(error){$('night-event').textContent='Bail physics could not load: '+error.message;}finally{bailLoading=false;requestDraw();}
 }
 function flareModel(){if(flare)return flare;flare=new T.Group();flare.name='Nonlethal expedition flare launcher';const orange=new T.MeshStandardMaterial({color:0xd45d26,roughness:.65}),metal=new T.MeshStandardMaterial({color:0x303c39,metalness:.6,roughness:.4});const barrel=new T.Mesh(new T.CylinderGeometry(.035,.042,.24,12),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.035,-.11);flare.add(barrel);const frame=new T.Mesh(new T.BoxGeometry(.075,.075,.12),orange);frame.position.set(0,0,-.025);flare.add(frame);const grip=new T.Mesh(new T.BoxGeometry(.055,.13,.055),orange);grip.position.set(0,-.07,.015);grip.rotation.x=-.2;flare.add(grip);return flare;}
 const puffs=[];let dustTexture=null;
 function puff(at,count=3,spread=.4){if(reduced)return;if(!dustTexture){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,.6)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);dustTexture=new T.CanvasTexture(c);}
  for(let i=0;i<count;i++){let p=puffs.find(p=>!p.alive);if(!p){if(puffs.length>=40)return;p={sprite:new T.Sprite(new T.SpriteMaterial({map:dustTexture,color:0x9d906f,transparent:true,depthWrite:false}))};scene.add(p.sprite);puffs.push(p);}p.alive=true;p.t=0;p.sprite.visible=true;p.sprite.position.copy(at).add(new T.Vector3((Math.random()-.5)*spread,.08,(Math.random()-.5)*spread));}}
 function draw(time){
  frame=0;if(disposed)return;if(!movement||!preferences||!body){requestDraw();return;}const consecutive=previous>0,raw=Math.min((time-(previous||time))/1000,.25),dt=Math.min(raw||1/60,.05);previous=time;
  try{
   if(ready)quality?.frame(time,consecutive);if(modalOpen()&&document.pointerLockElement)document.exitPointerLock();
   if(ready&&time>=hitStopUntil){const n=Math.max(1,Math.ceil(raw/.05)),step=(raw||1/60)/n;for(let i=0;i<n;i++){
    if(bail?.active){bail.update(step);const delta=bail.cameraTarget.clone().sub(targetPosition);targetPosition.add(delta);targetAim.add(delta);}
    else if(!modalOpen()){if(movement.needsStep())movement.move(step);movement.updateJump(step);}else walkVelocity.set(0,0,0);
   }}
   const eyeOffset=bail?.active?0:(body.bodyDimensions().height*.94-1.75);
   camera.position.copy(targetPosition);camera.position.y+=eyeOffset;aim.copy(targetAim);aim.y+=eyeOffset;camera.lookAt(aim);
   const p=preferences.get(),speed=Math.hypot(walkVelocity.x,walkVelocity.z),airborne=motion.inspect().airborne;movement.updateCrouch(dt);if(ready&&!modalOpen()&&!bail?.active)movement.updateAir(dt,speed,airborne);
   const sprint=keys.has('shift')&&speed>4.5&&movement.crouchAmount<.3;
   fovKick+=((movement.dive?15:movement.slide?.kind==='slide'?13:sprint?8:0)+(parkour.fov()||0)-fovKick)*(1-Math.exp(-6*dt));
   const drop=movement.crouchAmount*.55+(movement.dive?Math.min(1,movement.dive.t*5)*.55:0)+(movement.proneT>0?Math.min(1,movement.proneT/.25)*.75:0)-(third?0:parkour.lift()||0);
   const effectFov=p.cameraEffects&&p.speedFov?fovKick:0;
   thirdBlend+=((third?1:0)-thirdBlend)*(1-Math.exp(-(reduced?40:9)*dt));body?.third(thirdBlend);
   if(!bail?.active&&sway.apply(camera,aim,dt,{velocity:walkVelocity,airborne,walkSpeed:motion.speed(false),crouch:drop,lean:parkour.lean()||0,slide:movement.slide?Math.min(1,speed/7):0,sprint:sprint?1:0,effects:p,perspective:thirdBlend}))footsteps?.step(surfaceAt(targetPosition),speed);
   body?.update(dt,{aim,eyeOffset,position:targetPosition,sprint:sprint?1:0,effects:p,manageFov:false,velocity:walkVelocity,airborne,crouch:Math.min(drop,.55),fovKick:effectFov,hands:parkour.hands?.(),pose:{traversal:movement.traversal(),dive:movement.dive?Math.min(1,movement.dive.t*4):movement.proneT>0?Math.min(1,movement.proneT/.4):0,slide:movement.slide?.kind==='slide'&&!movement.slide.belly?1-movement.slide.t/movement.slide.dur:0}});
   const wantsHeld=!!expedition?.live()&&!bail?.active&&!parkour.handsFull();if(wantsHeld!==held){held=wantsHeld;body?.hold(held?flareModel():null,held?'pistol':null);}
   if(thirdBlend>.002){const forward=new T.Vector3();camera.getWorldDirection(forward);const right=new T.Vector3(-forward.z,0,forward.x).normalize(),offset=forward.multiplyScalar(-2.7).add(new T.Vector3(0,.28,0)).addScaledVector(right,.62*thirdSide).multiplyScalar(thirdBlend),length=offset.length(),dir=offset.clone().normalize();let room=length;for(let k=.2;k<length;k+=.15){const point=camera.position.clone().addScaledVector(dir,k);if(!world.clearance.fits({x:point.x,y:point.y-.12,z:point.z},.24,.12)){room=Math.max(.15,k-.2);break;}}offset.setLength(room);camera.position.add(offset);body?.cameraClearance?.(room);}
   const nextFov=T.MathUtils.lerp(p.firstFov,p.thirdFov,thirdBlend)+effectFov;if(Math.abs(camera.fov-nextFov)>.01){camera.fov=nextFov;camera.updateProjectionMatrix();}
   // Flashlight follows the final camera; network poses always use player feet.
   garden.update(time/1000,camera);expedition?.update(time/1000,dt);
   gripsView??=window.parkourGrips?.mount(T,scene,{getPose:()=>parkour?.ropePose?.()})||null;gripsView?.update();for(const c of scene.children)if((c.name==='Parkour grips'||c.name==='Pyramid at the end of the road')&&!c.userData.bakeRegistered){window.edenBaked?.registerStatic(c);c.userData.bakeRegistered=true;}
   lighting.update();
   if(ready&&time-lastLandmarkCheck>2000){lastLandmarkCheck=time;const missing=Object.entries(garden.district.inspect().models).filter(([,value])=>value==='fallback');if(missing.length)$('entry-hint').textContent='Some distant landmark artwork is unavailable. Return to Eden and enter again to retry.';}
   for(const dust of puffs)if(dust.alive){dust.t+=dt;dust.alive=dust.t<.8;dust.sprite.visible=dust.alive;dust.sprite.material.opacity=Math.max(0,1-dust.t/.8)*.4;dust.sprite.scale.setScalar(.15+dust.t*.7);dust.sprite.position.y+=dt*.12;}
   if(expedition?.active()){const label=p.bailKey.toUpperCase()+' · '+(bail?.active?'Get up':'Bail');if(label!==lastBailLabel){lastBailLabel=label;$('night-bail').textContent=label;$('night-bail').title='Manual bail / recover ('+p.bailKey.toUpperCase()+')';}}
   atmosphere?.update(time/1000);post.render();perfHud??=window.createPerfHud?.({renderer,quality})||null;perfHud?.frame(time);requestDraw();
  }catch(error){fail(error);}
 }
 try{
  status.textContent='Loading the shared night district…';
  const response=await fetch('/night-layout.json?v=3',{signal:lifetime.signal});if(!response.ok)throw new Error('The district map is unavailable.');const layout=await response.json();window.nightLayout=layout;
  renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setSize(stage.clientWidth,stage.clientHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.AgXToneMapping;renderer.toneMappingExposure=1.5;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;stage.append(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Beyond Eden. Click to look around; WASD to move.');window.showroomEnableKTX2(renderer);
  window.edenBaked=window.createEdenBakedLight?.(T,{onShadowChange:()=>{renderer.shadowMap.needsUpdate=true;}});window.edenBaked?.setWorld('beyond');
  scene=new T.Scene();camera=new T.PerspectiveCamera(60,stage.clientWidth/stage.clientHeight,.05,220);camera.position.copy(targetPosition);camera.lookAt(targetAim);
  const hemi=new T.HemisphereLight(0xdceffc,0x5a6538,1.35),sun=new T.DirectionalLight(0xffe4ad,3.2);sun.position.set(-23,19,-48);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;scene.add(hemi,sun);const fill=new T.DirectionalLight(0xe4edff,.35);fill.position.set(10,9,18);scene.add(fill);
  warmup=window.createRenderWarmup(renderer,camera,scene,{signal:lifetime.signal});
  garden=window.createExpeditionScene(T,scene,{layout,reduced,mobile:stage.clientWidth<700,onChange:requestDraw,prepareModel:model=>warmup.prepare(model)});world=garden.authority;
  lighting=window.createEdenLighting(T,renderer,scene,{sun,hemi,camera,mobile:stage.clientWidth<700,getNight:()=>1});post=window.createEdenPost(T,renderer,scene,camera,{enabled:true});post.setLights({sky:garden.sky,lamps:()=>garden.district.lamps});atmosphere=window.createEdenAtmosphere?.(T,scene,camera,{getNight:()=>post.night(),getLamps:()=>garden.district.lamps,reduced})||null;
  quality=window.createAdaptiveResolution(renderer,{targetFps:stage.clientWidth<700?30:60,max:Math.min(devicePixelRatio,1.25),onFloor(){post.set({ao:0,rays:0,flare:0,glare:0,wet:0,motionBlur:0,haze:0,exposure:0});atmosphere?.set({fireflies:0,cones:0});}});
  function setGraphics(value){graphics=['low','medium','high','photo'].includes(value)?value:'medium';const q=graphics==='low'?{ratio:1,post:true,samples:0,shadow:1024,ao:0,motionBlur:0,wet:0,air:0}:graphics==='medium'?{ratio:1.25,post:true,samples:2,shadow:2048,ao:0,motionBlur:.3,wet:0,air:1}:{ratio:1.5,post:true,samples:4,shadow:4096,ao:.8,motionBlur:.4,wet:.8,air:1};quality.setMax(Math.min(devicePixelRatio,q.ratio));post.set({enabled:q.post,samples:q.samples,ao:q.ao,rays:.7,flare:.8,glare:.9,grain:.028,bloom:.2,exposure:1,haze:.3,clouds:0,dof:0,wet:q.wet,motionBlur:reduced?0:q.motionBlur});atmosphere?.set({dust:0,fireflies:q.air,cones:q.air});lighting.set({shadowSize:q.shadow});renderer.shadowMap.needsUpdate=true;try{localStorage.setItem('eden-graphics',graphics);}catch{}}
  let savedGraphics=null;try{savedGraphics=localStorage.getItem('eden-graphics');}catch{}setGraphics(savedGraphics||(stage.clientWidth<700?'low':'medium'));
  window.edenControls?.setContext(()=> 'expedition');
  const updateControlHints=()=>{const c=window.edenControls;if(!c)return;$('entry-hint').textContent=c.hint('forward')+' / '+c.hint('left')+' / '+c.hint('back')+' / '+c.hint('right')+' move · '+c.hint('jump')+' jump · '+c.hint('sprint')+' sprint · '+c.hint('crouch')+' crouch · '+c.hint('help')+' controls';const hint=document.querySelector('.night-exploration-hint');if(hint)hint.textContent='Explore first, then ring the brass bell outside the Moon Temple. '+c.hint('interact')+' interacts. '+c.hint('flashlight')+' toggles the flashlight. '+c.hint('flare')+' fires a nonlethal flare; '+c.hint('reload')+' reloads. '+c.hint('bail')+' bails or gets up. Recover all eight pages and reach the pyramid.';};
  preferences=window.createExpeditionPreferences({onChange(){stop();updateControlHints();requestDraw();}});updateControlHints();
  parkour=window.createParkour({T,walls:()=>garden.district.walls,surfaces:()=>garden.district.surfaces,ground:()=>0,player:{pos:targetPosition,aim:targetAim,vel:walkVelocity,motion,keys,bodyDimensions:()=>body?.bodyDimensions()||window.playerBodyProfile(),crouchHeld:()=>movement.crouchHeld,sway,footsteps,surface:()=>surfaceAt(targetPosition),requestDraw,onFall:()=>{}}});
  movement=window.createPlayerMovement({momentumEnabled:()=>false,bodyDimensions:()=>body?.bodyDimensions()||window.playerBodyProfile(),T,targetPosition,targetAim,walkVelocity,motion,keys,sway,footsteps,surfaceAt,puff,hitStop:ms=>{if(!reduced)hitStopUntil=performance.now()+ms;},requestDraw,obstacle:()=>false,groundHeight,prepareWalking,shiftHeight,kick:n=>{fovKick+=n;},state,modalOpen,fistsEngaged:()=>false,parkour:()=>parkour,pk:()=>parkour,parkourOn:()=>true,garden,get expedition(){return expedition;},get playerBody(){return body;}});
  // This read shares the authenticated Eden identity without starting Eden's social
  // room, NPCs, editor, music panels or account dialogs in the expedition document.
  if(window.showroomDeployment?.mode!=='preview')try{const r=await fetch((window.showroomDeployment?.socialApi||'/api/social/')+'me',{credentials:'same-origin',signal:AbortSignal.any([lifetime.signal,AbortSignal.timeout(5000)])});if(r.ok){const data=await r.json();window.GardenPlayerCharacter=data.user?.character||null;window.GardenPlayerName=data.user?.name||null;if(data.user?.name)$('entry-identity').textContent=data.user.name+' · Eden identity';}}catch{}
  if(disposed)return;
  body=window.createPlayerBody({T,scene,camera,requestDraw,enabled:()=>(ready||preparingAvatar)&&!modalOpen(),canPunch:()=>false});
  expedition=window.createExpedition({getCharacter:()=>body?.getAppearance(),T,scene,camera,garden,layout,getPose,place,correct:correctPose,stopMoving:stop,requestDraw,returnHome:home,preferences:()=>preferences.get(),onAction(action){if(action==='interact')body?.anim('interact',{fade:.1,mask:'upper',weight:.7,arms:true});else if(action==='pickup')body?.anim('pickup',{fade:.08,mask:'upper',weight:.65,arms:true});else if(action==='flare')body?.anim('pistolShoot',{fade:.04,mask:'upper',arms:true});else if(action==='reload')body?.anim('pistolReload',{fade:.1,mask:'upper',arms:true,speed:(window.GardenAnim?.duration?.('pistolReload')||1.5)/1.5});else{body?.stopAnim('pistolReload',.08);if(action==='leave')bail?.cancel();}}});
  $('night-bail').onclick=toggleBail;$('night-view').onclick=()=>setThird(!third);
  // Retry is a new run in this same district, not a navigate-away return.
  $('night-retry').onclick=()=>{stop();bail?.cancel();expedition.leave();place(layout.spawn[0],layout.spawn[1]);expedition.open();};
  const play=window.createPlayMenu({nav:document.querySelector('.view-nav'),after:$('night-launch'),stage,items:[{id:'expedition',title:'Beyond Eden',text:'The lost pages, the temple bell and the Attendant.',keys:'E interact · G flare · R reload',run:()=>expedition.open()},{id:'eden',title:'Return to Eden',text:'The garden, vault, library, studio and all your showroom features.',run:home}],graphics:{levels:[{id:'low',label:'LOW'},{id:'medium',label:'MEDIUM'},{id:'high',label:'HIGH'}],get:()=>graphics,set:setGraphics},context:()=>expedition.active()?'expedition':'walk',onOpen:stop,onClose:requestDraw});
  listen(document,'keydown',event=>{if(preferences.isBailKey(event)&&expedition.active()){event.preventDefault();event.stopImmediatePropagation();toggleBail();}}, {capture:true});
  listen(document,'keydown',event=>{if(event.defaultPrevented||(window.edenControls?.blockedModifiers(event)??(event.ctrlKey||event.metaKey||event.altKey||event.isComposing))||event.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target.tagName))return;
   if(event.key==='Escape'){stop();if(!modalOpen())expedition.open();return;}if(!ready||modalOpen()||bail?.active)return;const key=window.edenControls?window.edenControls.key(event):event.key.toLowerCase(),p=preferences.get();
   if(key===' '){event.preventDefault();if(!event.repeat)movement.jump();keys.add('space');}
   else if(key==='c'){event.preventDefault();if(!event.repeat){movement.crouchHeld=p.crouchMode==='toggle'?!movement.crouchHeld:true;parkour.crouchPressed();if(movement.crouchHeld)movement.startSlide();}}
   else if(key==='shift'&&p.sprintMode==='toggle'){if(!event.repeat){if(keys.has('shift'))keys.delete('shift');else keys.add('shift');}}
   else if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)){event.preventDefault();keys.add(key);}
   else if(key==='view'&&!event.repeat){setThird(!third);}else if(key==='menu'&&!event.repeat){stop();play.open();}else if(key==='v'&&!event.repeat){thirdSide*=-1;}else if(key==='t'&&!event.repeat){body?.anim('wave',{fade:.15});}requestDraw();});
  listen(document,'keyup',event=>{const key=window.edenControls?window.edenControls.key(event):event.key.toLowerCase(),p=preferences.get();if(key==='c'&&p.crouchMode==='hold')movement.crouchHeld=false;if(!(key==='shift'&&p.sprintMode==='toggle'))keys.delete(key===' '?'space':key);});
  listen(renderer.domElement,'click',()=>{if(ready&&!modalOpen())renderer.domElement.requestPointerLock?.()?.catch?.(()=>{});});
  listen(document,'mousemove',event=>{if(document.pointerLockElement===renderer.domElement)look(event.movementX,event.movementY);});
  listen(renderer.domElement,'wheel',event=>{if(!ready||modalOpen())return;event.preventDefault();setThird(event.deltaY>0);},{passive:false});
  listen(window,'blur',stop);listen(document,'visibilitychange',()=>{stop();previous=0;quality?.pause();if(!document.hidden)requestDraw();});
  listen(renderer.domElement,'webglcontextlost',event=>{if(disposed)return;event.preventDefault();cancelAnimationFrame(frame);frame=0;fail(new Error('The graphics connection was interrupted. Use Retry loading.'));});
  observer=new ResizeObserver(()=>{if(disposed)return;renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();requestDraw();});observer.observe(stage);
  touch=window.createTouchControls({host:document.body,look,combat:()=>null,third:()=>setThird(!third),visible:()=>ready&&expedition.active()&&!modalOpen(),armed:()=>false,expedition:()=>!!expedition.active(),actions:()=>({fire:!$('night-flare').hidden,reload:!$('night-reload').hidden}),
   // Touch holds release directly, independent of the keyboard's toggle preferences.
   move(key,pressed){const k=key.toLowerCase();if(pressed){if(!ready||modalOpen()||bail?.active)return;keys.add(k);}else keys.delete(k);requestDraw();},
   jump(pressed=true){if(pressed){if(!ready||modalOpen()||bail?.active)return;if(!keys.has('space')){keys.add('space');movement.jump();}}else keys.delete('space');requestDraw();return pressed?()=>{keys.delete('space');requestDraw();}:undefined;},
   crouch(pressed){if(pressed){if(!ready||modalOpen()||bail?.active)return;movement.crouchHeld=true;parkour.crouchPressed();movement.startSlide();}else movement.crouchHeld=false;requestDraw();},onReset:stop});
  window.breakThyRuleExpedition={getState:()=>({ready,disposed,entry:'expedition',pos:targetPosition.toArray(),position:targetPosition.toArray(),aim:targetAim.toArray(),pose:getPose(),renderedCamera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov},movement:movement.state(),touch:touch?.inspect(),third,graphics,post:post.inspect(),lighting:lighting.inspect(),quality:quality.inspect(),warmup:warmup.inspect(),preferences:preferences.get(),body:body.inspect(),sway:sway.inspect(),bail:bail?.inspect(),expedition:expedition.inspect(),scene:garden.inspect(),resources:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,canvases:document.querySelectorAll('canvas').length},drawCalls:renderer.info.render.calls}),scene:()=>scene,renderer:()=>renderer,post:()=>post,atmosphere:()=>atmosphere,expedition:()=>expedition,place,view:setThird,bail:toggleBail,preferences:()=>preferences.get(),returnHome:home};
  requestDraw();await garden.ready;if(disposed)return;status.textContent='Opening the Moon Temple and preparing your character…';
  // Never dismiss the loading screen on a primitive-only fallback: the five core
  // authored landmarks and the actual player model must all finish successfully.
  await new Promise((resolve,reject)=>{const began=performance.now();function check(){if(disposed){resolve();return;}const models=garden.district.inspect().models,failed=garden.requiredLandmarks.filter(id=>models[id]==='fallback');if(failed.length){reject(new Error('Required landmark artwork could not load: '+failed.join(', ')+'.'));return;}const loaded=garden.requiredLandmarks.filter(id=>models[id]==='model').length,prepared=garden.warmupLandmarks.filter(id=>models[id]==='model'||models[id]==='fallback').length,elapsed=performance.now()-began;status.textContent='Preparing district artwork and shaders '+prepared+' / '+garden.warmupLandmarks.length+(body.inspect().ready?' · Character ready':' · Preparing your character');if(loaded===garden.requiredLandmarks.length&&body.inspect().ready&&(prepared===garden.warmupLandmarks.length||elapsed>75000)){resolve();return;}if(elapsed>45000&&(loaded!==garden.requiredLandmarks.length||!body.inspect().ready)){reject(new Error('The landmark or character artwork is unavailable.'));return;}setTimeout(check,100);}check();});
  if(disposed)return;status.textContent='Preparing character textures, tools and movement effects…';preparingAvatar=true;
  await (window.edenBaked?.loadBeyond?.()??window.edenBaked?.beyondReady);
  for(const c of scene.children)if(['Garden of Eden','Beyond Eden / the old civilization','Parkour grips','Pyramid at the end of the road'].includes(c.name))window.edenBaked?.registerStatic(c);
  await warmup.prepare(body.getModel().root,{waitForImages:true});
  await warmup.prepare(flareModel());
  if(!reduced){puff(targetPosition,1);await warmup.prepare(puffs[0].sprite,{waitForImages:true});for(const p of puffs){p.alive=false;p.sprite.visible=false;}}
  if(disposed)return;preparingAvatar=false;quality.pause();ready=true;$('entry-loading').hidden=true;$('night-launch').disabled=false;window.lucide?.createIcons();expedition.open();requestDraw();
 }catch(error){if(!disposed)fail(error);}
})();
