'use strict';
// First-person boxing arms. Each hand is modelled as a wrapped fist (curled fingers, thumb across
// the front, tape over the knuckles) on a two-bone arm solved from a shoulder anchor, so the elbow
// bends and the forearm extends naturally. Punches are keyframed with anticipation, a snap out,
// overshoot and a hit-stop, and the torso twist is handed back to the camera.
(function(root){
 const ease={
  linear:t=>t,
  snap:t=>1-Math.pow(2,-10*t)*(1-t)**.4,
  out:t=>1-(1-t)**3,
  in:t=>t*t*t,
  inOut:t=>t<.5?4*t*t*t:1-(-2*t+2)**3/2,
  back:t=>{const c=1.9;return 1+(c+1)*(t-1)**3+c*(t-1)**2;}
 };
 // Poses are for the right hand in camera space: [x,y,z, rx,ry,rz]. The left hand mirrors them.
 const GUARD={rear:[.15,-.125,-.4,.36,-.24,-1.38],lead:[.13,-.135,-.46,.32,-.16,-1.3]};
 const BLOCK=[.085,-.105,-.3,.95,-.32,-1.52];
 // Keys: [u, pose, easing into this key]; u is 0..1 over the move with `peak` marking impact.
 function moves(peak){
  return {
   jab:{twist:.03,keys:[[0,'guard'],[peak*.35,[.14,-.17,-.41,.26,-.12,-1.25],'out'],[peak,[.045,-.075,-.6,.04,.04,-.18],'snap'],[peak+.1,[.048,-.08,-.575,.06,.03,-.24],'out'],[1,'guard','inOut']]},
   cross:{twist:.075,keys:[[0,'guard'],[peak*.4,[.17,-.18,-.34,.28,-.3,-1.45],'out'],[peak,[.02,-.065,-.61,.04,.08,-.12],'snap'],[peak+.1,[.025,-.07,-.585,.07,.06,-.2],'out'],[1,'guard','inOut']]},
   power:{twist:.17,lean:.05,keys:[[0,'guard'],[peak*.5,[.27,-.12,-.38,.15,.65,-1.05],'out'],[peak*.82,[.17,-.05,-.52,.08,-.2,-1.4],'in'],[peak,[.0,-.045,-.56,.06,-.95,-1.5],'snap'],[peak+.14,[-.14,-.08,-.47,.02,-1.25,-1.4],'out'],[1,'guard','inOut']]}
  };
 }
 function createFistViewModel(T,camera,{reduced=false}={}){
  const rig=new T.Group();rig.name='First-person arms';camera.add(rig);
  const material=(color,rough,extra={})=>new T.MeshStandardMaterial({color,roughness:rough,fog:false,transparent:true,opacity:1,...extra});
  const skin=material(0xc89270,.58),wrap=material(0x6d2fa3,.5,{emissive:0x1d0730,emissiveIntensity:.35}),tape=material(0xefe6d8,.82),nail=material(0xd9a891,.4);
  const cylinder=new T.CylinderGeometry(1,1,1,16,1),sphere=new T.SphereGeometry(1,20,14),capsule=new T.CapsuleGeometry(1,1,6,12);
  // The arms render last over a cleared depth buffer, so they never clip into walls or the jester.
  const depthReset=new T.Mesh(new T.PlaneGeometry(.001,.001),new T.MeshBasicMaterial({colorWrite:false,depthWrite:false,transparent:true}));
  depthReset.renderOrder=998;depthReset.frustumCulled=false;depthReset.position.z=-.2;depthReset.onBeforeRender=renderer=>renderer.clearDepth();rig.add(depthReset);
  function part(parent,geometry,mat,position,scale,rotation=[0,0,0]){const m=new T.Mesh(geometry,mat);m.position.set(...position);m.scale.set(...scale);m.rotation.set(...rotation);parent.add(m);return m;}
  function buildFist(){
   // Right hand, palm down: knuckles toward -Z, back of hand +Y, thumb on -X.
   const fist=new T.Group();
   part(fist,sphere,skin,[0,0,-.005],[.045,.03,.05]);
   part(fist,sphere,wrap,[0,.012,-.012],[.047,.022,.046]);
   for(let i=0;i<4;i++){
    const x=-.03+i*.02,len=i===0||i===3?.92:1;
    part(fist,capsule,skin,[x,.004,-.05],[.0115,.016*len,.0115],[.35,0,0]);
    part(fist,sphere,wrap,[x,.017,-.047],[.0125,.009,.012]);
    part(fist,capsule,skin,[x,-.019,-.04],[.0105,.012*len,.0105],[Math.PI/2+.25,0,0]);
    part(fist,sphere,nail,[x,-.03,-.024],[.007,.004,.006]);
   }
   part(fist,sphere,tape,[0,.024,-.04],[.044,.006,.012]);
   const thumb=part(fist,capsule,skin,[-.016,-.03,-.047],[.0125,.022,.0125],[0,0,Math.PI/2-.25]);thumb.name='Thumb';
   part(fist,capsule,skin,[-.046,-.012,-.012],[.013,.014,.013],[.4,0,.5]);
   part(fist,cylinder,wrap,[0,0,.045],[.038,.05,.034],[Math.PI/2,0,0]);
   for(const z of [.028,.058])part(fist,cylinder,tape,[0,0,z],[.0395,.006,.0355],[Math.PI/2,0,0]);
   return fist;
  }
  const UPPER=.34,FORE=.36,arms=[];
  for(const side of [-1,1]){
   const arm=new T.Group();rig.add(arm);
   const fist=buildFist();if(side<0)fist.scale.x=-1;arm.add(fist);
   const fore=part(arm,cylinder,skin,[0,0,0],[1,1,1]);fore.geometry=new T.CylinderGeometry(.034,.047,1,18,1);
   const sleeve=part(arm,cylinder,wrap,[0,0,0],[1,1,1]);sleeve.geometry=new T.CylinderGeometry(.039,.04,.08,18,1);
   const elbow=part(arm,sphere,skin,[0,0,0],[.05,.05,.05]);
   const upper=part(arm,cylinder,skin,[0,0,0],[1,1,1]);upper.geometry=new T.CylinderGeometry(.05,.058,1,18,1);
   arm.traverse(n=>{if(n.isMesh){n.frustumCulled=false;n.renderOrder=999;}});
   arms.push({side,arm,fist,fore,sleeve,elbow,upper,pos:new T.Vector3(),rot:new T.Euler(),vel:new T.Vector3()});
  }
  const up=new T.Vector3(0,1,0),tmp=new T.Vector3(),tmp2=new T.Vector3(),q=new T.Quaternion();
  function bone(mesh,from,to){tmp.subVectors(to,from);const length=tmp.length();mesh.position.addVectors(from,to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,tmp.normalize());mesh.scale.set(1,length,1);}
  // Two-bone IK from the shoulder to the wrist with the elbow pushed down and out.
  function solve(a){
   const shoulder=new T.Vector3(a.side*.2,-.33,.06),wrist=new T.Vector3(0,0,.07).applyEuler(a.rot).add(a.pos);
   const toWrist=tmp2.subVectors(wrist,shoulder),d=Math.min(toWrist.length(),UPPER+FORE-1e-4),dir=toWrist.clone().normalize();
   const along=(UPPER*UPPER-FORE*FORE+d*d)/(2*d),h=Math.sqrt(Math.max(0,UPPER*UPPER-along*along));
   const pole=new T.Vector3(a.side*.75,-1,.15);pole.addScaledVector(dir,-pole.dot(dir)).normalize();
   const elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(pole,h);
   const reach=shoulder.clone().addScaledVector(dir,d);
   bone(a.upper,shoulder,elbow);bone(a.fore,elbow,reach);a.elbow.position.copy(elbow);
   a.sleeve.position.copy(reach).addScaledVector(tmp.subVectors(elbow,reach).normalize(),.07);a.sleeve.quaternion.copy(a.fore.quaternion);
   a.fist.position.copy(a.pos);a.fist.rotation.copy(a.rot);
  }
  function mirror(pose,side){return side>0?pose:[-pose[0],pose[1],pose[2],pose[3],-pose[4],-pose[5]];}
  function sample(keys,u,guard){
   const resolve=p=>p==='guard'?guard:p;
   for(let i=1;i<keys.length;i++){
    const [u1,p1,e]=keys[i];if(u<=u1||i===keys.length-1){const [u0,p0]=keys[i-1],k=Math.max(0,Math.min(1,(u-u0)/Math.max(1e-4,u1-u0))),w=(ease[e]||ease.inOut)(k),a=resolve(p0),b=resolve(p1);return a.map((v,j)=>v+(b[j]-v)*w);}
   }
   return guard;
  }
  let twist=0,lean=0,lunge=0,skinTone='';
  function update(t,dt,{show,blocking,attack,hurtAge=9,landedAge=9,leadHand=0}){
   rig.visible=show;if(!show){twist=lean=lunge=0;return;}
   const bounce=reduced?0:Math.sin(t*7.2),sway=reduced?0:Math.sin(t*3.6);
   let targetTwist=0,targetLean=0,targetLunge=0;
   for(const a of arms){
    const hand=a.side>0?1:0,role=hand===leadHand?'lead':'rear';
    let pose=GUARD[role].slice();
    pose[1]+=bounce*.009+(role==='lead'?sway*.006:-sway*.004);pose[0]+=sway*.004;pose[5]+=bounce*.03;
    if(blocking)pose=BLOCK.slice();
    if(attack&&attack.hand===hand){
     const freeze=attack.freeze||0,elapsed=attack.elapsed<attack.impact?attack.elapsed:attack.elapsed<attack.impact+freeze?attack.impact:attack.elapsed-freeze;
     const u=Math.min(1,elapsed/attack.recover),peak=attack.impact/attack.recover,move=moves(peak)[attack.kind]||moves(peak).jab;
     pose=sample(move.keys,u,GUARD[role]);
     if(attack.missed&&u>peak*.9&&u<peak+.25){const k=Math.sin((u-peak*.9)/(.25+peak*.1)*Math.PI);pose[2]-=.06*k;pose[1]-=.03*k;}
     if(attack.landed&&elapsed>=attack.impact){const k=Math.exp(-(elapsed-attack.impact)*22);pose[2]+=.035*k;}
     const swing=Math.sin(Math.min(1,u/(peak+.15))*Math.PI);targetTwist+=move.twist*swing*(hand?1:-1);targetLean+=(move.lean||0)*swing;targetLunge+=.03*swing;
    }else if(attack){pose[2]+=.025;pose[0]-=a.side*.012;pose[3]+=.08;}
    if(hurtAge<.35){const k=Math.sin(hurtAge/.35*Math.PI);pose[1]+=.035*k;pose[2]+=.07*k;pose[3]+=.25*k;}
    if(blocking&&hurtAge<.25){pose[0]+=Math.sin(t*90)*.004;pose[2]+=.03*(1-hurtAge/.25);}
    pose=mirror(pose,a.side);
    // Light spring on top of the keyframes keeps the motion springy without losing the snap.
    const k=attack&&attack.hand===hand?1-Math.exp(-60*dt):1-Math.exp(-18*dt);
    a.pos.x+=(pose[0]-a.pos.x)*k;a.pos.y+=(pose[1]-a.pos.y)*k;a.pos.z+=(pose[2]-a.pos.z)*k;
    a.rot.x+=(pose[3]-a.rot.x)*k;a.rot.y+=(pose[4]-a.rot.y)*k;a.rot.z+=(pose[5]-a.rot.z)*k;
    solve(a);
   }
   if(landedAge<.12)targetLunge+=.015;
   const s=1-Math.exp(-20*dt);twist+=(targetTwist-twist)*s;lean+=(targetLean-lean)*s;lunge+=(targetLunge-lunge)*s;
  }
  return {
   update,
   setSkin(hex){if(!hex||hex===skinTone)return;skinTone=hex;try{skin.color.set(hex);nail.color.set(hex).offsetHSL(0,-.1,.08);}catch{}},
   camera:()=>({yaw:reduced?0:twist,roll:reduced?0:-twist*.35,pitch:reduced?0:-lean,lunge:reduced?0:lunge}),
   inspect:()=>({visible:rig.visible,hands:arms.map(a=>({side:a.side,position:a.pos.toArray().map(v=>+v.toFixed(3))}))})
  };
 }
 root.createFistViewModel=createFistViewModel;
})(typeof window==='object'?window:globalThis);
