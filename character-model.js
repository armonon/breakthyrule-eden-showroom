'use strict';
// One rigged human is shared by the creator and multiplayer. Schema keys stay stable.
window.GardenCharacter = {
 create(T,a,ghost=false){
  const root=new T.Group(),limbs=[];
  // PS2-era shading: simple per-light Lambert over painted textures and baked vertex light.
  const material=(color,extra={})=>GardenCharacterDetails.material(T,color,extra);
  if(ghost){
   const profile=new T.SplineCurve([[0,.32],[.29,.32],[.26,.6],[.23,1],[.23,1.25],[.18,1.48],[0,1.56]].map(p=>new T.Vector2(...p))).getPoints(64);
   for(const point of profile)point.x=Math.max(0,point.x);
   const body=new T.Mesh(new T.LatheGeometry(profile,16),material('#d6efec',{transparent:true,opacity:.62,emissive:'#86b6ba',emissiveIntensity:.25,depthWrite:false,side:T.DoubleSide}));body.scale.z=.85;root.add(body);
   const p=body.geometry.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)<.4)p.setY(i,p.getY(i)+Math.sin(Math.atan2(p.getX(i),p.getZ(i))*5)*.07);body.geometry.computeVertexNormals();
   const dark=material('#191b20');for(const side of [-1,1]){const eye=new T.Mesh(new T.SphereGeometry(1,8,6),dark);eye.position.set(side*.065,1.29,.18);eye.scale.set(.023,.036,.013);root.add(eye);}
   return {root,limbs,ghost:true,height:1.75,animate(t){body.position.y=Math.sin(t*1.8)*.035;}};
  }
  const data=window.GardenHumanBase;
  if(!data)throw new Error('The human model could not load. Reload to try again.');
  a={faceDefinition:.65,age:.2,lipFullness:1,browWeight:1,hairLength:1,hairVolume:1,eyewear:'none',...a};
  const clamp=(n,l=0,h=1)=>Math.max(l,Math.min(h,n));
  const smooth=(l,h,n)=>{const t=clamp((n-l)/(h-l));return t*t*(3-2*t);};
  const bell=(x,c,r)=>Math.exp(-(((x-c)/r)**2));
  const mass=(a.weight-72)/100,scale=1.75/(16.6589+8.65*(a.legLength-1));
  // Localized deformations retain the authored eyelids, lips, ears and hand topology.
  function morph(p){
   let [x,y,z]=p;const ax=Math.abs(x),side=Math.sign(x),head=smooth(5.65,6.5,y);
   const hip=bell(y,.5,1.9),waist=bell(y,2.1,1.25),chest=bell(y,4.5,1.65);
   const leg=1-smooth(.3,1.2,y),arm=smooth(1.35,2.1,ax)*(1-head);
   x*=1+(a.hips-1)*hip+(a.waist-1-.035)*waist+(a.shoulders-1+.08)*chest+mass*(.4*hip+.6*waist+.28*chest);
   z*=1+mass*(.48*hip+.75*waist+.3*chest)+(a.build-.35)*.1*chest;
   x-=side*.98*clamp((.5-y)/8)*leg;
   x+=side*(a.build-.35)*.13*arm;
   if(head){
    x*=1+a.faceDefinition*.12*bell(y,6.43,.34);
    z-=a.faceDefinition*.11*bell(ax,.48,.22)*bell(y,6.89,.2);
    z+=a.faceDefinition*.07*bell(y,7.47,.12)*smooth(.6,1.2,z);
    y-=a.age*.09*bell(y,6.78,.4)*bell(ax,.5,.27);
    x*=1+(a.faceWidth-1)*head;
    x*=1+(a.jawWidth-1)*bell(y,6.45,.45)*head+(a.cheekWidth-1)*bell(y,7.02,.37)*head;
    y+=(y-7.1)*(a.faceHeight-1)*head-(a.chinLength-1)*.32*bell(y,6.25,.3)*head;
    const front=smooth(.75,1.22,z),eye=bell(ax,.308,.22)*bell(p[1],7.285,.19)*front;
    x+=side*(a.eyeSpacing-1)*.308*eye;
    x+=side*(ax-.308)*(a.eyeSize-1)*eye;
    y+=(p[1]-7.285)*(a.eyeSize-1)*eye;
    y-=(p[1]-7.285)*.15*eye;
    const nose=bell(ax,0,.21)*bell(p[1],6.98,.32)*front;
    x*=1+(a.noseWidth-1)*nose;z+=(a.noseLength-1)*.38*nose;
    x*=1+(a.mouthWidth-1)*bell(p[1],6.58,.15)*front;
    y+=(p[1]-6.59)*(a.lipFullness-1)*bell(p[1],6.59,.14)*front;
    z+=(a.lipFullness-1)*.11*bell(p[1],6.59,.12)*front;
    y+=(a.browHeight-1)*.16*bell(p[1],7.48,.12)*front;
   }
   // Slightly oversized heads, hands and feet keep the silhouette readable at low resolution.
   const big=.08*smooth(5.7,6.25,p[1]);x*=1+big;y=5.9+(y-5.9)*(1+big);z=.12+(z-.12)*(1+big);
   const hand=.14*smooth(4.05,4.45,ax);x=side*4.3+(x-side*4.3)*(1+hand);y=2.45+(y-2.45)*(1+hand);z=1.7+(z-1.7)*(1+hand);
   const foot=.1*(1-smooth(-7.6,-7.2,p[1]));x=side*2.2+(x-side*2.2)*(1+foot);z=.25+(z-.25)*(1+foot);
   y+=8.1676+clamp(p[1]+8.1676,0,8.65)*(a.legLength-1);
   return [x*scale,y*scale,z*scale];
  }
  const positions=[];for(let i=0;i<data.positions.length;i+=3)positions.push(...morph(data.positions.slice(i,i+3)));
  const joints=data.bones.map(b=>new T.Vector3(...morph(b.position)));
  const bones=data.bones.map((b,i)=>{const bone=new T.Bone();bone.name=b.name;bone.position.copy(joints[i]);if(b.parent>=0)bone.position.sub(joints[b.parent]);return bone;});
  data.bones.forEach((b,i)=>{if(b.parent>=0)bones[b.parent].add(bones[i]);else root.add(bones[i]);});
  const skeleton=new T.Skeleton(bones);root.updateMatrixWorld(true);skeleton.calculateInverses();
  const byName=Object.fromEntries(bones.map(b=>[b.name,b]));
  const baseGeometry=new T.BufferGeometry();baseGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));baseGeometry.setIndex(data.body);baseGeometry.computeVertexNormals();
  const skin=material('#ffffff',{vertexColors:true,map:GardenCharacterDetails.faceTexture(T,a)}),hair=material(a.hairColor,{vertexColors:true}),lips=new T.Color(a.skinTone).lerp(new T.Color('#92504b'),.24);
  const shirt=material(a.shirtColor,{vertexColors:true}),pants=material(a.pantsColor,{vertexColors:true}),shoe=material('#ebe5da',{vertexColors:true});
  // Baked key light and occlusion in bind space, as vertex colours, so the figure reads even under flat light.
  const light=new T.Vector3(.3,.75,.6).normalize();
  const bake=(x,y,z,nx,ny,nz)=>(.74+.26*Math.max(0,nx*light.x+ny*light.y+nz*light.z))*(.8+.2*smooth(-8.2,3,y))
   *(1-.28*bell(y,6.05,.28)*smooth(.1,.8,z))*(1-.18*bell(Math.abs(x),1.45,.35)*bell(y,4.85,.5))*(1-.16*bell(x,0,.35)*bell(y,.2,.9));
  shirt.map=a.outfit==='resort'?GardenCharacterDetails.shirtTexture(T):GardenCharacterDetails.clothTexture(T,'shirt');pants.map=GardenCharacterDetails.clothTexture(T,'pants');
  shoe.map=GardenCharacterDetails.shoeTexture(T);
  const skinIndices=[];
  const at=i=>data.positions.slice(i*3,i*3+3);
  const armWeight=i=>data.weights.slice(i*4,i*4+4).reduce((s,w,k)=>s+w*([5,6,7,11,12,13].includes(data.indices[i*4+k])?1:0),0);
  for(let j=0;j<data.body.length;j+=3){const ids=data.body.slice(j,j+3),y=ids.reduce((s,i)=>s+at(i)[1]/3,0);if(y>.7)skinIndices.push(...ids);}
  // Clip polygons at hems/hairlines, interpolating skin weights at the new vertices.
  // Selecting whole triangles here would leave visibly saw-toothed borders.
  function clippedGeometry(source,regions){
   const out=new T.BufferGeometry(),arrays={position:[],normal:[],color:[],uv:[],skinIndex:[],skinWeight:[]};
   const read=i=>{const weights=new Map();for(let k=0;k<4;k++){const bone=data.indices[i*4+k];weights.set(bone,(weights.get(bone)||0)+data.weights[i*4+k]);}return {p:at(i),arm:armWeight(i),position:Array.from(source.attributes.position.array.slice(i*3,i*3+3)),normal:Array.from(source.attributes.normal.array.slice(i*3,i*3+3)),color:source.attributes.color?Array.from(source.attributes.color.array.slice(i*3,i*3+3)):[1,1,1],weights};};
   function mix(v,w,t){
    const result={arm:v.arm+(w.arm-v.arm)*t,weights:new Map()};
    for(const key of ['p','position','normal','color'])result[key]=v[key].map((n,i)=>n+(w[key][i]-n)*t);
    for(const [bone,weight] of v.weights)result.weights.set(bone,weight*(1-t));
    for(const [bone,weight] of w.weights)result.weights.set(bone,(result.weights.get(bone)||0)+weight*t);
    return result;
   }
   function clip(poly,distance){
    const result=[];
    for(let i=0;i<poly.length;i++){const v=poly[i],w=poly[(i+1)%poly.length],dv=distance(v),dw=distance(w);if(dv>=0)result.push(v);if((dv>=0)!==(dw>=0))result.push(mix(v,w,dv/(dv-dw)));}
    return result;
   }
   const cached=new Map(),vertex=i=>{if(!cached.has(i))cached.set(i,read(i));return cached.get(i);};
   for(const [mat,region] of regions.entries()){
    const start=arrays.position.length/3;
    for(let j=0;j<source.index.count;j+=3){
     let poly=[0,1,2].map(k=>vertex(source.index.array[j+k]));
     if(region.armCut&&poly.reduce((s,v)=>s+v.arm/3,0)>.4)poly=clip(poly,v=>a.outfit==='sleeveless'?1.7-Math.abs(v.p[0]):v.p[1]-(a.outfit==='longsleeve'?2.7:4.45));
     for(const filter of region.filters){poly=clip(poly,filter);if(poly.length<3)break;}
     const back=poly.reduce((s,v)=>s+v.normal[2],0)<0;
     for(let n=1;n<poly.length-1;n++)for(const v of [poly[0],poly[n],poly[n+1]]){
      for(const key of ['position','normal','color'])arrays[key].push(...v[key]);
      if(mat===1)arrays.uv.push((v.p[0]*.22+.5)*.5+(back?.5:0),(v.p[1]+7.3)/8.15);
      else if(mat===2)arrays.uv.push((Math.abs(v.p[0])-1.65)/1.15,(v.p[2]+.6)/2.7);
      else arrays.uv.push(v.p[0]*.37+.5,v.p[1]*.29);
      const w=[...v.weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=w.reduce((s,v)=>s+v[1],0)||1;
      for(let k=0;k<4;k++){arrays.skinIndex.push(w[k]?.[0]||0);arrays.skinWeight.push((w[k]?.[1]||0)/total);}
     }
    }
    out.addGroup(start,arrays.position.length/3-start,region.material??mat);
   }
   for(const [key,values] of Object.entries(arrays))out.setAttribute(key,key==='skinIndex'?new T.Uint16BufferAttribute(values,4):new T.Float32BufferAttribute(values,key==='skinWeight'?4:key==='uv'?2:3));
   return out;
  }
  function rigged(geometry,materials,name){
   if(!geometry.attributes.skinIndex){geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(data.indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(data.weights,4));}
   const mesh=new T.SkinnedMesh(geometry,materials);mesh.name=name;mesh.frustumCulled=false;root.add(mesh);mesh.bind(skeleton,new T.Matrix4());return mesh;
  }
  const skinGeometry=baseGeometry.clone();skinGeometry.setIndex(skinIndices);
  const faceUV=[];for(let i=0;i<positions.length/3;i++)faceUV.push(...GardenCharacterDetails.faceUV(...at(i)));skinGeometry.setAttribute('uv',new T.Float32BufferAttribute(faceUV,2));
  const colors=[],white=new T.Color('#ffffff'),skinColor=new T.Color(a.skinTone),lipTint=lips.clone();
  lipTint.r/=Math.max(.01,skinColor.r);lipTint.g/=Math.max(.01,skinColor.g);lipTint.b/=Math.max(.01,skinColor.b);
  const bn=baseGeometry.attributes.normal;
  for(let i=0;i<positions.length/3;i++){
   const [x,y,z]=at(i),mouth=bell(x,0,.24)*bell(y,6.59,.082)*smooth(1.3,1.48,z);
   const face=smooth(.65,1.1,z),eyeShadow=bell(Math.abs(x),.31,.22)*bell(y,7.37,.15)*face,cheek=bell(Math.abs(x),.52,.22)*bell(y,6.91,.21)*face;
   const ageLine=bell(Math.abs(x),.36,.08)*bell(y,6.71,.3)*face*a.age;
   const c=white.clone().lerp(lipTint,mouth*.95);c.multiplyScalar(1-.22*eyeShadow-.12*cheek*a.faceDefinition-.15*ageLine-.09*bell(y,6.83,.16)*bell(x,0,.12)*smooth(1.45,1.65,z));c.multiplyScalar(bake(x,y,z,bn.getX(i),bn.getY(i),bn.getZ(i)));colors.push(c.r,c.g,c.b);
  }
  skinGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));rigged(skinGeometry,skin,'Human skin');
  const clothGeometry=new T.BufferGeometry();clothGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));clothGeometry.setIndex(data.clothes);clothGeometry.computeVertexNormals();
  const cp=clothGeometry.attributes.position,cn=clothGeometry.attributes.normal,clothColors=[];
  for(let i=0;i<cp.count;i++){
   const [x,y,z]=at(i),arm=armWeight(i),isTop=y>.85;
   const amount=isTop?(a.outfit==='resort'?.034:.024):.018+.014*bell(y,-4.5,2.6);
   if(cn.getX(i)||cn.getY(i)||cn.getZ(i)){
    cp.setXYZ(i,cp.getX(i)+cn.getX(i)*amount,cp.getY(i)+cn.getY(i)*amount,cp.getZ(i)+cn.getZ(i)*amount);
    if(isTop&&arm<.4&&z>.5){const front=Math.max(cp.getZ(i),(.95+.08*Math.cos(y*1.5))*scale);cp.setZ(i,cp.getZ(i)+(front-cp.getZ(i))*(1-smooth(4.8,5.6,y)));}
   }
   const tension=bell(y,4.5,.55)*arm+bell(y,-4.3,.65)+bell(y,-7,.35);
   const crease=Math.sin(y*11+x*3+z*4)*tension;
   cp.setXYZ(i,cp.getX(i)+cn.getX(i)*crease*.003,cp.getY(i)+cn.getY(i)*crease*.003,cp.getZ(i)+cn.getZ(i)*crease*.003);
   const fold=(Math.sin(y*13+x*3)*.5+.5)*.025+Math.max(0,crease)*.11,edge=(Math.abs(y-.85)<.1||Math.abs(y+7.3)<.09)?.2:0;
   const seam=Math.abs(z)<.09&&y<.85?.16:0,sole=y<-7.96?.33:0;
   if(y<-7.3){cp.setY(i,Math.max(.007,cp.getY(i)));cp.setX(i,cp.getX(i)+Math.sign(x)*.003);}
   const laces=y<-7.3&&y>-7.91&&z>.4?(Math.cos(z*31)> .6?.3:0):0;
   const shoePanel=y<-7.3&&y>-7.98?.32*smooth(.15,.6,Math.abs(cn.getX(i))):0;
   const tone=(1-fold-edge-seam-sole-laces-shoePanel)*bake(x,y,z,cn.getX(i),cn.getY(i),cn.getZ(i));clothColors.push(tone,tone,tone);
  }
  clothGeometry.computeVertexNormals();clothGeometry.setAttribute('color',new T.Float32BufferAttribute(clothColors,3));
  const clothes=clippedGeometry(clothGeometry,[{armCut:true,filters:[v=>6.04-(a.outfit==='resort'?1.52:.42)*bell(v.p[0],0,a.outfit==='resort'?.46:.7)*smooth(.2,.8,v.p[2])-v.p[1],v=>v.p[1]-.85]},{filters:[v=>.85-v.p[1],v=>v.p[1]+7.3]},{filters:[v=>-7.3-v.p[1]]}]);
  rigged(clothes,[shirt,pants,shoe],'Continuous clothing');clothGeometry.dispose();
  // Hair follows the actual cranial topology instead of stacked ellipsoids.
  const hairGeometry=baseGeometry.clone();const hp=hairGeometry.attributes.position,hn=hairGeometry.attributes.normal;
  const hairColors=[];
  for(let i=0;i<hp.count;i++){
   const [x,y,z]=at(i),scalp=y>7.65;
   const loft=scalp?.003*a.hairVolume:.0018;
   hp.setXYZ(i,hp.getX(i)+hn.getX(i)*loft,hp.getY(i)+hn.getY(i)*loft,hp.getZ(i)+hn.getZ(i)*loft);
   const tone=bake(x,y,z,hn.getX(i),hn.getY(i),hn.getZ(i))*(.82+.18*smooth(7.2,8.4,y));hairColors.push(tone,tone,tone);
  }
  hairGeometry.computeVertexNormals();hairGeometry.setAttribute('color',new T.Float32BufferAttribute(hairColors,3));
  const hairRegions=[];
  if(a.hairStyle!=='none')hairRegions.push({material:0,filters:[v=>{const x=Math.abs(v.p[0]),line=7.07+smooth(.35,1.1,v.p[2])*.69+.08*x;return v.p[1]-(line+(Math.max(line,7.68)-line)*smooth(.68,.82,x));}]});
  hairRegions.push({material:0,filters:[v=>v.p[2]-1.12,v=>Math.abs(v.p[0])-.14,v=>.53-Math.abs(v.p[0]),v=>v.p[1]-7.475+.009*a.browWeight,v=>7.475+(.018+.024*Math.sin((Math.abs(v.p[0])-.14)/.39*Math.PI))*a.browWeight-v.p[1]]});
  if(a.facialHair==='beard')hairRegions.push({material:0,filters:[v=>v.p[1]-6.04,v=>6.72-v.p[1],v=>v.p[2]-.12,v=>Math.max(Math.abs(v.p[0])-.3,6.45-v.p[1])]});
  if(a.facialHair!=='none')hairRegions.push({material:0,filters:[v=>v.p[2]-1.37,v=>v.p[1]-6.71,v=>6.8-v.p[1],v=>.31-Math.abs(v.p[0])]});
  rigged(clippedGeometry(hairGeometry,hairRegions),hair,'Sculpted hair');hairGeometry.dispose();baseGeometry.dispose();
  const head=byName.head,headIndex=bones.indexOf(head);
  // Both eyeballs are one low-poly mesh with the iris painted into a tiny texture.
  const eyes=GardenCharacterDetails.merge(T,data.eyes.map(point=>{const center=new T.Vector3(...morph(point)).sub(joints[headIndex]),r=.0146*a.eyeSize*1.08;return new T.SphereGeometry(r,10,8).scale(1,.86,1).translate(center.x,center.y,center.z);}));
  const eyeMesh=new T.Mesh(eyes,material('#ffffff',{map:GardenCharacterDetails.eyeTexture(T,a)}));eyeMesh.name='Eyes';head.add(eyeMesh);
  // Blob shadow in place of a shadow-map pass, as era-typical and cheaper.
  const blob=new T.Mesh(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),new T.MeshBasicMaterial({map:GardenCharacterDetails.blobTexture(T),transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2}));
  blob.name='Blob shadow';blob.position.y=.006;blob.scale.set(.62+mass*.25,1,.42+mass*.2);blob.renderOrder=-1;root.add(blob);
  GardenCharacterDetails.add({T,a,morph,head,headOrigin:joints[headIndex],torso:byName.spine01,torsoOrigin:joints[bones.indexOf(byName.spine01)]});
  for(const side of ['L','R'])limbs.push(byName['upperleg01.'+side],byName['upperarm01.'+side]);
  root.scale.setScalar(a.height/175);root.userData.characterStyle='ps2-painted-human';
  // Procedural motion (character-motion.js) replaces the old fixed swing; animate() keeps its old signature.
  const model={root,limbs,ghost:false,height:a.height/100,skeleton,byName};
  model.motion=GardenCharacterMotion.create(T,model);model.animate=model.motion.animate;GardenCharacterMotion.bodies.add(model);
  model.animate(0);return model;
 },
 dispose(model){
  const geometries=new Set(),materials=new Set();model.root.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);});
  for(const g of geometries)g.dispose();for(const m of materials){m.map?.dispose();m.dispose();}model.skeleton?.dispose();model.root.removeFromParent();GardenCharacterMotion.bodies.delete(model);
 }
};
