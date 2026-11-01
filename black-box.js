'use strict';
// The showroom is a plain black cube. Inside it is white, and a doorway in its east wall opens onto a white world far
// larger than the cube: long corridors and two halls, built 1 km away and drawn through the doorway every frame.
// Crossing the doorway moves the player by the same offset, so the cube is bigger on the inside.
window.createBlackBox=function createBlackBox(T,scene,renderer,camera){
 const OFFSET=new T.Vector3(1000,0,0),BACK=OFFSET.clone().negate();
 const outer={x0:-14.2,x1:-5.8,z0:-3.7,z1:4.7,h:8.4},shell=.25;
 const inner={x0:outer.x0+shell,x1:outer.x1-shell,z0:outer.z0+shell,z1:outer.z1-shell,h:outer.h-shell};
 const door={x0:-8.7,x1:-6.9,h:3};                                  // garden entrance in the south face
 const portal={x:-6.55,z0:-.6,z1:1.6,h:3.4,frame:inner.x1-1};          // the threshold plane and its opening
 const root=new T.Group();root.name='Black box showroom';scene.add(root);
 camera.layers.enable(2); // the doorways are drawn by the player's camera only, never by the cameras behind them

 // Unlit white: each face gets a fixed shade, walls darken where they meet the floor, everything dissolves into white
 // with distance, so the far ends of the corridors never arrive.
 const fade='uniform float fadeNear,fadeFar;varying float vDist;';
 const fadeVertex='vec4 world=modelMatrix*vec4(position,1.);vec4 view=viewMatrix*world;vDist=length(view.xyz);gl_Position=projectionMatrix*view;';
 const surface=new T.ShaderMaterial({polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
  uniforms:{fadeNear:{value:12},fadeFar:{value:90}},
  vertexShader:`${fade}varying vec3 vNormal;varying float vHeight;void main(){${fadeVertex}vNormal=normal;vHeight=world.y;}`,
  fragmentShader:`${fade}varying vec3 vNormal;varying float vHeight;
  void main(){vec3 n=normalize(vNormal);float shade=n.y>.5?.86:n.y<-.5?.97:abs(n.x)>.5?.99:.95;
   if(abs(n.y)<.5)shade*=1.-.14*exp(-max(vHeight,0.)*1.6);
   gl_FragColor=vec4(mix(vec3(shade),vec3(1.),smoothstep(fadeNear,fadeFar,vDist)),1.);
   #include <colorspace_fragment>
  }`});
 const edge=new T.ShaderMaterial({uniforms:surface.uniforms,
  vertexShader:`${fade}void main(){${fadeVertex}}`,
  fragmentShader:`${fade}void main(){gl_FragColor=vec4(mix(vec3(.5),vec3(1.),smoothstep(fadeNear*.5,fadeFar,vDist)),1.);
   #include <colorspace_fragment>
  }`});

 function world(name,offset){
  const solids=[],lines=[];
  const api={
   add(g){solids.push(g);return g;},
   solid(x0,x1,y0,y1,z0,z1){const g=new T.BoxGeometry(x1-x0,y1-y0,z1-z0).toNonIndexed();g.translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);return api.add(g);},
   edges(g){const e=new T.EdgesGeometry(g);lines.push(...e.attributes.position.array);e.dispose();},
   line(a,b){lines.push(...a,...b);},
   outline(x0,x1,y0,y1,z0,z1){
    for(const y of [y0,y1]){api.line([x0,y,z0],[x1,y,z0]);api.line([x0,y,z1],[x1,y,z1]);api.line([x0,y,z0],[x0,y,z1]);api.line([x1,y,z0],[x1,y,z1]);}
    for(const x of [x0,x1])for(const z of [z0,z1])api.line([x,y0,z],[x,y1,z]);
   },
   // A room: floor, ceiling and four walls just outside its interior bounds; openings are gaps in a wall
   // ({side:'n'|'s'|'w'|'e', from, to, height}) measured along it.
   room(x0,x1,z0,z1,h,openings=[]){
    const t=.2;
    api.solid(x0-t,x1+t,-t,0,z0-t,z1+t);api.solid(x0-t,x1+t,h,h+t,z0-t,z1+t);
    for(const side of ['n','s','w','e']){
     const alongX=side==='n'||side==='s',face={n:z0,s:z1,w:x0,e:x1}[side],back=face+(side==='n'||side==='w'?-t:t);
     const point=(u,y,d)=>alongX?[u,y,d]:[d,y,u];
     const slab=(a,b,y0,y1)=>{if(b-a<1e-3||y1-y0<1e-3)return;const d0=Math.min(face,back),d1=Math.max(face,back);
      if(alongX)api.solid(a,b,y0,y1,d0,d1);else api.solid(d0,d1,y0,y1,a,b);};
     let cursor=(alongX?x0:z0)-t;
     for(const gap of openings.filter(o=>o.side===side).sort((a,b)=>a.from-b.from)){
      const top=Math.min(gap.height??h,h);
      slab(cursor,gap.from,0,h);slab(gap.from,gap.to,top,h);cursor=gap.to;
      for(const u of [gap.from,gap.to]){api.line(point(u,0,face),point(u,top,face));for(const y of top<h?[0,top]:[0])api.line(point(u,y,face),point(u,y,back));}
      if(top<h)api.line(point(gap.from,top,face),point(gap.to,top,face));
     }
     slab(cursor,(alongX?x1:z1)+t,0,h);
    }
    api.outline(x0,x1,0,h,z0,z1);
   },
   finish(){
    let count=0;for(const g of solids)count+=g.attributes.position.count;
    const position=new Float32Array(count*3),normal=new Float32Array(count*3);let at=0;
    for(const g of solids){position.set(g.attributes.position.array,at*3);normal.set(g.attributes.normal.array,at*3);at+=g.attributes.position.count;g.dispose();}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(position,3));geometry.setAttribute('normal',new T.BufferAttribute(normal,3));
    const mesh=new T.Mesh(geometry,surface);mesh.name=name;mesh.position.copy(offset);root.add(mesh);
    const lineGeometry=new T.BufferGeometry();lineGeometry.setAttribute('position',new T.Float32BufferAttribute(lines,3));
    const lineMesh=new T.LineSegments(lineGeometry,edge);lineMesh.name=name+' edges';lineMesh.position.copy(offset);root.add(lineMesh);
    return mesh;
   }
  };
  return api;
 }

 // Outside: a matte black cube, solid but for the entrance.
 const black=new T.MeshStandardMaterial({color:0x060606,roughness:.72});
 function slab(x0,x1,y0,y1,z0,z1){
  const mesh=new T.Mesh(new T.BoxGeometry(x1-x0,y1-y0,z1-z0),black);mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
  mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
 }
 const lining=.02; // the white lining sits just in front of the shell's inner faces
 slab(outer.x0,outer.x1,0,outer.h,outer.z0,inner.z0-lining);
 slab(outer.x0,door.x0-.01,0,outer.h,inner.z1+lining,outer.z1);
 slab(door.x1+.01,outer.x1,0,outer.h,inner.z1+lining,outer.z1);
 slab(door.x0-.01,door.x1+.01,door.h+.01,outer.h,inner.z1+lining,outer.z1);
 slab(outer.x0,inner.x0-lining,0,outer.h,inner.z0-lining,inner.z1+lining);
 slab(inner.x1+lining,outer.x1,0,outer.h,inner.z0-lining,inner.z1+lining);
 slab(inner.x0-lining,inner.x1+lining,inner.h+lining,outer.h,inner.z0-lining,inner.z1+lining);

 // Inside the cube: white, with a deep frame around the doorway in the east wall.
 const here=world('Black box interior',new T.Vector3());
 here.room(inner.x0,inner.x1,inner.z0,inner.z1,inner.h,[{side:'s',from:door.x0,to:door.x1,height:door.h}]);
 for(const box of [[portal.z0-.4,portal.z0,0,portal.h+.4],[portal.z1,portal.z1+.4,0,portal.h+.4],[portal.z0,portal.z1,portal.h,portal.h+.4]])
  here.edges(here.solid(portal.frame,inner.x1,box[2],box[3],box[0],box[1]));
 here.finish();

 // The white world, laid out in the cube's own coordinates and moved 1 km east. Corridor A continues the doorway
 // for 57 m into Hall Two; Hall One opens off it to the north and corridor B runs south without end.
 const there=world('White world',OFFSET),rng=(seed=>()=>(seed=(seed*16807)%2147483647)/2147483647)(7);
 const hallOne={x0:12,x1:36,z0:-24.8,z1:-.8,h:12},hallTwo={x0:50.2,x1:80.2,z0:-14.5,z1:15.5,h:16},corridorB={x0:38,x1:40.2,z0:1.8,z1:120};
 there.room(portal.frame,50,portal.z0,portal.z1,portal.h,[{side:'n',from:22,to:25},{side:'s',from:corridorB.x0,to:corridorB.x1},{side:'e',from:portal.z0,to:portal.z1}]);
 there.room(hallOne.x0,hallOne.x1,hallOne.z0,hallOne.z1,hallOne.h,[{side:'s',from:22,to:25,height:portal.h}]);
 there.room(hallTwo.x0,hallTwo.x1,hallTwo.z0,hallTwo.z1,hallTwo.h,[{side:'w',from:portal.z0,to:portal.z1,height:portal.h}]);
 there.room(corridorB.x0,corridorB.x1,corridorB.z0,corridorB.z1,portal.h,[{side:'n',from:corridorB.x0,to:corridorB.x1}]);
 // Hall One: white cubes hanging in the air, each turned a little.
 for(let i=0;i<14;i++){
  const size=.5+rng()*2.4,g=new T.BoxGeometry(size,size,size).toNonIndexed();
  g.rotateX((rng()-.5)*.9);g.rotateY(rng()*Math.PI);
  g.translate(hallOne.x0+3+rng()*(hallOne.x1-hallOne.x0-6),3.6+rng()*6.4,hallOne.z0+3+rng()*(hallOne.z1-hallOne.z0-6));
  there.edges(there.add(g));
 }
 const hallTwoCentre=new T.Vector3((hallTwo.x0+hallTwo.x1)/2,0,(hallTwo.z0+hallTwo.z1)/2);
 there.finish();
 // Hall Two: the black box again, smaller, hovering.
 const monolith=new T.Mesh(new T.BoxGeometry(4.2,4.2,4.2),new T.MeshBasicMaterial({color:0x000000,fog:false}));
 monolith.position.copy(hallTwoCentre).add(OFFSET).setY(3.2);monolith.name='Black box within';root.add(monolith);
 const shade=document.createElement('canvas');shade.width=shade.height=128;
 const ctx=shade.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
 gradient.addColorStop(0,'rgba(0,0,0,.28)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 const pool=new T.Mesh(new T.PlaneGeometry(9,9),new T.MeshBasicMaterial({map:new T.CanvasTexture(shade),transparent:true,depthWrite:false,fog:false}));
 pool.rotation.x=-Math.PI/2;pool.position.copy(monolith.position).setY(.01);root.add(pool);

 // The doorway on each side shows the view from the other side, rendered with the same camera moved by the offset.
 const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:renderer.capabilities.isWebGL2?4:0});
 target.texture.colorSpace=T.SRGBColorSpace;target.isXRRenderTarget=true; // tone-mapped and encoded exactly like the canvas
 const window_=new T.ShaderMaterial({toneMapped:false,fog:false,uniforms:{map:{value:target.texture},resolution:{value:new T.Vector2(1,1)}},
  vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform sampler2D map;uniform vec2 resolution;void main(){gl_FragColor=texture2D(map,gl_FragCoord.xy/resolution);}'});
 const opening=new T.PlaneGeometry(portal.z1-portal.z0+.06,portal.h+.06);
 function doorway(offset,facing){
  const mesh=new T.Mesh(opening,window_);mesh.position.set(portal.x,portal.h/2,(portal.z0+portal.z1)/2).add(offset);
  mesh.rotation.y=facing*Math.PI/2;mesh.layers.set(2);root.add(mesh);mesh.updateMatrixWorld();
  return {mesh,box:new T.Box3().setFromObject(mesh)};
 }
 const realDoor=doorway(new T.Vector3(),-1),farDoor=doorway(OFFSET,1);
 // Each view keeps only what lies beyond its doorway (an oblique near plane), so nothing behind the doorway can
 // block it: the garden east of the cube, or the empty space west of the far corridor.
 const keepFar=new T.Plane(new T.Vector3(1,0,0),-(portal.x+OFFSET.x)),keepReal=new T.Plane(new T.Vector3(-1,0,0),portal.x);
 const portalCamera=new T.PerspectiveCamera(),frustum=new T.Frustum(),matrix=new T.Matrix4(),size=new T.Vector2(),clip=new T.Vector4(),q=new T.Vector4(),plane=new T.Plane();
 function obliqueNear(cam,keep){
  plane.copy(keep).applyMatrix4(cam.matrixWorldInverse);clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const e=cam.projectionMatrix.elements;
  q.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
  clip.multiplyScalar(2/clip.dot(q));e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+1;e[14]=clip.w;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
 }
 function inside(p){return p.x>OFFSET.x/2;}
 function render(){
  const far=inside(camera.position),p=camera.position,door=far?farDoor:realDoor;
  const facing=far?p.x>portal.x+OFFSET.x&&p.distanceTo(door.mesh.position)<140
   :p.x<portal.x&&p.x>outer.x0-1&&p.z>outer.z0-1&&p.z<outer.z1+10;
  if(!facing)return;
  camera.updateMatrixWorld();matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
  if(!frustum.intersectsBox(door.box))return;
  renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
  window_.uniforms.resolution.value.copy(size);
  portalCamera.projectionMatrix.copy(camera.projectionMatrix);
  portalCamera.position.copy(camera.position).add(far?BACK:OFFSET);portalCamera.quaternion.copy(camera.quaternion);portalCamera.updateMatrixWorld();
  obliqueNear(portalCamera,far?keepReal:keepFar);
  const shadows=renderer.shadowMap.needsUpdate,previous=renderer.getRenderTarget();renderer.shadowMap.needsUpdate=false;
  renderer.setRenderTarget(target);renderer.render(scene,portalCamera);renderer.setRenderTarget(previous);
  renderer.shadowMap.needsUpdate=shadows;
 }

 // Walking: inside the cube (and through its entrance and doorway frame), and through the white world's floor plan.
 const m=.3,rect=(x0,x1,z0,z1)=>p=>p.x>x0&&p.x<x1&&p.z>z0&&p.z<z1;
 const room=rect(inner.x0+m,inner.x1-m,inner.z0+m,inner.z1-m),entrance=rect(door.x0+m,door.x1-m,inner.z1-1,outer.z1+m+.01);
 const tunnel=rect(portal.frame-1,inner.x1-.25,portal.z0+m,portal.z1-m),frame=rect(portal.frame-m,outer.x1,portal.z0-.4-m,portal.z1+.4+m);
 const footprint=rect(outer.x0-m,outer.x1+m,outer.z0-m,outer.z1+m);
 const D=OFFSET.x,floorPlan=[
  rect(D+portal.frame+.25,D+50-m,portal.z0+m,portal.z1-m),                                      // corridor A
  rect(D+22+m,D+25-m,hallOne.z1-.5,portal.z0+.5),rect(D+hallOne.x0+m,D+hallOne.x1-m,hallOne.z0+m,hallOne.z1-m),
  rect(D+49,D+hallTwo.x0+.5,portal.z0+m,portal.z1-m),rect(D+hallTwo.x0+m,D+hallTwo.x1-m,hallTwo.z0+m,hallTwo.z1-m),
  rect(D+corridorB.x0+m,D+corridorB.x1-m,portal.z1-.5,corridorB.z1-m)];
 const monolithBlock=rect(monolith.position.x-2.1-m,monolith.position.x+2.1+m,monolith.position.z-2.1-m,monolith.position.z+2.1+m);
 function blocks(p){
  if(inside(p))return !floorPlan.some(r=>r(p))||monolithBlock(p);
  if(!footprint(p))return false;
  if(tunnel(p)||entrance(p))return false;
  return !room(p)||frame(p);
 }
 // Crossing the threshold plane in either direction returns the offset to move the player and camera by.
 function cross(p){
  if(p.z<=portal.z0||p.z>=portal.z1)return null;
  if(p.x>portal.x&&p.x<outer.x1)return OFFSET;
  const x=p.x-OFFSET.x;if(x<portal.x&&x>portal.frame-1)return BACK;
  return null;
 }
 // Inside the cube or the white world: nothing in the garden can be seen from here.
 function enclosed(p){return inside(p)||p.x>inner.x0&&p.x<inner.x1&&p.z>inner.z0&&p.z<inner.z1;}
 return {root,inside,enclosed,blocks,cross,render};
};
