'use strict';
(()=>{
 const T=window.THREE,reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const pageActive=()=>window.showroomPageActive?.()??!document.hidden;
 const hatStyles=()=>Array.isArray(window.BTR_HAT_STYLES)?window.BTR_HAT_STYLES:[];
 const hatStyle=item=>item?.family==='trucker'?(hatStyles().find(s=>s.id===(item.hatStyle||'trucker'))||hatStyles()[0]):null;
 function setColors(root,colors){root?.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material])){if(!m?.color)continue;const name=m.name||'';const key=name.startsWith('Front panel / color')?'front':/^(Brim|Topstitch) \/ color/.test(name)?'brim':/^(Open mesh|Snapback) \/ color/.test(name)?'mesh':null;if(key&&/^#[0-9a-f]{6}$/i.test(colors[key]))m.color.set(colors[key]);}});}
 function setInkArea(root,style){root.userData.hatInkArea=style?.ink||{width:.1536,height:.120,yMin:0,zMin:0,facingMin:.05};}

 // Ink lives in the hat fabric shader, so it follows the curved front panel.
 window.applyHatInk=function(root,canvas){
  const area=root.userData.hatInkArea||{width:.1536,height:.120,yMin:0,zMin:0,facingMin:.05};
  let applied=false;root.traverse(o=>{if(!o.isMesh)return;for(const m of(Array.isArray(o.material)?o.material:[o.material])){
   if(!m?.name.startsWith('Front panel / color'))continue;applied=true;
   let ink=m.userData.hatInk;
   if(!ink){
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=m.userData.maxAnisotropy||4;ink={texture,uniform:{value:texture},area:{value:new T.Vector4(area.width,area.height,area.yMin||0,area.zMin||0)},facing:{value:area.facingMin??.05}};m.userData.hatInk=ink;
    m.onBeforeCompile=shader=>{
     shader.uniforms.btrHatInk=ink.uniform;shader.uniforms.btrHatArea=ink.area;shader.uniforms.btrHatFacing=ink.facing;
     shader.vertexShader='uniform vec4 btrHatArea; varying vec2 vHatInkUV; varying float vHatInkFacing;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHatInkUV=vec2(transformed.x/btrHatArea.x+.5,(transformed.y-btrHatArea.z)/btrHatArea.y);vHatInkFacing=transformed.z>btrHatArea.w?objectNormal.z:0.0;');
     shader.fragmentShader='uniform sampler2D btrHatInk; uniform float btrHatFacing; varying vec2 vHatInkUV; varying float vHatInkFacing;\n'+shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nif(vHatInkFacing>btrHatFacing && vHatInkUV.x>=0.0 && vHatInkUV.x<=1.0 && vHatInkUV.y>=0.0 && vHatInkUV.y<=1.0){vec4 ink=texture2D(btrHatInk,vHatInkUV);diffuseColor.rgb=mix(diffuseColor.rgb,ink.rgb,ink.a*.98);}');
    };m.customProgramCacheKey=()=> 'btr-hat-ink-v4';m.needsUpdate=true;
   }
   ink.area.value.set(area.width,area.height,area.yMin||0,area.zMin||0);ink.facing.value=area.facingMin??.05;ink.texture.image=canvas;ink.texture.needsUpdate=true;
  }});return applied;
 };
 const lighting=scene=>{if(window.showroomProductLights)return window.showroomProductLights(scene);scene.add(new T.HemisphereLight(0xffffff,0x56606b,1.05));for(const [pos,power,col] of [[[-3,5,4],3.1,0xfff9ef],[[4,2,2],.85,0xe7edff],[[1,3,-4],1.7,0xffffff]]){const l=new T.DirectionalLight(col,power);l.position.set(...pos);scene.add(l);}};
 function renderer(canvas){const r=new T.WebGLRenderer({canvas,alpha:true,antialias:true});window.showroomEnableKTX2?.(r);r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.0;return r;}
 function prepareMaterials(model,r){const anisotropy=Math.min(8,r.capabilities.getMaxAnisotropy());model.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m){m.userData.maxAnisotropy=anisotropy;for(const key of ['map','normalMap','roughnessMap'])if(m[key]){m[key].anisotropy=anisotropy;m[key].needsUpdate=true;}}});}
 function center(scene){const box=new T.Box3().setFromObject(scene),size=box.getSize(new T.Vector3());scene.position.sub(box.getCenter(new T.Vector3()));const root=new T.Group();root.add(scene);root.scale.setScalar(1/Math.max(size.x,size.y,size.z));return root;}
 function bounds(model){const s=new T.Box3().setFromObject(model).getSize(new T.Vector3());return {radius:Math.hypot(s.x,s.z)/2,halfHeight:s.y/2};}
 function fit(camera,b,elevation,zoom=1){const v=camera.fov*Math.PI/360,h=Math.atan(Math.tan(v)*camera.aspect),c=Math.cos(elevation),s=Math.sin(elevation);const horizontal=b.radius*Math.sqrt(1/Math.tan(h)**2+c*c)+b.halfHeight*s,vertical=(b.radius*s+b.halfHeight*c)/Math.tan(v)+b.radius*c+b.halfHeight*s;const d=Math.max(horizontal,vertical)*1.10/zoom;camera.position.set(0,d*s,d*c);camera.lookAt(0,0,0);camera.updateProjectionMatrix();}
 function dispose(model){if(!model)return;const gs=new Set(),ms=new Set(),ts=new Set();model.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m){if(m.userData.hatInk?.texture)ts.add(m.userData.hatInk.texture);ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
 window.createAccessoryCarousel=function(cards){
  if(!T||!window.ShowroomGLTFLoader||!cards.length)return null;
  let r=null;const previewWidth=innerWidth<=700?480:640,previewHeight=previewWidth*.75;
  function ensureRenderer(){if(r)return true;try{r=renderer(document.createElement('canvas'));r.setPixelRatio(1);r.setSize(previewWidth,previewHeight,false);return true;}catch{return false;}}
  const scene=new T.Scene();lighting(scene);const camera=new T.PerspectiveCamera(30,4/3,.01,30);
  let frame=0,last=0,auto=!reduced.matches,dead=false;const visible=new Set(),queue=[],loading=new Set();
  const states=cards.map((c,i)=>({...c,index:i,root:null,angle:.25,ctx:c.canvas.getContext('2d'),failed:false}));
  function pump(){if(!dead&&pageActive()&&queue.length&&!ensureRenderer())return;while(!dead&&pageActive()&&loading.size<2&&queue.length){const s=queue.shift();if(s.root||s.failed||loading.has(s)||!visible.has(s))continue;loading.add(s);showroomAssets.model(hatStyle(s.item)?.model||s.url,{priority:'low'}).then(async g=>{prepareMaterials(g.scene,r);s.root=center(g.scene);setInkArea(s.root,hatStyle(s.item));setColors(s.root,{front:s.item.frontColor,brim:s.item.brimColor,mesh:s.item.meshColor});await window.decorateAccessoryModel?.(s.root,s.item);s.bounds=bounds(s.root);if(dead){dispose(s.root);return;}s.canvas.parentElement.classList.add('has-live-accessory');s.canvas.dataset.modelReady='true';request();}).catch(()=>s.failed=true).finally(()=>{loading.delete(s);pump();});}}
  const observer=new IntersectionObserver(entries=>{for(const e of entries){const s=states[Number(e.target.dataset.accessoryIndex)];if(e.isIntersecting){visible.add(s);if(!s.root&&!s.failed&&!loading.has(s)&&!queue.includes(s))queue.push(s);}else visible.delete(s);}pump();last=0;request();},{rootMargin:'100px'});
  for(const s of states){s.canvas.width=previewWidth;s.canvas.height=previewHeight;s.canvas.dataset.accessoryIndex=s.index;observer.observe(s.canvas);}
  function request(){if(!dead&&!frame&&visible.size&&pageActive())frame=requestAnimationFrame(draw);}
  function draw(t){frame=0;if(!pageActive()||!visible.size){last=0;return;}if(last&&t-last<40){request();return;}const dt=Math.min((t-(last||t))/1000,.1);last=t;let active=false;for(const s of visible){if(!s.root||!s.bounds)continue;active=true;if(auto&&!reduced.matches)s.angle+=dt*.42;s.root.rotation.y=s.angle;fit(camera,s.bounds,(s.family==='gloves'?8:23)*Math.PI/180);scene.add(s.root);r.render(scene,camera);scene.remove(s.root);s.ctx.clearRect(0,0,previewWidth,previewHeight);s.ctx.drawImage(r.domElement,0,0);}if(active&&auto&&!reduced.matches)request();else last=0;}
  const visibility=()=>{last=0;if(!pageActive()){cancelAnimationFrame(frame);frame=0;}else{pump();request();}};document.addEventListener('visibilitychange',visibility);document.addEventListener('btr:page-visibility',visibility);reduced.addEventListener('change',visibility);
  return {setAuto(v){auto=!!v;last=0;request();return auto;},destroy(){dead=true;cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('btr:page-visibility',visibility);reduced.removeEventListener('change',visibility);states.forEach(s=>dispose(s.root));r?.dispose();}};
 };
 window.mountAccessoryMedia=function(element,item){
  element.classList.remove('viewer','card-media');element.classList.add('accessory-viewer');element.replaceChildren();
  const stage=document.createElement('div');stage.className='accessory-stage';stage.tabIndex=0;stage.setAttribute('aria-label',item.name+' interactive 3D model. Drag or use arrow keys to turn.');
  const poster=document.createElement('img');poster.className='accessory-fallback';poster.src=item.poster;poster.alt=item.name;
  const status=document.createElement('p');status.className='accessory-loading';status.setAttribute('role','status');status.textContent='Loading 3D…';
  const tools=document.createElement('div');tools.className='accessory-tools';tools.innerHTML='<div class="seg" role="group" aria-label="Model view"><button type="button" data-side="front">Front</button><button type="button" data-side="back">Back</button></div><button type="button" data-auto aria-pressed="true">Pause spin</button><label>Zoom <input type="range" min="100" max="200" step="5" value="100" aria-label="Zoom the accessory"></label>';
  const help=document.createElement('p');help.className='fine';help.textContent='Drag to turn · scroll to zoom';element.append(stage,poster,status,tools,help);
  let r;try{r=renderer(document.createElement('canvas'));}catch{status.textContent='3D unavailable — preview shown';return {ready:Promise.resolve(false),setStyle:async()=>false,setColors(){},setArtwork(){},front(){},redraw(){},destroy(){element.replaceChildren();}};}
  const canvas=r.domElement;canvas.setAttribute('aria-hidden','true');stage.append(canvas);r.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.25:1.75));const scene=new T.Scene();lighting(scene);const camera=new T.PerspectiveCamera(30,1,.01,30);
  let model=null,box=null,yaw=.25,pitch=0,zoom=item.family==='trucker'?1.35:1,auto=!reduced.matches,drag=null,frame=0,last=0,onScreen=true,dead=false,loadToken=0,currentStyle=null,artwork=null;const colors={front:item.frontColor,brim:item.brimColor,mesh:item.meshColor};const elevation=(item.family==='gloves'?8:23)*Math.PI/180;
  tools.querySelector('input').value=Math.round(zoom*100);
  const autoButton=tools.querySelector('[data-auto]');function sync(){autoButton.textContent=auto?'Pause spin':'Spin';autoButton.setAttribute('aria-pressed',String(auto));}sync();
  function request(){if(!onScreen){const rect=stage.getBoundingClientRect();onScreen=rect.width>0&&rect.bottom>0&&rect.top<innerHeight;}if(!dead&&!frame&&onScreen&&pageActive())frame=requestAnimationFrame(draw);}
  function draw(t){frame=0;if(dead||!onScreen||!pageActive()){last=0;return;}const dt=Math.min((t-(last||t))/1000,.06);last=t;if(model&&box){if(auto&&!reduced.matches)yaw+=dt*.42;model.rotation.set(pitch,yaw,0);fit(camera,box,elevation,zoom);r.render(scene,camera);}if(auto&&!reduced.matches)request();else last=0;}
  function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(w&&h){r.setSize(w,h,false);camera.aspect=w/h;request();}}
  const ro=new ResizeObserver(resize);ro.observe(stage);const io=new IntersectionObserver(([e])=>{onScreen=e.isIntersecting;last=0;request();});io.observe(stage);
  const visibility=()=>{last=0;if(!pageActive()){cancelAnimationFrame(frame);frame=0;}else request();};document.addEventListener('visibilitychange',visibility);document.addEventListener('btr:page-visibility',visibility);
  const reduceChange=()=>{if(reduced.matches){auto=false;sync();}request();};reduced.addEventListener('change',reduceChange);
  autoButton.addEventListener('click',()=>{auto=!auto;sync();request();});
  tools.querySelectorAll('[data-side]').forEach(b=>b.addEventListener('click',()=>{auto=false;yaw=b.dataset.side==='front'?0:Math.PI;pitch=0;tools.querySelectorAll('[data-side]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));sync();request();}));
  tools.querySelector('input').addEventListener('input',e=>{zoom=Number(e.target.value)/100;request();});
  stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;auto=false;sync();drag={x:e.clientX,y:e.clientY,yaw,pitch};stage.setPointerCapture(e.pointerId);});
  stage.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.009;pitch=Math.max(-.55,Math.min(.55,drag.pitch+(e.clientY-drag.y)*.006));request();});
  for(const event of ['pointerup','pointercancel'])stage.addEventListener(event,()=>drag=null);
  stage.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();auto=false;sync();yaw+=(e.key==='ArrowLeft'?-1:1)*Math.PI/8;request();});
  stage.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(1,Math.min(2,zoom*(e.deltaY>0?.92:1.08)));tools.querySelector('input').value=Math.round(zoom*100);request();},{passive:false});
  // Each load is independently parsed by showroomAssets, so every style owns its materials.
  async function loadStyle(style){
   const token=++loadToken,url=style?.model||item.model;let next=null;
   stage.setAttribute('aria-busy','true');stage.dataset.loadingStyle=style?.id||'';status.hidden=false;status.textContent='Loading '+(style?.name||item.name)+'…';
   try{
    const g=await showroomAssets.model(url);prepareMaterials(g.scene,r);next=center(g.scene);setInkArea(next,style);
    if(!artwork)await window.decorateAccessoryModel?.(next,item);
    if(dead||token!==loadToken){dispose(next);return false;}
    setColors(next,colors);if(artwork)window.applyHatInk(next,artwork);
    const previous=model;model=next;box=bounds(model);scene.add(model);if(previous){scene.remove(previous);dispose(previous);}
    currentStyle=style||null;poster.src=style?.poster||item.poster;poster.alt=style?.name||item.name;poster.hidden=true;status.hidden=true;stage.dataset.modelReady='true';stage.dataset.hatStyle=style?.id||'';stage.setAttribute('aria-label',(style?.name||item.name)+' interactive 3D model. Drag or use arrow keys to turn.');resize();request();return true;
   }catch{
    if(next)dispose(next);if(!dead&&token===loadToken){status.textContent=model?'That shape could not load. Your current design is still here.':'Could not load 3D — preview shown';}return false;
   }finally{if(token===loadToken){stage.setAttribute('aria-busy','false');delete stage.dataset.loadingStyle;}}
  }
  const ready=loadStyle(hatStyle(item));
  return {ready,
   setVariant(next){item={...item,...next};return loadStyle(null);},
   setStyle(style){if(!style?.model)return Promise.resolve(false);if(currentStyle?.id===style.id&&stage.getAttribute('aria-busy')!=='true')return Promise.resolve(true);return loadStyle(style);},
   getStyle(){return currentStyle;},
   setColors(value){Object.assign(colors,value);setColors(model,colors);request();},
   setArtwork(value){artwork=value;if(model)window.applyHatInk(model,artwork);request();},
   front(){auto=false;yaw=0;pitch=0;sync();request();},
   redraw:request,
   destroy(){dead=true;++loadToken;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('btr:page-visibility',visibility);reduced.removeEventListener('change',reduceChange);dispose(model);r.dispose();element.replaceChildren();}};
 };
})();
