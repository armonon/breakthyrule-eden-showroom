'use strict';
// Rotating 3D garments for the public site.
// One hidden WebGL renderer draws every visible card in turn and copies the frame into
// that card's 2D canvas, so a grid of 40 garments never needs 40 WebGL contexts.
(()=>{
 const T=window.THREE;
 function lights(scene){
  if(window.showroomProductLights)return window.showroomProductLights(scene);
  scene.add(new T.HemisphereLight(0xffffff,0x8d8583,2));
  const key=new T.DirectionalLight(0xffffff,2.6);key.position.set(-3,5,5);scene.add(key);
  const fill=new T.DirectionalLight(0xe6e9ff,1.2);fill.position.set(4,1,-4);scene.add(fill);
 }
 function centre(gltfScene){
  const box=new T.Box3().setFromObject(gltfScene),size=box.getSize(new T.Vector3());
  gltfScene.position.sub(box.getCenter(new T.Vector3()));
  const root=new T.Group();root.add(gltfScene);// Fit height and turning width, so wide pieces (hats, gloves) stay inside a portrait frame.
  root.scale.setScalar(Math.min(1.75/size.y,1.4/Math.max(size.x,size.z)));return root;
 }
 function makeRenderer(canvas){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  window.showroomEnableKTX2?.(renderer);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  return renderer;
 }
 // Neutral studio reflections make silver readable without external HDR files.
 function beltEnvironment(renderer){
  const room=new T.Scene();room.background=new T.Color(.22,.24,.28);
  const surfaces=[];
  const wall=new T.Mesh(new T.BoxGeometry(12,10,12),new T.MeshBasicMaterial({color:new T.Color(.36,.38,.42),side:T.BackSide}));room.add(wall);surfaces.push(wall);
  for(const [position,width,height,intensity] of [[[-3,2,4],4,6,3],[[4,1,2],3,5,2],[[0,4,-1],4,4,2.5]]){
   const panel=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({color:new T.Color(intensity,intensity,intensity),side:T.DoubleSide,toneMapped:false}));panel.position.set(...position);panel.lookAt(0,0,0);room.add(panel);surfaces.push(panel);
  }
  const pmrem=new T.PMREMGenerator(renderer);const target=pmrem.fromScene(room,.04,.1,100);pmrem.dispose();for(const mesh of surfaces){mesh.geometry.dispose();mesh.material.dispose();}return target;
 }
 // Keep the buckle readable; ease through sides and back, then slow for the front.
 function beltSpinFactor(angle){
  // A short readable front pass, then a fast sweep around the rest of the belt.
  const away=Math.max(0,Math.min(1,(.9-Math.cos(angle))/.55));
  return .8*(.75+7.25*away*away*(3-2*away));
 }
 function advanceBeltSpin(angle,seconds,baseSpeed){
  // Small midpoint steps keep acceleration smooth across different frame rates.
  let remaining=seconds;
  while(remaining>1e-8){const dt=Math.min(remaining,1/120),mid=angle+baseSpeed*beltSpinFactor(angle)*dt/2;angle+=baseSpeed*beltSpinFactor(mid)*dt;remaining-=dt;}
  return angle;
 }
 // The apple's pitch/roll rhythm runs only while the front design is out of view.
 function beltWobble(angle,seconds){
  const facing=Math.cos(angle);
  // No rocking anywhere in the visible front half, including its side boundaries.
  if(facing>=-1e-6)return {pitch:0,roll:0};
  const hidden=Math.min(1,-facing/.45),mix=hidden*hidden*(3-2*hidden)*Math.min(1,seconds*2.5);
  return {pitch:Math.cos(seconds*5.2)*.09*mix,roll:Math.sin(seconds*7.5)*.19*mix};
 }
 let rockingQuaternion=null,rockingEuler=null;
 function applyBeltPose(model,pitch,yaw,rockPitch,rockRoll){
  model.rotation.set(pitch,yaw,0);
  if(rockPitch||rockRoll){
   rockingQuaternion ||= new T.Quaternion();rockingEuler ||= new T.Euler();rockingEuler.set(rockPitch,0,rockRoll);
   model.quaternion.premultiply(rockingQuaternion.setFromEuler(rockingEuler)).normalize();
  }
 }
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const pageActive=()=>window.showroomPageActive?.()??!document.hidden;

 // Belt thumbnails share one renderer, with the same studio lighting and camera.
 window.createBeltGarmentCarousel=function(cards){
  if(!T||!window.ShowroomGLTFLoader||!cards.length)return null;
  let renderer=null,environment=null;
  const scene=new T.Scene();lights(scene);
  function ensureRenderer(){if(renderer)return true;try{renderer=makeRenderer(document.createElement('canvas'));renderer.setPixelRatio(1);environment=beltEnvironment(renderer);scene.environment=environment.texture;return true;}catch{renderer?.dispose();renderer=null;return false;}}
  const camera=new T.PerspectiveCamera(30,1.6,.05,40),elevation=18*Math.PI/180;
  const palette=['#111111','#805433','#681f2b','#d8cfb7','#314b3d','#23364f'].map(hex=>new T.Color(hex));
  const visible=new Set(),queue=[],loading=new Set();let frame=0,last=0,destroyed=false,auto=!reduced,renderWidth=0,renderHeight=0;
  const state=cards.map((card,i)=>({...card,i,model:null,failed:false,angle:0,colorElapsed:0,wobbleTime:0,pass:0,straps:[],width:480,height:300,lastSeen:0,ctx:card.canvas.getContext('2d')}));
  function dispose(s){if(!s.model)return;const geometries=new Set(),materials=new Set();s.model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m)materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());s.model=null;s.straps=[];}
  function trim(){const loaded=state.filter(s=>s.model),limit=Math.max(8,visible.size+1);const stale=loaded.filter(s=>!visible.has(s)).sort((a,b)=>a.lastSeen-b.lastSeen);while(loaded.length>limit&&stale.length){const s=stale.shift();dispose(s);loaded.pop();}}
  function pump(){
   if(!destroyed&&pageActive()&&queue.length&&!ensureRenderer())return;
   while(!destroyed&&pageActive()&&loading.size<2&&queue.length){
    const s=queue.shift();if(!visible.has(s)||s.model||s.failed||loading.has(s))continue;loading.add(s);
    showroomAssets.model(s.url,{priority:'low'}).then(gltf=>{
     s.model=centre(gltf.scene);if(destroyed){dispose(s);return;}
     const size=new T.Box3().setFromObject(s.model).getSize(new T.Vector3());s.radius=Math.hypot(size.x,size.z)/2;s.halfHeight=size.y/2;
     s.model.traverse(o=>{if(o.name==='BTR_Strap')s.straps.push(...(Array.isArray(o.material)?o.material:[o.material]));});
     trim();request();
    }).catch(()=>{s.failed=true;}).finally(()=>{loading.delete(s);pump();});
   }
  }
  const resize=new ResizeObserver(entries=>{for(const entry of entries){const s=state[Number(entry.target.dataset.beltThumbIndex)],r=entry.contentRect;if(!s||!r.width||!r.height)continue;s.width=480;s.height=Math.max(180,Math.min(640,Math.round(480*r.height/r.width)));s.canvas.width=s.width;s.canvas.height=s.height;}request();});
  const io=new IntersectionObserver(entries=>{for(const entry of entries){const s=state[Number(entry.target.dataset.beltThumbIndex)];if(entry.isIntersecting){visible.add(s);s.lastSeen=performance.now();if(!s.model&&!s.failed&&!loading.has(s)&&!queue.includes(s))queue.push(s);}else{visible.delete(s);s.lastSeen=performance.now();}}pump();trim();last=0;request();});
  for(const s of state){s.canvas.width=s.width;s.canvas.height=s.height;s.canvas.dataset.beltThumbIndex=s.i;s.canvas.parentElement.dataset.beltThumbIndex=s.i;resize.observe(s.canvas.parentElement);io.observe(s.canvas.parentElement);}
  function request(){if(!destroyed&&!frame&&pageActive()&&visible.size)frame=requestAnimationFrame(draw);}
  function draw(time){
   frame=0;if(!pageActive()||!visible.size){last=0;return;}if(last&&time-last<40){request();return;}
   const dt=Math.min((time-(last||time))/1000,.1);last=time;let any=false;
   for(const s of visible){if(!s.model)continue;any=true;
    if(auto){const before=Math.floor(s.angle/(Math.PI*2));s.angle=advanceBeltSpin(s.angle,dt,Math.PI/5);s.colorElapsed=Math.floor(s.angle/(Math.PI*2))!==before?0:s.colorElapsed+dt;if(!reduced)s.wobbleTime+=dt;}
    const turns=s.angle/(Math.PI*2),pass=Math.floor(turns),fraction=turns-pass,color=palette[pass%palette.length],previous=palette[(pass-1+palette.length)%palette.length];
    for(const material of s.straps){if(pass===0)material.color.copy(palette[0]);else material.color.lerpColors(previous,color,Math.min(1,s.colorElapsed/.7));}
    s.canvas.dataset.previewPass=String(pass);s.canvas.dataset.strapColor='#'+s.straps[0]?.color.getHexString();
    if(pass!==s.pass){s.pass=pass;s.canvas.dispatchEvent(new CustomEvent('btr:preview-pass',{detail:{slug:s.slug,pass,color:'#'+color.getHexString()},bubbles:true}));}
    const rocking=beltWobble(s.angle,s.wobbleTime);applyBeltPose(s.model,0,fraction*Math.PI*2,rocking.pitch,rocking.roll);camera.aspect=s.width/s.height;camera.updateProjectionMatrix();
    const halfV=15*Math.PI/180,halfH=Math.atan(Math.tan(halfV)*camera.aspect),c=Math.cos(elevation),sin=Math.sin(elevation);
    const horizontal=s.radius*Math.sqrt(1/Math.tan(halfH)**2+c*c)+s.halfHeight*sin;
    const vertical=(s.radius*sin+s.halfHeight*c)/Math.tan(halfV)+s.radius*c+s.halfHeight*sin;
    const distance=Math.max(horizontal,vertical)*1.10;camera.position.set(0,distance*sin,distance*c);camera.lookAt(0,0,0);
    if(renderWidth!==s.width||renderHeight!==s.height){renderer.setSize(s.width,s.height,false);renderWidth=s.width;renderHeight=s.height;}
    scene.add(s.model);renderer.render(scene,camera);scene.remove(s.model);
    s.ctx.clearRect(0,0,s.width,s.height);s.ctx.drawImage(renderer.domElement,0,0);s.canvas.classList.add('live');s.canvas.parentElement.classList.add('has-live-preview');
   }
   if(any&&auto)request();else last=0;
  }
  const visibilityChange=()=>{last=0;if(!pageActive()){cancelAnimationFrame(frame);frame=0;}else{pump();request();}};document.addEventListener('visibilitychange',visibilityChange);document.addEventListener('btr:page-visibility',visibilityChange);
  return {request,setAuto(value){auto=!!value;last=0;request();return auto;},isAuto:()=>auto,destroy(){destroyed=true;cancelAnimationFrame(frame);io.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',visibilityChange);document.removeEventListener('btr:page-visibility',visibilityChange);state.forEach(dispose);environment?.dispose();renderer?.dispose();}};
 };

 // Single draggable viewer for the product page.
 // Belt options preserve the Garment Lab interaction and renderer, with belt-specific framing.
 window.createBeltGarmentViewer=function(element,{wheelZoom=false,onFrame=null,spin=.45,presentation='garment',loadModel=url=>showroomAssets.model(url),cacheLimit=3}={}){
  if(!T||!window.ShowroomGLTFLoader)return null;
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');element.append(canvas);
  let renderer;try{renderer=makeRenderer(canvas);}catch{return null;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.25:1.75));
  const scene=new T.Scene();lights(scene);const environment=presentation==='belt'?beltEnvironment(renderer):null;if(environment)scene.environment=environment.texture;const camera=new T.PerspectiveCamera(30,1,.05,40);
  let model=null,yaw=presentation==='belt'?0:.5,pitch=0,auto=!reduced,drag=null,frame=0,last=0,zoom=1,onScreen=true,destroyed=false,loadId=0,turnRadius=1,turnPlanarRadius=1,turnHalfHeight=.2,wobbleTime=0,wobblePitch=0,wobbleRoll=0;
  const graphicsListeners=new Set();
  const roots=new Map();
  const disposeRoot=root=>{const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());};
  function trimRoots(keep){for(const [url,promise] of roots){if(roots.size<=cacheLimit)break;if(url===keep)continue;roots.delete(url);promise.then(disposeRoot).catch(()=>{});}}
  // blanks already loaded, so switching back is instant
  const fetchRoot=url=>{if(!roots.has(url))roots.set(url,loadModel(url).then(g=>centre(g.scene)).catch(e=>{roots.delete(url);throw e;}));return roots.get(url);};
  function resize(){const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();request();}
  function request(){if(!destroyed&&!frame&&onScreen&&pageActive())frame=requestAnimationFrame(draw);}
  function draw(time){frame=0;if(destroyed||!onScreen||!pageActive()){last=0;return;}const dt=Math.min((time-(last||time))/1000,.05);last=time;if(auto){yaw=presentation==='belt'?advanceBeltSpin(yaw,dt,spin):yaw+dt*spin;if(presentation==='belt'&&!reduced){wobbleTime+=dt;const rocking=beltWobble(yaw,wobbleTime);wobblePitch=rocking.pitch;wobbleRoll=rocking.roll;}}
   if(presentation==='belt'&&Math.cos(yaw)>=-1e-6)wobblePitch=wobbleRoll=0;
   if(model){if(presentation==='belt')applyBeltPose(model,pitch,yaw,wobblePitch,wobbleRoll);else model.rotation.set(pitch,yaw,0);}const d=Math.max(4.4,2.2/Math.tan(15*Math.PI/180)/camera.aspect/2.4)/zoom;
   if(presentation==='belt'){
    const halfV=15*Math.PI/180,halfH=Math.atan(Math.tan(halfV)*camera.aspect);
    const effective=18*Math.PI/180+pitch,c=Math.abs(Math.cos(effective)),s=Math.abs(Math.sin(effective));
    const horizontal=turnPlanarRadius*Math.sqrt(1/Math.tan(halfH)**2+c*c)+turnHalfHeight*s;
    const vertical=(turnPlanarRadius*s+turnHalfHeight*c)/Math.tan(halfV)+turnPlanarRadius*c+turnHalfHeight*s;
    const distance=Math.max(horizontal,vertical)*1.10/zoom;
    const elevation=18*Math.PI/180;camera.position.set(0,distance*Math.sin(elevation),distance*Math.cos(elevation));
   }else camera.position.set(0,.1,d);
   camera.lookAt(0,0,0);onFrame?.(yaw);renderer.render(scene,camera);for(const listener of graphicsListeners)listener();if(auto)request();else last=0;}
  element.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,a'))return;auto=false;drag={x:e.clientX,y:e.clientY,yaw,pitch};element.setPointerCapture(e.pointerId);});
  element.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.009;pitch=Math.max(-.4,Math.min(.4,drag.pitch+(e.clientY-drag.y)*.006));request();});
  element.addEventListener('pointerup',()=>drag=null);element.addEventListener('pointercancel',()=>drag=null);
  if(wheelZoom)element.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.8,Math.min(2.4,zoom*(e.deltaY>0?.92:1.08)));request();},{passive:false});
  element.addEventListener('keydown',e=>{const k={ArrowLeft:-1,ArrowRight:1}[e.key];if(k){e.preventDefault();auto=false;yaw+=k*Math.PI/8;request();}});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(element);
  // Stop spinning while scrolled away or in a background tab.
  const intersectionObserver=new IntersectionObserver(([e])=>{onScreen=e.isIntersecting;last=0;request();});intersectionObserver.observe(element);
  const visibilityChange=()=>{last=0;if(!pageActive()){cancelAnimationFrame(frame);frame=0;}else request();};document.addEventListener('visibilitychange',visibilityChange);document.addEventListener('btr:page-visibility',visibilityChange);
  return {
   async load(url){const id=++loadId;const root=await fetchRoot(url);if(destroyed||id!==loadId)return false;if(model)scene.remove(model);model=root;wobbleTime=wobblePitch=wobbleRoll=0;model.rotation.set(0,0,0);scene.add(model);const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());turnRadius=bounds.getBoundingSphere(new T.Sphere()).radius;turnPlanarRadius=Math.hypot(size.x,size.z)/2;turnHalfHeight=size.y/2;trimRoots(url);resize();request();return true;},
   destroy(){destroyed=true;++loadId;cancelAnimationFrame(frame);resizeObserver.disconnect();intersectionObserver.disconnect();document.removeEventListener('visibilitychange',visibilityChange);document.removeEventListener('btr:page-visibility',visibilityChange);roots.forEach(p=>p.then(disposeRoot).catch(()=>{}));roots.clear();environment?.dispose();renderer.dispose();canvas.remove();},
   preload(url){return fetchRoot(url);},yaw:()=>yaw,
   setAuto(v){auto=v;last=0;request();return auto;},isAuto:()=>auto,
   view(side){auto=false;yaw=side==='back'?Math.PI:0;pitch=0;wobbleTime=wobblePitch=wobbleRoll=0;request();},
   // Used by the Garment Lab: recolour the loaded model, zoom from a slider, redraw after changes.
   graphicsCamera:()=>camera,graphicsCanvas:canvas,onGraphicsFrame(fn){graphicsListeners.add(fn);return()=>graphicsListeners.delete(fn);},
   model:()=>model,setZoom(z){zoom=Math.max(.8,Math.min(2.4,z));request();},redraw:request
  };
 };
})();
