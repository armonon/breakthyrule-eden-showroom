'use strict';
// The garden is a painted enclosure: four tall walls that render the same sky as the real dome,
// with a matte-painted treeline at the horizon. Up close the panel seams shimmer through, and the
// wall behind the "where is god ?" sign hides a door onto the long brick road.
window.createEdenSkybox=function(T,scene,{sky,roadX,reduced=false}){
 const bounds={minX:-23,maxX:23,minZ:-21.5,maxZ:32},height=26;
 const door={x:roadX,z:bounds.minZ,width:2.2,height:3.3};
 const root=new T.Group();root.name='Eden sky box';scene.add(root);
 const uniforms={
  roadNight:sky.material.uniforms.roadNight,time:{value:0},
  doorRect:{value:new T.Vector4(door.x-door.width/2,0,door.x+door.width/2,door.height)},
  doorZ:{value:door.z},doorGlow:{value:0}
 };
 const vertexShader='varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}';
 const fragmentShader=`varying vec3 vWorld;uniform float roadNight,time,doorZ,doorGlow;uniform vec4 doorRect;
 float hash(float n){return fract(sin(n)*43758.5453);}
 float noise(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(hash(i),hash(i+1.),f);}
 vec3 skyColor(vec3 d){float h=max(d.y,0.);vec3 c=mix(vec3(.87,.91,.79),vec3(.24,.58,.79),pow(h,.55));
  vec3 sun=normalize(vec3(-.38,.32,-.8));float s=max(dot(d,sun),0.);c+=vec3(1.,.72,.34)*pow(s,45.)*.36;c+=vec3(1.,.92,.7)*smoothstep(.9993,.9998,s)*2.;
  vec3 night=mix(vec3(.075,.11,.095),vec3(.009,.019,.023),pow(h,.45));float moon=max(dot(d,normalize(vec3(-.38,.62,-.64))),0.);night+=vec3(.72,.83,.71)*smoothstep(.99965,.9999,moon)*1.4;return mix(c,night,roadNight);}
 void main(){
  float u=vWorld.x+vWorld.z,y=vWorld.y,dist=distance(cameraPosition,vWorld);
  if(gl_FrontFacing){
   vec3 dir=normalize(vWorld-cameraPosition);vec3 col=skyColor(dir);
   // Matte-painted horizon, drawn by view direction like a real skybox: it stays at eye level wherever you stand.
   float az=atan(dir.x,dir.z),e=dir.y;
   float wave=.5+.22*sin(3.*az+1.3)+.14*sin(7.*az+.4)+.09*sin(13.*az+2.1)+.05*sin(29.*az+.7);
   float hills=.035+.05*wave;
   vec3 haze=mix(vec3(.55,.66,.62),vec3(.05,.08,.08),roadNight),forest=mix(vec3(.27,.38,.22),vec3(.03,.06,.05),roadNight),meadow=mix(vec3(.42,.52,.3),vec3(.05,.08,.05),roadNight);
   if(e<hills)col=mix(col,haze,.5*(1.-max(e,0.)/hills*.35));
   float crowns=.012+.016*(.5+.5*sin(5.*az+2.)*sin(11.*az))+.01*abs(sin(47.*az+2.*sin(17.*az)))+.004*sin(131.*az);
   if(e<crowns)col=mix(col,forest,.78-.3*max(e,0.)/crowns);
   if(e<0.)col=mix(col,meadow,smoothstep(0.,-.06,e));
   float near=1.-smoothstep(3.5,10.5,dist);
   vec2 g=abs(fract(vec2(u,y)/3.)-.5);float seam=smoothstep(.484,.497,max(g.x,g.y));
   col=mix(col,col*.74,seam*near);col+=vec3(.55,.8,1.)*seam*near*(.16+.1*sin(time*2.+y*.7+u*.3));
   col+=vec3(.6,.78,1.)*near*.05*smoothstep(.96,1.,sin(y*11.-time*2.6));
   float onDoor=1.-step(.25,abs(vWorld.z-doorZ));
   vec2 dd=min(abs(vWorld.xy-doorRect.xy),abs(vWorld.xy-doorRect.zw));
   float inside=step(doorRect.x-.02,vWorld.x)*step(vWorld.x,doorRect.z+.02)*step(vWorld.y,doorRect.w+.02);
   float frame=inside*onDoor*(1.-smoothstep(.018,.05,min(dd.x,dd.y)));
   float doorNear=1.-smoothstep(2.5,8.,dist);
   col=mix(col,vec3(1.,.93,.7),frame*clamp(doorNear*.6+doorGlow,0.,.8));
   gl_FragColor=vec4(col,1.);
  }else{
   // The outside is plain scaffold panelling, like the back of a stage set.
   vec2 g=abs(fract(vec2(u,y)/3.)-.5);float seam=smoothstep(.47,.495,max(g.x,g.y));
   vec3 col=mix(vec3(.30,.33,.33),vec3(.10,.12,.13),roadNight)*(.9+.1*noise(u*.5+floor(y/3.)*13.));
   col=mix(col,col*.45,seam);col+=vec3(.25,.35,.42)*seam*.12*(1.-smoothstep(4.,20.,dist));
   gl_FragColor=vec4(col,1.);
  }
 }`;
 const material=new T.ShaderMaterial({uniforms,vertexShader,fragmentShader,side:T.DoubleSide});
 function wall(width,x,z,rotation,y=height/2,h=height){
  const mesh=new T.Mesh(new T.PlaneGeometry(width,h),material);mesh.position.set(x,y,z);mesh.rotation.y=rotation;mesh.name='Sky box wall';root.add(mesh);return mesh;
 }
 const w=bounds.maxX-bounds.minX,d=bounds.maxZ-bounds.minZ,cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
 wall(w,cx,bounds.maxZ,Math.PI);
 wall(d,bounds.maxX,cz,-Math.PI/2);
 wall(d,bounds.minX,cz,Math.PI/2);
 // North wall is cut around the hidden door.
 const left=door.x-door.width/2-bounds.minX,right=bounds.maxX-(door.x+door.width/2);
 // Pieces overlap the opening slightly (the door sits just in front) so no hairline cracks show.
 const lap=.04;
 wall(left+lap,bounds.minX+(left+lap)/2,bounds.minZ,0);
 wall(right+lap,bounds.maxX-(right+lap)/2,bounds.minZ,0);
 wall(door.width,door.x,bounds.minZ,0,door.height-lap+(height-door.height+lap)/2,height-door.height+lap);
 const hinge=new T.Group();hinge.name='Sky box door';hinge.position.set(door.x-door.width/2,0,door.z+.012);root.add(hinge);
 const panel=new T.Mesh(new T.PlaneGeometry(door.width,door.height),material);panel.position.set(door.width/2,door.height/2,0);panel.userData.skyDoor=true;panel.name='Sky box door panel';hinge.add(panel);
 const brass=new T.MeshStandardMaterial({color:0xcfae62,metalness:.85,roughness:.28,emissive:0x3b2a08,emissiveIntensity:.4});
 const knob=new T.Mesh(new T.SphereGeometry(.055,16,12),brass);knob.position.set(door.width-.22,1.08,.06);knob.userData.skyDoor=true;hinge.add(knob);
 const backKnob=knob.clone();backKnob.position.z=-.06;hinge.add(backKnob);
 const keyhole=new T.Mesh(new T.CircleGeometry(.018,12),new T.MeshBasicMaterial({color:0x14100a}));keyhole.position.set(door.width-.22,.96,.012);hinge.add(keyhole);
 const frameMaterial=new T.MeshStandardMaterial({color:0x2b2f30,roughness:.8,metalness:.3});
 for(const x of [-door.width/2-.06,door.width/2+.06]){const post=new T.Mesh(new T.BoxGeometry(.12,door.height+.12,.3),frameMaterial);post.position.set(door.x+x,(door.height+.12)/2,door.z-.16);root.add(post);}
 const lintel=new T.Mesh(new T.BoxGeometry(door.width+.24,.12,.3),frameMaterial);lintel.position.set(door.x,door.height+.06,door.z-.16);root.add(lintel);
 const threshold=new T.Mesh(new T.BoxGeometry(door.width,.04,.5),frameMaterial);threshold.position.set(door.x,.02,door.z-.3);threshold.receiveShadow=true;root.add(threshold);
 // Warm light spills through the gap when the door opens.
 const spill=new T.PointLight(0xffd9a0,0,9,1.6);spill.position.set(door.x,2.2,door.z-.8);root.add(spill);
 root.traverse(n=>{if(n.isMesh){n.castShadow=false;n.frustumCulled=n.material!==material;}});
 let open=0,target=0,found=false,lastNear=0;
 const marker=new T.Vector3(door.x,1.75,door.z+.35);
 function passable(){return open>.72;}
 return {
  bounds,door,marker,root,pickables:[panel,knob],
  isOpen:()=>target===1,
  get found(){return found;},
  open(){target=1;found=true;},
  close(){target=0;},
  toggle(){target=target?0:1;if(target)found=true;},
  distance(position){return Math.hypot(position.x-door.x,position.z-door.z);},
  blocks(next,previous){
   const pad=.4,halfGap=door.width/2-.32;
   const crossing=(previous.z-door.z)*(next.z-door.z)<=0||Math.abs(next.z-door.z)<pad;
   if(!crossing)return false;
   if(next.x<bounds.minX||next.x>bounds.maxX)return false;
   return !(passable()&&Math.abs(next.x-door.x)<halfGap);
  },
  update(time,viewer,dt=.016){
   uniforms.time.value=reduced?0:time;
   const step=reduced?1:Math.min(1,dt*1.4);open+=Math.sign(target-open)*Math.min(Math.abs(target-open),step);
   const eased=open*open*(3-2*open);hinge.rotation.y=eased*1.72;spill.intensity=eased*6;
   const near=viewer?Math.hypot(viewer.position.x-door.x,viewer.position.z-door.z):99;
   knob.visible=backKnob.visible=keyhole.visible=near<9||open>0;
   uniforms.doorGlow.value=found?.25:0;
   // Close quietly once everyone has wandered away again.
   if(target&&near>26&&viewer.position.z>door.z){if(!lastNear)lastNear=time;else if(time-lastNear>6)target=0;}else lastNear=0;
   return Math.abs(target-open)>.001;
  },
  inspect:()=>({bounds:{...bounds},door:{...door},open:+open.toFixed(3),target,found})
 };
};
