'use strict';
/*
 * First-person arms and realistic weapon models for the Eden combat system.
 *
 * Assets (see models/combat/CREDITS.md):
 *   arms_tactical.glb (arms_military.glb refined by tools/combat/refine-arms.py)  Microsoft Rocketbox avatar arms (MIT)
 *   pistol.glb         Poly Haven "Service Pistol" (CC0)
 *   shotgun.glb        3D Model Haven Mossberg 500 (CC0)
 *   hatchet/           Poly Haven "Hatchet" (CC0)
 *
 * Weapon space: -Z is forward (muzzle), +Y up, origin near the firing hand.
 * The arms are driven every frame by two-bone IK: each wrist is placed on a grip
 * (position + finger direction + thumb direction in weapon space), elbows bend toward
 * a pole, and fingers curl around the grip.
 */
(function(root){
 const DEG=Math.PI/180;
 const FINGERS=['Index','Middle','Ring','Pinky'];
 const REACH=.2;

 // Grip definitions. pos = wrist position, fingers = wrist->knuckles direction,
 // thumb = thumb-side direction, curl = degrees per finger (or per joint), all in weapon space.
 const GRIPS={
  pistol:{
   mag:{pos:[-.03,-.075,.035],fingers:[.35,.8,-.45],thumb:[.85,-.15,.45],curl:[55,60,65,70],thumbCurl:[20,30,25]},
   right:{pos:[.024,.008,.076],fingers:[0,-.26,-.97],thumb:[0,.97,-.26],curl:[[20,35,25],70,75,80],thumbCurl:[10,25,20]},
   left:{pos:[-.042,-.002,.074],fingers:[.18,-.42,-.89],thumb:[.1,.89,-.43],curl:[60,65,70,75],thumbCurl:[10,15,15]}
  },
  pump:{
   shell:{pos:[-.025,-.07,.045],fingers:[.3,.75,-.6],thumb:[.1,.6,.8],curl:[45,55,65,75],thumbCurl:[25,35,30]},
   right:{pos:[.024,.072,.162],fingers:[0,-.6,-.8],thumb:[0,.8,-.6],curl:[[10,30,30],70,75,80],thumbCurl:[10,25,25]},
   left:{pos:[-.04,.048,-.45],fingers:[.94,.09,-.33],thumb:[-.25,.3,-.92],curl:[55,60,65,70],thumbCurl:[5,15,15]}
  },
  smg:{
   right:{pos:[.022,.1,.063],fingers:[0,-.633,-.774],thumb:[0,.774,-.633],curl:[[25,40,30],65,70,75],thumbCurl:[10,20,20]},
   left:{pos:[-.022,-.004,-.253],fingers:[0,-.1,-1],thumb:[0,1,-.1],curl:[60,65,70,75],thumbCurl:[10,20,20]}
  },
  rifle:{
   right:{pos:[.022,.035,.12],fingers:[0,-.29,-.96],thumb:[0,.96,-.29],curl:[[25,40,30],65,70,75],thumbCurl:[10,20,20]},
   left:{pos:[-.045,.035,-.21],fingers:[.94,.09,-.33],thumb:[-.25,.3,-.92],curl:[50,55,60,65],thumbCurl:[5,10,10]}
  },
  sniper:{
   right:{pos:[.022,.099,.136],fingers:[0,-.6,-.8],thumb:[0,.8,-.6],curl:[[10,30,30],65,70,75],thumbCurl:[10,20,20]},
   left:{pos:[-.045,.04,-.28],fingers:[.94,.09,-.33],thumb:[-.25,.3,-.92],curl:[50,55,60,65],thumbCurl:[5,10,10]},
   bolt:{pos:[.06,.11,.03],fingers:[-.2,-.3,-.93],thumb:[-.3,.9,-.2],curl:[60,70,75,80],thumbCurl:[20,30,30]}
  },
  axe:{
   right:{pos:[.0,-.02,.085],fingers:[0,-.05,-1],thumb:[0,1,0],curl:[85,90,90,90],thumbCurl:[30,45,30]},
   left:null
  },
  c4:{
   right:{pos:[.05,-.06,.07],fingers:[-.2,.35,-.92],thumb:[-.8,.5,.2],curl:[40,45,50,55],thumbCurl:[0,15,10]},
   left:null,
   remote:{pos:[-.004,-.075,.03],fingers:[0,.9,-.4],thumb:[.9,0,.2],curl:[70,75,80,85],thumbCurl:[0,10,5]}
  }
 };


 // Cloth and leather that hold up at arm's length: the scan's camouflage is dyed dark, its folds kept, and a weave (sleeves)
 // or grain (gloves) is laid over it, both fading out with distance before they can shimmer.
 function dress(material){
  const own=material.onBeforeCompile;material.roughness=1;material.metalness=0;material.normalScale?.setScalar(.8);
  material.onBeforeCompile=(sh,r)=>{own?.call(material,sh,r);
   sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
   float armH=0.,armGlove=0.;float armHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
   float armNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(armHash(i),armHash(i+vec2(1.,0.)),f.x),mix(armHash(i+vec2(0.,1.)),armHash(i+1.),f.x),f.y);}`)
   .replace('#include <map_fragment>',`#include <map_fragment>
   {float l=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)),bare=smoothstep(.12,.3,diffuseColor.r-diffuseColor.b),skin=0.;l*=mix(1.,.45,bare); /* the sleeves run to the gloves: a bare forearm is dyed as cloth too */armGlove=smoothstep(.69,.71,vMapUv.y);
    vec2 t=vMapUv*760.;float fade=1.-smoothstep(.25,.8,max(fwidth(t.x),fwidth(t.y)));
    float twill=abs(fract((t.x+t.y)*.5)-.5)*2.,cross=abs(fract(t.x-t.y*.5)-.5)*2.;float weave=mix(twill,cross,.3);
    vec2 g=vMapUv*420.;float grain=armNoise(g)*.6+armNoise(g*2.3)*.4,gf=1.-smoothstep(.4,1.2,max(fwidth(g.x),fwidth(g.y)));
    float broad=armNoise(vMapUv*22.)*.6+armNoise(vMapUv*61.)*.4;
    vec3 cloth=mix(vec3(.044,.048,.046),vec3(.100,.104,.096),clamp(l*2.4,0.,1.))*(.72+.55*broad)*(1.-.35*fade*(1.-weave));
    vec3 leather=mix(vec3(.018,.018,.020),vec3(.070,.068,.066),clamp(l*3.2,0.,1.))*(.75+.5*broad)*(1.-.3*gf*(1.-grain));
    diffuseColor.rgb=mix(mix(cloth,leather,armGlove),diffuseColor.rgb,skin);
    armH=mix(weave*fade*.00012,grain*gf*.0002,armGlove)*(1.-skin);}`)
   .replace('#include <roughnessmap_fragment>',`float roughnessFactor=mix(.94,.62,armGlove)-.12*armGlove*smoothstep(.3,.7,armNoise(vMapUv*90.));`)
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   {vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);vec3 r1=cross(sy,normal),r2=cross(normal,sx);float det=dot(sx,r1)*faceDirection;vec3 gr=sign(det)*(dFdx(armH)*r1+dFdy(armH)*r2);normal=normalize(abs(det)*normal-gr*.8);}`);};
  material.customProgramCacheKey=()=>'arms-cloth-3';material.needsUpdate=true;
 }
 // Gun steel: blued rather than bare, so a grey scan stops glowing at night; the scan's bright edges stay as worn metal.
 const STEEL=`#include <map_fragment>
  {float l=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722)),grey=1.-smoothstep(.02,.10,max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b)-min(min(diffuseColor.r,diffuseColor.g),diffuseColor.b));
   float worn=smoothstep(.34,.62,l);diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(l)*vec3(.54,.55,.58),vec3(l)*.8,worn),grey);}`;
 function createCombatArms(T,{env,base='/models/combat/'}={}){
  const v=(a)=>new T.Vector3().fromArray(a);
  const tmpM=new T.Matrix4(),tmpQ=new T.Quaternion(),tmpQ2=new T.Quaternion();
  const zAxis=new T.Vector3(0,0,1);
  function basisQ(x,y,out=new T.Quaternion()){const X=x.clone().normalize(),Z=new T.Vector3().crossVectors(X,y).normalize(),Y=new T.Vector3().crossVectors(Z,X);tmpM.makeBasis(X,Y,Z);return out.setFromRotationMatrix(tmpM);}
  function setWorldQ(bone,q){bone.parent.getWorldQuaternion(tmpQ).invert();bone.quaternion.copy(tmpQ.multiply(q));bone.updateMatrixWorld(true);}
  // minRough keeps near-mirror texels from blowing out to white under direct sun.
  function prep(scene,{metalBoost=1,minRough=0}={}){scene.traverse(o=>{if(!o.isMesh)return;o.castShadow=false;o.frustumCulled=false;const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(env){m.envMap=env;m.envMapIntensity=metalBoost;}
   if(minRough&&m.roughnessMap){m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',STEEL);sh.fragmentShader=sh.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n\troughnessFactor = max( roughnessFactor, '+minRough.toFixed(2)+' );');};m.customProgramCacheKey=()=>'steel1minRough'+minRough;}
   m.needsUpdate=true;}});return scene;}

  /* ---------------- arms */
  let arms=null;
  function setupArms(gltf){
   const group=new T.Group();group.name='First-person arms';
   const scene=prep(gltf.scene,{metalBoost:.6});scene.traverse(q=>{if(q.isMesh)for(const m of [].concat(q.material))dress(m);});
   // Model faces +Z with its right arm on -X: turn it to face the view (-Z) and drop the shoulders below the eye.
   scene.rotation.y=Math.PI;scene.position.set(0,-.25,.11);group.add(scene);
   group.updateMatrixWorld(true);
   let skinned=null;scene.traverse(o=>{if(o.isSkinnedMesh)skinned=o;});
   const bone=n=>skinned.skeleton.bones.find(b=>b.name===T.PropertyBinding.sanitizeNodeName(n));
   const sides={};
   for(const s of ['R','L']){
    const upper=bone('UpperArm.'+s),lower=bone('LowerArm.'+s),wrist=bone('Wrist.'+s);
    const P=b=>b.getWorldPosition(new T.Vector3());
    const pu=P(upper),pl=P(lower),pw=P(wrist),pm=P(bone('Middle1.'+s));
    const uDir=pl.clone().sub(pu).normalize(),lDir=pw.clone().sub(pl).normalize();
    let bend=new T.Vector3().crossVectors(uDir,lDir);if(bend.lengthSq()<1e-6)bend.set(0,1,0);bend.normalize();
    const wq=wrist.getWorldQuaternion(new T.Quaternion());
    const fDir=pm.clone().sub(pw).normalize();
    const tDir=new T.Vector3(0,0,s==='R'?1:-1).applyQuaternion(wq);tDir.addScaledVector(fDir,-tDir.dot(fDir)).normalize();
    sides[s]={s,upper,lower,wrist,a:pu.distanceTo(pl),b:pl.distanceTo(pw),
     // q_world = targetBasis * inverse(bindBasis) * bindWorld; keep the last two factors.
     upperBindInv:basisQ(uDir,bend).invert().multiply(upper.getWorldQuaternion(new T.Quaternion())),
     lowerBindInv:basisQ(lDir,bend).invert().multiply(lower.getWorldQuaternion(new T.Quaternion())),
     wristBindInv:basisQ(fDir,tDir).invert().multiply(wq),
     fingers:FINGERS.map(f=>[1,2,3].map(i=>bone(f+i+'.'+s)).filter(Boolean)),
     thumb:[1,2,3].map(i=>bone('Thumb'+i+'.'+s)).filter(Boolean),
     pole:new T.Vector3(s==='R'?.9:-.9,-1.3,.35).normalize()};
    for(const b of [...sides[s].fingers.flat(),...sides[s].thumb])b.userData.rest=b.quaternion.clone();
    upper.userData.restPos=upper.position.clone();
   }
   arms={group,sides,skinned};return arms;
  }

  const shoulder=new T.Vector3(),wristT=new T.Vector3(),elbow=new T.Vector3(),u=new T.Vector3(),pp=new T.Vector3(),fT=new T.Vector3(),tT=new T.Vector3(),n=new T.Vector3(),qT=new T.Quaternion();
  function solveSide(side,grip,weapon,away=0,awayOffset=null){
   weapon.updateMatrixWorld(true);const wq=weapon.getWorldQuaternion(new T.Quaternion());
   side.upper.position.copy(side.upper.userData.restPos);side.upper.updateMatrixWorld(true);side.upper.getWorldPosition(shoulder);
   if(grip){
    wristT.fromArray(grip.pos).applyMatrix4(weapon.matrixWorld);
    fT.fromArray(grip.fingers).applyQuaternion(wq).normalize();tT.fromArray(grip.thumb).applyQuaternion(wq);
    if(away>0&&awayOffset){wristT.lerp(awayOffset,away);}
   }else{
    // No grip: let the arm hang out of view.
    wristT.set(side.s==='R'?.32:-.32,-.75,.05);fT.set(0,-1,-.2).normalize();tT.set(side.s==='R'?-1:1,0,0);
   }
   tT.addScaledVector(fT,-tT.dot(fT)).normalize();
   const a=side.a,b=side.b;u.subVectors(wristT,shoulder);let d=u.length();u.normalize();
   // Shoulder reach (scapula protraction): move the shoulder toward a grip the straight arm can't reach.
   const over=d-(a+b)*.97;if(over>0){const move=Math.min(over,REACH);shoulder.addScaledVector(u,move);d-=move;side.upper.position.copy(side.upper.parent.worldToLocal(shoulder.clone()));side.upper.updateMatrixWorld(true);}
   d=Math.min(d,(a+b)*.999);d=Math.max(d,Math.abs(a-b)+1e-3);
   const cosA=(a*a+d*d-b*b)/(2*a*d),sinA=Math.sqrt(Math.max(0,1-cosA*cosA));
   pp.copy(side.pole).addScaledVector(u,-side.pole.dot(u)).normalize();
   elbow.copy(shoulder).addScaledVector(u,a*cosA).addScaledVector(pp,a*sinA);
   const wristReached=shoulder.clone().addScaledVector(u,d);
   const ud=elbow.clone().sub(shoulder).normalize(),ld=wristReached.clone().sub(elbow).normalize();
   n.crossVectors(ud,ld);if(n.lengthSq()<1e-8)n.copy(pp).cross(u);n.normalize();
   setWorldQ(side.upper,basisQ(ud,n,qT).multiply(side.upperBindInv));
   setWorldQ(side.lower,basisQ(ld,n,qT).multiply(side.lowerBindInv));
   setWorldQ(side.wrist,basisQ(fT,tT,qT).multiply(side.wristBindInv));
   // Fingers
   const curl=grip?.curl||[15,18,20,22],tc=grip?.thumbCurl||[5,8,8];
   side.fingers.forEach((chain,i)=>{const c=curl[i]??curl[curl.length-1];chain.forEach((bn,j)=>{const deg=Array.isArray(c)?c[j]??c[c.length-1]:c;bn.quaternion.copy(bn.userData.rest).multiply(tmpQ2.setFromAxisAngle(zAxis,deg*DEG));});});
   side.thumb.forEach((bn,j)=>bn.quaternion.copy(bn.userData.rest).multiply(tmpQ2.setFromAxisAngle(zAxis,(tc[j]??0)*DEG)));
  }

  /* ---------------- weapons */
  const weapons={};
  function marker(parent,pos){const o=new T.Object3D();o.position.fromArray(pos);parent.add(o);return o;}
  function setupPistol(gltf){
   const g=new T.Group();g.name='Service pistol';const scene=prep(gltf.scene,{metalBoost:.6,minRough:.35});
   // Split the slide (everything above the frame) into its own mesh so it can cycle.
   let src=null;scene.traverse(o=>{if(o.isMesh&&!src)src=o;});
   const slide=new T.Group();g.add(scene);g.add(slide);
   if(src){
    const geo=src.geometry.index?src.geometry.toNonIndexed():src.geometry.clone();const pos=geo.attributes.position,count=pos.count/3;
    const keep=[],move=[];for(let t=0;t<count;t++){const y=(pos.getY(t*3)+pos.getY(t*3+1)+pos.getY(t*3+2))/3,z=(pos.getZ(t*3)+pos.getZ(t*3+1)+pos.getZ(t*3+2))/3;(y>.047&&z<.05?move:keep).push(t);}
    const pick=list=>{const out=new T.BufferGeometry();for(const name in geo.attributes){const at=geo.attributes[name],arr=new at.array.constructor(list.length*3*at.itemSize);list.forEach((t,i)=>{for(let k=0;k<3;k++)for(let c=0;c<at.itemSize;c++)arr[(i*3+k)*at.itemSize+c]=at.array[(t*3+k)*at.itemSize+c];});out.setAttribute(name,new T.BufferAttribute(arr,at.itemSize,at.normalized));}return out;};
    if(move.length&&keep.length){src.geometry=pick(keep);const sm=new T.Mesh(pick(move),src.material);sm.frustumCulled=false;src.updateMatrixWorld(true);sm.applyMatrix4(src.matrixWorld);slide.add(sm);}
   }
   weapons.pistol={model:g,parts:{slide,muzzle:marker(slide,[0,.068,-.178]),ejector:marker(g,[.012,.07,-.02]),sight:marker(g,[0,.086,-.03])}};
  }
  function setupPump(gltf){
   const g=new T.Group();g.name='Pump shotgun';const scene=prep(gltf.scene,{metalBoost:.22,minRough:.55});g.add(scene);
   // Darker blued/parkerized finish on the steel parts (the source texture is a light satin grey).
   scene.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material))if(m.name==='Mossberg500'||m.name==='MagazineTube')m.color.setScalar(.5);});
   const fore=new T.Group();g.add(fore);
   const forend=[];scene.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material[0]:o.material)?.name==='Forend')forend.push(o);});
   forend.forEach(m=>fore.attach(m));
   weapons.pump={model:g,parts:{fore,muzzle:marker(g,[0,.1,-.645]),ejector:marker(g,[.02,.1,.02]),sight:marker(g,[0,.132,-.12]),port:marker(g,[0,.04,.02])}};
  }
  // Generic long guns (CC0, see models/combat/CREDITS.md): weapon space, -Z forward, origin at the firing hand.
  const GUN_POINTS={
   smg:{muzzle:[0,.1,-.445],sight:[0,.225,-.136],ejector:[.02,.13,-.05]},
   rifle:{muzzle:[0,.102,-.56],sight:[0,.152,-.15],ejector:[.02,.11,-.05]},
   sniper:{muzzle:[0,.1,-.892],sight:[-.007,.135,-.04],ejector:[.02,.11,.0]}
  };
  function setupGun(id,gltf){
   const g=new T.Group();g.name=id;const scene=prep(gltf.scene,{metalBoost:.45,minRough:.4});g.add(scene);const P=GUN_POINTS[id];
   weapons[id]={model:g,parts:{muzzle:marker(g,P.muzzle),sight:marker(g,P.sight),ejector:marker(g,P.ejector)}};
  }
  function setupAxe(gltf){
   const g=new T.Group();g.name='Hatchet';const scene=prep(gltf.scene,{metalBoost:1});
   // Handle along +Y, bit toward +Z: turn the bit forward and lean the head away from the view.
   const pivot=new T.Group();pivot.add(scene);scene.rotation.y=Math.PI;scene.position.set(0,.03,0);g.add(pivot);
   weapons.axe={model:g,parts:{blade:marker(scene,[0,.2,.06])}};
  }

  // Variant guns (models/combat/variants, CC0, see models/combat/CREDITS.md), already in weapon space.
  // v: {file, points:{muzzle, sight, ejector?}, metal?, rough?}. Pistols get a slide group (meshes named Slide*),
  // pumps a fore-end group (meshes named *Fore*), so the class's actions and grips keep working.
  const variantLoads={};
  function loadVariant(cls,v){
   return variantLoads[v.file]||(variantLoads[v.file]=window.showroomAssets.model(base+'variants/'+v.file).then(gltf=>{
    const g=new T.Group();g.name=v.file;const scene=prep(gltf.scene,{metalBoost:v.metal??.5,minRough:v.rough??.4});g.add(scene);g.updateMatrixWorld(true);
    const find=re=>{const out=[];scene.traverse(o=>{if(o.isMesh&&re.test(o.name))out.push(o);});return out;};
    const P=v.points,parts={sight:marker(g,P.sight),ejector:marker(g,P.ejector||[.015,P.sight[1]-.03,-.02])};
    if(cls==='pistol'){const slide=new T.Group();g.add(slide);find(/^slide/i).forEach(m=>slide.attach(m));parts.slide=slide;parts.muzzle=marker(slide,P.muzzle);}
    else parts.muzzle=marker(g,P.muzzle);
    if(cls==='pump'){const fore=new T.Group();g.add(fore);find(/fore/i).forEach(m=>fore.attach(m));parts.fore=fore;parts.port=marker(g,[0,.04,.02]);}
    return {model:g,parts};
   }));
  }

  const ready=(async()=>{
   const load=url=>window.showroomAssets.model(base+url);
   const [a,p,s,h,smg,rifle,sniper]=await Promise.allSettled([load(root.edenRenderProfile?.().mobile?'arms_tactical_lite.glb':'arms_tactical.glb'),load('pistol.glb'),load('shotgun.glb'),load('hatchet/hatchet_1k.gltf'),load('smg.glb'),load('rifle_ak.glb'),load('sniper.glb')]);
   for(const [id,r] of [['smg',smg],['rifle',rifle],['sniper',sniper]])if(r.status==='fulfilled')setupGun(id,r.value);
   if(a.status==='fulfilled')setupArms(a.value);else console.warn('Combat arms unavailable',a.reason);
   if(p.status==='fulfilled')setupPistol(p.value);
   if(s.status==='fulfilled')setupPump(s.value);
   if(h.status==='fulfilled')setupAxe(h.value);
   return {arms:!!arms,weapons:Object.keys(weapons)};
  })();

  return {
   ready,weapons,grips:GRIPS,loadVariant,
   gripPos(grip,space,out=new T.Vector3()){space.updateMatrixWorld(true);return out.fromArray(grip.pos).applyMatrix4(space.matrixWorld);},
   get arms(){return arms;},
   /** weapon: Object3D whose matrixWorld is weapon space in view space. overrides: {left:{away,offset}} */
   pose(id,weapon,{leftAway=0,leftOffset=null,rightAway=0,rightOffset=null,leftGrip,rightGrip,leftSpace,rightSpace}={}){
    if(!arms)return;const g=GRIPS[id]||{};arms.group.updateMatrixWorld(true);
    solveSide(arms.sides.R,rightGrip===undefined?g.right:rightGrip,rightSpace||weapon,rightAway,rightOffset);
    solveSide(arms.sides.L,leftGrip===undefined?g.left:leftGrip,leftSpace||weapon,leftAway,leftOffset);
   }
  };
 }
 root.createCombatArms=createCombatArms;
})(window);
