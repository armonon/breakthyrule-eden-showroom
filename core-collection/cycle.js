'use strict';
(()=>{
 const T=window.THREE,TAU=Math.PI*2;
 const pageActive=()=>window.showroomPageActive?.()??!document.hidden;
 const palette=[{name:'Red',hue:0,thread:'#b51f2b'},{name:'Violet',hue:.82,thread:'#8f32b5'},{name:'Blue',hue:.62,thread:'#2a66b8'},{name:'Green',hue:.31,thread:'#347c44'},{name:'Gold',hue:.10,thread:'#b47c1d'}];
 function appearance(root,initial='black'){
  const materials=new Map(),fabric=[],rib=[],seams=[],contrast=[],thread=[],hue={value:0};
  const shader=`
uniform float btrCoreHue;
vec3 btrCoreShift(vec3 c){
 float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo,h=0.0;
 if(d>0.000001){if(hi==c.r)h=(c.g-c.b)/d;else if(hi==c.g)h=(c.b-c.r)/d+2.0;else h=(c.r-c.g)/d+4.0;h=fract(h/6.0+btrCoreHue);}
 vec3 rgb=clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
 return hi*mix(vec3(1.0),rgb,hi>0.000001?d/hi:0.0);
}
`;
  function clone(m){
   if(materials.has(m))return materials.get(m);const c=m.clone();materials.set(m,c);
   if(c.name.startsWith('Core fabric /'))fabric.push(c);
   else if(c.name.startsWith('Core rib knit /'))rib.push(c);
   else if(c.name.startsWith('Core stitching /'))seams.push(c);
   else if(c.name.startsWith('Core logo / contrast'))contrast.push(c);
   else if(c.name.startsWith('Core logo / red thread'))thread.push(c);
   else if(c.name.startsWith('Core eye artwork /')){
    c.onBeforeCompile=s=>{s.uniforms.btrCoreHue=hue;s.fragmentShader=shader+s.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=btrCoreShift(diffuseColor.rgb);');
     if(c.userData.collectionPigment)s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>','outgoingLight = mix(outgoingLight, diffuseColor.rgb, 0.65);\n#include <opaque_fragment>');
    };
    c.customProgramCacheKey=()=> 'btr-core-hue-2-'+Number(!!c.userData.collectionPigment);c.needsUpdate=true;
   }
   return c;
  }
  root.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);});
  let color=initial,graphic=0;
  function apply(next,index=graphic){
   color=next;graphic=((index%palette.length)+palette.length)%palette.length;const white=color==='white';
   for(const m of fabric)m.color.set(white?'#eeeae0':'#151619');
   for(const m of rib)m.color.set(white?'#e4dfd3':'#121315');
   for(const m of seams)m.color.set(white?'#d9d3c6':'#25262a');
   for(const m of contrast)m.color.set(white?'#202020':'#ded7c5');
   for(const m of thread)m.color.set(palette[graphic].thread);
   hue.value=palette[graphic].hue;return state();
  }
  function state(){return{color,graphic:palette[graphic].name,index:graphic};}
  apply(initial,0);return{apply,state};
 }
 // Count only automatic motion. Dragging, selecting Front/Back and hidden tabs cannot skip colors.
 function turns(onTurn){let last=null,progress=0,pass=0;return{tick(yaw,auto){const delta=last===null?0:yaw-last;last=yaw;if(auto&&delta>0&&delta<.4){progress+=delta;while(progress>=TAU){progress-=TAU;onTurn(++pass);}}},reset(yaw){last=yaw;progress=0;},pass:()=>pass};}
 function look(pass,offset=0,fabricOffset=0){const index=((pass+offset)%palette.length+palette.length)%palette.length;return{color:(pass+fabricOffset)%2?'white':'black',graphic:palette[index].name,index};}
 window.BTRCoreCycle={appearance,turns,palette,look};

 window.createCoreCarousel=function(cards){
  if(!T||!window.ShowroomGLTFLoader||!cards.length)return null;
  let renderer=null;
  function ensureRenderer(){if(renderer)return true;try{renderer=new T.WebGLRenderer({canvas:document.createElement('canvas'),antialias:true,alpha:true});window.showroomEnableKTX2?.(renderer);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.setPixelRatio(1);renderer.setSize(480,600,false);return true;}catch{return false;}}
  const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x8d8583,2));
  for(const [color,power,position] of [[0xffffff,2.6,[-3,5,5]],[0xe6e9ff,1.2,[4,1,-4]]]){const l=new T.DirectionalLight(color,power);l.position.set(...position);scene.add(l);}
  window.showroomProductLights?.(scene);
  const camera=new T.PerspectiveCamera(30,.8,.05,40);camera.position.set(0,.1,4.6);camera.lookAt(0,0,0);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,visible=new Set(),queue=[],loading=new Set();let auto=!reduced,frame=0,last=0,destroyed=false,angle=0,pass=0;
  const state=cards.map((c,i)=>({...c,i,model:null,failed:false,pass:0,offset:c.offset??i*2,fabricOffset:c.fabricOffset??i%2,ctx:c.canvas.getContext('2d')}));
  function publish(s){const a=s.appearance?.state()||look(pass,s.offset,s.fabricOffset),host=s.canvas.parentElement;host.dataset.coreColor=a.color;host.dataset.coreGraphic=a.graphic;host.dataset.corePass=String(s.pass);s.onChange?.({...a,pass:s.pass});}
  for(const s of state)publish(s);
  function pump(){if(!destroyed&&pageActive()&&queue.length&&!ensureRenderer())return;while(!destroyed&&pageActive()&&loading.size<2&&queue.length){const s=queue.shift();if(s.model||s.failed||loading.has(s)||!visible.has(s))continue;loading.add(s);
   showroomAssets.model(s.url,{priority:'low'}).then(g=>{
    const box=new T.Box3().setFromObject(g.scene),size=box.getSize(new T.Vector3());g.scene.position.sub(box.getCenter(new T.Vector3()));s.model=new T.Group();s.model.add(g.scene);s.model.scale.setScalar(Math.min(1.75/size.y,1.4/Math.max(size.x,size.z)));s.appearance=appearance(s.model);const initial=look(pass,s.offset,s.fabricOffset);s.pass=pass;s.appearance.apply(initial.color,initial.index);publish(s);s.onReady?.();request();
   }).catch(()=>{s.failed=true;}).finally(()=>{loading.delete(s);pump();});
  }}
  const io=new IntersectionObserver(entries=>{for(const e of entries){const s=state[Number(e.target.dataset.coreCanvas)];if(e.isIntersecting){visible.add(s);if(!s.model&&!s.failed&&!loading.has(s)&&!queue.includes(s))queue.push(s);}else visible.delete(s);}pump();last=0;request();},{rootMargin:'80px'});
  for(const s of state){s.canvas.width=480;s.canvas.height=600;s.canvas.dataset.coreCanvas=String(s.i);io.observe(s.canvas);}
  function request(){if(!destroyed&&!frame&&pageActive()&&visible.size)frame=requestAnimationFrame(draw);}
  function draw(time){frame=0;if(!pageActive()||!visible.size){last=0;return;}if(last&&time-last<33){request();return;}const dt=Math.min((time-(last||time))/1000,.05);last=time;let any=false;
   if(auto&&[...visible].some(s=>s.model)){angle+=dt*.62;pass=Math.floor(angle/TAU);}
   // Apply one shared turn to every loaded card before painting any preview.
   for(const s of state)if(s.pass!==pass){s.pass=pass;const next=look(pass,s.offset,s.fabricOffset);s.appearance?.apply(next.color,next.index);publish(s);}
   for(const s of visible){if(!s.model)continue;any=true;
    s.model.rotation.y=angle%TAU;scene.add(s.model);renderer.render(scene,camera);scene.remove(s.model);s.ctx.clearRect(0,0,480,600);s.ctx.drawImage(renderer.domElement,0,0);
   }
   if(any&&auto)request();else last=0;
  }
  const visibility=()=>{last=0;if(!pageActive()){cancelAnimationFrame(frame);frame=0;}else{pump();request();}};document.addEventListener('visibilitychange',visibility);document.addEventListener('btr:page-visibility',visibility);
  return{setAuto(v){auto=!!v;last=0;request();return auto;},isAuto:()=>auto,request,destroy(){destroyed=true;cancelAnimationFrame(frame);io.disconnect();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('btr:page-visibility',visibility);renderer?.dispose();}};
 };
})();
