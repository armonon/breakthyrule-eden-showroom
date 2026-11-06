'use strict';
// Rocketbox characters (Microsoft, MIT): fixed, fully dressed people from assets/characters/, built on the rig names the
// procedural motion already uses. Meshes load on demand and are cached; the body sliders reshape a copy bone by bone,
// so clothes follow the body. The face and clothes are part of each character's textures and do not change.
(function(root){
 const BASE='/assets/characters/',VERSION=2;
 // tone: nearest match picks a character for a saved appearance made before the characters existed.
 const CATALOG={
  boulevard:{name:'Boulevard',tone:'#dfb393'},harbor:{name:'Harbor',tone:'#754630'},midnight:{name:'Midnight',tone:'#ba8564'},coast:{name:'Coast',tone:'#482d24'},
  riviera:{name:'Riviera',tone:'#f2d5bd'},marina:{name:'Marina',tone:'#dfb393'},garden:{name:'Garden',tone:'#ba8564'},sunset:{name:'Sunset',tone:'#9a6349'}
 };
 const DEFAULT='boulevard',meshes=new Map(),pending=new Map(),textureListeners=new Set();
 const clamp=(n,l,h)=>Math.max(l,Math.min(h,n));
 const rgb=hex=>[1,3,5].map(i=>parseInt(String(hex).slice(i,i+2),16)||0);
 function idFor(a){
  if(a&&Object.hasOwn(CATALOG,a.character))return a.character;
  if(!a?.skinTone)return DEFAULT;
  const c=rgb(a.skinTone);let best=DEFAULT,bestScore=Infinity;
  // Among equal tones the saved hips and shoulders choose, so old characters stay varied.
  for(const [id,entry] of Object.entries(CATALOG)){const t=rgb(entry.tone),feminine=['riviera','marina','garden','sunset'].includes(id),leaning=(a.hips||1)-(a.shoulders||1)>.05;
   const score=(c[0]-t[0])**2+(c[1]-t[1])**2+(c[2]-t[2])**2+(feminine===leaning?0:900);if(score<bestScore){bestScore=score;best=id;}}
  return best;
 }
 function decode(buffer){
  const headerLength=new DataView(buffer).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,headerLength)));
  let at=4+headerLength;const take=(Type,count)=>{const out=new Type(buffer,at,count);at+=out.byteLength;return out;};
  const n=header.vertices,tris=header.triangles*3,p=take(Int16Array,n*3),index=take(Uint16Array,tris),t=take(Uint16Array,n*2),no=take(Int8Array,n*4),joints=take(Uint8Array,n*4),w=take(Uint8Array,n*4);
  if(at!==buffer.byteLength)throw Error('Character file is damaged.');
  const position=new Float32Array(n*3),normal=new Float32Array(n*3),uv=new Float32Array(n*2),weights=new Float32Array(n*4),[u0,v0,u1,v1]=header.uv;
  for(let i=0;i<n;i++){for(let k=0;k<3;k++){position[i*3+k]=p[i*3+k]/16000;normal[i*3+k]=no[i*4+k]/127;}uv[i*2]=u0+t[i*2]/65535*(u1-u0);uv[i*2+1]=v0+t[i*2+1]/65535*(v1-v0);for(let k=0;k<4;k++)weights[i*4+k]=w[i*4+k]/255;}
  return {...header,position,normal,uv,index,joints,weights};
 }
 function load(id){
  if(meshes.has(id))return Promise.resolve(meshes.get(id));
  if(!pending.has(id))pending.set(id,fetch(BASE+id+'/mesh.bin?v='+VERSION,{signal:AbortSignal.timeout(60000)}).then(r=>{if(!r.ok)throw Error('Character could not load.');return r.arrayBuffer();}).then(buffer=>{const mesh=decode(buffer);meshes.set(id,mesh);pending.delete(id);return mesh;}).catch(error=>{pending.delete(id);throw error;}));
  return pending.get(id);
 }
 // Materials and textures are shared by everyone wearing the same character, across every renderer on the page.
 const sets=new Map();
 function materials(T,id,mesh){
  const key=id;if(sets.has(key))return sets.get(key);
  const loader=new T.TextureLoader(),map=(name,srgb=true)=>{const t=loader.load(BASE+id+'/'+name+'.webp?v='+VERSION,()=>{for(const listener of textureListeners)listener();});if(srgb)t.colorSpace=T.SRGBColorSpace;t.anisotropy=2;return t;};
  const make=(kind)=>{const extra=kind==='opacity'?{map:map('opacity'),alphaTest:.45,side:T.DoubleSide}:{map:map(kind),normalMap:map(kind+'-n',false)};const m=GardenCharacterDetails.material(T,'#ffffff',extra);m.userData.shared=true;m.name='Rocketbox '+kind;return m;};
  const set=Object.fromEntries([...new Set(mesh.sections.map(s=>s.material))].map(kind=>[kind,make(kind)]));sets.set(key,set);return set;
 }
 const CHAIN={root:'spine03',spine03:'spine02',spine02:'spine01',spine01:'neck01',neck01:'head'};
 for(const s of 'LR')Object.assign(CHAIN,{['upperarm01.'+s]:'lowerarm01.'+s,['lowerarm01.'+s]:'wrist.'+s,['upperleg01.'+s]:'lowerleg01.'+s,['lowerleg01.'+s]:'foot.'+s,['foot.'+s]:'toes.'+s});
 // The sliders as per-bone changes: torso bones widen about the spine, limbs thicken about their own axis, arms and legs
 // move with the shoulders and hips. Limits keep clothes and hands believable at the far ends of each slider.
 function shape(mesh,a){
  const num=(k,d=1)=>Number.isFinite(a?.[k])?a[k]:d,mass=clamp((num('weight',72)-72)/100,-.27,.6),build=clamp(num('build',.35),0,1)-.35;
  const hips=clamp(num('hips'),.8,1.35)-1,waist=clamp(num('waist'),.75,1.3)-1,shoulders=clamp(num('shoulders'),.8,1.3)-1,legs=clamp(num('legLength'),.9,1.1);
  const torso={root:[1+hips*.7+mass*.35,1+mass*.4],spine03:[1+waist*.8+mass*.5,1+mass*.6],spine02:[1+waist*.3+shoulders*.15+mass*.4,1+mass*.45],spine01:[1+shoulders*.35+mass*.22+build*.05,1+mass*.25+build*.06]};
  const armR=1+mass*.25+build*.12,armOut=shoulders*.18+mass*.03,legOut=hips*.09+mass*.02;
  const radial=n=>n.startsWith('upperarm')||n.startsWith('lowerarm')?armR:n.startsWith('upperleg')?1+mass*.35+build*.05:n.startsWith('lowerleg')?1+mass*.18+build*.04:n==='neck01'?1+mass*.15:1;
  const shift=n=>{const side=n.endsWith('.L')?1:n.endsWith('.R')?-1:0;if(!side)return 0;if(n.startsWith('clavicle'))return side*armOut*.5;if(/^(upperleg|lowerleg|foot|toes)/.test(n))return side*legOut;return side*armOut;};
  const index=Object.fromEntries(mesh.bones.map((b,i)=>[b.name,i])),info=mesh.bones.map(b=>({head:b.position,tail:CHAIN[b.name]?mesh.bones[index[CHAIN[b.name]]].position:null,torso:torso[b.name]||null,r:radial(b.name),dx:shift(b.name)}));
  const stretch=y=>y<mesh.hipY?y*legs:y+(legs-1)*mesh.hipY,fit=mesh.eyeY/stretch(mesh.eyeY);
  const finish=(out,i,x,y,z)=>{out[i]=x*fit;out[i+1]=stretch(y)*fit;out[i+2]=z*fit;};
  const joints=mesh.bones.map((b,i)=>{const o=[0,0,0];finish(o,0,b.position[0]+info[i].dx,b.position[1],b.position[2]);return o;});
  const plain=!mass&&!build&&!hips&&!waist&&!shoulders&&legs===1;
  if(plain)return {position:mesh.position,joints};
  const p=mesh.position,out=new Float32Array(p.length),J=mesh.joints,W=mesh.weights;
  for(let i=0,n=p.length/3;i<n;i++){
   const x=p[i*3],y=p[i*3+1],z=p[i*3+2];let px=0,py=0,pz=0;
   for(let k=0;k<4;k++){
    const w=W[i*4+k];if(!w)continue;const b=info[J[i*4+k]];let qx,qy=y,qz;
    if(b.torso){qx=x*b.torso[0];qz=b.head[2]+(z-b.head[2])*b.torso[1];}
    else if(b.tail&&b.r!==1){const [ax,ay,az]=b.head,dx=b.tail[0]-ax,dy=b.tail[1]-ay,dz=b.tail[2]-az,t=clamp(((x-ax)*dx+(y-ay)*dy+(z-az)*dz)/(dx*dx+dy*dy+dz*dz),0,1),cx=ax+dx*t,cy=ay+dy*t,cz=az+dz*t;qx=cx+(x-cx)*b.r;qy=cy+(y-cy)*b.r;qz=cz+(z-cz)*b.r;}
    else{qx=x;qz=z;}
    px+=w*(qx+b.dx);py+=w*qy;pz+=w*qz;
   }
   finish(out,i*3,px,py,pz);
  }
  return {position:out,joints};
 }
 // Build the people-parts under `group` and report what the motion layer and the model need.
 function build(T,id,a,group){
  const mesh=meshes.get(id),{position,joints}=shape(mesh,a);
  const bones=mesh.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;const j=joints[i],q=b.parent>=0?joints[b.parent]:[0,0,0];bone.position.set(j[0]-q[0],j[1]-q[1],j[2]-q[2]);return bone;});
  const parts=[];mesh.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else{group.add(bones[i]);parts.push(bones[i]);}});
  // Rest pose from the joints themselves, so a character swapped in while already placed or scaled in the world binds correctly.
  const skeleton=new T.Skeleton(bones,joints.map(j=>new T.Matrix4().makeTranslation(-j[0],-j[1],-j[2])));group.updateMatrixWorld(true);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(position,3));g.setAttribute('normal',new T.BufferAttribute(mesh.normal,3));g.setAttribute('uv',new T.BufferAttribute(mesh.uv,2));
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(mesh.joints,4));g.setAttribute('skinWeight',new T.BufferAttribute(mesh.weights,4));g.setIndex(new T.BufferAttribute(mesh.index,1));
  const set=materials(T,id,mesh),list=mesh.sections.map((s,i)=>{g.addGroup(s.start,s.count,i);return set[s.material];});
  const body=new T.SkinnedMesh(g,list);body.name='Character: '+id;body.frustumCulled=false;group.add(body);body.bind(skeleton,new T.Matrix4());parts.push(body);
  const mass=(Number.isFinite(a?.weight)?a.weight-72:0)/100;
  const blob=new T.Mesh(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),new T.MeshBasicMaterial({map:GardenCharacterDetails.blobTexture(T),transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}));
  blob.name='Blob shadow';blob.position.y=.006;blob.scale.set(.62+mass*.25,1,.42+mass*.2);blob.renderOrder=-1;group.add(blob);parts.push(blob);
  return {skeleton,byName:Object.fromEntries(bones.map(b=>[b.name,b])),parts};
 }
 root.GardenCharacterRocketbox={textureListeners,CATALOG,DEFAULT,idFor,load,build,loaded:id=>meshes.has(id),thumb:id=>BASE+id+'/thumb.webp?v='+VERSION};
})(typeof window==='object'?window:globalThis);
