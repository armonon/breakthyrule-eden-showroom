'use strict';
// The local player's own body in first person: the shared character stands under the camera with its head hidden, so
// looking down shows torso, arms, legs and feet. The procedural motion layer then reacts to the world: hands brace on
// walls the player walks into, reach for things in arm's length and grab what is clicked, a guard comes up when
// someone is close, and F throws alternating punches that knock the other character back.
(function(root){
 const clamp=(n,l,h)=>Math.max(l,Math.min(h,n)),smooth=(l,h,n)=>{const t=clamp((n-l)/(h-l),0,1);return t*t*(3-2*t);};
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 function createPlayerBody({T,scene,camera,pickables=[],enabled=()=>true,requestDraw=()=>{}}){
  const push=root.createFoliagePush?.(T,scene);
  let baseFov=null,ownFov=null,model=null,signature='',defaults=null,loading=null,checked=-1e9,clock=0,frame=0,yaw=null,turning=false,guardUntil=0,grabUntil=0,grabPoint=null,hover=null,wall=null;
  const eye=new T.Vector3(),headQ=new T.Quaternion(),turnAround=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
  const forward=new T.Vector3(),left=new T.Vector3(),up=new T.Vector3(0,1,0),probe=new T.Vector3(),ray=new T.Raycaster(),center=new T.Vector2();
  // The character comes from the signed-in account, else the creator's latest draft, else the schema defaults.
  function appearance(){
   if(root.GardenPlayerCharacter)return {...defaults,...root.GardenPlayerCharacter};
   let best=null;try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key.startsWith('eden-character-draft-v1-'))continue;const entry=JSON.parse(localStorage.getItem(key));if(entry?.appearance?.version===1&&(!best||entry.at>best.at))best=entry;}}catch{}
   return {...defaults,...best?.appearance};
  }
  async function refresh(){
   // One schema fetch shared by every refresh; a body is only built once the defaults are really in.
   loading??=fetch('/character-schema.json').then(r=>r.json()).then(schema=>{defaults=Object.fromEntries([['version',1],...Object.values(schema).filter(v=>v&&typeof v==='object').flatMap(g=>Object.entries(g).map(([k,s])=>[k,s.default]))]);}).catch(()=>{loading=null;});
   await loading;if(!defaults)return;
   const look=appearance(),next=JSON.stringify(look);if(next===signature)return;signature=next;
   const old=model;try{model=GardenCharacter.create(T,look);}catch{model=old;return;}
   if(old)GardenCharacter.dispose(old);
   model.root.name='Player body';model.byName.neck01.scale.setScalar(.001);model.motion.tune.guardLift=.05;model.motion.tune.wadeLift=.33;scene.add(model.root);requestDraw();
  }
  // Walls are found by chest-height rays against the static meshes near the player (refreshed each second), so a
  // knee-high birdbath does not raise the hands but a wall, shelf or pillar does, with its true surface normal.
  let nearby=[],gathered=-1e9;const sphere=new T.Sphere();
  function gather(){
   nearby=[];scene.traverseVisible(node=>{if(!node.isMesh||node.isSkinnedMesh||node.isInstancedMesh||node.isSprite||node.material?.transparent)return;for(let p=node.parent;p;p=p.parent)if(p.userData.characterStyle)return;const g=node.geometry;if(!g?.attributes.position?.count)return;if(!g.boundingSphere){if(!g.attributes.position.array.every(Number.isFinite))return;g.computeBoundingSphere();}if(!Number.isFinite(g.boundingSphere.radius))return;sphere.copy(g.boundingSphere).applyMatrix4(node.matrixWorld);if(sphere.radius<40&&(g.index?g.index.count:g.attributes.position.count)<60000&&sphere.distanceToPoint(camera.position)<2.5)nearby.push(node);});
  }
  // Brush: shrubs, ferns and tall grass are instanced; index every plant that reaches the waist in a 2 m grid.
  let plants=new Map(),indexed=-1e9,brush=0;
  function indexPlants(){
   plants=new Map();const m=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),sc=new T.Vector3();
   scene.traverseVisible(node=>{if(!node.isInstancedMesh)return;const g=node.geometry;if(!g.boundingBox)g.computeBoundingBox();const box=g.boundingBox;if(!box||!Number.isFinite(box.max.y))return;
    // Grass-sized meshes are skipped after a small sample, so the index stays cheap.
    let tall=false;for(let i=0;i<Math.min(node.count,24)&&!tall;i++){node.getMatrixAt(i,m);m.premultiply(node.matrixWorld);m.decompose(p,q,sc);tall=p.y+box.max.y*sc.y>=.6;}if(!tall)return;
    for(let i=0;i<node.count;i++){node.getMatrixAt(i,m);m.premultiply(node.matrixWorld);m.decompose(p,q,sc);const k=Math.max(sc.x,sc.z),top=p.y+box.max.y*sc.y,bottom=p.y+box.min.y*sc.y,r=Math.max(-box.min.x,box.max.x,-box.min.z,box.max.z)*k;
     if(top<.75||top>2.4||bottom>.6||r>2.2||r<.05)continue;const key=Math.floor(p.x/2)+','+Math.floor(p.z/2);if(!plants.has(key))plants.set(key,[]);plants.get(key).push([p.x,p.z,r]);}});
  }
  function brushAt(x,z){let d=0;for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const [px,pz,r] of plants.get((Math.floor(x/2)+i)+','+(Math.floor(z/2)+j))||[]){const gap=Math.hypot(px-x,pz-z)-r*.75;if(gap<.45)d+=clamp(1-gap/.45,0,1);}return clamp(d,0,1);}
  function wallAt(offset){
   probe.copy(camera.position).addScaledVector(left,offset);probe.y-=.4;ray.set(probe,forward);ray.far=.85;
   const hit=ray.intersectObjects(nearby,false).find(h=>h.face);if(!hit)return null;
   const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);if(normal.dot(forward)>0)normal.negate();
   return Math.abs(normal.y)<.55?{distance:hit.distance,point:hit.point,normal}:null;
  }
  const inScene=node=>{while(node.parent)node=node.parent;return node===scene;};
  function nearestOther(range){
   let best=null,bestDistance=range;
   for(const other of root.GardenCharacterMotion.bodies){if(other===model||!other.root.visible||!inScene(other.root))continue;const p=other.root.getWorldPosition(new T.Vector3()),d=Math.hypot(p.x-camera.position.x,p.z-camera.position.z);
    const facing=((p.x-camera.position.x)*forward.x+(p.z-camera.position.z)*forward.z)/Math.max(d,1e-3);if(d<bestDistance&&facing>.55){best=other;bestDistance=d;}}
   return best;
  }
  function onKey(event){
   if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.key.toLowerCase()!=='f'||!model?.root.visible||!enabled()||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.target.isContentEditable)return;
   event.preventDefault();api.punch();
  }
  document.addEventListener('keydown',onKey);
  // Someone else's punch landed on us: the body flinches (no first-person knockdown yet).
  const onPunched=event=>{const d=event.detail?.direction;if(model&&d){const dir=camera.position.clone().set(d.x,0,d.z);if(event.detail.knockdown)model.motion.knockdown(dir,1.7);else model.motion.hit(dir,1.1);}requestDraw();};
  root.addEventListener?.('eden-punched',onPunched);
  const api={
   update(dt,{aim,velocity=null,airborne=false}={}){
    clock+=dt;frame++;
    if(clock-checked>1.5){checked=clock;refresh();}
    // Plants part around you and the five nearest characters.
    if(push){const near=[{x:camera.position.x,y:camera.position.y-1.75,z:camera.position.z,d:0}];
     for(const other of root.GardenCharacterMotion?.bodies||[])if(other!==model&&other.root.visible&&inScene(other.root)){const p=other.root.getWorldPosition(probe),d=p.distanceTo(camera.position);if(d<15)near.push({x:p.x,y:p.y,z:p.z,d});}
     push.update(near.sort((a,b)=>a.d-b.d),clock);}
    if(!model)return;
    const on=enabled();model.root.visible=on;root.GardenCharacterMotion.attention=on?camera.position:null;if(!on){yaw=null;if(ownFov!==null&&Math.abs(camera.fov-ownFov)<.01){camera.fov=baseFov;camera.updateProjectionMatrix();}ownFov=null;return;}
    // Knocked down: the body ragdolls where it stood and the camera rides its head (eyes forward of the skull),
    // then hands the view back to the player's camera as the body gets up.
    const down=model.motion.downAmount();
    if(down>0){
     model.motion.update(dt,{});const head=model.byName.head;head.getWorldPosition(eye);head.getWorldQuaternion(headQ);
     eye.add(probe.set(0,.035,.09).multiplyScalar(model.root.scale.x).applyQuaternion(headQ));headQ.multiply(turnAround);eye.y=Math.max(eye.y,model.root.position.y+.26); // never inside the ground
     const k=down>=1?1:smooth(0,1,down);camera.position.lerp(eye,k);camera.quaternion.slerp(headQ,k);requestDraw();return;
    }
    forward.subVectors(aim,camera.position);const pitch=Math.atan2(forward.y,Math.hypot(forward.x,forward.z));forward.y=0;forward.normalize();left.set(forward.z,0,-forward.x);
    // The body turns with the view only once the head is twisted far enough, or while walking, like a real neck.
    const view=Math.atan2(forward.x,forward.z),speed=velocity?Math.hypot(velocity.x,velocity.z):0;if(yaw===null)yaw=view;
    const diff=wrap(view-yaw);if(speed>.3||Math.abs(diff)>.75)turning=true;else if(Math.abs(diff)<.04)turning=false;
    if(turning)yaw=wrap(yaw+diff*(1-Math.exp(-(speed>.3?11:6)*dt)));
    model.root.rotation.y=yaw;
    // The eyes sit ahead of the neck: looking down, the chest and toes should be below the view, not behind it.
    const back=.06+.22*smooth(-.25,-1.1,pitch);
    // Looking down widens the view like peripheral vision, so chest, legs and feet come into frame together.
    // Whatever field of view the app set last is the base; only our own widening is undone.
    if(ownFov===null||Math.abs(camera.fov-ownFov)>.01)baseFov=camera.fov;
    const fov=baseFov+30*smooth(-.3,-1.2,pitch);if(Math.abs(fov-camera.fov)>.01){camera.fov=fov;camera.updateProjectionMatrix();}ownFov=camera.fov;
    model.root.position.set(camera.position.x-Math.sin(yaw)*back,camera.position.y-1.75,camera.position.z-Math.cos(yaw)*back);
    model.motion.airborne(airborne);
    // Walls: both palms meet the surface ahead at chest height, harder and earlier when walking into it.
    if(clock-gathered>2){gathered=clock;gather();}
    if(clock-indexed>(plants.size?30:4)){indexed=clock;indexPlants();}
    if(frame%4===0)brush=brushAt(camera.position.x,camera.position.z)*smooth(.4,2.5,speed);
    if(frame%3===0){const hits=[wallAt(0),wallAt(.18),wallAt(-.18)].filter(Boolean).sort((a,b)=>a.distance-b.distance);wall=hits[0]||null;}
    const along=new T.Vector3();
    for(const [side,sign] of [['L',1],['R',-1]]){
     let weight=0,point=null;
     if(wall){weight=smooth(1.08,.78,wall.distance);along.copy(left).addScaledVector(wall.normal,-left.dot(wall.normal)).normalize();point=wall.point.clone().addScaledVector(along,sign*.19).addScaledVector(wall.normal,.025);point.y=camera.position.y-(sign>0?.42:.36);}
     if(side==='R'&&clock<grabUntil&&grabPoint){weight=1;point=grabPoint;}
     else if(side==='R'&&hover&&!weight){weight=.4;point=hover;}
     model.motion.touch(side,point,wall&&point!==grabPoint&&point!==hover?wall.normal:null,weight,point===grabPoint||point===hover?'grab':'press');
    }
    // Reach: anything clickable inside arm's length draws the right hand towards it before it is grabbed.
    if(frame%4===0){center.set(0,0);ray.setFromCamera(center,camera);ray.far=1.25;const hit=ray.intersectObjects(pickables,false)[0];hover=hit?hit.point.clone().addScaledVector(ray.ray.direction,-.14):null;}
    const near=nearestOther(1.9);model.motion.guard(clock<guardUntil?1:near?.85:0);
    model.motion.update(dt,{velocity,wade:brush});
   },
   // Click on something within reach: the hand gets there first, then the caller opens it.
   downed:()=>!!model&&model.motion.downAmount()>0,
   grab(point){if(!model?.root.visible||!point||point.distanceTo(camera.position)>1.6)return 0;grabPoint=point.clone();grabUntil=clock+.55;requestDraw();return 230;},
   punch(){
    if(!model)return;root.dispatchEvent?.(new CustomEvent('eden-punch-thrown'));
    const target=nearestOther(1.4),head=target?.byName?.head?.getWorldPosition(new T.Vector3());
    const aimPoint=head||camera.position.clone().addScaledVector(forward,.75).add(new T.Vector3(0,-.12,0));
    const land=model.motion.punch(aimPoint);guardUntil=clock+2.2;requestDraw();
    if(target)setTimeout(()=>{if(!target.root.parent)return;const p=target.root.getWorldPosition(new T.Vector3());if(Math.hypot(p.x-camera.position.x,p.z-camera.position.z)<1.5){const direction=p.sub(camera.position).setY(0).normalize(),result=target.motion.hit(direction,1.2);
     // Tell the room: multiplayer can relay this so everyone sees the same hit or knockdown.
     if(target.root.userData.visitorId)root.dispatchEvent?.(new CustomEvent('eden-punch',{detail:{visitorId:target.root.userData.visitorId,direction:{x:direction.x,z:direction.z},knockdown:result==='down'}}));}
    requestDraw();},land*1000);
   },
   inspect:()=>({ready:!!model,visible:!!model?.root.visible,yaw:yaw===null?null:+yaw.toFixed(3),wall:wall?+wall.distance.toFixed(2):null,brush:+brush.toFixed(2),nearestBrush:(()=>{let best=null,bd=1e9;for(const list of plants.values())for(const [x,z,r] of list){const d=Math.hypot(x-camera.position.x,z-camera.position.z);if(d<bd){bd=d;best=[+x.toFixed(2),+z.toFixed(2),+r.toFixed(2)];}}return best;})(),plants:[...plants.values()].reduce((n,a)=>n+a.length,0),hover:!!hover,motion:model?.motion.inspect()}),
   dispose(){document.removeEventListener('keydown',onKey);root.removeEventListener?.('eden-punched',onPunched);if(model)GardenCharacter.dispose(model);model=null;}
  };
  return api;
 }
 root.createPlayerBody=createPlayerBody;
})(typeof window==='object'?window:globalThis);
