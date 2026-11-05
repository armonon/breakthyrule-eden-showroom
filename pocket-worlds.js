'use strict';
// Places that are bigger on the inside. Each place is a doorway in the garden that shows, and leads to, a world built
// far away: the doorway is drawn by the player's camera moved by the offset between the two (with an oblique near
// plane at the threshold), and crossing the threshold moves the player by that offset.
// A place is laid out in its doorway's frame: origin at the centre of the threshold on the floor, +x pointing in.
window.createPocketWorlds=function createPocketWorlds(T,scene,renderer,camera){
 camera.layers.enable(2); // doorways are drawn by the player's camera only, never by the cameras behind them

 // Unlit white: each face gets a fixed shade, walls darken where they meet the floor, everything dissolves into white
 // with distance, so the far ends of the corridors never arrive.
 const fade='uniform float fadeNear,fadeFar;varying float vDist;';
 const fadeVertex='vec4 world=modelMatrix*vec4(position,1.);vec4 view=viewMatrix*world;vDist=length(view.xyz);gl_Position=projectionMatrix*view;';
 const surface=new T.ShaderMaterial({polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
  uniforms:{fadeNear:{value:12},fadeFar:{value:90}},
  vertexShader:`${fade}varying vec3 vNormal;varying float vHeight;void main(){${fadeVertex}vNormal=normalize(mat3(modelMatrix)*normal);vHeight=position.y;}`,
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

 // Builds white rooms into a group as one mesh and one set of edge lines.
 function white(name,parent){
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
   // ({side:'n'|'s'|'w'|'e', from, to, height}) measured along it (n/s run along x at z0/z1, w/e along z at x0/x1).
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
    const mesh=new T.Mesh(geometry,surface);mesh.name=name;parent.add(mesh);
    const lineGeometry=new T.BufferGeometry();lineGeometry.setAttribute('position',new T.Float32BufferAttribute(lines,3));
    const lineMesh=new T.LineSegments(lineGeometry,edge);lineMesh.name=name+' edges';parent.add(lineMesh);
    return mesh;
   }
  };
  return api;
 }

 const view=`uniform sampler2D map;uniform vec2 resolution;void main(){gl_FragColor=texture2D(map,gl_FragCoord.xy/resolution);}`;
 const portalCamera=new T.PerspectiveCamera(),frustum=new T.Frustum(),matrix=new T.Matrix4(),size=new T.Vector2(),clip=new T.Vector4(),q=new T.Vector4(),plane=new T.Plane(),local=new T.Vector3();
 function obliqueNear(cam,keep){
  plane.copy(keep).applyMatrix4(cam.matrixWorldInverse);clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const e=cam.projectionMatrix.elements;
  q.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
  clip.multiplyScalar(2/clip.dot(q));e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+1;e[14]=clip.w;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
 }
 const rect=(x0,x1,z0,z1)=>[x0,x1,z0,z1],within=(p,r)=>p.x>r[0]&&p.x<r[1]&&p.z>r[2]&&p.z<r[3];

 const places=[];
 // position/rotation: the doorway in the garden. offset: where its world is built (its floor ends up at y = 0).
 // width/height: the opening. beyond/behind: how far the real and far tunnels run past the threshold.
 // walk: floor plan of the world (rects [x0,x1,z0,z1] in the doorway frame); solid: obstacles in it.
 // blocksOutside(q): the building in the garden, in the doorway frame. enclosedOutside(q): inside that building.
 // seen(q): whether the doorway can be in view from q (outside), so it is not drawn behind the building's walls.
 function place({name,position,rotation=0,offset,width,height,beyond,behind,caption,view:viewDistance=30,walk=[],solid=[],blocksOutside=()=>false,enclosedOutside=()=>false,seen=()=>true,update=()=>{}}){
  const real=new T.Group(),far=new T.Group();real.name=name;far.name=name+' (inside)';
  real.position.copy(position);real.rotation.y=rotation;far.position.copy(position).add(offset);far.rotation.y=rotation;
  scene.add(real,far);real.updateMatrixWorld();far.updateMatrixWorld();
  const toReal=real.matrixWorld.clone().invert(),toFar=far.matrixWorld.clone().invert(),back=offset.clone().negate();
  const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:4});
  target.texture.colorSpace=T.SRGBColorSpace;target.isXRRenderTarget=true; // tone-mapped and encoded exactly like the canvas
  const material=new T.ShaderMaterial({toneMapped:false,fog:false,uniforms:{map:{value:target.texture},resolution:{value:size}},
   vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:view});
  const opening=new T.PlaneGeometry(width+.06,height+.06);
  function doorway(group,facing){
   const mesh=new T.Mesh(opening,material);mesh.position.set(0,height/2,0);mesh.rotation.y=facing*Math.PI/2;mesh.layers.set(2);
   group.add(mesh);mesh.updateMatrixWorld();return new T.Box3().setFromObject(mesh);
  }
  const realBox=doorway(real,-1),farBox=doorway(far,1);
  // Each view keeps only what lies beyond its doorway, so nothing between the camera and the doorway can block it.
  const inward=new T.Vector3(1,0,0).applyAxisAngle(new T.Vector3(0,1,0),rotation);
  const keepFar=new T.Plane().setFromNormalAndCoplanarPoint(inward,far.position),keepReal=new T.Plane().setFromNormalAndCoplanarPoint(inward.clone().negate(),real.position);
  const p={name,real,far,caption,white:white(name+' white world',far),
   toReal:point=>local.copy(point).applyMatrix4(toReal),toFar:point=>local.copy(point).applyMatrix4(toFar),
   inside:point=>Math.hypot(point.x-far.position.x,point.z-far.position.z)<450,
   blocks(point){const f=p.toFar(point);return !walk.some(r=>within(f,r))||solid.some(r=>within(f,r));},
   blocksOutside(point){const r=p.toReal(point);return Math.abs(r.x)<40&&Math.abs(r.z)<40&&blocksOutside(r);},
   enclosed(point){if(p.inside(point))return true;const r=p.toReal(point);return Math.abs(r.x)<40&&Math.abs(r.z)<40&&enclosedOutside(r);},
   cross(point){
    let l=p.toReal(point);if(Math.abs(l.z)<width/2&&l.x>0&&l.x<beyond&&l.y<height+3)return offset;
    l=p.toFar(point);if(Math.abs(l.z)<width/2&&l.x<0&&l.x>-behind&&l.y<height+3)return back;
    return null;
   },
   render(){
    const camPos=camera.position,inside=p.inside(camPos);
    update(camPos,inside);
    const l=inside?p.toFar(camPos):p.toReal(camPos);
    if(inside?!(l.x>0&&l.length()<140):!(l.x<0&&l.length()<viewDistance&&seen(l)))return;
    camera.updateMatrixWorld();matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
    if(!frustum.intersectsBox(inside?farBox:realBox))return;
    renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
    portalCamera.projectionMatrix.copy(camera.projectionMatrix);
    portalCamera.position.copy(camPos).add(inside?back:offset);portalCamera.quaternion.copy(camera.quaternion);portalCamera.updateMatrixWorld();
    obliqueNear(portalCamera,inside?keepReal:keepFar);
    const shadows=renderer.shadowMap.needsUpdate,previous=renderer.getRenderTarget();renderer.shadowMap.needsUpdate=false;
    renderer.setRenderTarget(target);renderer.render(scene,portalCamera);renderer.setRenderTarget(previous);
    renderer.shadowMap.needsUpdate=shadows;
   }
  };
  places.push(p);return p;
 }

 return {surface,edge,rect,place,white,
  inside:point=>places.find(p=>p.inside(point))||null,
  blocks:point=>{const p=places.find(p=>p.inside(point));return p?p.blocks(point):places.some(p=>p.blocksOutside(point));},
  enclosed:point=>places.some(p=>p.enclosed(point)),
  cross:point=>{for(const p of places){const jump=p.cross(point);if(jump)return jump;}return null;},
  render(){for(const p of places)p.render();}
 };
};
