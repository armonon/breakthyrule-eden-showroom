'use strict';
// Air you can see and things living in it, a draw call each: dust motes drifting in daylight, fireflies blinking low over
// the ground at night, soft cones of light under the night district's lanterns, birds crossing the sky now and then,
// butterflies over the garden by day and moths circling the nearest lanterns at night. Everything is animated on the GPU from one time
// uniform (no per-frame buffer uploads); the particle fields wrap around the camera so a fixed handful always fills the view.
// isGarden(position): true where butterflies and birds belong (outdoors in Eden, not in a pocket world).
window.createEdenAtmosphere=function(T,scene,camera,{getNight=()=>0,getLamps=()=>null,isGarden=()=>true,reduced=false}={}){
 const settings={dust:1,fireflies:1,cones:1,life:1};
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

 // Birds: a loose flock of dark silhouettes (two flapping wings each) crossing high overhead every 20-45 s by day.
 const BIRDS=9,birdGeometry=new T.InstancedBufferGeometry();{
  const p=[0,0,.2, -.04,0,-.16, .04,0,-.16, -.04,0,.06, -.04,0,-.08, -.36,0,-.06, .04,0,.06, .36,0,-.06, .04,0,-.08];
  birdGeometry.setAttribute('position',new T.Float32BufferAttribute(p,3));birdGeometry.setIndex([0,1,2,3,4,5,6,7,8]);
  const offset=[],phase=[];for(let i=0;i<BIRDS;i++){const row=Math.ceil(i/2),side=i%2?1:-1;offset.push(side*row*(1.4+Math.sin(i*7.1)*.4),Math.sin(i*3.3)*.8,-row*(1.6+Math.cos(i*5.2)*.5));phase.push(i*1.7);}
  birdGeometry.setAttribute('offset',new T.InstancedBufferAttribute(new Float32Array(offset),3));birdGeometry.setAttribute('phase',new T.InstancedBufferAttribute(new Float32Array(phase),1));
  birdGeometry.instanceCount=BIRDS;birdGeometry.boundingSphere=new T.Sphere(new T.Vector3(),1e6);}
 const flock={start:{value:-100},origin:{value:new T.Vector3()},dir:{value:new T.Vector3(1,0,0)}};let nextFlock=8;
 const birds=new T.Mesh(birdGeometry,new T.ShaderMaterial({uniforms:{time,start:flock.start,origin:flock.origin,dir:flock.dir},side:T.DoubleSide,
  vertexShader:`attribute vec3 offset;attribute float phase;uniform float time,start;uniform vec3 origin,dir;
   void main(){float t=time-start;vec3 right=normalize(cross(dir,vec3(0.,1.,0.)));float span=abs(position.x)/.36;
    vec3 c=origin+dir*t*9.+right*offset.x+dir*offset.z+vec3(0.,offset.y+sin(t*.7+phase)*.5,0.)+right*sin(t*.4+phase)*.6;
    float flap=sin(t*8.5+phase*6.)*span*.26*(.6+.4*step(.5,fract(t*.12+phase*.1)));
    vec3 w=c+right*position.x+vec3(0.,1.,0.)*(position.y+flap)+dir*position.z;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
  fragmentShader:`void main(){gl_FragColor=vec4(vec3(.05,.055,.06),1.);}`}));
 birds.frustumCulled=false;birds.visible=false;birds.name='Birds';root.add(birds);

 // Butterflies: a few white, yellow and orange flutterers wandering a box around you, knee to head height, by day.
 const FLIES=10,flyGeometry=new T.InstancedBufferGeometry();{
  flyGeometry.setAttribute('position',new T.Float32BufferAttribute([-1,0,-.7, 0,0,-.7, 0,0,.7, -1,0,.7, 0,0,-.7, 1,0,-.7, 1,0,.7, 0,0,.7],3));
  flyGeometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1, 1,0,0,0,0,1,1,1],2));flyGeometry.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);
  const home=[],tint=[],palette=[[.96,.95,.88],[.98,.85,.3],[.95,.55,.18],[.55,.7,.98]];let s=4242;const rnd=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<FLIES;i++){home.push(rnd()*14,rnd(),rnd()*14);tint.push(...palette[i%palette.length]);}
  flyGeometry.setAttribute('home',new T.InstancedBufferAttribute(new Float32Array(home),3));flyGeometry.setAttribute('tint',new T.InstancedBufferAttribute(new Float32Array(tint),3));
  flyGeometry.instanceCount=FLIES;flyGeometry.boundingSphere=new T.Sphere(new T.Vector3(),1e6);}
 const flies=new T.Mesh(flyGeometry,new T.ShaderMaterial({uniforms:{time,center},side:T.DoubleSide,transparent:false,
  vertexShader:`attribute vec3 home,tint;uniform float time;uniform vec3 center;varying vec2 vUv;varying vec3 vTint;
   vec3 path(float t){float h=home.y*40.;return vec3(sin(t*.31+h)*2.6+sin(t*.93+h*2.)*.7,0.,cos(t*.27+h*1.3)*2.6+cos(t*1.1+h)*.7)+vec3(0.,sin(t*1.7+h)*.18+sin(t*4.3+h)*.06,0.);}
   void main(){vUv=uv;vTint=tint;vec3 p0=path(time),p1=path(time+.08);vec3 c=mod(home+vec3(p0.x,0.,p0.z)-center+7.,14.)-7.+center;c.y=center.y-1.75+.45+home.y*.9+p0.y;
    vec3 fwd=normalize(vec3(p1.x-p0.x,0.,p1.z-p0.z)+vec3(1e-4,0.,0.)),right=normalize(cross(fwd,vec3(0.,1.,0.)));
    float a=(sin(time*15.+home.y*60.)*.5+.5)*1.15+.1,side=sign(position.x);vec3 local=vec3(position.x*cos(a),abs(position.x)*sin(a),position.z)*.075;
    vec3 w=c+right*local.x+vec3(0.,1.,0.)*local.y+fwd*local.z;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
  fragmentShader:`varying vec2 vUv;varying vec3 vTint;void main(){vec2 q=vec2(1.-vUv.x,vUv.y*2.-1.); // x: 0 at the body, 1 at the wing tip
  float r=length(vec2(q.x*.9,q.y*(1.1-.35*q.x)));if(r>1.||q.x<.04)discard;
   gl_FragColor=vec4(vTint*mix(1.,.45,smoothstep(.75,1.,r))*.8,1.);}`}));
 flies.frustumCulled=false;flies.visible=false;flies.name='Butterflies';root.add(flies);

 // Moths: pale specks spiralling erratically around the six nearest lit lanterns at night.
 const MOTH_LAMPS=6,mothLamps=Array.from({length:MOTH_LAMPS},()=>new T.Vector4());let mothCheck=-1;
 const moths=points(reduced?18:36,1,31337,`attribute float phase;uniform float time,strength;uniform vec4 lamps[${MOTH_LAMPS}];varying float vAlpha;
  void main(){int k=int(mod(phase*7.,${MOTH_LAMPS}.));vec4 l=lamps[0];for(int i=1;i<${MOTH_LAMPS};i++)if(i==k)l=lamps[i];
   float s=fract(phase*13.7),t=time*(2.2+s*2.5)+phase,r=.22+.32*s+sin(t*2.7)*.08;
   vec3 p=l.xyz+vec3(cos(t)*r,sin(t*1.9+phase)*.22+sin(t*5.3)*.05-.05,sin(t)*r);
   vec4 mv=modelViewMatrix*vec4(p,1.);float dist=-mv.z;gl_Position=projectionMatrix*mv;gl_PointSize=clamp(18./dist,1.,4.);vAlpha=strength*l.w*smoothstep(25.,12.,dist);}`,
  `varying float vAlpha;void main(){vec2 q=gl_PointCoord-.5;float a=smoothstep(.5,.1,length(q))*vAlpha;if(a<.01)discard;gl_FragColor=vec4(vec3(.95,.9,.78)*a*1.4,1.);}`,
  {strength:{value:1},lamps:{value:mothLamps}});

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
   // living things
   const day=night.value<.3,outside=settings.life>0&&isGarden(center.value);
   flies.visible=outside&&day;
   if(settings.life>0&&outside&&day&&seconds>nextFlock&&time.value-flock.start.value>20){
    const a=Math.random()*Math.PI*2,dir=flock.dir.value.set(Math.cos(a),0,Math.sin(a)),side=new T.Vector3(-dir.z,0,dir.x);
    flock.origin.value.copy(center.value).addScaledVector(dir,-75).addScaledVector(side,(Math.random()-.5)*50).setY(center.value.y+22+Math.random()*18);
    flock.start.value=time.value;nextFlock=seconds+20+Math.random()*25;
   }
   birds.visible=settings.life>0&&time.value-flock.start.value<17;
   const allLamps=settings.life>0&&night.value>.3?getLamps():null;moths.visible=!!allLamps;
   if(allLamps&&seconds-mothCheck>.5){mothCheck=seconds;const near=[...allLamps].sort((p,q)=>p.distanceToSquared(center.value)-q.distanceToSquared(center.value));
    mothLamps.forEach((v,i)=>{const p=near[i%Math.max(1,near.length)];if(p)v.set(p.x,p.y,p.z,i<near.length?1:0);else v.w=0;});}
  },
  // Where the flock's lead bird is right now (into `out`), or null when no flock is in the sky; for the birdsong.
  flock(out){if(!birds.visible)return null;const age=time.value-flock.start.value;return out.copy(flock.origin.value).addScaledVector(flock.dir.value,age*9);},
  // dust, fireflies, cones, life (birds, butterflies, moths): 0 (off) to 1
  set(next={}){Object.assign(settings,next);apply();},
  inspect:()=>({...settings,night:+night.value.toFixed(2),cones:cones?cones.count:0,birds:birds.visible,butterflies:flies.visible,moths:moths.visible}),
  dispose(){scene.remove(root);dust.geometry.dispose();dust.material.dispose();fireflies.geometry.dispose();fireflies.material.dispose();coneGeometry.dispose();coneMaterial.dispose();cones?.dispose?.();for(const m of [birds,flies,moths]){m.geometry.dispose();m.material.dispose();}}
 };
};
