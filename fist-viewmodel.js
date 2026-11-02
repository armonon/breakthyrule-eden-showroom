'use strict';
// First-person boxing arms built from the CC0 MakeHuman arm (assets/fp-arm.js): a real skinned hand
// and forearm with three bones per finger. Fingers hinge into a fist, a two-bone IK places the elbow,
// forearm twist is spread over both forearm bones, and the skin uses the same MakeHuman textures as
// the avatars, tinted to the visitor's skin tone. Punches are keyframed with anticipation, snap,
// overshoot and hit-stop; the torso twist is handed back to the camera.
(function(root){
 const ease={
  linear:t=>t,
  snap:t=>1-Math.pow(2,-10*t)*(1-t)**.4,
  out:t=>1-(1-t)**3,
  in:t=>t*t*t,
  inOut:t=>t<.5?4*t*t*t:1-(-2*t+2)**3/2
 };
 // Poses place the middle knuckle of the right hand in camera space: [x,y,z, rx,ry,rz] where the
 // fist's local -Z is the punching face, +Y the back of the hand and -X the thumb side.
 const GUARD={rear:[.145,-.11,-.35,.36,-.24,-1.38],lead:[.125,-.115,-.41,.32,-.16,-1.3]};
 const BLOCK=[.08,-.095,-.27,.95,-.32,-1.52];
 function moves(peak){
  return {
   jab:{twist:.03,keys:[[0,'guard'],[peak*.35,[.14,-.17,-.41,.26,-.12,-1.25],'out'],[peak,[.045,-.075,-.6,.04,.04,-.18],'snap'],[peak+.1,[.048,-.08,-.575,.06,.03,-.24],'out'],[1,'guard','inOut']]},
   cross:{twist:.075,keys:[[0,'guard'],[peak*.4,[.17,-.18,-.34,.28,-.3,-1.45],'out'],[peak,[.02,-.065,-.61,.04,.08,-.12],'snap'],[peak+.1,[.025,-.07,-.585,.07,.06,-.2],'out'],[1,'guard','inOut']]},
   power:{twist:.17,lean:.05,keys:[[0,'guard'],[peak*.5,[.27,-.12,-.38,.15,.65,-1.05],'out'],[peak*.82,[.17,-.05,-.52,.08,-.2,-1.4],'in'],[peak,[.0,-.045,-.56,.06,-.95,-1.5],'snap'],[peak+.14,[-.14,-.08,-.47,.02,-1.25,-1.4],'out'],[1,'guard','inOut']]}
  };
 }
 // Finger curl in radians per phalanx [proximal, middle, distal] and sideways squeeze toward the middle finger.
 const FIST={2:[1.42,1.62,1.0,-.05],3:[1.5,1.66,1.02,0],4:[1.56,1.66,1.0,.05],5:[1.62,1.6,.95,.11]};
 const THUMB=[[.62,.3,-.72],[.8,-.48,-.25],[.5,-.82,-.05]];
 const SCALE=1.12,SHOULDER=[.19,-.29,-.04];
 function createFistViewModel(T,camera,{reduced=false}={}){
  const data=window.GardenFirstPersonArm,rig=new T.Group();rig.name='First-person arms';camera.add(rig);
  const textures=new Map();
  function texture(file,color=true){let t=textures.get(file);if(!t){t=new T.TextureLoader().load('/assets/fp-arm/'+file);if(color)t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;textures.set(file,t);}return t;}
  const skin=new T.MeshPhysicalMaterial({roughness:.56,metalness:0,sheen:.22,sheenRoughness:.5,sheenColor:new T.Color(.85,.5,.45),clearcoat:.03,clearcoatRoughness:.6,normalMap:texture(data.normal,false),normalScale:new T.Vector2(.9,.9),fog:false,transparent:true,opacity:1});
  // Soft wrap lighting so the shadow side of the fist glows warm like skin instead of going grey.
  skin.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\n reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(.11,.045,.035);');};
  // The arms render last over a cleared depth buffer, so they never clip into walls or the jester.
  const depthReset=new T.Mesh(new T.PlaneGeometry(.001,.001),new T.MeshBasicMaterial({colorWrite:false,depthWrite:false,transparent:true}));
  depthReset.renderOrder=998;depthReset.frustumCulled=false;depthReset.position.z=-.2;depthReset.onBeforeRender=renderer=>renderer.clearDepth();rig.add(depthReset);
  // Shared geometry; normals are averaged across UV seams so the skin stays smooth.
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uvs,2));
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(data.skinIndex,4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(data.skinWeight,4));
  geometry.setIndex(data.indices);geometry.computeVertexNormals();
  {const p=geometry.attributes.position,n=geometry.attributes.normal,groups=new Map();
   for(let i=0;i<p.count;i++){const key=p.getX(i).toFixed(4)+','+p.getY(i).toFixed(4)+','+p.getZ(i).toFixed(4);(groups.get(key)||groups.set(key,[]).get(key)).push(i);}
   for(const list of groups.values()){if(list.length<2)continue;const s=new T.Vector3();for(const i of list)s.x+=n.getX(i),s.y+=n.getY(i),s.z+=n.getZ(i);s.normalize();for(const i of list)n.setXYZ(i,s.x,s.y,s.z);}}
  const V=a=>new T.Vector3(...a),byName=Object.fromEntries(data.bones.map((b,i)=>[b.name,{...b,index:i}]));
  const head=name=>V(byName[name+'.R'].head);
  // Rest hand frame from the skeleton: forward along the middle metacarpal, side toward the thumb.
  const wrist0=head('wrist'),knuckle0=head('finger3-1'),forward0=knuckle0.clone().sub(wrist0).normalize();
  const side0=head('finger2-1').sub(head('finger5-1'));side0.addScaledVector(forward0,-side0.dot(forward0)).normalize();
  const back0=new T.Vector3().crossVectors(forward0,side0).normalize();
  const restBasis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(side0.clone().negate(),back0,forward0.clone().negate()));
  const upperLength=head('lowerarm01').distanceTo(head('upperarm01')),foreLength=wrist0.distanceTo(head('lowerarm01'));
  const upperRest=head('lowerarm01').sub(head('upperarm01')).normalize(),foreRest=wrist0.clone().sub(head('lowerarm01')).normalize();
  // Per-bone hinge axes in rest space: rotate each finger bone toward the palm.
  const hinge={};
  for(const b of data.bones){
   const dir=V(b.tail).sub(V(b.head));if(dir.lengthSq()<1e-10)continue;dir.normalize();
   hinge[b.name]=new T.Vector3().crossVectors(dir,back0.clone().negate()).normalize();
  }
  const frameVector=([f,s,b])=>forward0.clone().multiplyScalar(f).addScaledVector(side0,s).addScaledVector(back0,b);
  const thumbRest=[1,2,3].map(i=>{const b=byName['finger1-'+i+'.R'];return V(b.tail).sub(V(b.head)).normalize();});
  // Fool's Wraps (an unlockable): violet tape over the wrist and knuckles, offset along the skin
  // normal and skinned to the same bones so it moves with every finger.
  const wrapMask=new Float32Array(geometry.attributes.position.count),wrapBand=new Float32Array(wrapMask.length);
  {const p=geometry.attributes.position,si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight,thumb=new Set([1,2,3].map(i=>byName['finger1-'+i+'.R'].index));
   const k2=head('finger2-1'),k5=head('finger5-1'),v=new T.Vector3(),line=k2.clone().sub(k5),lineLength=line.length();line.normalize();
   for(let i=0;i<p.count;i++){
    v.fromBufferAttribute(p,i);let thumbWeight=0;for(let j=0;j<4;j++)if(thumb.has(si.getComponent(i,j)))thumbWeight+=sw.getComponent(i,j);
    const along=v.clone().sub(wrist0).dot(forward0),wrist=along>-.075&&along<.03?1:0;
    const rel=v.clone().sub(k5),t=rel.dot(line),closest=k5.clone().addScaledVector(line,Math.max(-.006,Math.min(lineLength+.006,t)));
    const offset=v.clone().sub(closest),knuckle=offset.dot(forward0)>-.03&&offset.dot(forward0)<.004&&offset.length()<.03?1:0;
    wrapMask[i]=thumbWeight>.4?0:Math.max(wrist,knuckle);wrapBand[i]=wrist?along*90:t*120;
   }}
  geometry.setAttribute('wrapMask',new T.BufferAttribute(wrapMask,1));geometry.setAttribute('wrapBand',new T.BufferAttribute(wrapBand,1));
  const wrapMaterial=new T.MeshStandardMaterial({color:0x6b2ea3,roughness:.78,fog:false,transparent:true,opacity:1});
  wrapMaterial.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float wrapMask;attribute float wrapBand;varying float vWrapMask;varying float vWrapBand;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed+=objectNormal*.0032*wrapMask;vWrapMask=wrapMask;vWrapBand=wrapBand;');
   shader.fragmentShader='varying float vWrapMask;varying float vWrapBand;\n'+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n if(vWrapMask<.5)discard;float stripe=smoothstep(.42,.5,abs(fract(vWrapBand)-.5));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.93,.9,.84),stripe*.85);');
  };
  let wrapsOn=false;
  const arms=[];
  for(const side of [-1,1]){
   const holder=new T.Group();holder.scale.set(side*SCALE,SCALE,SCALE);rig.add(holder);
   const bones=data.bones.map(b=>{const bone=new T.Bone();bone.name=b.name;return bone;});
   data.bones.forEach((b,i)=>{const p=V(b.head);if(b.parent){const parent=byName[b.parent];p.sub(V(parent.head));bones[parent.index].add(bones[i]);}else holder.add(bones[i]);bones[i].position.copy(p);});
   const mesh=new T.SkinnedMesh(geometry,skin);mesh.frustumCulled=false;mesh.renderOrder=999;mesh.name=(side<0?'Left':'Right')+' arm';holder.add(mesh);
   holder.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);mesh.bind(skeleton,mesh.matrixWorld);
   const wraps=new T.SkinnedMesh(geometry,wrapMaterial);wraps.frustumCulled=false;wraps.renderOrder=1000;wraps.visible=false;holder.add(wraps);wraps.bind(skeleton,mesh.matrixWorld);
   arms.push({side,holder,mesh,wraps,bones:Object.fromEntries(bones.map(b=>[b.name.replace('.R',''),b])),pos:new T.Vector3(),rot:new T.Euler(),clench:.9});
  }
  const q=new T.Quaternion(),q2=new T.Quaternion();
  function twistAbout(rotation,axis){const r=new T.Vector3(rotation.x,rotation.y,rotation.z),p=axis.clone().multiplyScalar(r.dot(axis));const t=new T.Quaternion(p.x,p.y,p.z,rotation.w);return t.lengthSq()<1e-10?new T.Quaternion():t.normalize();}
  // All solving happens in the right-arm space of each holder (the left holder is mirrored).
  function solve(a){
   const B=a.bones;
   const k=1/SCALE,P=a.pos.clone().multiplyScalar(k),handQ=new T.Quaternion().setFromEuler(a.rot).multiply(restBasis.clone().invert());
   const S=new T.Vector3(...SHOULDER).multiplyScalar(k);
   const W=P.clone().sub(knuckle0.clone().sub(wrist0).applyQuaternion(handQ));
   const toW=W.clone().sub(S),d=Math.min(toW.length(),upperLength+foreLength-1e-4),dir=toW.normalize();
   const along=(upperLength**2-foreLength**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,upperLength**2-along*along));
   const pole=new T.Vector3(.7,-1,.25);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
   const E=S.clone().addScaledVector(dir,along).addScaledVector(pole,h),reach=S.clone().addScaledVector(dir,d);
   B.upperarm01.position.copy(S);
   const upperQ=new T.Quaternion().setFromUnitVectors(upperRest,E.clone().sub(S).normalize());
   const foreSwing=new T.Quaternion().setFromUnitVectors(foreRest,reach.clone().sub(E).normalize());
   // Spread the hand's roll along the forearm so the wrist never candy-wraps.
   const residual=foreSwing.clone().invert().multiply(handQ),twist=twistAbout(residual,foreRest);
   const fore1=foreSwing.clone().multiply(new T.Quaternion().slerp(twist,.35)),fore2=foreSwing.clone().multiply(new T.Quaternion().slerp(twist,.8));
   // Rest bones are axis-aligned, so each local rotation is parent⁻¹ · own rotation in holder space.
   let parent=new T.Quaternion();
   for(const [bone,world] of [[B.upperarm01,upperQ],[B.upperarm02,upperQ],[B.lowerarm01,fore1],[B.lowerarm02,fore2],[B.wrist,handQ]]){bone.quaternion.copy(parent.clone().invert().multiply(world));parent=world;}
   // Fist: metacarpals cup slightly, each phalanx hinges toward the palm, thumb wraps the front.
   const c=a.clench;
   for(let m=1;m<=4;m++){const name='metacarpal'+m;B[name].quaternion.setFromAxisAngle(hinge[name+'.R'],c*(m-1)*.06);}
   for(let f=2;f<=5;f++){const [p1,p2,p3,spread]=FIST[f];[p1,p2,p3].forEach((angle,i)=>{const name='finger'+f+'-'+(i+1),bone=B[name];bone.quaternion.setFromAxisAngle(hinge[name+'.R'],angle*c);if(i===0)bone.quaternion.premultiply(q.setFromAxisAngle(back0,spread*c));});}
   // Thumb segments are aimed (hand frame: forward, toward thumb, toward back) so the tip lands across
   // the curled index and middle fingers.
   let accumulated=new T.Quaternion();
   for(const [i,target] of THUMB.entries()){
    const name='finger1-'+(i+1),rest=thumbRest[i],aim=frameVector(target).lerp(rest,1-c).normalize();
    const local=new T.Quaternion().setFromUnitVectors(rest,aim.applyQuaternion(accumulated.clone().invert()));
    B[name].quaternion.copy(local);accumulated.multiply(local);
   }
  }
  function sample(keys,u,guard){
   const resolve=p=>p==='guard'?guard:p;
   for(let i=1;i<keys.length;i++){
    const [u1,p1,e]=keys[i];if(u<=u1||i===keys.length-1){const [u0,p0]=keys[i-1],k=Math.max(0,Math.min(1,(u-u0)/Math.max(1e-4,u1-u0))),w=(ease[e]||ease.inOut)(k),a=resolve(p0),b=resolve(p1);return a.map((v,j)=>v+(b[j]-v)*w);}
   }
   return guard;
  }
  let twist=0,lean=0,lunge=0,skinKey='';
  function update(t,dt,{show,blocking,attack,hurtAge=9,landedAge=9,leadHand=0}){
   rig.visible=show;if(!show){twist=lean=lunge=0;return;}
   const bounce=reduced?0:Math.sin(t*7.2),sway=reduced?0:Math.sin(t*3.6);
   let targetTwist=0,targetLean=0,targetLunge=0;
   for(const a of arms){
    const hand=a.side>0?1:0,role=hand===leadHand?'lead':'rear';
    let pose=GUARD[role].slice(),clench=.88;
    pose[1]+=bounce*.009+(role==='lead'?sway*.006:-sway*.004);pose[0]+=sway*.004;pose[5]+=bounce*.03;
    if(blocking){pose=BLOCK.slice();clench=1;}
    if(attack&&attack.hand===hand){
     const freeze=attack.freeze||0,elapsed=attack.elapsed<attack.impact?attack.elapsed:attack.elapsed<attack.impact+freeze?attack.impact:attack.elapsed-freeze;
     const u=Math.min(1,elapsed/attack.recover),peak=attack.impact/attack.recover,move=moves(peak)[attack.kind]||moves(peak).jab;
     pose=sample(move.keys,u,GUARD[role]);clench=.9+.1*Math.sin(Math.min(1,u/(peak+.1))*Math.PI);
     if(attack.missed&&u>peak*.9&&u<peak+.25){const k=Math.sin((u-peak*.9)/(.25+peak*.1)*Math.PI);pose[2]-=.06*k;pose[1]-=.03*k;}
     if(attack.landed&&elapsed>=attack.impact){const k=Math.exp(-(elapsed-attack.impact)*22);pose[2]+=.035*k;}
     const swing=Math.sin(Math.min(1,u/(peak+.15))*Math.PI);targetTwist+=move.twist*swing*(hand?1:-1);targetLean+=(move.lean||0)*swing;targetLunge+=.03*swing;
    }else if(attack){pose[2]+=.025;pose[0]-=.012;pose[3]+=.08;clench=1;}
    if(hurtAge<.35){const k=Math.sin(hurtAge/.35*Math.PI);pose[1]+=.035*k;pose[2]+=.07*k;pose[3]+=.25*k;}
    if(blocking&&hurtAge<.25){pose[0]+=Math.sin(t*90)*.004;pose[2]+=.03*(1-hurtAge/.25);}
    // Each holder is mirrored for the left arm, so poses stay in right-hand space.
    const k=attack&&attack.hand===hand?1-Math.exp(-60*dt):1-Math.exp(-18*dt);
    a.pos.x+=(pose[0]-a.pos.x)*k;a.pos.y+=(pose[1]-a.pos.y)*k;a.pos.z+=(pose[2]-a.pos.z)*k;
    a.rot.x+=(pose[3]-a.rot.x)*k;a.rot.y+=(pose[4]-a.rot.y)*k;a.rot.z+=(pose[5]-a.rot.z)*k;a.clench+=(clench-a.clench)*k;
    solve(a);
   }
   if(landedAge<.12)targetLunge+=.015;
   const s=1-Math.exp(-20*dt);twist+=(targetTwist-twist)*s;lean+=(targetLean-lean)*s;lunge+=(targetLunge-lunge)*s;
  }
  // Same texture choice and tint as the avatars: nearest light/medium/dark by brightness, then tinted.
  function setSkin(character){
   const c=typeof character==='string'?{skinTone:character}:character||{};
   const tone=new T.Color(c.skinTone||'#c68e6a'),age=(c.age??.3)<.4?'young':(c.age??.3)<.72?'middleage':'old',key=tone.getHexString()+age;
   if(key===skinKey)return;skinKey=key;
   const lum=x=>.2126*x.r+.7152*x.g+.0722*x.b,linear=m=>new T.Color().setRGB(...m,T.SRGBColorSpace);let best=null;
   for(const name of ['light','medium','dark']){const s=data.textures[name+'-'+age],d=Math.abs(lum(linear(s.mean))-lum(tone));if(!best||d<best.d)best={s,d};}
   const mean=linear(best.s.mean);skin.map=texture(best.s.file);
   skin.color.setRGB(...['r','g','b'].map(k=>Math.max(.4,Math.min(1.8,tone[k]/Math.max(.02,mean[k])))));skin.needsUpdate=true;
  }
  setSkin('#c68e6a');
  return {
   update,setSkin,
   setWraps(on){wrapsOn=!!on;for(const a of arms)a.wraps.visible=wrapsOn;},
   camera:()=>({yaw:reduced?0:twist,roll:reduced?0:-twist*.35,pitch:reduced?0:-lean,lunge:reduced?0:lunge}),
   inspect:()=>({visible:rig.visible,model:'makehuman-arm',wraps:wrapsOn,hands:arms.map(a=>({side:a.side,position:a.pos.toArray().map(v=>+v.toFixed(3)),clench:+a.clench.toFixed(2)}))})
  };
 }
 root.createFistViewModel=createFistViewModel;
})(typeof window==='object'?window:globalThis);
