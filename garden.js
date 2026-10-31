'use strict';
window.createEdenGarden=function(T,scene,{reduced=false,mobile=false,onChange=()=>{}}={}){
 const garden=new T.Group();garden.name='Garden of Eden';scene.add(garden);
 const roadX=11.7,roadStart=-10.8,roadWidth=3.8,roadLength=24,roadSections=[];
 const roadSegmentCount=4,roadEnd=roadStart-roadLength*roadSegmentCount;
 let seed=7183;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const between=(a,b)=>a+(b-a)*random();
 const dummy=new T.Object3D(),up=new T.Vector3(0,1,0);
 const assetLoader=new T.TextureLoader(),assetJobs=[];
 function surface(path,repeat,color=true){let texture;assetJobs.push(new Promise(resolve=>{texture=assetLoader.load(path,resolve,undefined,resolve);}));texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(repeat,repeat);texture.anisotropy=8;if(color)texture.colorSpace=T.SRGBColorSpace;return texture;}
 const stone=new T.MeshStandardMaterial({color:0xdad9c7,map:surface('/assets/eden-stone-color.jpg',1),normalMap:surface('/assets/eden-stone-normal.jpg',1,false),normalScale:new T.Vector2(.65,.65),roughness:.93});
 const bark=new T.MeshStandardMaterial({color:0x67513d,roughness:1});
 const terrain=new T.Mesh(new T.PlaneGeometry(240,240,100,100),new T.MeshStandardMaterial({color:0xa4bd79,map:surface('/assets/eden-grass-color.jpg',80),normalMap:surface('/assets/eden-grass-normal.jpg',80,false),normalScale:new T.Vector2(.65,.65),roughness:1}));
 terrain.rotation.x=-Math.PI/2;terrain.position.y=-.09;terrain.receiveShadow=true;garden.add(terrain);
 // Break up the tiled lawn texture with large soft patches (greener / drier, lighter / darker) from world position.
 terrain.material.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 vLawn;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vLawn=(modelMatrix*vec4(transformed,1.)).xz;');
  shader.fragmentShader=`varying vec2 vLawn;
float lawnHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float lawnNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(lawnHash(i),lawnHash(i+vec2(1,0)),f.x),mix(lawnHash(i+vec2(0,1)),lawnHash(i+vec2(1,1)),f.x),f.y);}
`+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 float lawnBroad=lawnNoise(vLawn*.07)*.65+lawnNoise(vLawn*.23)*.35,lawnDry=smoothstep(.55,.85,lawnNoise(vLawn*.11+17.));
 diffuseColor.rgb*=mix(.84,1.1,lawnBroad);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.12,1.04,.78),lawnDry*.6);`);
 };
 const p=terrain.geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getY(i),edge=Math.max(0,Math.hypot(x,z)-25),worldZ=-z;
  const roadClearance=worldZ<roadStart?T.MathUtils.smoothstep(Math.abs(x-roadX),60,80):1;
  p.setZ(i,Math.sin(x*.12)*Math.cos(z*.15)*Math.min(6,edge*.15)*roadClearance);
 }
 terrain.geometry.computeVertexNormals();

 const sky=new T.Mesh(new T.SphereGeometry(160,40,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{roadNight:{value:0}},vertexShader:'varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vWorld;uniform float roadNight;
 void main(){vec3 d=normalize(vWorld);float h=max(d.y,0.);vec3 c=mix(vec3(.87,.91,.79),vec3(.24,.58,.79),pow(h,.55));
 vec3 sun=normalize(vec3(-.38,.32,-.8));float s=max(dot(d,sun),0.);c+=vec3(1.,.72,.34)*pow(s,45.)*.36;c+=vec3(1.,.92,.7)*smoothstep(.9993,.9998,s)*2.;
 vec3 night=mix(vec3(.075,.11,.095),vec3(.009,.019,.023),pow(h,.45));float moon=max(dot(d,normalize(vec3(-.38,.62,-.64))),0.);night+=vec3(.72,.83,.71)*smoothstep(.99965,.9999,moon)*1.4;c=mix(c,night,roadNight);gl_FragColor=vec4(c,1.);}`}));
 garden.add(sky);scene.fog=new T.FogExp2(0xc7d9b8,.016);

 function canvasTexture(size,paint){const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
 const barkMap=canvasTexture(256,c=>{c.fillStyle='#93856d';c.fillRect(0,0,256,256);for(let i=0;i<450;i++){const x=between(0,256);c.strokeStyle=['#5a5145','#b2a38a','#7e725e'][i%3];c.lineWidth=between(.5,3);c.beginPath();c.moveTo(x,0);for(let y=0;y<=256;y+=12)c.lineTo(x+Math.sin(y*.07+i)*3,y);c.stroke();}});barkMap.wrapS=barkMap.wrapT=T.RepeatWrapping;barkMap.repeat.set(2,3);bark.map=barkMap;bark.bumpMap=barkMap;bark.bumpScale=.075;bark.color.set(0xd1c0a3);
 // Each foliage card contains individual leaves, with a cutout silhouette for sunlight and shadows.
 const leaves=canvasTexture(256,(c,s)=>{
  for(let i=0;i<85;i++){const a=between(0,Math.PI*2),r=Math.sqrt(random())*100,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r;
   c.save();c.translate(x,y);c.rotate(a+between(-1,1));c.fillStyle=['#91a951','#6c8838','#b1bd66','#44682e'][i%4];c.beginPath();c.ellipse(0,0,between(8,17),between(3,7),0,0,Math.PI*2);c.fill();c.strokeStyle='#d2d48a';c.lineWidth=.7;c.beginPath();c.moveTo(-9,0);c.lineTo(9,0);c.stroke();c.restore();}
 });
 const leafMat=new T.MeshStandardMaterial({map:leaves,alphaTest:.45,side:T.DoubleSide,roughness:.88,emissive:0x34421a,emissiveIntensity:.18});
 // Wind displaces only the leaf tips; reduced-motion keeps the same still landscape.
 const wind={value:0};
 leafMat.onBeforeCompile=shader=>{shader.uniforms.edenTime=wind;shader.vertexShader='uniform float edenTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(edenTime*.7+instanceMatrix[3].x*.8+instanceMatrix[3].z)*.07*(position.y+.5);');};

 const pathX=z=>Math.sin((z-3)*.15)*1.5;
 function openGround(x,z){return (z< -9&&Math.abs(x-roadX)<2.5)||(x>6.8&&x<13&&z>-10.8&&z<-7.2)||(x>-4.5&&x<-1.1&&z>-8.2&&z<-5.3)||Math.hypot(x-window.showroomAmphitheaterPosition.x,z-window.showroomAmphitheaterPosition.z)<8.6||Math.hypot(x-3.1,z+5.7)<4.7||(Math.abs(x-pathX(z))<1.45&&z>-6&&z<22)||(x>-14.5&&x<-5.4&&z>-4&&z<5)||Math.pow((x-5.7)/3.8,2)+Math.pow((z-3.5)/5.6,2)<1.14;}
 // Trees, shrubs, ferns and wildflowers come from eden-flora.js; the lawn is the terrain texture (no grass geometry).
 const flora=window.createEdenFlora(T,garden,{bark,openGround,mobile});assetJobs.push(flora.ready);

 const pathStone=new T.CylinderGeometry(1,1.07,.065,9);
 for(let z=20;z>-6;z-=.9){for(let side=0;side<2;side++){
  const slab=new T.Mesh(pathStone,stone);slab.position.set(pathX(z)+(side-.5)*.92,-.015,z+between(-.1,.1));slab.scale.set(between(.45,.58),1,between(.38,.5));slab.rotation.y=between(0,6.28);slab.receiveShadow=true;garden.add(slab);
 }}
 // A second path connects the garden to the product pavilion.
 for(let i=0;i<13;i++){const slab=new T.Mesh(pathStone,stone);slab.position.set(-i*.7,-.015,7-i*.22);slab.scale.set(.48,1,.44);slab.rotation.y=i*.8;slab.receiveShadow=true;garden.add(slab);}

 // Recycled road sections lead from the sign to the distant pyramid court.
 const entrance=new T.CatmullRomCurve3([new T.Vector3(6.8,.025,-7.4),new T.Vector3(9.6,.025,-8.1),new T.Vector3(roadX,.025,roadStart)]);
 for(let i=0;i<=12;i++){const point=entrance.getPoint(i/12),slab=new T.Mesh(pathStone,stone);slab.position.copy(point);slab.scale.set(.86,1,.64);slab.rotation.y=i*.35;slab.receiveShadow=true;garden.add(slab);}
 const roadMap=surface('/assets/eden-stone-color.jpg',1),roadNormal=surface('/assets/eden-stone-normal.jpg',1,false);roadMap.repeat.set(2,12);roadNormal.repeat.set(2,12);
 const roadMaterial=new T.MeshStandardMaterial({map:roadMap,normalMap:roadNormal,normalScale:new T.Vector2(.4,.4),color:0xc8c9c0,roughness:.95});
 const vergeMap=surface('/assets/eden-grass-color.jpg',1);vergeMap.repeat.set(60,8);
 const vergeMaterial=new T.MeshStandardMaterial({map:vergeMap,color:0xa4bd79,roughness:1});
 const roadGeometry=new T.PlaneGeometry(roadWidth,roadLength),vergeGeometry=new T.PlaneGeometry(180,roadLength);
 const edgeGeometry=new T.BoxGeometry(.14,.10,roadLength);
 for(let i=0;i<20;i++){
  const section=new T.Group();section.name='Endless road section';garden.add(section);roadSections.push(section);
  section.userData.roadMeshes=[];
  const verge=new T.Mesh(vergeGeometry,vergeMaterial);verge.rotation.x=-Math.PI/2;verge.position.y=-.085;verge.receiveShadow=true;section.add(verge);
  const surfaceMesh=new T.Mesh(roadGeometry,roadMaterial);surfaceMesh.rotation.x=-Math.PI/2;surfaceMesh.position.y=.024;surfaceMesh.receiveShadow=true;section.add(surfaceMesh);
  section.userData.roadMeshes.push(surfaceMesh);
  for(const side of [-1,1]){const edge=new T.Mesh(edgeGeometry,stone);edge.position.set(side*(roadWidth/2+.07),.025,0);edge.receiveShadow=true;section.add(edge);section.userData.roadMeshes.push(edge);}
 }
 let roadFirst=-1,nightRoad=null;
 function updateRoad(position){
  const section=Math.floor(Math.max(0,roadStart-Math.max(roadEnd,position.z))/roadLength),first=Math.max(0,section-8);
  if(first!==roadFirst){roadFirst=first;roadSections.forEach((part,i)=>{part.position.set(roadX,0,roadStart-(first+i+.5)*roadLength);part.userData.roadIndex=first+i;part.userData.roadMeshes.forEach(mesh=>{mesh.visible=first+i<roadSegmentCount;});nightRoad?.recycle(part,first+i);});}
 }
 updateRoad(new T.Vector3());

 const waterUniforms={time:{value:0}};
 const water=new T.Mesh(new T.CircleGeometry(1,96),new T.ShaderMaterial({uniforms:waterUniforms,transparent:false,vertexShader:'varying vec3 vP;void main(){vec4 p=modelMatrix*vec4(position,1.);vP=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',fragmentShader:`uniform float time;varying vec3 vP;
 void main(){vec2 p=vP.xz;float wave=sin(p.x*9.+p.y*7.+time*.7)*.5+sin(p.x*17.-p.y*12.-time*.5)*.25;
 vec3 normal=normalize(vec3(wave*.10,1.,cos(p.y*11.+time)*.055));vec3 eye=normalize(cameraPosition-vP);float fres=pow(1.-max(dot(eye,normal),0.),3.);
 vec3 color=mix(vec3(.10,.32,.27),vec3(.61,.79,.77),fres*.8+.25);float light=pow(max(dot(reflect(-normalize(vec3(-.48,.48,-.55)),normal),eye),0.),90.);color+=vec3(1.,.91,.64)*light*1.5;
 color+=vec3(.1,.16,.09)*pow(max(0.,sin(p.x*12.+sin(p.y*8.+time))),18.)*.35;gl_FragColor=vec4(color,1.);}`}));
 water.rotation.x=-Math.PI/2;water.position.set(5.7,-.005,3.5);water.scale.set(3.8,5.6,1);garden.add(water);
 const rockGeo=new T.DodecahedronGeometry(1,1);
 for(let i=0;i<68;i++){const a=i/68*Math.PI*2,rock=new T.Mesh(rockGeo,stone);rock.position.set(5.7+Math.cos(a)*3.9,between(-.02,.08),3.5+Math.sin(a)*5.7);rock.scale.set(between(.23,.48),between(.12,.27),between(.25,.45));rock.rotation.set(random(),random(),random());rock.castShadow=true;rock.receiveShadow=true;garden.add(rock);}
 const lilyMat=new T.MeshStandardMaterial({color:0x497238,roughness:.55,side:T.DoubleSide});
 for(let i=0;i<20;i++){const lily=new T.Mesh(new T.CircleGeometry(between(.12,.28),20,0,Math.PI*1.9),lilyMat);lily.rotation.set(-Math.PI/2,0,random()*6.28);lily.position.set(5.7+between(-2.5,2.5),.006,3.5+between(-3.5,3.5));garden.add(lily);}

 const cloudTex=canvasTexture(256,(c)=>{for(let i=0;i<28;i++){const x=between(35,221),y=between(85,165),r=between(20,48),g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.28)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}});
 for(let i=0;i<14;i++){const cloud=new T.Sprite(new T.SpriteMaterial({map:cloudTex,transparent:true,opacity:.65,depthWrite:false,fog:false}));cloud.position.set(between(-90,90),between(27,42),between(-95,-45));cloud.scale.set(between(28,48),between(12,18),1);garden.add(cloud);}
 const dustPos=new Float32Array(90*3);for(let i=0;i<90;i++){dustPos[i*3]=between(-15,15);dustPos[i*3+1]=between(.5,6);dustPos[i*3+2]=between(-15,18);}
 const dustGeo=new T.BufferGeometry();dustGeo.setAttribute('position',new T.BufferAttribute(dustPos,3));const dust=new T.Points(dustGeo,new T.PointsMaterial({color:0xffefb8,size:.026,transparent:true,opacity:.6,depthWrite:false}));garden.add(dust);
 const snake=window.createTreeSnake(T,scene,{bark,reduced,onChange});
 // The night section (pyramid court, district, night woodland) is built only when the viewer heads for the road
 // entrance or an expedition starts, one piece per frame so the build never lands as a single long stall.
 let pyramid=null,district=null,nightSteps=null,lastViewer=null;
 const nightBuilders=[
  ()=>{pyramid=window.createRoadPyramid(T,scene,{roadX,roadEnd,stone,onChange,reduced});},
  ()=>{district=window.createNightDistrict(T,scene,{stone,leafMat,layout:window.nightLayout,reduced});window.mergeStaticMeshes?.(T,district.root,{skip:o=>o.name.startsWith('Lost page')});},
  ()=>{nightRoad=window.createNightRoad(T,scene,{sections:roadSections,roadX,roadStart,roadLength,clearingStart:-120,district,sky,bark,forest:flora.forest,stone,roadMaterial,vergeMaterial,clouds:garden.children.filter(node=>node.isSprite),reduced,mobile});roadFirst=-1;if(lastViewer)updateRoad(lastViewer.position);onChange();}
 ];
 // Back in the garden the night section is hidden again, exactly as before it was first built.
 const nightNear=p=>p.z< -12||Math.hypot(p.x-9,p.z+8.5)<10;
 function buildNight(all=false){nightSteps??=[...nightBuilders];while(nightSteps.length){nightSteps.shift()();if(!all)break;}}
 const nightBuilt=()=>!!nightRoad;
 return {snake,get nightRoad(){return nightRoad;},get pyramid(){buildNight(true);return pyramid;},get district(){buildNight(true);return district;},nightBuilt,ready:Promise.allSettled(assetJobs),constrain(position,previous){
  if(position.z< -12&&!nightBuilt())buildNight(true);
  if(previous.z< -20){if(position.z< -111)pyramid.constrain(position);else{const width=T.MathUtils.lerp(2.7,50,T.MathUtils.smoothstep(-position.z,20,30));position.x=T.MathUtils.clamp(position.x,roadX-width,roadX+width);}}
  else{position.x=T.MathUtils.clamp(position.x,-20,20);if(position.z< -20&&Math.abs(position.x-roadX)>2.7)position.z=-20;}
  if(district?.blocks(position)||pyramid?.blocks(position))position.copy(previous);
  position.z=Math.min(position.z,26);return position;
 },road:{x:roadX,start:roadStart,end:roadEnd,inspect:()=>({first:roadFirst,sections:roadSections.length,near:roadStart-roadFirst*roadLength,far:Math.max(roadEnd,roadStart-(roadFirst+roadSections.length)*roadLength)})},update(time,viewer,active=true){
  if(viewer){lastViewer=viewer;flora.setVisible(viewer.position.z>-45);flora.lod(viewer.position);if(!nightBuilt()&&(nightSteps||nightNear(viewer.position))){buildNight();onChange();}updateRoad(viewer.position);sky.position.copy(viewer.position);snake.update(time,viewer,active);if(nightBuilt()){const near=nightNear(viewer.position);nightRoad.setEnabled(near);district.root.visible=near;nightRoad.update(time,viewer,active);pyramid.update(viewer,time);if(near)district.update(time,viewer,nightRoad.amount);}}
  if(reduced)return;wind.value=time;flora.update(time);waterUniforms.time.value=time;dust.rotation.y=Math.sin(time*.025)*.07;
 },foliage:flora.leaves,flora,sky};
};
