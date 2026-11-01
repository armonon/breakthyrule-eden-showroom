'use strict';
// Garden flora. Realistic jacarandas (a scanned CC0 tree rebuilt as trunk + frond cards, with distance billboards) fill
// the garden; the hero apple tree and Italian cypresses grow from recursive branching templates,
// each instanced across the garden; leaf clusters use normals bent away from the crown centre so canopies shade as
// volumes, not as flat cards. Ground cover: rounded shrubs (kept clear of placed props), ferns at tree bases and
// wildflower patches (grass is eden-grass.js). Leaves sway in the wind unless motion is reduced.
window.createEdenFlora=function(T,garden,{bark,openGround,mobile=false}){
 let seed=90210;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},between=(a,b)=>a+(b-a)*random();
 const up=new T.Vector3(0,1,0),dummy=new T.Object3D(),time={value:0};

 // ---- textures (painted once on canvases) ----
 function canvasTexture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;}
 function leaf(c,x,y,length,width,angle,base,tip){
  c.save();c.translate(x,y);c.rotate(angle);const g=c.createLinearGradient(0,0,length,0);g.addColorStop(0,base);g.addColorStop(1,tip);c.fillStyle=g;
  c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(length*.45,-width,length,0);c.quadraticCurveTo(length*.45,width,0,0);c.fill();
  c.strokeStyle='rgba(232,238,186,.32)';c.lineWidth=.9;c.beginPath();c.moveTo(length*.06,0);c.lineTo(length*.88,0);c.stroke();c.restore();
 }
 const broadleafMap=canvasTexture(512,512,c=>{
  c.strokeStyle='#5b4a35';c.lineCap='round';
  for(let i=0;i<9;i++){const a=between(0,6.28);c.lineWidth=between(2,4);c.beginPath();c.moveTo(256,256);c.quadraticCurveTo(256+Math.cos(a+.4)*90,256+Math.sin(a+.4)*90,256+Math.cos(a)*190,256+Math.sin(a)*190);c.stroke();}
  const tones=[['#3f5f26','#7f9c45'],['#4c6d2c','#98ae55'],['#33521f','#6f8d3c'],['#557532','#a7bb63']];
  for(let i=0;i<120;i++){const a=between(0,6.28),r=Math.pow(random(),.6)*205,t=tones[i%4];leaf(c,256+Math.cos(a)*r,256+Math.sin(a)*r,between(34,58),between(11,18),a+between(-.9,.9),t[0],t[1]);}
 });
 const cypressMap=canvasTexture(256,256,c=>{
  for(let i=0;i<900;i++){const a=between(0,6.28),r=Math.pow(random(),.5)*118,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r;
   c.strokeStyle=['#22381c','#2d4724','#3b5a2c','#1b2e17'][i%4];c.lineWidth=between(2,4);c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(x+between(-7,7),y+between(-9,3));c.stroke();}
 });
 const fernMap=canvasTexture(128,512,c=>{
  c.strokeStyle='#3d5a26';c.lineWidth=3;c.beginPath();c.moveTo(64,512);c.quadraticCurveTo(60,260,64,8);c.stroke();
  for(let y=490;y>20;y-=13){const span=Math.sin((512-y)/512*Math.PI)*52+6;for(const s of [-1,1]){
   c.save();c.translate(64,y);c.rotate(s*-1.15);const g=c.createLinearGradient(0,0,span,0);g.addColorStop(0,'#3e6326');g.addColorStop(1,'#86a84a');c.fillStyle=g;
   c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(span*.5,-6,span,0);c.quadraticCurveTo(span*.5,6,0,0);c.fill();c.restore();}}
 });

 // ---- materials ----
 // Double-sided leaves keep their outward crown normals on back faces (three would flip them inward).
 function windMaterial(params,{sway=.05,flutter=.025,keepNormals=true}={}){
  const material=new T.MeshStandardMaterial({side:T.DoubleSide,alphaTest:.45,roughness:.85,...params});
  material.onBeforeCompile=shader=>{
   shader.uniforms.edenTime=time;
   shader.vertexShader='uniform float edenTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float edenH=max(position.y,0.);vec3 edenRoot=instanceMatrix[3].xyz;
    transformed.x+=sin(edenTime*.8+edenRoot.x*.35+edenRoot.z*.2)*${sway.toFixed(3)}*edenH*.18+sin(edenTime*3.1+position.x*4.+position.z*3.)*${flutter.toFixed(3)};
    transformed.z+=cos(edenTime*.65+edenRoot.z*.3)*${sway.toFixed(3)}*edenH*.1;`);
   if(keepNormals)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;',''));
  };
  return material;
 }
 const leafMaterial=windMaterial({map:broadleafMap,emissive:0x2c3a16,emissiveIntensity:.14});
 const cypressMaterial=windMaterial({map:cypressMap,emissive:0x16220f,emissiveIntensity:.1},{sway:.025,flutter:.01});
 const fernMaterial=windMaterial({map:fernMap,roughness:.9,emissive:0x1c2a10,emissiveIntensity:.1},{sway:.0,flutter:.02});
 const fruitMaterial=new T.MeshStandardMaterial({color:0xb23a24,roughness:.42});

 // ---- geometry builder ----
 function builder(){return {p:[],n:[],uv:[],c:[],i:[]};}
 function toGeometry(b){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));
  if(b.c.length)g.setAttribute('color',new T.Float32BufferAttribute(b.c,3));g.setIndex(b.i);g.computeBoundingSphere();return g;
 }
 // Tapered tube along a polyline, with a parallel-transported frame so it never twists.
 function tube(b,points,radii,radial){
  const start=b.p.length/3,tangent=new T.Vector3(),normal=new T.Vector3(),binormal=new T.Vector3(),dir=new T.Vector3();let v=0;
  tangent.subVectors(points[1],points[0]).normalize();normal.set(1,0,0);if(Math.abs(tangent.x)>.9)normal.set(0,0,1);
  for(let i=0;i<points.length;i++){
   if(i>0)v+=points[i].distanceTo(points[i-1])*.9;
   tangent.subVectors(points[Math.min(i+1,points.length-1)],points[Math.max(i-1,0)]).normalize();
   normal.addScaledVector(tangent,-normal.dot(tangent)).normalize();binormal.crossVectors(tangent,normal);
   for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2;dir.copy(normal).multiplyScalar(Math.cos(a)).addScaledVector(binormal,Math.sin(a));
    b.p.push(points[i].x+dir.x*radii[i],points[i].y+dir.y*radii[i],points[i].z+dir.z*radii[i]);b.n.push(dir.x,dir.y,dir.z);b.uv.push(j/radial,v);}
  }
  for(let i=0;i<points.length-1;i++)for(let j=0;j<radial;j++){const a=start+i*(radial+1)+j,c=a+radial+1;b.i.push(a,c,a+1,a+1,c,c+1);}
 }
 // Leaf card centred at `centre`, facing roughly along `facing`; normals bend toward `crown` outward direction.
 function card(b,centre,facing,size,crownCentre,bend=.8,roll=between(0,6.28),stretch=1){
  const n=facing.clone().normalize(),t=new T.Vector3().crossVectors(Math.abs(n.y)>.95?new T.Vector3(1,0,0):up,n).normalize(),s=new T.Vector3().crossVectors(n,t);
  const tx=t.clone().multiplyScalar(Math.cos(roll)).addScaledVector(s,Math.sin(roll)).multiplyScalar(size*.5),ty=s.clone().multiplyScalar(Math.cos(roll)).addScaledVector(t,-Math.sin(roll)).multiplyScalar(size*.5*stretch);
  const start=b.p.length/3,corners=[[-1,-1,0,0],[1,-1,1,0],[1,1,1,1],[-1,1,0,1]],out=new T.Vector3(),q=new T.Vector3();
  for(const [x,y,u,w] of corners){q.copy(centre).addScaledVector(tx,x).addScaledVector(ty,y);b.p.push(q.x,q.y,q.z);
   out.subVectors(q,crownCentre).normalize().multiplyScalar(bend).addScaledVector(n,1-bend).normalize();b.n.push(out.x,out.y,out.z);b.uv.push(u,w);}
  b.i.push(start,start+1,start+2,start,start+2,start+3);
 }
 function appendGeometry(b,geometry,matrix){
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,start=b.p.length/3,v=new T.Vector3(),nm=new T.Matrix3().getNormalMatrix(matrix);
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(matrix);b.p.push(v.x,v.y,v.z);v.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();b.n.push(v.x,v.y,v.z);b.uv.push(uv.getX(i),uv.getY(i));}
  for(const i of geometry.index.array)b.i.push(start+i);
 }

 // ---- trees ----
 const species={
  broadleaf:{trunk:3.1,trunkRadius:.3,forkStart:.55,children:[5,4,3],spread:[.95,.75,.7],lift:.35,ratio:[.62,.6,.55],gnarl:.12,depth:3,leafSize:1.25,clusters:3,fruit:0},
  apple:{trunk:1.9,trunkRadius:.24,forkStart:.6,children:[5,3,3],spread:[1.05,.85,.75],lift:.28,ratio:[.85,.6,.55],gnarl:.2,depth:3,leafSize:.95,clusters:3,fruit:.28},
  // Woodland trees seen at night through fog: two branching levels and fewer, larger leaf cards (~1/3 the triangles).
  forest:{trunk:3.1,trunkRadius:.3,forkStart:.5,children:[6,4],spread:[.95,.75],lift:.35,ratio:[.62,.6],gnarl:.12,depth:2,leafSize:2.1,clusters:3,cards:2,fruit:0},
  hero:{trunk:4.4,trunkRadius:.42,forkStart:.68,children:[7,4,3],spread:[1.0,.8,.7],lift:.3,ratio:[.78,.6,.55],gnarl:.24,depth:3,leafSize:1.25,clusters:4,fruit:.3,radial:[22,12,7,4],flare:1.55}
 };
 function grow(b,tips,spec,from,dir,length,radius,depth){
  const steps=[7,5,3,2][depth],points=[from.clone()],radii=[radius],d=dir.clone();
  for(let s=1;s<=steps;s++){
   const gnarl=depth?spec.gnarl:spec.gnarl*.25;d.x+=between(-1,1)*gnarl;d.z+=between(-1,1)*gnarl;if(depth>0)d.y+=spec.lift*.25;d.normalize();
   points.push(points[s-1].clone().addScaledVector(d,length/steps));radii.push(radius*(1-s/steps*(depth?.7:.45)));
  }
  // Root flare: the trunk swells where it meets the ground.
  if(!depth&&spec.flare){radii[0]*=spec.flare;radii[1]*=1+(spec.flare-1)*.35;}
  tube(b,points,radii,(spec.radial||[9,6,4,3])[depth]);
  if(depth>=spec.depth){for(let k=0;k<spec.clusters;k++)tips.push(points[steps-(k%2)].clone().add(new T.Vector3(between(-.3,.3),between(-.1,.35),between(-.3,.3)).multiplyScalar(length)));return;}
  const count=spec.children[depth],perp=new T.Vector3(),axis=new T.Vector3(),childDir=new T.Vector3();
  for(let k=0;k<count;k++){
   const t=depth===0?between(spec.forkStart,1):between(.35,1),i=Math.min(steps-1,Math.max(1,Math.round(t*steps)));
   axis.subVectors(points[i+1]||points[i],points[i-1]).normalize();
   perp.crossVectors(axis,Math.abs(axis.y)>.9?new T.Vector3(1,0,0):up).normalize().applyAxisAngle(axis,k*2.399+between(-.4,.4));
   const spread=spec.spread[depth]*between(.8,1.15);childDir.copy(axis).multiplyScalar(Math.cos(spread)).addScaledVector(perp,Math.sin(spread));childDir.y+=spec.lift;childDir.normalize();
   grow(b,tips,spec,points[i],childDir,length*spec.ratio[depth]*between(.8,1.1),radii[i]*.62,depth+1);
  }
 }
 const sphere=new T.SphereGeometry(1,8,6);
 function buildTree(spec){
  const wood=builder(),foliage=builder(),fruit=builder(),tips=[];
  grow(wood,tips,spec,new T.Vector3(0,-.15,0),new T.Vector3(between(-.04,.04),1,between(-.04,.04)).normalize(),spec.trunk+.15,spec.trunkRadius,0);
  const crown=tips.reduce((a,p)=>a.add(p),new T.Vector3()).multiplyScalar(1/tips.length);crown.y-=.4;
  const m=new T.Matrix4();
  for(const tip of tips){
   const out=tip.clone().sub(crown).normalize();
   for(let k=0;k<(spec.cards||3);k++){const facing=out.clone().add(new T.Vector3(between(-.7,.7),between(-.4,.7),between(-.7,.7))).normalize();card(foliage,tip.clone().addScaledVector(facing,between(-.25,.25)),facing,spec.leafSize*between(.8,1.25),crown);}
   if(spec.fruit&&random()<spec.fruit){const s=between(.075,.1);m.compose(tip.clone().add(new T.Vector3(between(-.4,.4),-.35,between(-.4,.4))),new T.Quaternion(),new T.Vector3(s,s*1.08,s));appendGeometry(fruit,sphere,m);}
  }
  return {wood:toGeometry(wood),foliage:toGeometry(foliage),fruit:fruit.p.length?toGeometry(fruit):null,height:tips.reduce((h,p)=>Math.max(h,p.y),0)};
 }
 function buildCypress(cards=150,cardScale=1){
  const wood=builder(),foliage=builder(),height=between(6.5,8),crown=new T.Vector3(0,height*.5,0);
  tube(wood,[0,.3,.6,1].map(t=>new T.Vector3(0,-.15+t*height*.75,0)),[.2,.17,.12,.05],7);
  for(let i=0;i<cards;i++){
   const t=Math.pow(random(),.8),y=.5+t*(height-.3),radius=(Math.sin(Math.min(1,(1-t)*1.25)*Math.PI*.5)*.95+.08)*Math.pow(1-t,.25),a=between(0,6.28),r=radius*Math.sqrt(random());
   const p=new T.Vector3(Math.cos(a)*r,y,Math.sin(a)*r),facing=new T.Vector3(Math.cos(a),between(-.2,.5),Math.sin(a));
   card(foliage,p,facing,between(.6,.95)*cardScale,new T.Vector3(0,y,0),.85,between(0,6.28),1.4);
  }
  return {wood:toGeometry(wood),foliage:toGeometry(foliage),fruit:null,height,crown};
 }
 function buildShrub(){
  const foliage=builder(),r=between(.55,.9),h=r*between(.75,1.05),crown=new T.Vector3(0,h*.45,0);
  for(let i=0;i<46;i++){const a=between(0,6.28),e=Math.acos(between(-.2,1)),p=new T.Vector3(Math.cos(a)*Math.sin(e)*r,h*.5+Math.cos(e)*h*.55,Math.sin(a)*Math.sin(e)*r);
   card(foliage,p,p.clone().sub(crown),between(.5,.75),crown);}
  return toGeometry(foliage);
 }
 function buildFern(){
  const fronds=builder(),count=7;
  for(let f=0;f<count;f++){
   const a=f/count*6.28+between(-.3,.3),len=between(.55,.85),dir=new T.Vector3(Math.cos(a),0,Math.sin(a)),side=new T.Vector3(-dir.z,0,dir.x),start=fronds.p.length/3;
   for(let s=0;s<=5;s++){const t=s/5,arc=new T.Vector3().addScaledVector(dir,t*len).setY(Math.sin(t*2.3)*len*.55),w=.09;
    for(const k of [-1,1]){const q=arc.clone().addScaledVector(side,k*w);fronds.p.push(q.x,q.y,q.z);fronds.n.push(0,1,0);fronds.uv.push(k<0?0:1,t);}}
   for(let s=0;s<5;s++){const i=start+s*2;fronds.i.push(i,i+1,i+3,i,i+3,i+2);}
  }
  return toGeometry(fronds);
 }

 const shadowed=(mesh,cast=true)=>{mesh.castShadow=cast;mesh.receiveShadow=true;garden.add(mesh);return mesh;};
 const gardenMeshes=[];
 function instance(geometry,material,matrices,tints,cast=true){
  if(!matrices.length)return null;const mesh=new T.InstancedMesh(geometry,material,matrices.length);gardenMeshes.push(mesh);
  matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);if(tints)mesh.setColorAt(i,tints[i]);});mesh.computeBoundingSphere();return shadowed(mesh,cast);
 }
 const leafMeshes=[];
 function plant(templates,placements,material,tint){
  templates.forEach((template,v)=>{
   const mine=placements.filter((p,i)=>i%templates.length===v),matrices=mine.map(p=>p.matrix);if(!matrices.length)return;
   instance(template.wood,bark,matrices,null);
   leafMeshes.push(instance(template.foliage,material,matrices,mine.map(()=>tint())));
   if(template.fruit)instance(template.fruit,fruitMaterial,matrices,null);
  });
 }
 const matrix=(x,z,scale,y=0)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,between(0,6.28),0);dummy.scale.setScalar(scale);dummy.updateMatrix();return dummy.matrix.clone();};
 const tintFrom=(h,s,l)=>()=>new T.Color().setHSL(h+between(-.02,.02),s+between(-.08,.08),l+between(-.06,.06));

 // Same footprint rules as the trees they replace: nothing on the road, the amphitheatre or the spawn-side clearing.
 const blocked=(x,z)=>z< -20||(z< -9&&Math.abs(x-11.7)<6)||Math.hypot(x+11,z-11)<10.5||(x>-8&&x<5&&z>19&&z<30);
 const cypresses=[],trunks=[],jacarandaSpots=[];
 // Jacarandas fill the ring (and the old orchard spots); some cypresses keep the classical rhythm closer in.
 for(let i=0;i<(mobile?90:150);i++){
  const a=between(0,Math.PI*2),r=between(22,66),x=Math.cos(a)*r,z=Math.sin(a)*r-8,s=between(.75,1.25);if(blocked(x,z))continue;
  if(trunks.some(([tx,tz])=>Math.hypot(x-tx,z-tz)<5.5))continue;
  (r<38&&random()<.18?cypresses:jacarandaSpots).push({x,z,s});trunks.push([x,z]);
 }
 for(let i=0;i<40&&jacarandaSpots.length<(mobile?70:115);i++){ // a looser inner ring around the garden rooms
  const a=between(0,Math.PI*2),r=between(15,22),x=Math.cos(a)*r,z=Math.sin(a)*r+3;
  if(blocked(x,z)||openGround(x,z)||Math.abs(x-.9)<3&&z>-6&&z<22||trunks.some(([tx,tz])=>Math.hypot(x-tx,z-tz)<6))continue;
  jacarandaSpots.push({x,z,s:between(.7,1.05)});trunks.push([x,z]);
 }
 for(const [x,z,s] of [[-22,7,1.1],[10,12,1.15],[-18,-7,1.2],[12,-7,1.1]]){jacarandaSpots.push({x,z,s});trunks.push([x,z]);}
 const cypressTemplates=[0,1].map(()=>buildCypress());
 plant(cypressTemplates,cypresses.map(t=>({matrix:matrix(t.x,t.z,t.s*.85)})),cypressMaterial,tintFrom(.3,.25,.85));
 // The hero apple tree keeps its trunk where the snake's branch meets it (garden x .5, z -7).
 const hero=buildTree(species.hero);
 dummy.position.set(.5,0,-7);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1.15);dummy.updateMatrix();
 const heroMatrix=[dummy.matrix.clone()];
 instance(hero.wood,bark,heroMatrix,null);leafMeshes.push(instance(hero.foliage,leafMaterial,heroMatrix,[new T.Color().setHSL(.23,.52,.9)]));instance(hero.fruit,fruitMaterial,heroMatrix,null);
 trunks.push([.5,-7]);

 const forestTemplates=[0,1].map(()=>buildTree(species.forest)),forestCypress=buildCypress(80,1.35);

 // ---- realistic jacarandas: Poly Haven's CC0 tree (3.9M tris) rebuilt by the asset workshop's make_card_tree.py into
 // ~4.1k tris (trunk + frond cards) plus a 4-triangle crossed billboard. Within LOD_NEAR metres a tree draws the full
 // model (wind, shadows); beyond it, the billboard. The split is recomputed a few times a second, not every frame.
 const LOD_NEAR=mobile?30:42,jacaranda={ready:false,wood:null,leaves:null,woodMaterial:null,leafMaterial:null,near:[],far:null,height:9,tints:[]};
 jacarandaSpots.forEach(t=>{t.bloom=random()<.5;jacaranda.tints.push(new T.Color().setHSL(.24+between(-.03,.03),.32+between(-.08,.08),.78+between(-.08,.08)));});
 const lilac=new T.Color(0xc9a6ff);
 const spotMatrices=jacarandaSpots.map(t=>matrix(t.x,t.z,t.s));
 const jacarandaReady=window.showroomAssets.model('/assets/flora/jacaranda.glb').then(gltf=>{
  gltf.scene.updateMatrixWorld(true);let woodMesh,leafMesh;
  gltf.scene.traverse(o=>{if(o.isMesh){if(/leaves/.test(o.name)||o.material.transparent||o.material.alphaTest)leafMesh=o;else woodMesh=o;}});
  const geometry=o=>o.geometry.clone().applyMatrix4(o.matrixWorld);
  jacaranda.wood=geometry(woodMesh);jacaranda.leaves=geometry(leafMesh);
  jacaranda.woodMaterial=new T.MeshStandardMaterial({map:woodMesh.material.map,roughness:.92});
  jacaranda.leafMaterial=windMaterial({map:leafMesh.material.map,alphaTest:.5,roughness:.78,emissive:0x23300f,emissiveIntensity:.12},{sway:.045,flutter:.02});
  const n=jacarandaSpots.length;
  const nearWood=new T.InstancedMesh(jacaranda.wood,jacaranda.woodMaterial,n),nearLeaves=new T.InstancedMesh(jacaranda.leaves,jacaranda.leafMaterial,n);
  jacaranda.near=[nearWood,nearLeaves];for(const m of jacaranda.near){m.count=0;shadowed(m,true);gardenMeshes.push(m);}
  leafMeshes.push(nearLeaves);
  // billboard: front view on a quad facing +Z (left half of the texture), side view on a quad facing +X (right half)
  const S=13.08,h=S/2,bb=new T.BufferGeometry(),up=[0,.82,.57];
  bb.setAttribute('position',new T.Float32BufferAttribute([-h,0,0, h,0,0, h,S,0, -h,S,0, 0,0,h, 0,0,-h, 0,S,-h, 0,S,h],3));
  bb.setAttribute('uv',new T.Float32BufferAttribute([0,0,.5,0,.5,1,0,1, .5,0,1,0,1,1,.5,1],2));
  bb.setAttribute('normal',new T.Float32BufferAttribute(Array(8).fill(up).flat(),3));bb.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);
  const bbMap=new T.TextureLoader().load('/assets/flora/jacaranda_billboard.png');bbMap.colorSpace=T.SRGBColorSpace;bbMap.anisotropy=4;
  jacaranda.far=new T.InstancedMesh(bb,new T.MeshStandardMaterial({map:bbMap,alphaTest:.5,side:T.DoubleSide,roughness:.85}),n);
  jacaranda.far.count=0;shadowed(jacaranda.far,false);gardenMeshes.push(jacaranda.far);
  // blossoms: every second frond card gets a purple blossom card, pushed slightly outward
  const lp=jacaranda.leaves.attributes.position,ln=jacaranda.leaves.attributes.normal,bp=[],bn=[],buv=[],bi=[],v=new T.Vector3(),centre=new T.Vector3();
  for(let card=0;card*4+3<lp.count;card+=2){
   centre.set(0,0,0);for(let k=0;k<4;k++)centre.add(v.fromBufferAttribute(lp,card*4+k));centre.multiplyScalar(.25);
   const o=bp.length/3;for(let k=0;k<4;k++){v.fromBufferAttribute(lp,card*4+k).sub(centre).multiplyScalar(.95).add(centre);const nx=ln.getX(card*4+k),ny=ln.getY(card*4+k),nz=ln.getZ(card*4+k);bp.push(v.x+nx*.1,v.y+ny*.1,v.z+nz*.1);bn.push(nx,ny,nz);}
   buv.push(0,0,1,0,1,1,0,1);bi.push(o,o+1,o+2,o,o+2,o+3);
  }
  const bloomGeo=new T.BufferGeometry();bloomGeo.setAttribute('position',new T.Float32BufferAttribute(bp,3));bloomGeo.setAttribute('normal',new T.Float32BufferAttribute(bn,3));bloomGeo.setAttribute('uv',new T.Float32BufferAttribute(buv,2));bloomGeo.setIndex(bi);
  const bloomMap=new T.TextureLoader().load('/assets/flora/jacaranda-blossom.png');bloomMap.colorSpace=T.SRGBColorSpace;bloomMap.anisotropy=4;
  jacaranda.bloom=new T.InstancedMesh(bloomGeo,windMaterial({map:bloomMap,alphaTest:.45,roughness:.7,emissive:0x2a1840,emissiveIntensity:.1},{sway:.045,flutter:.02}),n);
  jacaranda.bloom.count=0;shadowed(jacaranda.bloom,false);gardenMeshes.push(jacaranda.bloom);leafMeshes.push(jacaranda.bloom);
  jacaranda.ready=true;lastLod=null;
  // shrubs reuse the real frond texture
  for(const m of shrubMeshes)m.material=jacaranda.leafMaterial;
 }).catch(error=>console.warn('Jacaranda model unavailable',error));
 let lastLod=null;const lodAt=new T.Vector3();
 function updateLod(position){
  if(!jacaranda.ready)return;
  if(lastLod&&lodAt.distanceToSquared(position)<4)return;lodAt.copy(position);lastLod=true; // re-split after moving ~2 m
  const [wood,leaves]=jacaranda.near,far=jacaranda.far,bloom=jacaranda.bloom;let near=0,distant=0,blooming=0;const tmpTint=new T.Color();
  jacarandaSpots.forEach((t,i)=>{
   if(Math.hypot(t.x-position.x,t.z-position.z)<LOD_NEAR*(0.9+t.s*.1)){wood.setMatrixAt(near,spotMatrices[i]);leaves.setMatrixAt(near,spotMatrices[i]);leaves.setColorAt(near,jacaranda.tints[i]);near++;if(t.bloom)bloom.setMatrixAt(blooming++,spotMatrices[i]);}
   else{far.setMatrixAt(distant,spotMatrices[i]);far.setColorAt(distant,t.bloom?tmpTint.copy(jacaranda.tints[i]).lerp(lilac,.45):jacaranda.tints[i]);distant++;}
  });
  wood.count=leaves.count=near;far.count=distant;bloom.count=blooming;
  for(const m of [wood,leaves,far,bloom]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();}
 }
 // Ferns gather at tree bases.
 const fern=buildFern(),ferns=[];
 for(const [x,z] of trunks){if(Math.hypot(x,z)>48)continue;for(let k=0;k<4;k++){const a=between(0,6.28),r=between(.9,2.4),fx=x+Math.cos(a)*r,fz=z+Math.sin(a)*r;if(openGround(fx,fz))continue;ferns.push(matrix(fx,fz,between(.8,1.4),-.02));}}
 instance(fern,fernMaterial,ferns,ferns.map(tintFrom(.27,.45,.75)),false);

 // ---- flowers: photographic clumps (generated locally with SDXL, cut out) on crossed cards, in beds and drifts.
 // assets/flora/flowers.json lists each type's texture and aspect; one instanced draw per type, 4 triangles a clump.
 const flowerSpots=[],flowerMeshes=[];
 const pathEdge=z=>Math.sin((z-3)*.15)*1.5; // centreline of the main stepping-stone path (garden.js pathX)
 function flowerBed(cx,cz,radius,count,type){for(let k=0;k<count;k++){const a=between(0,6.28),r=Math.sqrt(random())*radius,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;if(!openGround(x,z))flowerSpots.push({x,z,type,s:between(.8,1.25)});}}
 // beds along both edges of the main path, alternating types in short runs
 for(let z=21,i=0;z>-4;z-=2.6,i++)for(const side of [-1,1])flowerBed(pathEdge(z)+side*2.05,z,.75,mobile?4:7,(i+(side>0?2:0))%5);
 // around the pond rim, the pavilion front and in loose drifts across the lawn
 for(let i=0;i<14;i++){const a=i/14*6.28;flowerBed(5.7+Math.cos(a)*5.1,3.5+Math.sin(a)*7,.7,mobile?3:5,i%5);}
 for(let x=-13.5;x<=-6.5;x+=1.4)flowerBed(x,5.4,.55,mobile?2:4,(Math.round(x)+9)%5);
 for(let i=0;i<(mobile?26:46);i++){const a=between(0,6.28),r=between(6,26);flowerBed(Math.cos(a)*r,Math.sin(a)*r+4,between(.8,1.6),mobile?6:10,Math.floor(random()*5));}
 const flowersReady=fetch('/assets/flora/flowers.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(manifest=>{
  if(!manifest)return;
  manifest.types.forEach((type,t)=>{
   const spots=flowerSpots.filter(f=>f.type===t%manifest.types.length);if(!spots.length)return;
   const w=type.height/type.aspect,h=type.height,g=new T.BufferGeometry(),p=[],uv=[],n=[],idx=[];
   for(let q=0;q<2;q++){const c=Math.cos(q*Math.PI/2)*w/2,s_=Math.sin(q*Math.PI/2)*w/2,o=p.length/3;
    p.push(-c,0,-s_, c,0,s_, c,h,s_, -c,h,-s_);uv.push(0,0,1,0,1,1,0,1);for(let k=0;k<4;k++)n.push(0,1,0);idx.push(o,o+1,o+2,o,o+2,o+3);}
   g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setIndex(idx);
   const map=new T.TextureLoader().load(type.url);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
   const material=windMaterial({map,alphaTest:.62,roughness:.8},{sway:.35,flutter:.008,keepNormals:false}); // high cutoff drops faint backdrop haze
   const mesh=instance(g,material,spots.map(f=>matrix(f.x,f.z,f.s,-.03)),spots.map(()=>new T.Color().setHSL(0,0,between(.9,1.05))),false);
   if(mesh)flowerMeshes.push(mesh);
  });
 }).catch(error=>console.warn('Flowers unavailable',error));

 // ---- shrubs, placed once the prop layout is known so none sit on a prop ----
 const shrubTemplates=[0,1,2].map(buildShrub),shrubMeshes=[];let shrubCount=0;
 const shrubsReady=fetch('/assets/props/scene.json',{cache:'no-store'}).then(r=>r.ok?r.json():{props:[]}).catch(()=>({props:[]})).then(sceneData=>{
  const keepOut=(sceneData.props||[]).flatMap(e=>(e.placements||[]).map(p=>[p.position[0],p.position[2],(e.radius||.4)*(p.scale||1)+1.1]));
  const spots=[];
  for(let i=0;i<(mobile?60:120)&&spots.length<(mobile?30:60);i++){
   const a=between(0,6.28),r=between(8,24),x=Math.cos(a)*r,z=Math.sin(a)*r+4;
   if(openGround(x,z)||blocked(x,z)||Math.abs(x-.9)<2.2&&z>-6&&z<22||keepOut.some(([px,pz,pr])=>Math.hypot(x-px,z-pz)<pr)||trunks.some(([tx,tz])=>Math.hypot(x-tx,z-tz)<2))continue;
   spots.push(matrix(x,z,between(.8,1.3),-.05));
  }
  shrubTemplates.forEach((g,v)=>{const mine=spots.filter((s,i)=>i%3===v),mesh=instance(g,jacaranda.ready?jacaranda.leafMaterial:leafMaterial,mine,mine.map(tintFrom(.27,.4,.62)));if(mesh){shrubMeshes.push(mesh);leafMeshes.push(mesh);}});
  shrubCount=spots.length;return spots.length;
 });

 return {
  ready:Promise.allSettled([shrubsReady,jacarandaReady]),
  get leaves(){return leafMeshes.filter(Boolean);},
  // Templates for other woodland (the night road streams its own instances of these).
  get forest(){return {trees:(jacaranda.ready?[{wood:jacaranda.wood,foliage:jacaranda.leaves,material:jacaranda.leafMaterial,woodMaterial:jacaranda.woodMaterial,height:jacaranda.height}]:[[forestTemplates[0],leafMaterial],[forestTemplates[1],leafMaterial]].map(([t,material])=>({wood:t.wood,foliage:t.foliage,material,height:t.height}))).concat([{wood:forestCypress.wood,foliage:forestCypress.foliage,material:cypressMaterial,height:forestCypress.height}]),fern:{geometry:fern,material:fernMaterial}};},
  update(t){time.value=t;},
  lod(position){updateLod(position);},
  // Hide the garden's own trees and ground cover (not the road woodland, which uses its own instances).
  setVisible(value){if(gardenMeshes[0]?.visible===value)return;for(const mesh of gardenMeshes)mesh.visible=value;},
  inspect:()=>({trees:{jacaranda:jacarandaSpots.length,jacarandaNear:jacaranda.near[0]?.count??0,cypress:cypresses.length,hero:1},ferns:ferns.length,flowers:flowerSpots.length,shrubs:shrubCount})
 };
};
