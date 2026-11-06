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
 // Photographic bark (Poly Haven CC0) shared by every tree; tubes map U around the trunk and V along it.
 const barkMap=surface('/assets/eden-textures/bark_brown_02_diff.jpg',1),barkNormal=surface('/assets/eden-textures/bark_brown_02_nor.jpg',1,false),barkRough=surface('/assets/eden-textures/bark_brown_02_arm.jpg',1,false);
 for(const texture of [barkMap,barkNormal,barkRough])texture.repeat.set(2,1.1);
 const bark=new T.MeshStandardMaterial({color:0xb9ab98,map:barkMap,normalMap:barkNormal,normalScale:new T.Vector2(1.2,1.2),roughnessMap:barkRough,roughness:1});
 const terrain=new T.Mesh(new T.PlaneGeometry(240,240,100,100),new T.MeshStandardMaterial({color:0xa4bd79,map:surface('/assets/eden-textures/leafy_grass_diff.jpg',80),normalMap:surface('/assets/eden-textures/leafy_grass_nor.jpg',80,false),normalScale:new T.Vector2(.65,.65),roughness:1}));
 terrain.rotation.x=-Math.PI/2;terrain.position.y=-.09;terrain.receiveShadow=true;garden.add(terrain);
 // Break up the tiled lawn texture with large soft patches (greener / drier, lighter / darker) from world position.
 const bakedSun=window.edenBaked?.applyToTerrain(terrain.material);
 const groundMap=(path,repeat)=>{const t=surface(path,repeat);t.anisotropy=8;return t;};
 const groundLitter=groundMap('/assets/eden-textures/ground/forest_leaves_02_diff.jpg',1),groundEarth=groundMap('/assets/eden-textures/ground/grass_path_2_diff.jpg',1);
 const groundWear=new T.TextureLoader().load('/assets/eden-bake/grass-mask.png');groundWear.colorSpace=T.NoColorSpace;groundWear.generateMipmaps=true;groundWear.minFilter=T.LinearMipmapLinearFilter;
 terrain.material.onBeforeCompile=shader=>{
  if(bakedSun){shader.uniforms.edenLitter={value:groundLitter};shader.uniforms.edenEarth={value:groundEarth};shader.uniforms.edenWear={value:groundWear};shader.fragmentShader='uniform sampler2D edenLitter,edenEarth,edenWear;\n'+shader.fragmentShader;shader.uniforms.edenSun={value:bakedSun};shader.fragmentShader='uniform sampler2D edenSun;\n'+shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
  reflectedLight.directDiffuse*=mix(1.,texture2D(edenSun,vec2(vLawn.x/240.+.5,.5-vLawn.y/240.)).r,edenBake.x*smoothstep(16.,24.,length(vLawn-cameraPosition.xz)));`);}
  shader.vertexShader='varying vec2 vLawn;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vLawn=(modelMatrix*vec4(transformed,1.)).xz;');
  shader.fragmentShader=`varying vec2 vLawn;
float lawnHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float lawnNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(lawnHash(i),lawnHash(i+vec2(1,0)),f.x),mix(lawnHash(i+vec2(0,1)),lawnHash(i+vec2(1,1)),f.x),f.y);}
`+shader.fragmentShader.replace('#include <map_fragment>',`
 // Anti-tiling: blend a second, rotated, larger-scale sample of the same grass through world-space noise.
 vec2 lawnUvB=mat2(.8,-.6,.6,.8)*vMapUv*.37+vec2(.31,.67);
 vec4 lawnSample=mix(texture2D(map,vMapUv),texture2D(map,lawnUvB),smoothstep(.3,.7,lawnNoise(vLawn*.19+4.)));
 diffuseColor*=lawnSample;
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.86,1.1,.74),.55);
 float lawnBroad=lawnNoise(vLawn*.07)*.65+lawnNoise(vLawn*.23)*.35,lawnDry=smoothstep(.55,.85,lawnNoise(vLawn*.11+17.));
 diffuseColor.rgb*=mix(.84,1.1,lawnBroad);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.12,1.04,.78),lawnDry*.6);
 // Scanned ground blends: leaf litter where the bake says canopy shade falls, worn earth around stones and plinths.
 vec2 edenBakeUv=vec2(vLawn.x/240.+.5,.5-vLawn.y/240.);
 float edenShade=(1.-smoothstep(.45,.85,texture2D(edenSun,edenBakeUv).r))*smoothstep(.25,.6,lawnNoise(vLawn*.55+9.)+.25);
 float edenWorn=smoothstep(.05,.5,textureLod(edenWear,vec2(edenBakeUv.x,1.-edenBakeUv.y),3.2).r)*smoothstep(.2,.6,lawnNoise(vLawn*1.3+3.)+.3);
 diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(edenLitter,vLawn*.42).rgb*.8,edenShade*.85);
 diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(edenEarth,vLawn*.36).rgb,edenWorn*.8);`);
 };
 const p=terrain.geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getY(i),edge=Math.max(0,Math.hypot(x,z)-25),worldZ=-z;
  const roadClearance=worldZ<roadStart?T.MathUtils.smoothstep(Math.abs(x-roadX),95,115):1;  // flat under the widened night district
  // The rolling ground flattens out around the black box's valley, then sinks into it.
  const valley=window.edenValley,settled=T.MathUtils.smoothstep(Math.hypot(x-valley.x,worldZ-valley.z),valley.rim+2,valley.rim+14);
  p.setZ(i,Math.sin(x*.12)*Math.cos(z*.15)*Math.min(6,edge*.15)*roadClearance*settled+valley.height(x,worldZ));
 }
 terrain.geometry.computeVertexNormals();

 const sky=new T.Mesh(new T.SphereGeometry(160,40,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{roadNight:{value:0}},vertexShader:'varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vWorld;uniform float roadNight;
 void main(){vec3 d=normalize(vWorld);float h=max(d.y,0.);vec3 c=mix(vec3(.87,.91,.79),vec3(.24,.58,.79),pow(h,.55));
 vec3 sun=normalize(vec3(-.38,.32,-.8));float s=max(dot(d,sun),0.);c+=vec3(1.,.72,.34)*pow(s,45.)*.36;c+=vec3(1.,.92,.7)*smoothstep(.9993,.9998,s)*2.;
 vec3 night=mix(vec3(.075,.11,.095),vec3(.009,.019,.023),pow(h,.45));float moon=max(dot(d,normalize(vec3(-.38,.62,-.64))),0.);night+=vec3(.72,.83,.71)*smoothstep(.99965,.9999,moon)*1.4;c=mix(c,night,roadNight);gl_FragColor=vec4(c,1.);}`}));
 garden.add(sky);scene.fog=new T.FogExp2(0xc7d9b8,.016);

 function canvasTexture(size,paint){const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
 // Each foliage card contains individual leaves, with a cutout silhouette for sunlight and shadows.
 const leaves=new T.TextureLoader().load('/assets/eden-textures/foliage/broadleaf-card.webp');leaves.colorSpace=T.SRGBColorSpace;leaves.anisotropy=4;
 const leafMat=new T.MeshStandardMaterial({map:leaves,alphaTest:.45,side:T.DoubleSide,roughness:.88,emissive:0x34421a,emissiveIntensity:.18});
 // Wind displaces only the leaf tips; reduced-motion keeps the same still landscape.
 const wind={value:0};
 leafMat.onBeforeCompile=shader=>{shader.uniforms.edenTime=wind;shader.vertexShader='uniform float edenTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(edenTime*.7+instanceMatrix[3].x*.8+instanceMatrix[3].z)*.07*(position.y+.5);');};

 const pathX=z=>Math.sin((z-3)*.15)*1.5;
 function openGround(x,z){return (z< -9&&Math.abs(x-roadX)<2.5)||(x>6.8&&x<13&&z>-10.8&&z<-7.2)||(x>-4.5&&x<-1.1&&z>-8.2&&z<-5.3)||Math.hypot(x-window.showroomAmphitheaterPosition.x,z-window.showroomAmphitheaterPosition.z)<8.6||Math.hypot(x-3.1,z+5.7)<4.7||(Math.abs(x-pathX(z))<1.45&&z>-6&&z<22)||(x>-14.2&&x<-5.4&&z>-4.8&&z<2.8)||window.edenValley.reaches(x,z)||Math.pow((x-5.7)/3.8,2)+Math.pow((z-3.5)/5.6,2)<1.14;}
 // Trees, shrubs, ferns and wildflowers come from eden-flora.js; the lawn is the terrain texture (no grass geometry).
 // The sculpted hero apple tree and its serpent share one model (tools/blender/build_hero_tree.py).
 const heroModel=window.showroomAssets.model('/assets/eden-hero/hero-tree.glb?v=2');assetJobs.push(heroModel.catch(()=>{}));
 const flora=window.createEdenFlora(T,garden,{bark,openGround,mobile,heroModel});assetJobs.push(flora.ready);
 const terrainHeight=(x,worldZ)=>{const z=-worldZ,edge=Math.max(0,Math.hypot(x,z)-25),roadClearance=worldZ<roadStart?T.MathUtils.smoothstep(Math.abs(x-roadX),95,115):1,valley=window.edenValley,settled=T.MathUtils.smoothstep(Math.hypot(x-valley.x,worldZ-valley.z),valley.rim+2,valley.rim+14);return terrain.position.y+Math.sin(x*.12)*Math.cos(z*.15)*Math.min(6,edge*.15)*roadClearance*settled+valley.height(x,worldZ);};
 const grass=window.createEdenGrass(T,garden,{openGround,height:terrainHeight,mobile,wind});

 const pathStone=new T.CylinderGeometry(1,1.07,.065,9);
 for(let z=20;z>-6;z-=.9){for(let side=0;side<2;side++){
  const slab=new T.Mesh(pathStone,stone);slab.position.set(pathX(z)+(side-.5)*.92,-.015,z+between(-.1,.1));slab.scale.set(between(.45,.58),1,between(.38,.5));slab.rotation.y=between(0,6.28);slab.receiveShadow=true;garden.add(slab);
 }}
 // A second path connects the garden to the product pavilion.
 for(let i=0;i<13;i++){const slab=new T.Mesh(pathStone,stone);slab.position.set(-i*.7,-.015,7-i*.22);slab.scale.set(.48,1,.44);slab.rotation.y=i*.8;slab.receiveShadow=true;garden.add(slab);}

 // Recycled road sections lead from the sign to the distant pyramid court.
 const entrance=new T.CatmullRomCurve3([new T.Vector3(6.8,.025,-7.4),new T.Vector3(9.6,.025,-8.1),new T.Vector3(roadX,.025,roadStart)]);
 for(let i=0;i<=12;i++){const point=entrance.getPoint(i/12),slab=new T.Mesh(pathStone,stone);slab.position.copy(point);slab.scale.set(.86,1,.64);slab.rotation.y=i*.35;slab.receiveShadow=true;garden.add(slab);}
 let brickSeed=4421;const brickRandom=()=>{brickSeed=(brickSeed*1664525+1013904223)>>>0;return brickSeed/4294967296;};
 // A few worn stones peter out toward the edge of the world.
 for(let i=0;i<7;i++){if(i===3||i===5)continue;const slab=new T.Mesh(pathStone,stone);slab.position.set(roadX+(brickRandom()-.5),-.015,roadStart-1.5-i*1.45);slab.scale.set(.55-i*.03,1,.42-i*.025);slab.rotation.y=brickRandom()*6.28;slab.receiveShadow=true;garden.add(slab);}
 // The long brick road: hand-laid running bond in ochre, terracotta and the odd gold brick.
 const brickCanvas=document.createElement('canvas');brickCanvas.width=brickCanvas.height=1024;
 const bricks=brickCanvas.getContext('2d'),brickHeight=1024/16,brickWidth=1024/4;
 bricks.fillStyle='#5b4632';bricks.fillRect(0,0,1024,1024);
 const brickBump=document.createElement('canvas');brickBump.width=brickBump.height=1024;const bump=brickBump.getContext('2d');bump.fillStyle='#000';bump.fillRect(0,0,1024,1024);
 for(let row=0;row<16;row++)for(let col=-1;col<5;col++){
  const x=col*brickWidth+(row%2?brickWidth/2:0)+5,y=row*brickHeight+5,w=brickWidth-10,h=brickHeight-10;
  const tone=brickRandom(),base=tone>.9?[214,170,74]:tone>.45?[178,106,64]:[198,132,78];
  const shade=.82+brickRandom()*.3;bricks.fillStyle='rgb('+base.map(v=>Math.min(255,v*shade|0)).join(',')+')';bricks.fillRect(x,y,w,h);
  for(let k=0;k<26;k++){bricks.fillStyle='rgba('+(brickRandom()>.5?'255,230,190':'60,30,15')+','+(brickRandom()*.12).toFixed(3)+')';bricks.fillRect(x+brickRandom()*w,y+brickRandom()*h,2+brickRandom()*14,1+brickRandom()*5);}
  const g=bump.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#c8c8c8');g.addColorStop(.5,'#ffffff');g.addColorStop(1,'#b4b4b4');bump.fillStyle=g;bump.fillRect(x,y,w,h);
 }
 const roadMap=new T.CanvasTexture(brickCanvas),roadBump=new T.CanvasTexture(brickBump);roadMap.colorSpace=T.SRGBColorSpace;
 for(const texture of [roadMap,roadBump]){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(2,12);texture.anisotropy=8;}
 const roadMaterial=new T.MeshStandardMaterial({map:roadMap,bumpMap:roadBump,bumpScale:.035,color:0xf2ece2,roughness:.88});
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
 // The garden side of the first section is grassed over: the road only begins beyond the hidden door.
 const doorZ=-21.5,hiddenLength=roadStart-doorZ;
 function clipRoad(mesh,index){
  const trimmed=index===0,length=trimmed?roadLength-hiddenLength:roadLength;
  if(mesh.geometry===roadGeometry)mesh.scale.y=length/roadLength;else mesh.scale.z=length/roadLength;
  mesh.position.z=trimmed?-hiddenLength/2:0;
 }
 function updateRoad(position){
  const section=Math.floor(Math.max(0,roadStart-Math.max(roadEnd,position.z))/roadLength),first=Math.max(0,section-8);
  if(first!==roadFirst){roadFirst=first;roadSections.forEach((part,i)=>{part.position.set(roadX,0,roadStart-(first+i+.5)*roadLength);part.userData.roadIndex=first+i;part.userData.roadMeshes.forEach(mesh=>{mesh.visible=first+i<roadSegmentCount;clipRoad(mesh,first+i);});nightRoad?.recycle(part,first+i);});}
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
 // The serpent is a CC0 photogrammetry scan of a Japanese pit viper (assets/eden-hero/pit-viper-LICENSE.txt).
 const viperModel=window.showroomAssets.model('/assets/eden-hero/pit-viper.glb?v=1');viperModel.catch(()=>{});
 const snake=window.createTreeSnake(T,scene,{bark,reduced,model:heroModel,viper:viperModel,onChange});assetJobs.push(snake.ready);
 // The night section (pyramid court, district, night woodland) is built only when the viewer heads for the road
 // entrance or an expedition starts, one piece per frame so the build never lands as a single long stall.
 let pyramid=null,district=null,nightSteps=null,lastViewer=null,skyMoving=false,lastTime=0;
 // The garden is enclosed in a painted sky box (eden-skybox.js); a hidden door behind the "where is god ?" sign opens
 // onto the brick road. Its south and west walls stand beyond the black-box valley (black-box.js) so the valley stays inside.
 const skybox=window.createEdenSkybox(T,scene,{sky,roadX,reduced,bounds:{minX:-28,maxX:23,minZ:-21.5,maxZ:59}});
 const nightBuilders=[
  ()=>{pyramid=window.createRoadPyramid(T,scene,{roadX,roadEnd,stone,onChange,reduced});},
  ()=>{district=window.createNightDistrict(T,scene,{stone,leafMat,layout:window.nightLayout,reduced});window.mergeStaticMeshes?.(T,district.root,{skip:o=>o.name.startsWith('Lost page')||o.userData.landmarkModel});},
  ()=>{nightRoad=window.createNightRoad(T,scene,{sections:roadSections,roadX,roadStart,nightStart:skybox.door.z,roadLength,clearingStart:-120,district,sky,bark,forest:flora.forest,stone,roadMaterial,vergeMaterial,clouds:garden.children.filter(node=>node.isSprite),reduced,mobile});roadFirst=-1;if(lastViewer)updateRoad(lastViewer.position);onChange();}
 ];
 // Back in the garden the night section is hidden again, exactly as before it was first built.
 const nightNear=p=>p.z< -12||Math.hypot(p.x-9,p.z+8.5)<10;
 function buildNight(all=false){nightSteps??=[...nightBuilders];while(nightSteps.length){nightSteps.shift()();if(!all)break;}}
 const nightBuilt=()=>!!nightRoad;
 return {snake,skybox,get nightRoad(){return nightRoad;},get pyramid(){buildNight(true);return pyramid;},get district(){buildNight(true);return district;},nightBuilt,ready:Promise.allSettled(assetJobs),constrain(position,previous,feet=null){
  if(position.z< -12&&!nightBuilt())buildNight(true);
  if(previous.z< -20){if(position.z< -111)pyramid.constrain(position);else{const width=T.MathUtils.lerp(2.7,90,T.MathUtils.smoothstep(-position.z,20,30));position.x=T.MathUtils.clamp(position.x,roadX-width,roadX+width);}}
  else{position.x=T.MathUtils.clamp(position.x,-20,20);if(position.z< -20&&Math.abs(position.x-roadX)>2.7)position.z=-20;}
  if(district?.blocks(position,feet)||pyramid?.blocks(position)||skybox.blocks(position,previous))position.copy(previous);
  if(position.z>26&&!window.edenValley.reaches(position.x,position.z)){if(previous.z>26)position.copy(previous);else position.z=26;}
  return position;
 },road:{x:roadX,start:roadStart,end:roadEnd,door:skybox.door.z,inspect:()=>({first:roadFirst,sections:roadSections.length,near:roadStart-roadFirst*roadLength,far:Math.max(roadEnd,roadStart-(roadFirst+roadSections.length)*roadLength)})},update(time,viewer,active=true){
  if(viewer){lastViewer=viewer;if(grass.update(viewer.position))onChange();flora.setVisible(viewer.position.z>-45);flora.lod(viewer.position);if(!nightBuilt()&&(nightSteps||nightNear(viewer.position))){buildNight();onChange();}updateRoad(viewer.position);sky.position.copy(viewer.position);skyMoving=skybox.update(time,viewer,Math.min(.05,Math.max(0,time-lastTime)));lastTime=time;snake.update(time,viewer,active);if(nightBuilt()){const near=nightNear(viewer.position);nightRoad.setEnabled(near);district.root.visible=near;nightRoad.update(time,viewer,active);pyramid.update(viewer,time);if(near)district.update(time,viewer,nightRoad.amount);}}
  if(reduced)return;wind.value=time;flora.update(time);waterUniforms.time.value=time;dust.rotation.y=Math.sin(time*.025)*.07;
 },get animating(){return skyMoving;},foliage:flora.leaves,flora,sky};
};
