'use strict';
(()=>{
 const T=THREE,$=id=>document.getElementById(id),shirts=showroomCollection;
 const scene=new T.Scene();scene.background=new T.Color('#dbe1df');
 scene.add(new T.HemisphereLight(0xffffff,0x88968b,1.8));
 for(const [x,y,z,intensity,color] of [[-3,5,4,2.3,0xfff6e9],[4,2,-3,1.8,0xe3f3ff],[3,1,4,.45,0xffffff]]){const light=new T.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);}
 const renderer=new T.WebGLRenderer({canvas:$('canvas'),antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 const camera=new T.PerspectiveCamera(32,1,.01,20);let model,angle=.5,zoom=1,drag=null,spinning=false,generation=0,size=new T.Vector3(.8,.7,.2),frame=0;
 window.shirtStudy={ready:false,error:null};
 const qa=new URLSearchParams(location.search).has('qa');let lastProbe=0;
 function draw(){
  frame=0;if(model)model.rotation.y=angle;
  const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  const distance=Math.max(size.y/2*1.65,size.x/(2*camera.aspect)*1.2)/Math.tan(16*Math.PI/180)/zoom;
  camera.position.set(0,.015,distance);camera.lookAt(0,0,0);renderer.render(scene,camera);
  if(qa&&model&&(!spinning||performance.now()-lastProbe>300)){
   lastProbe=performance.now();const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let foreground=0,checksum=0;for(let i=0;i<pixels.length;i+=64){if(Math.abs(pixels[i]-pixels[0])+Math.abs(pixels[i+1]-pixels[1])+Math.abs(pixels[i+2]-pixels[2])>30)foreground++;checksum=(Math.imul(checksum,31)+pixels[i]+pixels[i+1]*3+pixels[i+2]*7)>>>0;}
   $('canvas').dataset.renderCheck=JSON.stringify({...window.shirtStudy,foreground,samples:Math.ceil(pixels.length/64),checksum,angle});
  }
  if(spinning){angle+=.008;frame=requestAnimationFrame(draw);}
 }
 function request(){if(!frame)frame=requestAnimationFrame(draw);}
 function dispose(root){const textures=new Set(),materials=new Set();root.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of [].concat(n.material)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}}});for(const t of textures)t.dispose();for(const m of materials)m.dispose();}
 async function load(){
  const epoch=++generation,row=shirts[Number($('shirt').value)],old=$('previous').checked,rack=$('rack').checked;
  const version=new URLSearchParams(location.search).get('version'),revision=version==='6'?'tailored-v6':version==='5'?'sewn-v5':row.qualityRevision||null,candidate=revision!==row.qualityRevision;
  window.shirtStudy={ready:false,error:null,slug:row.slug};$('status').textContent='Loading '+row.name;
  const path=old?(rack?(candidate?row.rackModel:row.previousRackModel||row.rackModel):(candidate?row.model:row.previousModel||row.model)):revision?'/'+(rack?'rack-models/':'models/')+row.slug+'-'+revision+'.glb':rack?row.rackModel:row.model;
  try{const gltf=await showroomAssets.model(path);if(epoch!==generation){dispose(gltf.scene);return;}
   if(model){scene.remove(model);dispose(model);}const box=new T.Box3().setFromObject(gltf.scene),center=box.getCenter(new T.Vector3());box.getSize(size);gltf.scene.position.sub(center);model=new T.Group();model.add(gltf.scene);scene.add(model);
   let triangles=0,meshes=0;model.traverse(n=>{if(n.isMesh){triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;meshes++;}});
   window.shirtStudy={ready:true,error:null,slug:row.slug,path,triangles,bounds:size.toArray(),meshes};
   $('status').textContent=row.name+' / '+(old?'Previous':(revision||'Original').replace('sewn-','Sewn ').replace('tailored-','Tailored ')+(rack?' / Rack':''))+(row.estimated?' / Unverified design':'');request();
  }catch(error){window.shirtStudy.error=error.message;$('status').textContent='This model is not available yet.';}
 }
 shirts.forEach((row,i)=>{const option=document.createElement('option');option.value=i;option.textContent=row.name;$('shirt').append(option);});
 const initial=shirts.findIndex(row=>row.slug===new URLSearchParams(location.search).get('item'));if(initial>=0)$('shirt').value=String(initial);
 $('shirt').onchange=$('previous').onchange=$('rack').onchange=load;
 $('front').onclick=()=>{angle=0;request();};$('back').onclick=()=>{angle=Math.PI;request();};$('left').onclick=()=>{angle-=Math.PI/4;request();};$('right').onclick=()=>{angle+=Math.PI/4;request();};
 $('spin').onclick=()=>{spinning=!spinning;$('spin').setAttribute('aria-pressed',String(spinning));request();};$('closer').onclick=()=>{zoom=Math.min(2,zoom+.2);request();};$('farther').onclick=()=>{zoom=Math.max(.7,zoom-.2);request();};
 $('canvas').onpointerdown=e=>{drag={x:e.clientX,angle};$('canvas').setPointerCapture(e.pointerId);};$('canvas').onpointermove=e=>{if(drag){angle=drag.angle+(e.clientX-drag.x)*.009;request();}};$('canvas').onpointerup=$('canvas').onpointercancel=()=>drag=null;
 $('canvas').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();angle+=e.key==='ArrowLeft'?-.2:.2;request();}};
 window.addEventListener('resize',request);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else request();});lucide.createIcons();load();
})();
