'use strict';
// A loading boundary for the real Beyond Eden district. The landmarks, woodland,
// pyramid, collision authority and streaming are the same modules Eden uses.
// There are deliberately no showroom, garment, library or studio dependencies.
window.createExpeditionScene=function(T,scene,{layout,reduced=false,mobile=false,onChange=()=>{},prepareModel=null}){
 const root=new T.Group();root.name='Garden of Eden';scene.add(root);
 const jobs=[],loader=new T.TextureLoader();
 function texture(path,repeat=1,color=true){let map;jobs.push(new Promise((resolve,reject)=>{map=loader.load(path,()=>{onChange();resolve();},undefined,()=>reject(new Error('World texture unavailable: '+path)));}));map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(repeat,repeat);map.anisotropy=4;if(color)map.colorSpace=T.SRGBColorSpace;return map;}
 const stone=new T.MeshStandardMaterial({color:0xdad9c7,map:texture('/assets/eden-stone-color.jpg'),normalMap:texture('/assets/eden-stone-normal.jpg',1,false),normalScale:new T.Vector2(.65,.65),roughness:.93});
 const barkMap=texture('/assets/eden-textures/bark_brown_02_diff.jpg'),barkNormal=texture('/assets/eden-textures/bark_brown_02_nor.jpg',1,false),barkRough=texture('/assets/eden-textures/bark_brown_02_arm.jpg',1,false);
 for(const map of [barkMap,barkNormal,barkRough])map.repeat.set(2,1.1);
 const bark=new T.MeshStandardMaterial({color:0xb9ab98,map:barkMap,normalMap:barkNormal,normalScale:new T.Vector2(1.2,1.2),roughnessMap:barkRough,roughness:1});
 const leafMap=texture('/assets/eden-textures/foliage/broadleaf-card.webp'),leafMat=new T.MeshStandardMaterial({map:leafMap,alphaTest:.45,side:T.DoubleSide,roughness:.88,emissive:0x34421a,emissiveIntensity:.18});
 const sky=new T.Mesh(new T.SphereGeometry(160,40,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{roadNight:{value:1}},vertexShader:'varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vWorld;uniform float roadNight;
 void main(){vec3 d=normalize(vWorld);float h=max(d.y,0.);vec3 night=mix(vec3(.075,.11,.095),vec3(.009,.019,.023),pow(h,.45));float moon=max(dot(d,normalize(vec3(-.38,.62,-.64))),0.);night+=vec3(.72,.83,.71)*smoothstep(.99965,.9999,moon)*1.4;gl_FragColor=vec4(night,1.);}`}));root.add(sky);scene.fog=new T.FogExp2(0xc7d9b8,.016);
 const flora=window.createEdenFlora(T,root,{bark,mobile,forestOnly:true});
 const roadX=11.7,roadStart=-10.8,roadLength=24,roadEnd=roadStart-roadLength*4,sections=[];
 // Preserve Eden's hand-laid ochre brick road, using its original seeded pattern.
 let brickSeed=4421;const brickRandom=()=>{brickSeed=(brickSeed*1664525+1013904223)>>>0;return brickSeed/4294967296;};
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const c=canvas.getContext('2d');c.fillStyle='#5b4632';c.fillRect(0,0,1024,1024);
 const bumpCanvas=document.createElement('canvas');bumpCanvas.width=bumpCanvas.height=1024;const bc=bumpCanvas.getContext('2d');bc.fillStyle='#000';bc.fillRect(0,0,1024,1024);
 for(let row=0;row<16;row++)for(let col=-1;col<5;col++){
  const x=col*256+(row%2?128:0)+5,y=row*64+5,w=246,h=54,tone=brickRandom(),base=tone>.9?[214,170,74]:tone>.45?[178,106,64]:[198,132,78],shade=.82+brickRandom()*.3;
  c.fillStyle='rgb('+base.map(v=>Math.min(255,v*shade|0)).join(',')+')';c.fillRect(x,y,w,h);
  for(let k=0;k<26;k++){c.fillStyle='rgba('+(brickRandom()>.5?'255,230,190':'60,30,15')+','+(brickRandom()*.12).toFixed(3)+')';c.fillRect(x+brickRandom()*w,y+brickRandom()*h,2+brickRandom()*14,1+brickRandom()*5);}
  const g=bc.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#c8c8c8');g.addColorStop(.5,'#ffffff');g.addColorStop(1,'#b4b4b4');bc.fillStyle=g;bc.fillRect(x,y,w,h);
 }
 const roadMap=new T.CanvasTexture(canvas),roadBump=new T.CanvasTexture(bumpCanvas);roadMap.colorSpace=T.SRGBColorSpace;for(const map of [roadMap,roadBump]){map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(2,12);map.anisotropy=4;}
 const roadMaterial=new T.MeshStandardMaterial({map:roadMap,bumpMap:roadBump,bumpScale:.035,color:0xf2ece2,roughness:.88});
 const vergeMap=texture('/assets/eden-grass-color.jpg');vergeMap.repeat.set(60,8);const vergeMaterial=new T.MeshStandardMaterial({map:vergeMap,color:0xa4bd79,roughness:1});
 const roadGeometry=new T.PlaneGeometry(3.8,roadLength),vergeGeometry=new T.PlaneGeometry(240,roadLength),edgeGeometry=new T.BoxGeometry(.14,.1,roadLength);
 for(let i=0;i<12;i++){
  const section=new T.Group();section.name='Endless road section';section.position.set(roadX,0,roadStart-(i+.5)*roadLength);section.userData.roadIndex=i;root.add(section);sections.push(section);
  const verge=new T.Mesh(vergeGeometry,vergeMaterial);verge.rotation.x=-Math.PI/2;verge.position.y=-.085;verge.receiveShadow=true;section.add(verge);
  if(i<4){const path=new T.Mesh(roadGeometry,roadMaterial);path.rotation.x=-Math.PI/2;path.position.y=.024;path.receiveShadow=true;section.add(path);for(const side of [-1,1]){const edge=new T.Mesh(edgeGeometry,stone);edge.position.set(side*1.97,.025,0);edge.receiveShadow=true;section.add(edge);}}
 }
 const pyramid=window.createRoadPyramid(T,scene,{roadX,roadEnd,stone,onChange,reduced});
 const district=window.createNightDistrict(T,scene,{stone,leafMat,layout,reduced,prepareModel});
 const requiredLandmarks=['temple','observatory','playhouse','hotel','gardens'];// Phones keep only a ring of landmarks resident (night-district.js), so the entry waits for the required ones and those
 // near the spawn; the rest stream in as the player walks.
 const ringPhone=!!window.edenRenderProfile?.().mobile,[spawnX,spawnZ]=[layout.spawn?.[0]??11.7,layout.spawn?.[2]??layout.spawn?.[1]??-24];
 const warmupLandmarks=layout.landmarks.filter(s=>!ringPhone||requiredLandmarks.includes(s.id)||Math.hypot(s.x-spawnX,s.z-spawnZ)<60).map(s=>s.id);district.prepare(warmupLandmarks);
 const nightRoad=window.createNightRoad(T,scene,{sections,roadX,roadStart,nightStart:-21.5,roadLength,clearingStart:-120,district,sky,bark,forest:flora.forest,stone,roadMaterial,vergeMaterial,clouds:[],mobile});nightRoad.setOverride(1);
 const authority=window.createExpeditionWorld({layout,roofs:window.edenRoofs});
 const constrain=window.createExpeditionConstraints({layout,unlocked:()=>pyramid.inspect().unlocked});
 return {root,sky,district,pyramid,nightRoad,authority,requiredLandmarks,warmupLandmarks,road:{x:roadX,start:roadStart,end:roadEnd,door:-21.5},nightBuilt:()=>true,
  ready:Promise.all([...jobs,pyramid.ready,flora.ready]),
  constrain(next,previous,feet=0,body=null){constrain(next,previous);if(!body&&district.blocks(next,feet))next.copy(previous);return next;},
  update(time,camera){sky.position.copy(camera.position);flora.update(time);nightRoad.update(time,camera);district.update(time,camera,1);pyramid.update(camera,time);},
  inspect:()=>({entry:'expedition',district:district.inspect(),woodland:nightRoad.inspect()})};
};
