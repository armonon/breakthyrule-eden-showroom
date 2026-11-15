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
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),reduced=motion.matches;
 const pageActive=()=>window.showroomPageActive?.()??!document.hidden;

 // Cards: [{canvas, url, fallback}] → spins whichever are on screen.
 window.createGarmentCarousel=function(cards){
  if(!T||!window.ShowroomGLTFLoader||!cards.length)return null;
  let renderer=null;const W=400,H=500;
  function ensureRenderer(){if(renderer)return true;try{renderer=makeRenderer(document.createElement('canvas'));renderer.setPixelRatio(1);renderer.setSize(W,H,false);return true;}catch{return false;}}
  const scene=new T.Scene();lights(scene);
  const camera=new T.PerspectiveCamera(30,W/H,.05,40);camera.position.set(0,.1,4.6);camera.lookAt(0,0,0);
  const visible=new Set(),queue=[],loading=new Set();let frame=0,last=0;
  const state=cards.map((card,i)=>({...card,i,model:null,failed:false,angle:card.angle??(.6+i*.37),speed:.5,lastSeen:0,ctx:card.canvas.getContext('2d')}));
  for(const s of state){s.canvas.width=W;s.canvas.height=H;
   s.canvas.parentElement.addEventListener('pointerenter',()=>s.speed=1.6);
   s.canvas.parentElement.addEventListener('pointerleave',()=>s.speed=.5);}
  function disposeCard(s){if(!s.model)return;const geometries=new Set(),materials=new Set(),textures=new Set();s.model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());s.model=null;}
  function trimCards(){const loaded=state.filter(s=>s.model),stale=loaded.filter(s=>!visible.has(s)).sort((a,b)=>a.lastSeen-b.lastSeen);let count=loaded.length;while(count>Math.max(8,visible.size)&&stale.length){disposeCard(stale.shift());count--;}}
  function pump(){
   if(pageActive()&&queue.length&&!ensureRenderer())return;
   while(pageActive()&&loading.size<3&&queue.length){
    const s=queue.shift();if(s.model||s.failed||loading.has(s)||!visible.has(s))continue;loading.add(s);
    showroomAssets.model(s.url,{priority:'low'}).then(gltf=>{s.model=centre(gltf.scene);s.canvas.classList.add('live');s.onReady?.();trimCards();request();})
     .catch(()=>{s.failed=true;}).finally(()=>{loading.delete(s);pump();});
   }
  }
  const io=new IntersectionObserver(entries=>{for(const e of entries){const s=state[Number(e.target.dataset.i)];
   if(e.isIntersecting){visible.add(s);s.lastSeen=performance.now();if(!s.model&&!s.failed&&!loading.has(s)&&!queue.includes(s)){queue.push(s);pump();}}else{visible.delete(s);s.lastSeen=performance.now();}trimCards();}request();},{rootMargin:'200px'});
  state.forEach((s,i)=>{s.canvas.dataset.i=i;io.observe(s.canvas);});
  function request(){if(!frame&&visible.size&&pageActive())frame=requestAnimationFrame(draw);}
  function draw(time){
   frame=0;if(!pageActive()||!visible.size){last=0;return;}if(time-last<30){request();return;}// ~30 fps is plenty for a slow turn
   const dt=Math.min((time-(last||time))/1000,.05);last=time;let any=false;
   for(const s of visible){if(!s.model)continue;any=true;
    if(!reduced)s.angle+=dt*s.speed;s.model.rotation.y=s.angle;
    scene.add(s.model);renderer.render(scene,camera);scene.remove(s.model);
    s.ctx.clearRect(0,0,W,H);s.ctx.drawImage(renderer.domElement,0,0);}
   if(any&&!reduced)request();else last=0;
  }
  const visibility=()=>{last=0;if(!pageActive()){cancelAnimationFrame(frame);frame=0;}else{pump();request();}};
  document.addEventListener('visibilitychange',visibility);document.addEventListener('btr:page-visibility',visibility);
  return {request};
 };

 // Single draggable viewer for the product page.
 window.createGarmentViewer=function(element,{wheelZoom=false,onFrame=null,spin=.45,cacheLimit=3}={}){
  if(!T||!window.ShowroomGLTFLoader)return null;
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');element.append(canvas);
  let renderer;try{renderer=makeRenderer(canvas);}catch{canvas.remove();return null;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.25:1.75));
  const scene=new T.Scene();lights(scene);const camera=new T.PerspectiveCamera(30,1,.05,40);
  let model=null,yaw=.5,pitch=0,auto=!motion.matches,drag=null,frame=0,last=0,zoom=1,onScreen=true,enabled=true,dead=false,loadId=0,pending=null;
  const graphicsListeners=new Set();
  const roots=new Map(),disposed=new WeakSet(),limit=Math.max(1,cacheLimit);
  function dispose(root){if(!root||disposed.has(root))return;disposed.add(root);const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());}
  function trim(){for(const [url,entry] of roots){if(roots.size<=limit)break;if(!entry.root||entry.root===model||url===pending)continue;roots.delete(url);dispose(entry.root);}}
  function fetchRoot(url){
   if(dead)return Promise.reject(new Error('The viewer is closed.'));
   if(roots.has(url)){const entry=roots.get(url);roots.delete(url);roots.set(url,entry);return entry.promise;}
   const entry={root:null,promise:null};roots.set(url,entry);
   entry.promise=showroomAssets.model(url).then(g=>{const root=entry.root=centre(g.scene);if(dead){dispose(root);return root;}trim();return root;}).catch(error=>{if(roots.get(url)===entry)roots.delete(url);throw error;});return entry.promise;
  }
  function resize(){const w=element.clientWidth,h=element.clientHeight;if(!w||!h||dead)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();request();}
  function active(){return !dead&&enabled&&onScreen&&pageActive();}
  function request(){if(!frame&&active())frame=requestAnimationFrame(draw);}
  function draw(time){frame=0;if(!active()){last=0;return;}const dt=Math.min((time-(last||time))/1000,.05);last=time;if(auto)yaw+=dt*spin;
   if(model)model.rotation.set(pitch,yaw,0);const d=Math.max(4.4,2.2/Math.tan(15*Math.PI/180)/camera.aspect/2.4)/zoom;
   camera.position.set(0,.1,d);camera.lookAt(0,0,0);onFrame?.(yaw);renderer.render(scene,camera);for(const listener of graphicsListeners)listener();if(auto&&model)request();else last=0;}
  const handlers=[];function listen(type,handler,options){element.addEventListener(type,handler,options);handlers.push([type,handler,options]);}
  listen('pointerdown',e=>{if(e.button!==0||e.target.closest('button,a'))return;auto=false;drag={x:e.clientX,y:e.clientY,yaw,pitch};element.setPointerCapture(e.pointerId);});
  listen('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.009;pitch=Math.max(-.4,Math.min(.4,drag.pitch+(e.clientY-drag.y)*.006));request();});
  listen('pointerup',()=>drag=null);listen('pointercancel',()=>drag=null);
  if(wheelZoom)listen('wheel',e=>{e.preventDefault();zoom=Math.max(.8,Math.min(2.4,zoom*(e.deltaY>0?.92:1.08)));request();},{passive:false});
  listen('keydown',e=>{const k={ArrowLeft:-1,ArrowRight:1}[e.key];if(k){e.preventDefault();auto=false;yaw+=k*Math.PI/8;request();}});
  const ro=new ResizeObserver(resize);ro.observe(element);
  function visibility(){last=0;if(!active()){cancelAnimationFrame(frame);frame=0;}else request();}
  const io=new IntersectionObserver(([e])=>{onScreen=e.isIntersecting;visibility();});io.observe(element);
  const motionChange=()=>{if(motion.matches)auto=false;visibility();};
  document.addEventListener('visibilitychange',visibility);document.addEventListener('btr:page-visibility',visibility);motion.addEventListener('change',motionChange);
  return {
   async load(url){const id=++loadId;pending=url;try{const root=await fetchRoot(url);if(dead||id!==loadId)return false;if(model)scene.remove(model);model=root;scene.add(model);pending=null;trim();resize();request();return true;}finally{if(id===loadId){pending=null;trim();}}},
   preload(url){return fetchRoot(url);},yaw:()=>yaw,
   setVisible(value){enabled=!!value;visibility();},
   setAuto(v){auto=!!v;last=0;request();return auto;},isAuto:()=>auto,
   view(side){auto=false;yaw=side==='back'?Math.PI:0;pitch=0;request();},
   graphicsCamera:()=>camera,graphicsCanvas:canvas,onGraphicsFrame(fn){graphicsListeners.add(fn);return()=>graphicsListeners.delete(fn);},
   model:()=>model,setZoom(z){zoom=Math.max(.8,Math.min(2.4,z));request();},redraw:request,
   destroy(){if(dead)return;dead=true;++loadId;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('btr:page-visibility',visibility);motion.removeEventListener('change',motionChange);handlers.forEach(([type,handler,options])=>element.removeEventListener(type,handler,options));roots.forEach(entry=>entry.promise.then(dispose).catch(()=>{}));roots.clear();dispose(model);renderer.dispose();canvas.remove();}
  };
 };
})();
