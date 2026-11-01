'use strict';
// PvP arena (client). A walled sand arena 300 m from the garden, built the first time someone enters. The server
// (server/arena.mjs) decides every hit; this file only sends what the player does and shows what happened.
// Controls: click to lock the mouse, move to aim, left click attack, right click (hold) block with the sword,
// 1 / 2 or Q to switch sword / crossbow, Tab for scores. Needs the local live server and a character.
window.createArena=function({T,scene,camera,renderer,player,multiplayer,requestDraw,stopMoving}){
 const $=id=>document.getElementById(id);
 let layout=null,root=null,active=false,weapon='sword',blocking=false,locked=false,yaw=0,pitch=0;
 let lastSwing=0,lastShot=0,swingStart=-1,recoilStart=-1,dead=false,respawnIn=0,me=null,shake=0,hurt=0,hitMarker=0;
 const bolts=[],seenEvents=new Set(),remoteSwings=new Map(),feed=[];
 const center=new T.Vector3();

 // ---------- materials and weapon models (low-poly, PS2-era proportions) ----------
 const mat=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.6,...o});
 const steel=mat(0xc9cdd2,{metalness:.85,roughness:.28}),brass=mat(0xb08a3e,{metalness:.7,roughness:.35}),leather=mat(0x4a2f1e,{roughness:.9}),wood=mat(0x7a5232,{roughness:.8}),dark=mat(0x2b2724,{roughness:.7}),string=mat(0xe8e2cf,{roughness:.9});
 function box(w,h,d,m,x=0,y=0,z=0,parent){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);parent?.add(mesh);return mesh;}
 function makeSword(){
  const g=new T.Group(),bladeGeo=new T.BoxGeometry(.055,.72,.014);bladeGeo.translate(0,.36,0);
  const p=bladeGeo.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)>.5)p.setX(i,p.getX(i)*.55);bladeGeo.computeVertexNormals();
  const blade=new T.Mesh(bladeGeo,steel);blade.position.y=.05;g.add(blade);
  const tip=new T.Mesh(new T.ConeGeometry(.022,.09,4),steel);tip.position.y=.81;tip.rotation.y=Math.PI/4;tip.scale.z=.3;g.add(tip);
  box(.21,.03,.05,brass,0,.04,0,g);const grip=new T.Mesh(new T.CylinderGeometry(.018,.02,.16,8),leather);grip.position.y=-.05;g.add(grip);
  const pommel=new T.Mesh(new T.SphereGeometry(.03,8,6),brass);pommel.position.y=-.14;g.add(pommel);return g;
 }
 function makeCrossbow(){
  const g=new T.Group();box(.055,.06,.62,wood,0,0,.05,g);box(.04,.08,.12,wood,0,-.06,.27,g);box(.012,.05,.02,dark,0,-.05,.14,g);
  const arc=new T.QuadraticBezierCurve3(new T.Vector3(-.32,0,-.16),new T.Vector3(0,0,-.34),new T.Vector3(.32,0,-.16));
  g.add(new T.Mesh(new T.TubeGeometry(arc,16,.016,6),dark));
  const stirrup=new T.Mesh(new T.TorusGeometry(.05,.008,6,12),steel);stirrup.position.set(0,0,-.3);stirrup.rotation.x=Math.PI/2;g.add(stirrup);
  for(const side of [-1,1]){const s=new T.Mesh(new T.CylinderGeometry(.003,.003,.38,4),string);s.position.set(side*.16,0,-.08);s.rotation.set(Math.PI/2,0,side*-1.0);g.add(s);}
  const bolt=new T.Group();const shaft=new T.Mesh(new T.CylinderGeometry(.006,.006,.36,6),wood);shaft.rotation.x=Math.PI/2;bolt.add(shaft);
  const head=new T.Mesh(new T.ConeGeometry(.012,.04,4),steel);head.rotation.x=-Math.PI/2;head.position.z=-.2;bolt.add(head);bolt.position.set(0,.04,-.02);g.add(bolt);g.userData.bolt=bolt;return g;
 }
 // first-person view models, children of the camera
 const view=new T.Group(),viewSword=makeSword(),viewBow=makeCrossbow();view.add(viewSword,viewBow);view.scale.setScalar(.55);view.position.set(.04,-.02,0);
 for(const m of [viewSword,viewBow])m.traverse(n=>{if(n.isMesh){n.castShadow=false;n.renderOrder=5;}});

 // ---------- arena space ----------
 function canvasTexture(size,paint){const c=document.createElement('canvas');c.width=c.height=size;paint(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;return t;}
 function build(){
  root=new T.Group();root.name='PvP arena';root.position.copy(center);scene.add(root);
  const sand=canvasTexture(512,(c,s)=>{c.fillStyle='#c9ad7f';c.fillRect(0,0,s,s);for(let i=0;i<9000;i++){c.fillStyle=['#b89a6c','#d6bd92','#c2a374','#ae9064'][i%4];c.fillRect(Math.random()*s,Math.random()*s,2,2);}c.strokeStyle='rgba(120,95,60,.18)';for(let y=0;y<s;y+=9){c.beginPath();c.moveTo(0,y);for(let x=0;x<=s;x+=32)c.lineTo(x,y+Math.sin(x*.05+y)*2);c.stroke();}});sand.repeat.set(7,7);
  const stoneTex=canvasTexture(256,(c,s)=>{c.fillStyle='#9d968a';c.fillRect(0,0,s,s);for(let row=0;row<8;row++)for(let col=-1;col<5;col++){const x=col*64+(row%2)*32,y=row*32;c.fillStyle=['#a59e91','#938c80','#aaa396','#8b8478'][(row*3+col+8)%4];c.fillRect(x+2,y+2,60,28);}});stoneTex.repeat.set(1,1);
  const stone=mat(0xffffff,{map:stoneTex,roughness:.92}),floorMat=mat(0xffffff,{map:sand,roughness:1});
  const floor=new T.Mesh(new T.CircleGeometry(layout.radius+1.5,72),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=.001;floor.receiveShadow=true;root.add(floor);
  const field=new T.Mesh(new T.PlaneGeometry(260,260),mat(0x5f7a3a,{roughness:1}));field.rotation.x=-Math.PI/2;field.position.y=-.02;field.receiveShadow=true;root.add(field);
  // wall ring with a gate gap, stepped seating outside it
  const segments=56;for(let i=0;i<segments;i++){
   const a=(i+.5)/segments*Math.PI*2,r=layout.radius+.45;const wall=box(2*Math.PI*r/segments+.02,layout.wallHeight,.9,stone,Math.sin(a)*r,layout.wallHeight/2,Math.cos(a)*r,root);wall.rotation.y=a;wall.castShadow=wall.receiveShadow=true;
   for(let tier=0;tier<3;tier++){const tr=r+1.3+tier*1.1,seat=box(2*Math.PI*tr/segments+.02,.5,1.1,stone,Math.sin(a)*tr,layout.wallHeight+.25+tier*.55,Math.cos(a)*tr,root);seat.rotation.y=a;seat.receiveShadow=true;}
  }
  const bannerColors=[0x8c1c13,0x1f4e79,0x8c1c13,0x1f4e79,0x8c1c13,0x1f4e79,0x8c1c13,0x1f4e79];
  bannerColors.forEach((color,i)=>{const a=i/8*Math.PI*2,r=layout.radius-.1;const pole=box(.08,4.2,.08,dark,Math.sin(a)*r,2.1,Math.cos(a)*r,root);pole.castShadow=true;const cloth=new T.Mesh(new T.PlaneGeometry(.9,1.6),mat(color,{side:T.DoubleSide,roughness:.9}));cloth.position.set(Math.sin(a)*(r-.05),3.2,Math.cos(a)*(r-.05));cloth.rotation.y=a+Math.PI;root.add(cloth);});
  for(const c of layout.cover){
   if(c.kind==='pillar'){const col=new T.Mesh(new T.CylinderGeometry(c.r*.85,c.r,c.h,12),stone);col.position.set(c.x,c.h/2,c.z);col.castShadow=col.receiveShadow=true;root.add(col);box(c.r*2.3,.25,c.r*2.3,stone,c.x,c.h+.12,c.z,root).castShadow=true;box(c.r*2.4,.3,c.r*2.4,stone,c.x,.15,c.z,root).receiveShadow=true;}
   else{const crate=box(c.r*1.55,c.h,c.r*1.55,mat(0x8a6038,{roughness:.85}),c.x,c.h/2,c.z,root);crate.rotation.y=c.x*.7;crate.castShadow=crate.receiveShadow=true;for(const y of [.08,c.h-.08])box(c.r*1.6,.08,c.r*1.6,dark,c.x,y,c.z,root).rotation.y=c.x*.7;}
  }
  window.mergeStaticMeshes?.(T,root);
 }

 // ---------- HUD ----------
 const hud=document.createElement('div');hud.id='arena-hud';hud.hidden=true;
 hud.innerHTML=`<div class="arena-crosshair"><i></i><b></b></div>
 <div class="arena-health"><span class="arena-health-fill"></span><strong>100</strong></div>
 <div class="arena-weapon"><span class="arena-weapon-name">Sword</span><span class="arena-cooldown"><i></i></span><small>1 sword · 2 crossbow · Q swap · right-click block · Tab scores</small></div>
 <ol class="arena-feed"></ol>
 <div class="arena-lock">Click to fight<small>Mouse aims · left click attacks · Esc frees the mouse</small></div>
 <div class="arena-dead" hidden><strong>Defeated</strong><span></span></div>
 <table class="arena-scores" hidden><thead><tr><th>Fighter</th><th>K</th><th>D</th></tr></thead><tbody></tbody></table>
 <div class="arena-hurt"></div>
 <button type="button" class="arena-leave">Leave arena</button>`;
 document.body.append(hud);
 const q=s=>hud.querySelector(s);
 q('.arena-leave').onclick=()=>leave();
 const style=document.createElement('style');style.textContent=`
 #arena-hud{position:fixed;inset:0;pointer-events:none;z-index:30;font:500 13px/1.3 system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000a}
 #arena-hud[hidden]{display:none}
 body.in-arena .world-caption,body.in-arena #world-hint{display:none}
 .arena-crosshair{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px}
 .arena-crosshair i,.arena-crosshair b{position:absolute;background:#fff;box-shadow:0 0 2px #000}
 .arena-crosshair i{left:10px;top:3px;width:2px;height:16px}.arena-crosshair b{top:10px;left:3px;height:2px;width:16px}
 .arena-crosshair.hit i,.arena-crosshair.hit b{background:#ff4d3d}
 .arena-health{position:absolute;left:24px;bottom:96px;width:220px;height:18px;background:#0008;border:1px solid #fff6}
 .arena-health-fill{position:absolute;inset:0;width:100%;background:linear-gradient(#e0473a,#a1251c);transition:width .15s}
 .arena-health strong{position:relative;display:block;text-align:center;line-height:18px}
 .arena-weapon{position:absolute;right:24px;bottom:96px;text-align:right}
 .arena-weapon-name{display:block;font-size:20px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
 .arena-cooldown{display:block;margin:6px 0 4px auto;width:140px;height:4px;background:#0008}.arena-cooldown i{display:block;height:100%;width:100%;background:#f3d27a}
 .arena-weapon small{opacity:.8}
 .arena-feed{position:absolute;right:24px;top:180px;margin:0;padding:0;list-style:none;text-align:right}
 .arena-feed li{margin:3px 0;padding:3px 8px;background:#0007;border-radius:3px}
 .arena-lock{position:absolute;left:50%;top:58%;transform:translateX(-50%);padding:10px 16px;background:#000a;border-radius:6px;font-size:16px;text-align:center}
 .arena-lock small{display:block;font-size:12px;opacity:.8;margin-top:4px}
 .arena-dead{position:absolute;inset:0;display:grid;place-content:center;text-align:center;background:#40000055}
 .arena-dead[hidden]{display:none}.arena-dead strong{font-size:40px;letter-spacing:.08em;text-transform:uppercase}
 .arena-scores{position:absolute;left:50%;top:22%;transform:translateX(-50%);min-width:280px;border-collapse:collapse;background:#000c}
 .arena-scores th,.arena-scores td{padding:6px 12px;text-align:left}.arena-scores td+td,.arena-scores th+th{text-align:right}
 .arena-hurt{position:absolute;inset:0;box-shadow:inset 0 0 140px 40px #c00;opacity:0}
 .arena-leave{pointer-events:auto;position:absolute;left:24px;top:84px;padding:8px 14px;border:1px solid #fff8;background:#000a;color:#fff;font:inherit;border-radius:4px;cursor:pointer}
 @media (max-width:700px){.arena-health{left:16px;width:150px}.arena-weapon{right:16px}.arena-weapon small{display:none}}`;
 document.head.append(style);

 // ---------- input ----------
 const canvas=renderer.domElement;
 canvas.addEventListener('click',()=>{if(active&&!locked)canvas.requestPointerLock?.();});
 document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===canvas;q('.arena-lock').hidden=locked||!active;if(!locked)blocking=false;});
 document.addEventListener('mousemove',event=>{if(!active||!locked||dead)return;yaw-=event.movementX*.0024;pitch=T.MathUtils.clamp(pitch-event.movementY*.0024,-1.2,1.2);aimFromAngles();requestDraw();});
 canvas.addEventListener('mousedown',event=>{if(!active||!locked)return;if(event.button===0)attack();else if(event.button===2&&weapon==='sword')blocking=true;});
 document.addEventListener('mouseup',event=>{if(event.button===2)blocking=false;});
 canvas.addEventListener('contextmenu',event=>{if(active)event.preventDefault();});
 document.addEventListener('keydown',event=>{
  if(!active||event.target.closest?.('input,textarea,select,[contenteditable]'))return;
  const key=event.key.toLowerCase();
  if(key==='1')setWeapon('sword');else if(key==='2')setWeapon('crossbow');else if(key==='q')setWeapon(weapon==='sword'?'crossbow':'sword');
  else if(key==='tab'){event.preventDefault();q('.arena-scores').hidden=false;renderScores();}
 });
 document.addEventListener('keyup',event=>{if(event.key==='Tab')q('.arena-scores').hidden=true;});
 function setWeapon(next){if(next===weapon)return;weapon=next;blocking=false;swingStart=-1;q('.arena-weapon-name').textContent=next==='sword'?'Sword':'Crossbow';requestDraw();}
 function aimFromAngles(){player.aim.copy(player.position).add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(5));}
 function attack(){
  if(dead)return;const now=performance.now();
  if(weapon==='sword'){if(now-lastSwing<layout.rules.sword.cooldownMs||blocking)return;lastSwing=now;swingStart=now;multiplayer.send({t:'attack'});}
  else{if(now-lastShot<layout.rules.crossbow.cooldownMs)return;lastShot=now;recoilStart=now;const dir=new T.Vector3();camera.getWorldDirection(dir);multiplayer.send({t:'shoot',dir:[dir.x,dir.y,dir.z]});}
  requestDraw();
 }

 // ---------- events from the server ----------
 const nameOf=id=>id===multiplayer.selfId()?'You':multiplayer.people().find(p=>p.id===id)?.name||'Someone';
 multiplayer.onLive(message=>{
  if(message.t!=='arena'||!active)return;
  for(const e of message.events){
   if(seenEvents.has(e.id))continue;seenEvents.add(e.id);if(seenEvents.size>400)seenEvents.delete(seenEvents.values().next().value);
   const self=multiplayer.selfId();
   if(e.type==='swing'&&e.attacker!==self)remoteSwings.set(e.attacker,performance.now());
   else if(e.type==='shot')launchBolt(e);
   else if(e.type==='hit'){if(e.target===self){hurt=1;shake=.6;}if(e.attacker===self&&e.target!==self)hitMarker=performance.now();}
   else if(e.type==='kill'){feed.unshift({text:`${nameOf(e.attacker)} ${e.weapon.startsWith('crossbow')?'shot':'cut down'} ${nameOf(e.target)}`,time:performance.now()});feed.length=Math.min(feed.length,5);renderFeed();}
   else if(e.type==='respawn'&&e.target===self)spawn(e.spawn);
  }
  requestDraw();
 });
 function renderFeed(){q('.arena-feed').replaceChildren(...feed.map(f=>{const li=document.createElement('li');li.textContent=f.text;return li;}));}
 function renderScores(){
  const rows=multiplayer.people().filter(p=>p.zone==='arena'&&p.arena).sort((a,b)=>b.arena.kills-a.arena.kills||a.arena.deaths-b.arena.deaths);
  q('.arena-scores tbody').replaceChildren(...rows.map(p=>{const tr=document.createElement('tr');for(const v of [p.name+(p.id===multiplayer.selfId()?' (you)':''),p.arena.kills,p.arena.deaths]){const td=document.createElement('td');td.textContent=v;tr.append(td);}return tr;}));
 }

 // bolts: flown on the client along the server's computed path, then left stuck where they landed
 const boltGeo=new T.CylinderGeometry(.012,.012,.42,5);boltGeo.rotateX(Math.PI/2);
 function launchBolt(e){
  const mesh=new T.Mesh(boltGeo,wood);mesh.castShadow=true;scene.add(mesh);
  bolts.push({mesh,origin:new T.Vector3(...e.origin),velocity:new T.Vector3(...e.velocity),flight:e.flight,start:performance.now(),stuck:e.hitKind!=='body'&&e.hitKind!=='none',end:new T.Vector3(...e.end)});
 }
 const gravity=()=>layout?.rules.crossbow.gravity||9.8,tmp=new T.Vector3(),tmp2=new T.Vector3();
 function updateBolts(now){
  for(let i=bolts.length-1;i>=0;i--){
   const b=bolts[i],t=(now-b.start)/1000;
   if(t<b.flight){b.mesh.position.copy(b.origin).addScaledVector(b.velocity,t);b.mesh.position.y-=gravity()*t*t/2;tmp.copy(b.velocity);tmp.y-=gravity()*t;b.mesh.lookAt(tmp2.copy(b.mesh.position).sub(tmp));}
   else if(b.stuck&&t<b.flight+6)b.mesh.position.copy(b.end);
   else{scene.remove(b.mesh);bolts.splice(i,1);}
  }
 }

 // ---------- remote fighters: weapons, block pose, swing, death fall ----------
 function updateRemote(now){
  for(const p of multiplayer.people()){
   if(p.id===multiplayer.selfId()||p.zone!=='arena'||!p.arena)continue;
   const a=multiplayer.avatar(p.id);if(!a)continue;
   let holder=a.root.userData.arenaHolder;
   if(!holder){holder=new T.Group();const s=a.root.scale;holder.scale.set(1/s.x,1/s.y,1/s.z);holder.userData.sword=makeSword();holder.userData.bow=makeCrossbow();holder.add(holder.userData.sword,holder.userData.bow);holder.traverse(n=>{if(n.isMesh)n.castShadow=true;});a.root.add(holder);a.root.userData.arenaHolder=holder;}
   const sword=holder.userData.sword,bow=holder.userData.bow,height=(p.character?.height||175)/100;
   sword.visible=p.arena.weapon!=='crossbow';bow.visible=!sword.visible;
   const swingT=Math.min(1,(now-(remoteSwings.get(p.id)??-1e9))/260);
   if(sword.visible){
    if(p.arena.blocking){sword.position.set(0,height*.62,.38);sword.rotation.set(0,0,Math.PI/2);}
    else{sword.position.set(.3,height*.5,.22);sword.rotation.set(-.4-(swingT<1?Math.sin(swingT*Math.PI)*1.6:0),0,-.25+(swingT<1?swingT*1.2:0));}
   }else{bow.position.set(.18,height*.72,.35);bow.rotation.set(-(p.arena.pitch||0),Math.PI,0);}
   const fall=p.arena.dead?1:0;a.root.userData.fall=T.MathUtils.lerp(a.root.userData.fall||0,fall,.12);a.root.rotation.z=-a.root.userData.fall*Math.PI/2;
  }
 }

 // ---------- first-person view model ----------
 function updateView(now){
  view.visible=active&&!dead;viewSword.visible=weapon==='sword';viewBow.visible=weapon==='crossbow';
  if(weapon==='sword'){
   const s=swingStart<0?1:Math.min(1,(now-swingStart)/260),arc=s<1?Math.sin(s*Math.PI):0;
   if(blocking){viewSword.position.set(0,-.2,-.5);viewSword.rotation.set(0,0,Math.PI/2.2);}
   else{viewSword.position.set(.3-arc*.35,-.32+arc*.1,-.55);viewSword.rotation.set(-.5-arc*1.4,.2,-.35+s*.9*(s<1?1:0));}
  }else{
   const r=recoilStart<0?1:Math.min(1,(now-recoilStart)/180),kick=r<1?Math.sin(r*Math.PI)*.06:0;
   viewBow.position.set(.16,-.2+kick*.5,-.45+kick);viewBow.rotation.set(kick*2,0,0);
   viewBow.userData.bolt.visible=now-lastShot>layout.rules.crossbow.cooldownMs;
  }
 }

 // ---------- entering, leaving, respawning ----------
 function spawn(index){
  const [x,z,facing]=layout.spawns[index%layout.spawns.length];
  yaw=facing;pitch=0;player.place(center.x+x,center.z+z,center.x+x+Math.sin(facing)*5,center.z+z+Math.cos(facing)*5);aimFromAngles();
 }
 async function enter(){
  if(active)return;
  if(!multiplayer.canFight()){multiplayer.openAccount();return;}
  if(!layout){layout=await (await fetch('/arena-layout.json',{cache:'no-store'})).json();center.set(layout.center[0],0,layout.center[1]);}
  if(!root)build();
  root.visible=true;active=true;dead=false;scene.add(camera);camera.add(view);
  spawn(Math.floor(Math.random()*layout.spawns.length));hud.hidden=false;q('.arena-lock').hidden=false;setWeapon('sword');
  document.body.classList.add('in-arena');requestDraw();
 }
 function leave(goHome=true){
  if(!active)return;active=false;blocking=false;hud.hidden=true;camera.remove(view);document.body.classList.remove('in-arena');
  if(document.pointerLockElement===canvas)document.exitPointerLock();
  for(const b of bolts)scene.remove(b.mesh);bolts.length=0;if(root)root.visible=false;
  if(goHome)player.home();requestDraw();
 }

 return {
  enter,leave,
  active:()=>active,
  // Movement inside the arena: within the wall, outside cover; frozen while defeated.
  allowed(next){
   if(dead||!layout)return false;const x=next.x-center.x,z=next.z-center.z;
   if(Math.hypot(x,z)>layout.radius-.55)return false;
   return !layout.cover.some(c=>Math.hypot(x-c.x,z-c.z)<c.r+.42);
  },
  poseExtras:()=>active?{zone:'arena',weapon,blocking,pitch:+pitch.toFixed(3),y:+(player.motion.inspect().height||0).toFixed(3)}:{zone:'garden'},
  update(time,dt){
   if(!active)return false;
   const now=performance.now(),self=multiplayer.people().find(p=>p.id===multiplayer.selfId());me=self?.arena||null;
   // Someone used the site navigation (go()) and left the arena area: tidy up without moving them again.
   if(player.position.distanceTo(center)>(layout.radius+12))leave(false);
   if(!active)return false;
   if(me){const wasDead=dead;dead=me.dead;respawnIn=me.respawnIn;if(dead&&!wasDead){stopMoving();blocking=false;}
    q('.arena-health-fill').style.width=me.health+'%';q('.arena-health strong').textContent=me.health;
    q('.arena-dead').hidden=!dead;if(dead)q('.arena-dead span').textContent=`Back in ${Math.ceil(respawnIn/1000)}…`;}
   const cooldown=weapon==='sword'?layout.rules.sword.cooldownMs:layout.rules.crossbow.cooldownMs,ready=Math.min(1,(now-(weapon==='sword'?lastSwing:lastShot))/cooldown);
   q('.arena-cooldown i').style.width=(ready*100)+'%';
   q('.arena-crosshair').classList.toggle('hit',now-hitMarker<180);
   hurt=Math.max(0,hurt-dt*1.8);q('.arena-hurt').style.opacity=hurt.toFixed(2);
   if(shake>0){shake=Math.max(0,shake-dt*3);camera.rotateZ((Math.random()-.5)*shake*.03);}
   if(feed.length&&now-feed[feed.length-1].time>8000){feed.pop();renderFeed();}
   if(!q('.arena-scores').hidden)renderScores();
   updateView(now);updateBolts(now);updateRemote(now);
   return true; // keep rendering while in the arena
  },
  inspect:()=>({active,weapon,blocking,locked,dead,health:me?.health??null,kills:me?.kills??0,deaths:me?.deaths??0,bolts:bolts.length})
 };
};
