'use strict';
// Rotating 3D garments for the public site.
// One hidden WebGL renderer draws every visible card in turn and copies the frame into
// that card's 2D canvas, so a grid of 40 garments never needs 40 WebGL contexts.
(()=>{
 const T=window.THREE;
 function lights(scene){
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
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

 // Cards: [{canvas, url, fallback}] → spins whichever are on screen.
 window.createGarmentCarousel=function(cards){
  if(!T||!window.ShowroomGLTFLoader)return null;
  let renderer;try{renderer=makeRenderer(document.createElement('canvas'));}catch{return null;}
  const W=400,H=500;renderer.setPixelRatio(1);renderer.setSize(W,H,false);
  const scene=new T.Scene();lights(scene);
  const camera=new T.PerspectiveCamera(30,W/H,.05,40);camera.position.set(0,.1,4.6);camera.lookAt(0,0,0);
  const visible=new Set(),queue=[],loading=new Set();let frame=0,last=0;
  const state=cards.map((card,i)=>({...card,i,model:null,failed:false,angle:.6+i*.37,speed:.5,ctx:card.canvas.getContext('2d')}));
  for(const s of state){s.canvas.width=W;s.canvas.height=H;
   s.canvas.parentElement.addEventListener('pointerenter',()=>s.speed=1.6);
   s.canvas.parentElement.addEventListener('pointerleave',()=>s.speed=.5);}
  function pump(){
   while(loading.size<3&&queue.length){
    const s=queue.shift();if(s.model||s.failed||loading.has(s))continue;loading.add(s);
    showroomAssets.model(s.url).then(gltf=>{s.model=centre(gltf.scene);s.canvas.classList.add('live');s.onReady?.();request();})
     .catch(()=>{s.failed=true;}).finally(()=>{loading.delete(s);pump();});
   }
  }
  const io=new IntersectionObserver(entries=>{for(const e of entries){const s=state[Number(e.target.dataset.i)];
   if(e.isIntersecting){visible.add(s);if(!s.model&&!s.failed){queue.push(s);pump();}}else visible.delete(s);}request();},{rootMargin:'200px'});
  state.forEach((s,i)=>{s.canvas.dataset.i=i;io.observe(s.canvas);});
  function request(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
  function draw(time){
   frame=0;if(time-last<30){request();return;}// ~30 fps is plenty for a slow turn
   const dt=Math.min((time-(last||time))/1000,.05);last=time;let any=false;
   for(const s of visible){if(!s.model)continue;any=true;
    if(!reduced)s.angle+=dt*s.speed;s.model.rotation.y=s.angle;
    scene.add(s.model);renderer.render(scene,camera);scene.remove(s.model);
    s.ctx.clearRect(0,0,W,H);s.ctx.drawImage(renderer.domElement,0,0);}
   if(any&&!reduced)request();else last=0;
  }
  document.addEventListener('visibilitychange',()=>{last=0;request();});
  return {request};
 };

 // Single draggable viewer for the product page.
 window.createGarmentViewer=function(element,{wheelZoom=false}={}){
  if(!T||!window.ShowroomGLTFLoader)return null;
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');element.append(canvas);
  let renderer;try{renderer=makeRenderer(canvas);}catch{return null;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new T.Scene();lights(scene);const camera=new T.PerspectiveCamera(30,1,.05,40);
  let model=null,yaw=.5,pitch=0,auto=!reduced,drag=null,frame=0,last=0,zoom=1,onScreen=true;
  function resize(){const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();request();}
  function request(){if(!frame&&onScreen&&!document.hidden)frame=requestAnimationFrame(draw);}
  function draw(time){frame=0;const dt=Math.min((time-(last||time))/1000,.05);last=time;if(auto)yaw+=dt*.45;
   if(model)model.rotation.set(pitch,yaw,0);const d=Math.max(4.4,2.2/Math.tan(15*Math.PI/180)/camera.aspect/2.4)/zoom;
   camera.position.set(0,.1,d);camera.lookAt(0,0,0);renderer.render(scene,camera);if(auto)request();else last=0;}
  element.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button,a'))return;auto=false;drag={x:e.clientX,y:e.clientY,yaw,pitch};element.setPointerCapture(e.pointerId);});
  element.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.009;pitch=Math.max(-.4,Math.min(.4,drag.pitch+(e.clientY-drag.y)*.006));request();});
  element.addEventListener('pointerup',()=>drag=null);element.addEventListener('pointercancel',()=>drag=null);
  if(wheelZoom)element.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.8,Math.min(2.4,zoom*(e.deltaY>0?.92:1.08)));request();},{passive:false});
  element.addEventListener('keydown',e=>{const k={ArrowLeft:-1,ArrowRight:1}[e.key];if(k){e.preventDefault();auto=false;yaw+=k*Math.PI/8;request();}});
  new ResizeObserver(resize).observe(element);
  // Stop spinning while scrolled away or in a background tab.
  new IntersectionObserver(([e])=>{onScreen=e.isIntersecting;last=0;request();}).observe(element);
  document.addEventListener('visibilitychange',()=>{last=0;request();});
  return {
   async load(url){const gltf=await showroomAssets.model(url);if(model)scene.remove(model);model=centre(gltf.scene);scene.add(model);resize();request();},
   setAuto(v){auto=v;last=0;request();return auto;},isAuto:()=>auto,
   view(side){auto=false;yaw=side==='back'?Math.PI:0;pitch=0;request();},
   // Used by the Garment Lab: recolour the loaded model, zoom from a slider, redraw after changes.
   model:()=>model,setZoom(z){zoom=Math.max(.8,Math.min(2.4,z));request();},redraw:request
  };
 };
})();
