'use strict';
// The Photoreal graphics setting: real captured content in the garden, loaded only when someone picks it. Never chosen
// automatically. It swaps the sky and horizon for a photographed panorama, the pond for a planar-reflection water surface,
// the garden's trees and stones for scans and the grass for a denser field; every other setting keeps the original scene.
window.edenPhotoSkyChunk=`uniform sampler2D photoMap;uniform vec4 photoSky;uniform vec3 photoSun;
 vec3 edenPhotoSky(vec3 d){float e=asin(clamp(d.y,-1.,1.));
  vec3 c=texture2D(photoMap,vec2(fract(atan(d.z,d.x)/6.2831853+.5+photoSky.y),clamp((e-photoSky.z)/(1.5707963-photoSky.z),0.,1.))).rgb*photoSky.w;
  // The photographed sun stands higher than the scene's, so the scene's sun gets its own glow.
  float s=max(dot(d,photoSun),0.);return c+vec3(1.,.93,.78)*(pow(s,420.)*.5+pow(s,28.)*.07)+vec3(1.,.97,.9)*smoothstep(.9994,.9998,s);}`;

window.createEdenPhotoreal=function(T,{renderer,scene,camera,garden,lighting,post,requestDraw=()=>{}}){
 const skyUniforms=garden.sky.material.uniforms,sunDir=new T.Vector3(-.38,.32,-.8).normalize();
 const original={fog:scene.fog.density,fogColor:scene.fog.color.clone(),water:garden.pond.water.material};
 let on=false,loaded=null;

 // ---- sky ----
 async function loadSky(){
  const [info,map]=await Promise.all([fetch('/assets/eden-photo/sky.json?v=1').then(r=>r.json()),new T.TextureLoader().loadAsync('/assets/eden-photo/sky.webp?v=1')]);
  map.colorSpace=T.NoColorSpace;map.wrapS=T.RepeatWrapping;map.generateMipmaps=false;map.minFilter=T.LinearFilter;map.magFilter=T.LinearFilter;map.anisotropy=1;
  skyUniforms.photoMap.value=map;
  skyUniforms.photoSky.value.y=info.sunU-(Math.atan2(sunDir.z,sunDir.x)/(Math.PI*2)+.5);
  skyUniforms.photoSky.value.z=info.bottom*Math.PI/180;
  skyUniforms.photoSky.value.w=1;
  skyUniforms.photoSun.value.copy(sunDir);
 }

 // ---- pond: planar reflection (the same mirrored-camera method as three's Reflector), rendered once a frame while the
 // pond is on screen, display-referred like the scene pass. Small and wind-only ripples: a garden pond is nearly still.
 const SIZE=new T.Vector2();
 const reflection=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:0,depthBuffer:true});reflection.texture.colorSpace=T.SRGBColorSpace;reflection.isXRRenderTarget=true;
 const virtual=new T.PerspectiveCamera(),textureMatrix=new T.Matrix4();
 const waterMaterial=new T.ShaderMaterial({
  uniforms:{reflection:{value:reflection.texture},textureMatrix:{value:textureMatrix},bed:{value:garden.pond.bed},time:garden.pond.time,night:skyUniforms.roadNight,centre:{value:new T.Vector4(5.7,3.5,3.8,5.6)},sun:{value:sunDir}},
  vertexShader:'varying vec3 vP;void main(){vec4 p=modelMatrix*vec4(position,1.);vP=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
  fragmentShader:`uniform sampler2D reflection,bed;uniform mat4 textureMatrix;uniform float time,night;uniform vec4 centre;uniform vec3 sun;varying vec3 vP;
 float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
 float surface(vec2 p){return n(p*2.3+vec2(time*.09,time*.05))*.5+n(p*5.1-vec2(time*.14,-time*.07))*.3+n(p*11.3+vec2(-time*.2,time*.17))*.2;}
 void main(){vec2 p=vP.xz;float e=.02,a=surface(p);vec3 N=normalize(vec3((a-surface(p+vec2(e,0.)))/e*.028,1.,(a-surface(p+vec2(0.,e)))/e*.028));
  vec3 V=cameraPosition-vP;float dist=length(V);V/=dist;float c=max(dot(V,N),0.);float F=.02+.98*pow(1.-c,5.);
  vec4 uvw=textureMatrix*vec4(vP,1.);vec2 uv=uvw.xy/uvw.w+N.xz*.55/max(dist,1.);
  vec3 sky=texture2D(reflection,clamp(uv,.002,.998)).rgb;
  // Looking in: the pond bed fades to dark green water with depth, refracted a little by the ripples.
  float rim=length((p-centre.xy)/centre.zw),depth=smoothstep(.55,1.,rim);
  vec3 refr=normalize(mix(-V,-N,.25)-N*.2);vec2 floorAt=p+refr.xz/max(-refr.y,.25)*mix(.9,.12,depth);
  vec3 under=texture2D(bed,floorAt*.42).rgb*vec3(.62,.66,.5);under=mix(vec3(.022,.05,.036),under,depth*.55+.06);
  vec3 col=mix(under,sky,F);
  float glint=pow(max(dot(reflect(-sun,N),V),0.),900.);col+=vec3(1.,.95,.82)*glint*2.4*(1.-night);
  col=mix(col,col*.25,night*(1.-F));gl_FragColor=vec4(col,1.);}`});
 const planeNormal=new T.Vector3(0,1,0),planePoint=new T.Vector3(),view=new T.Vector3(),eye=new T.Vector3(),look=new T.Vector3(),goal=new T.Vector3(),rotation=new T.Matrix4(),clipPlane=new T.Vector4(),q=new T.Vector4(),plane=new T.Plane();
 let reflectedFrame=false,rendering=false,frameCount=0;const tuning={reflectEvery:2,reflectLeaves:.3};
 const hiddenInReflection=()=>[garden.pond.water,garden.grassMesh,...garden.flora.groundCover(),...scene.children.filter(o=>o.isObject3D&&o!==garden.stones.parent&&o.name!=='Eden sky box'&&!o.isLight)];
 function renderReflection(render,mainCamera){
  // Only the main camera's first pass of a frame draws it.
  if(reflectedFrame||rendering||mainCamera!==camera)return;reflectedFrame=true;
  // Ripples hide a frame's lag, so the reflection refreshes every other frame, with a thinner share of each crown's leaves
  // (fronds are stored in random order, so the first part of the index buffer is an even sample of the crown).
  if(frameCount++%tuning.reflectEvery&&reflection.width>1)return;
  planePoint.setFromMatrixPosition(garden.pond.water.matrixWorld);eye.setFromMatrixPosition(camera.matrixWorld);
  view.subVectors(planePoint,eye);if(view.dot(planeNormal)>0)return;
  view.reflect(planeNormal).negate().add(planePoint);
  rotation.extractRotation(camera.matrixWorld);look.set(0,0,-1).applyMatrix4(rotation).add(eye);
  goal.subVectors(planePoint,look).reflect(planeNormal).negate().add(planePoint);
  virtual.position.copy(view);virtual.up.set(0,1,0).applyMatrix4(rotation).reflect(planeNormal);virtual.lookAt(goal);
  virtual.near=camera.near;virtual.far=camera.far;virtual.updateMatrixWorld();virtual.projectionMatrix.copy(camera.projectionMatrix);
  textureMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
  plane.setFromNormalAndCoplanarPoint(planeNormal,planePoint).applyMatrix4(virtual.matrixWorldInverse);
  clipPlane.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const e=virtual.projectionMatrix.elements;
  q.set((Math.sign(clipPlane.x)+e[8])/e[0],(Math.sign(clipPlane.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
  clipPlane.multiplyScalar(2/clipPlane.dot(q));e[2]=clipPlane.x;e[6]=clipPlane.y;e[10]=clipPlane.z+1-.003;e[14]=clipPlane.w;
  virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
  renderer.getDrawingBufferSize(SIZE);const w=Math.max(256,SIZE.x>>1),h=Math.max(256,SIZE.y>>1);if(reflection.width!==w||reflection.height!==h)reflection.setSize(w,h);
  const hidden=hiddenInReflection().filter(o=>o&&o.visible),target=renderer.getRenderTarget(),shadow=renderer.shadowMap.autoUpdate,xr=renderer.xr.enabled;
  for(const o of hidden)o.visible=false;
  const thinned=garden.flora.photoLeaves().map(g=>{const count=g.drawRange.count;g.setDrawRange(0,Math.floor(g.index.count*tuning.reflectLeaves/3)*3);return [g,count];});
  rendering=true;renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
  renderer.setRenderTarget(reflection);renderer.clear();renderer.render(scene,virtual);
  renderer.setRenderTarget(target);renderer.shadowMap.autoUpdate=shadow;renderer.xr.enabled=xr;rendering=false;
  for(const o of hidden)o.visible=true;for(const [g,count] of thinned)g.setDrawRange(0,count);
 }

 // ---- scanned trees and rocks ----
 const texture=async(name,srgb=true)=>{const t=await new T.TextureLoader().loadAsync('/assets/eden-photo/'+name+'.webp?v=1');t.flipY=false;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;t.needsUpdate=true;return t;};
 const parts=async name=>{const gltf=await window.showroomAssets.model('/assets/eden-photo/'+name+'.glb?v=2'),out={};gltf.scene.traverse(o=>{if(o.isMesh)out[o.name]=o.geometry;});return out;};
 async function loadTrees(){
  const [near,mid,hero,leaves,leavesNormal,trunk,trunkNormal,branches,heroLeaves]=await Promise.all([parts('jacaranda-near'),parts('jacaranda-mid'),parts('hero-leaves'),texture('jacaranda-leaves'),texture('jacaranda-leaves-nor',false),texture('jacaranda-trunk'),texture('jacaranda-trunk-nor',false),texture('jacaranda-branches'),texture('hero-leaves')]);
  garden.flora.buildPhotoTrees({near,mid,heroLeaves:hero.leaves,maps:{leaves,leavesNormal,trunk,trunkNormal,branches,heroLeaves}});
 }
 const scanned=new T.Group();scanned.name='Eden scanned stones';scanned.visible=false;garden.stones.parent.add(scanned);
 async function loadRocks(){
  const [rocks,map,normalMap]=await Promise.all([parts('rocks'),texture('rocks'),texture('rocks-nor',false)]),types=Object.values(rocks);
  const material=new T.MeshStandardMaterial({map,normalMap,roughness:.95});material.color.setRGB(1.12,1.14,1.14);
  const placed=types.map(()=>[]),dummy=new T.Object3D();let seed=5081;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  // Path stones: scanned rock pressed flat and sunk, like field stone set into the ground. Rim: the rocks as they are, half buried.
  garden.stoneSpots.path.forEach((slab,i)=>{dummy.position.set(slab.position.x,-.03,slab.position.z);dummy.rotation.set(0,random()*6.28,0);dummy.scale.set(slab.scale.x*.82,.075,slab.scale.z*.82);dummy.updateMatrix();placed[i%types.length].push(dummy.matrix.clone());});
  garden.stoneSpots.rim.forEach((rock,i)=>{const size=(rock.scale.x+rock.scale.z)*.5*.66;dummy.position.set(rock.position.x,-.08+rock.scale.y*.25,rock.position.z);dummy.rotation.set(random()*.5,random()*6.28,random()*.5);dummy.scale.set(size,size*(.55+random()*.3),size);dummy.updateMatrix();placed[(i*5+1)%types.length].push(dummy.matrix.clone());});
  types.forEach((geometry,i)=>{const mesh=new T.InstancedMesh(geometry,material,placed[i].length);placed[i].forEach((m,k)=>mesh.setMatrixAt(k,m));mesh.computeBoundingSphere();mesh.castShadow=mesh.receiveShadow=true;scanned.add(mesh);});
 }

 function apply(){
  skyUniforms.photoSky.value.x=on&&loaded===true?1:0;
  const ready=on&&loaded===true;
  // Grade toward a real garden photograph: fuller colour, more contrast (measured, see docs/graphics/RESULTS.md).
  post.set(ready?{saturation:1.3,contrast:.17,grain:.018}:{saturation:1.06,contrast:.12,grain:.028});
  garden.stones.visible=!ready;scanned.visible=ready;garden.setDenseGrass(ready);garden.flora.setPhotoTrees(ready);renderer.shadowMap.needsUpdate=true;
  scene.fog.density=ready?.0075:original.fog;scene.fog.color.copy(original.fogColor);if(ready)scene.fog.color.set(0xb9cbd6);
  const water=garden.pond.water;
  water.material=ready?waterMaterial:original.water;
  water.onBeforeRender=ready?(r,s,cam)=>renderReflection(r,cam):T.Object3D.prototype.onBeforeRender;
  garden.pond.lilies.visible=!ready;
  requestDraw();
 }
 async function load(){
  if(loaded)return;loaded='loading';
  try{await Promise.all([loadSky(),loadTrees(),loadRocks()]);loaded=true;apply();}catch(error){loaded=null;console.warn('Photoreal assets unavailable; keeping the standard garden.',error);}
 }
 return {
  set(value){on=!!value;if(on)load();apply();},
  get active(){return on&&loaded===true;},
  update(){reflectedFrame=false;},
  tuning,
  inspect:()=>({on,loaded,fog:scene.fog.density,reflection:[reflection.width,reflection.height]})
 };
};
