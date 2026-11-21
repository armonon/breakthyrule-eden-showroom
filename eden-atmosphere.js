'use strict';
// Air you can see, in three draw calls at most: dust motes drifting in daylight, fireflies blinking low over the ground at
// night, and soft cones of light under the night district's lanterns. Everything is animated on the GPU from one time
// uniform (no per-frame buffer uploads); the particle fields wrap around the camera so a fixed handful always fills the view.
window.createEdenAtmosphere=function(T,scene,camera,{getNight=()=>0,getLamps=()=>null,reduced=false}={}){
 const settings={dust:1,fireflies:1,cones:1};
 const time={value:0},night={value:0},center={value:new T.Vector3()};
 const root=new T.Group();root.name='Atmosphere (dust, fireflies, light cones)';scene.add(root);

 function field(count,span,seed){
  const positions=new Float32Array(count*3),phase=new Float32Array(count);let s=seed;
  const random=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<count;i++){positions[i*3]=random()*span;positions[i*3+1]=random()*span;positions[i*3+2]=random()*span;phase[i]=random()*100;}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('phase',new T.BufferAttribute(phase,1));
  geometry.boundingSphere=new T.Sphere(new T.Vector3(),1e6); // positions are placed in the shader
  return geometry;
 }
 // Wrap a particle's home into a box of `span` metres centred on the camera (y from the ground up), then add drift.
 const wrap=`vec3 wrapped(vec3 home,float span,vec3 drift){vec3 p=mod(home+drift-center+span*.5,span)-span*.5+center;return p;}`;
 const points=(count,span,seed,vertex,fragment,uniforms)=>{
  const material=new T.ShaderMaterial({uniforms:{time,night,center,...uniforms},vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  const mesh=new T.Points(field(count,span,seed),material);mesh.frustumCulled=false;mesh.renderOrder=5;root.add(mesh);return mesh;
 };

 // Dust: tiny warm motes, lit by day, drifting slowly with the breeze and fading out at the edge of their box.
 const dust=points(reduced?220:420,22,7919,`attribute float phase;uniform float time,night,strength;uniform vec3 center;varying float vAlpha;${wrap}
  void main(){vec3 drift=vec3(time*.18+sin(time*.3+phase)*.4,sin(time*.21+phase*1.7)*.35,time*.07+cos(time*.27+phase)*.4);
   vec3 p=wrapped(position,22.,drift);p.y=center.y-1.2+mod(position.y+drift.y,6.);
   vec4 mv=modelViewMatrix*vec4(p,1.);float dist=-mv.z;gl_Position=projectionMatrix*mv;gl_PointSize=clamp(36./dist,1.,5.);
   vAlpha=strength*(1.-night)*smoothstep(11.,6.,length(p.xz-center.xz))*smoothstep(.4,1.5,dist)*(.55+.45*sin(time*1.3+phase));}`,
  `varying float vAlpha;void main(){vec2 q=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(q))*vAlpha;if(a<.003)discard;gl_FragColor=vec4(vec3(1.,.93,.8)*a*2.,1.);}`,
  {strength:{value:1}});

 // Fireflies: a few dozen yellow-green sparks between knee and head height, wandering and blinking slowly; bright enough
 // (over white, untone-mapped) that bloom gives each a halo.
 const fireflies=points(reduced?40:90,34,104729,`attribute float phase;uniform float time,night,strength;uniform vec3 center;varying float vAlpha;${wrap}
  void main(){float t=time*.35+phase;vec3 drift=vec3(sin(t)*1.6+sin(t*2.3)*.5,0.,cos(t*.8)*1.6+sin(t*1.7)*.5);
   vec3 p=wrapped(position,34.,drift);p.y=center.y-1.45+.35+mod(position.y,2.2)+sin(t*1.9)*.25;
   vec4 mv=modelViewMatrix*vec4(p,1.);float dist=-mv.z;gl_Position=projectionMatrix*mv;gl_PointSize=clamp(110./dist,2.,12.);
   float blink=pow(max(sin(time*(.9+fract(phase)*.8)+phase*3.),0.),6.);
   vAlpha=strength*night*blink*smoothstep(17.,11.,length(p.xz-center.xz))*smoothstep(.5,2.,dist);}`,
  `varying float vAlpha;void main(){vec2 q=gl_PointCoord-.5;float r=length(q);float a=(smoothstep(.5,.0,r)*.35+smoothstep(.16,0.,r))*vAlpha;if(a<.003)discard;gl_FragColor=vec4(vec3(.85,1.,.4)*a*3.,1.);}`,
  {strength:{value:1}});

 // Light cones: an open cone from each lantern to the ground, brightest at the lamp and where you look through most air
 // (edge-on), fading to nothing at the rim. One instanced draw for every lantern in the district.
 const coneGeometry=new T.CylinderGeometry(.14,1.7,1,20,1,true);coneGeometry.translate(0,-.5,0);
 const coneMaterial=new T.ShaderMaterial({uniforms:{night,strength:{value:1}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,toneMapped:false,
  vertexShader:`varying float vH;varying vec3 vN,vV;void main(){vH=-position.y;vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix*instanceMatrix)*normal);vV=normalize(cameraPosition-wp.xyz);gl_Position=projectionMatrix*viewMatrix*wp;}`,
  fragmentShader:`uniform float night,strength;varying float vH;varying vec3 vN,vV;void main(){float edge=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.6);
   float a=strength*night*(1.-edge)*(1.-vH)*(1.-vH)*.9;if(a<.002)discard;gl_FragColor=vec4(vec3(1.,.74,.45)*a,1.);}`});
 let cones=null,coneSource=null;
 function buildCones(lamps){
  if(cones){root.remove(cones);cones.dispose?.();}cones=null;coneSource=lamps;if(!lamps?.length)return;
  cones=new T.InstancedMesh(coneGeometry,coneMaterial,lamps.length);cones.name='Lantern light cones';cones.renderOrder=4;
  const m=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3();
  lamps.forEach((p,i)=>{const h=Math.max(.5,p.y-.1);m.compose(new T.Vector3(p.x,p.y-.1,p.z),q,s.set(1,h,1));cones.setMatrixAt(i,m);});
  cones.instanceMatrix.needsUpdate=true;cones.computeBoundingSphere();root.add(cones);
 }

 function apply(){dust.material.uniforms.strength.value=settings.dust;fireflies.material.uniforms.strength.value=settings.fireflies;coneMaterial.uniforms.strength.value=settings.cones;
  dust.visible=settings.dust>0;fireflies.visible=settings.fireflies>0;}
 apply();

 return {
  root,
  update(seconds){
   time.value=reduced?seconds*.4:seconds;night.value=getNight();camera.getWorldPosition(center.value);
   dust.visible=settings.dust>0&&night.value<.98;fireflies.visible=settings.fireflies>0&&night.value>.02;
   const lamps=settings.cones>0&&night.value>.02?getLamps():null;if(lamps!==coneSource&&(lamps||cones))buildCones(lamps);
   if(cones)cones.visible=!!lamps;
  },
  // dust, fireflies, cones: 0 (off) to 1
  set(next={}){Object.assign(settings,next);apply();},
  inspect:()=>({...settings,night:+night.value.toFixed(2),cones:cones?cones.count:0}),
  dispose(){scene.remove(root);dust.geometry.dispose();dust.material.dispose();fireflies.geometry.dispose();fireflies.material.dispose();coneGeometry.dispose();coneMaterial.dispose();cones?.dispose?.();}
 };
};
