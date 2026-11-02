'use strict';
/*
 * BREAK THY RULE: ARENA (offline prototype)
 * Loaded as battle-arena.js; arena.js is the online PvP sword-and-crossbow arena.
 *
 * 8 combatants (the player + 7 test bots) spawn on a ring around The Commons, a clearing in the
 * middle of a daylight Beyond Eden. The centre holds chests with armour (pieces from the collection),
 * heals and C4; guns there are rare (pistol ~8%, SMG ~3%). Real weapons lie around the landmarks:
 * the Hotel holds the sniper, the Observatory the rifle, the Temple the SMG and pump, the Playhouse
 * pistols and C4. Night closes in from the edges in phases; standing in the dark drains health.
 *
 * Host hooks (app.js): createBattleArena({T,scene,camera,combat,garden,layout,requestDraw,placePlayer,
 *                                  setNight,canUse,onExit,openShop})
 */
(function(root){
 const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,rand=(a,b)=>a+Math.random()*(b-a);
 const pick=a=>a[Math.random()*a.length|0];
 const EYE=1.62,PLAYER_EYE=1.75;

 // Loot tables. Weights are relative. Guns in the centre are deliberately rare.
 const CENTER_TABLE=[
  [30,'armor'],[18,'bandage'],[10,'medkit'],[9,'c4'],[8,'ammo'],
  [8,{weapon:'pistol'}],[3,{weapon:'smg'}],[14,'nothing']
 ];
 const AMMO_FOR={pistol:['pistol',24],smg:['smg',60],rifle:['rifle',60],sniper:['sniper',10],pump:['shells',12]};
 const AMMO_LABEL={pistol:'9MM',smg:'.45 ACP',rifle:'7.62',sniper:'.308',shells:'12GA'};
 const RARITY={common:0xe9e6dc,uncommon:0x7fd18b,rare:0x64a8ff,epic:0xc183ff};
 const GUN_RARITY={pistol:'uncommon',pump:'uncommon',smg:'rare',rifle:'rare',sniper:'epic'};
 // Landmark loot: guaranteed racks + random floor spots.
 const LANDMARK_LOOT={
  hotel:[{weapon:'sniper'},{ammo:'sniper'},{ammo:'sniper'},'armor','medkit'],
  observatory:[{weapon:'rifle'},{ammo:'rifle'},{ammo:'rifle'},'armor','bandage'],
  temple:[{weapon:'smg'},{weapon:'pump'},{ammo:'smg'},{ammo:'shells'},'bandage'],
  playhouse:[{weapon:'pistol'},{weapon:'pistol'},{ammo:'pistol'},'c4','c4','armor'],
  gardens:[{weapon:'pump'},{weapon:'rifle'},{ammo:'shells'},{ammo:'rifle'},'medkit','armor']
 };
 // The night closes in slowly: about seven minutes from the first wait to full dark, and the dark only nibbles at first.
 // Recharging shields over 100 health: the player's matches a full health bar, the bots' is half that.
 const SHIELD_PLAYER=100,SHIELD_BOT=50,SHIELD_DELAY=4;
 const ZONE_PHASES=[{wait:70,shrink:60,r:52,dps:1},{wait:50,shrink:50,r:32,dps:2},{wait:40,shrink:40,r:16,dps:4},{wait:30,shrink:36,r:6,dps:7},{wait:20,shrink:30,r:0,dps:12}];
 const BOT_NAMES=['ADAM','LILITH','SERAPH','JUBAL','NAAMAH','ENOCH','ZILLAH','TUBAL','ADAH','IRAD','METHUSA'];

 function armorFromGarment(item){
  const n=item.name.toLowerCase();
  if(/gloves|beanie/.test(n))return null;
  const tier=/hoodie|jacket|thermal/.test(n)?{armor:70,rarity:'rare'}:/crewneck|longsleeve|crop/.test(n)?{armor:45,rarity:'uncommon'}:{armor:25,rarity:'common'};
  return {...tier,name:item.name,id:item.id,image:item.images?.[0],price:item.price};
 }

 function createArena(o){
  const {T,scene,camera,combat,garden,layout}=o;
  const A=layout.arena,CENTER=new T.Vector3(A.x,0,A.z);
  const B=layout.bounds; // [minX,maxX,minZ,maxZ]
  let godMode=false,built=false,active=false,phase='idle',clock=0,countdown=0,ended=null,matchStart=0;
  let player=null,bots=[],chests=[],loot=[],feed=[],zone=null,hud=null,root=null,grid=null,finder=null;
  const garments=(window.showroomCollection||[]).map(armorFromGarment).filter(Boolean);

  /* ---------------------------------------------------------------- helpers */
  // Ground heights are sampled once per 1 m cell (a full-scene raycast per bot per frame is far too slow).
  const groundCache=new Map();
  const groundY=(x,z)=>{const k=Math.round(x)*4096+Math.round(z);let y=groundCache.get(k);if(y===undefined){try{y=combat.groundAt(Math.round(x),Math.round(z),8)??0;}catch{y=0;}if(Math.abs(y)>6)y=0;groundCache.set(k,y);}return y;};
  // Line of sight against building footprints (analytic, 2D slab test). Buildings are taller than anyone.
  const walls=()=>garden.district?.walls||[];
  function segBlocked(a,b){
   const dx=b.x-a.x,dz=b.z-a.z;
   for(const [x,z,w,d] of walls()){const minX=x-w/2,maxX=x+w/2,minZ=z-d/2,maxZ=z+d/2;let t0=0,t1=1;
    for(const [p,dd,mn,mx] of [[a.x,dx,minX,maxX],[a.z,dz,minZ,maxZ]]){if(Math.abs(dd)<1e-9){if(p<mn||p>mx){t0=2;break;}}else{let u=(mn-p)/dd,v=(mx-p)/dd;if(u>v)[u,v]=[v,u];t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)break;}}
    if(t0<=t1&&t0<1&&t1>0)return t0;}
   return null;
  }
  const blocked=p=>garden.district?.blocks(p)||false;
  function los(a,b){return segBlocked(a,b)===null;}
  function weighted(table){const tot=table.reduce((s,[w])=>s+w,0);let r=Math.random()*tot;for(const [w,v] of table){if((r-=w)<0)return v;}return table[0][1];}
  function rollItem(spec){
   if(spec==='nothing')return null;
   if(spec==='armor'){const g=pick(garments);return g?{type:'armor',armor:g.armor,garment:g,rarity:g.rarity,label:g.name.toUpperCase()+' · '+g.armor+' ARMOR'}:null;}
   if(spec==='bandage')return {type:'heal',heal:'bandage',count:2,rarity:'common',label:'BANDAGES ×2'};
   if(spec==='medkit')return {type:'heal',heal:'medkit',count:1,rarity:'uncommon',label:'MEDKIT'};
   if(spec==='c4')return {type:'c4',count:1,rarity:'uncommon',label:'C4 CHARGE'};
   if(spec==='ammo'){const k=pick(Object.keys(AMMO_FOR));return rollItem({ammo:AMMO_FOR[k][0]});}
   if(spec.ammo){const [type,n]=Object.values(AMMO_FOR).find(([t])=>t===spec.ammo)||[spec.ammo,20];return {type:'ammo',ammo:type,count:n,rarity:'common',label:AMMO_LABEL[type]+' AMMO ×'+n};}
   if(spec.weapon){const W=combat.weapons.find(w=>w.id===spec.weapon);return {type:'weapon',weapon:spec.weapon,loaded:W.mag,rarity:GUN_RARITY[spec.weapon]||'uncommon',label:W.name+' · '+W.kind};}
   return null;
  }

  /* ---------------------------------------------------------------- visuals */
  function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
  let MAT=null;
  function materials(){
   if(MAT)return MAT;
   const wood=canvasTex(256,128,(x,w,h)=>{x.fillStyle='#6b4527';x.fillRect(0,0,w,h);for(let i=0;i<70;i++){x.strokeStyle=`rgba(${Math.random()<.5?30:150},${Math.random()<.5?18:95},10,${rand(.08,.25)})`;x.lineWidth=rand(.5,2);x.beginPath();const y=Math.random()*h;x.moveTo(0,y);for(let k=0;k<=w;k+=16)x.lineTo(k,y+Math.sin(k*.05+i)*2);x.stroke();}for(let i=0;i<4;i++){x.fillStyle='rgba(20,12,6,.5)';x.fillRect(0,(i+1)*h/5,w,1.5);}});
   const ring=canvasTex(128,128,(x)=>{const g=x.createRadialGradient(64,64,30,64,64,62);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.75,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);});
   const beam=canvasTex(32,128,(x)=>{const g=x.createLinearGradient(0,128,0,0);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,32,128);const s=x.createLinearGradient(0,0,32,0);s.addColorStop(0,'rgba(0,0,0,1)');s.addColorStop(.5,'rgba(0,0,0,0)');s.addColorStop(1,'rgba(0,0,0,1)');x.globalCompositeOperation='destination-out';x.fillStyle=s;x.fillRect(0,0,32,128);});
   MAT={
    wood:new T.MeshStandardMaterial({map:wood,roughness:.8}),
    iron:new T.MeshStandardMaterial({color:0x2c2b28,metalness:.8,roughness:.45}),
    brass:new T.MeshStandardMaterial({color:0xb8913e,metalness:1,roughness:.3}),
    ring,beam,
    white:new T.MeshStandardMaterial({color:0xeeeeea,roughness:.6}),
    red:new T.MeshStandardMaterial({color:0xb4231c,roughness:.5}),
    gauze:new T.MeshStandardMaterial({color:0xe6dfcf,roughness:.95}),
    ammo:{pistol:0x6d6a3d,smg:0x4a5a6a,rifle:0x5b4a32,sniper:0x3e4a3a,shells:0x7a2c22}
   };
   return MAT;
  }
  function box(w,h,d,m,parent,x=0,y=0,z=0){const b=new T.Mesh(new T.BoxGeometry(w,h,d),m);b.position.set(x,y,z);b.castShadow=b.receiveShadow=true;parent.add(b);return b;}

  function makeChest(x,z,rot){
   const M=materials(),g=new T.Group(),y=groundY(x,z);g.position.set(x,y,z);g.rotation.y=rot;root.add(g);
   box(.92,.46,.56,M.wood,g,0,.23,0);
   for(const sx of [-.38,.38])box(.05,.48,.58,M.iron,g,sx,.24,0);
   const lidPivot=new T.Group();lidPivot.position.set(0,.46,-.28);g.add(lidPivot);
   const lid=new T.Mesh(new T.CylinderGeometry(.28,.28,.92,20,1,false,0,Math.PI),M.wood);lid.rotation.z=Math.PI/2;lid.rotation.y=Math.PI/2;lid.position.set(0,0,.28);lid.castShadow=true;lidPivot.add(lid);
   for(const sx of [-.38,.38]){const band=new T.Mesh(new T.CylinderGeometry(.29,.29,.05,20,1,true,0,Math.PI),M.iron);band.rotation.copy(lid.rotation);band.position.set(sx,0,.28);lidPivot.add(band);}
   box(.08,.1,.03,M.brass,g,0,.4,.29);
   const glow=new T.Mesh(new T.PlaneGeometry(2.2,2.2),new T.MeshBasicMaterial({map:M.ring,color:0xffd27a,transparent:true,opacity:.45,depthWrite:false,blending:T.AdditiveBlending}));glow.rotation.x=-Math.PI/2;glow.position.y=.03;g.add(glow);
   g.traverse(n=>n.userData.noHit=false);
   const c={group:g,lidPivot,glow,open:false,openT:0,pos:new T.Vector3(x,y,z)};chests.push(c);return c;
  }

  function itemVisual(item){
   const M=materials(),g=new T.Group();
   if(item.type==='weapon'){const m=combat.weaponModel(item.weapon);if(m){m.rotation.set(0,0,Math.PI/2);m.position.y=.05;const s=new T.Group();s.add(m);g.add(s);}else box(.5,.08,.12,M.iron,g);}
   else if(item.type==='armor'){const t=item.garment.image?new T.TextureLoader().load(item.garment.image,()=>o.requestDraw()):null;if(t)t.colorSpace=T.SRGBColorSpace;
    const fold=new T.Mesh(new T.BoxGeometry(.42,.07,.34),[M.white,M.white,new T.MeshStandardMaterial({map:t,color:t?0xffffff:0xdddddd,roughness:.9}),M.white,M.white,M.white]);fold.position.y=.04;fold.castShadow=true;g.add(fold);}
   else if(item.type==='heal'){if(item.heal==='medkit'){box(.34,.2,.24,M.white,g,0,.1,0);box(.2,.21,.06,M.red,g,0,.1,0);box(.06,.21,.2,M.red,g,0,.1,0);}else{for(const dx of [-.07,.07]){const r=new T.Mesh(new T.CylinderGeometry(.06,.06,.1,16),M.gauze);r.rotation.z=Math.PI/2;r.position.set(dx,.06,0);g.add(r);}}}
   else if(item.type==='ammo'){box(.26,.16,.16,new T.MeshStandardMaterial({color:M.ammo[item.ammo]||0x555555,roughness:.6}),g,0,.08,0);box(.27,.03,.17,M.iron,g,0,.17,0);}
   else if(item.type==='c4'){const m=combat.weaponModel('c4');if(m){m.position.y=.04;g.add(m);}}
   const col=RARITY[item.rarity]||RARITY.common;
   const ring=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:M.ring,color:col,transparent:true,opacity:.6,depthWrite:false,blending:T.AdditiveBlending}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;g.add(ring);
   const beam=new T.Mesh(new T.PlaneGeometry(.18,item.rarity==='epic'?3.2:item.rarity==='rare'?2.4:1.4),new T.MeshBasicMaterial({map:M.beam,color:col,transparent:true,opacity:.55,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));beam.position.y=beam.geometry.parameters.height/2;g.add(beam);
   g.userData.beam=beam;g.traverse(n=>{n.userData.noHit=true;});
   return g;
  }
  function dropItem(item,x,z,vel=null){
   if(!item)return null;const g=itemVisual(item),y=groundY(x,z);g.position.set(x,y,z);root.add(g);
   const l={item,group:g,pos:new T.Vector3(x,y,z),vel:vel?vel.clone():null,phase:Math.random()*TAU,y};loot.push(l);return l;
  }
  function removeLoot(l){loot.splice(loot.indexOf(l),1);l.group.parent?.remove(l.group);}

  /* ---------------------------------------------------------------- night zone */
  function buildZone(){
   const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{time:{value:0}},
    vertexShader:'varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`uniform float time;varying vec2 vUv;varying vec3 vW;
     float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}
     float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
     void main(){float y=vUv.y;float s=n(vec2(vUv.x*60.,y*6.-time*.25))*.5+n(vec2(vUv.x*140.,y*14.-time*.6))*.25;
      float a=(1.-smoothstep(.05,1.,y))*(.55+s*.45);vec3 c=mix(vec3(.02,.04,.07),vec3(.09,.16,.22),s);
      float edge=smoothstep(.0,.03,y)*(1.-smoothstep(.0,.02,abs(y-.004)))*0.;gl_FragColor=vec4(c+edge,a*.86);}`});
   const wall=new T.Mesh(new T.CylinderGeometry(1,1,40,96,1,true),mat);wall.position.y=20;wall.renderOrder=3;wall.userData.noHit=true;wall.frustumCulled=false;
   const g=new T.Group();g.add(wall);root.add(g);
   return {group:g,wall,mat,center:CENTER.clone(),r:95,from:{c:CENTER.clone(),r:95},to:{c:CENTER.clone(),r:95},phase:-1,t:0,state:'wait'};
  }
  function nextZoneTarget(cur,r){
   // Final circles drift toward a random landmark so the end fight lands somewhere new.
   const lm=layout.landmarks[(Math.random()*layout.landmarks.length)|0];
   const want=new T.Vector3(lm.x,0,lm.z+lm.d/2+4);const dir=want.clone().sub(cur);const maxMove=Math.max(0,zone.r-r);
   if(dir.length()>maxMove)dir.setLength(maxMove*rand(.5,.95));return cur.clone().add(dir);
  }
  function updateZone(dt){
   if(phase!=='live')return;
   const P=ZONE_PHASES[Math.max(0,zone.phase)];
   zone.t+=dt;
   if(zone.phase<0){zone.phase=0;zone.state='wait';zone.t=0;zone.to={c:nextZoneTarget(zone.center,ZONE_PHASES[0].r),r:ZONE_PHASES[0].r};zone.from={c:zone.center.clone(),r:zone.r};}
   const ph=ZONE_PHASES[zone.phase];
   if(zone.state==='wait'&&zone.t>=ph.wait){zone.state='shrink';zone.t=0;zone.from={c:zone.center.clone(),r:zone.r};announce('NIGHT IS CLOSING IN');}
   if(zone.state==='shrink'){const k=clamp(zone.t/ph.shrink,0,1),e=k*k*(3-2*k);zone.center.lerpVectors(zone.from.c,zone.to.c,e);zone.r=lerp(zone.from.r,zone.to.r,e);
    if(k>=1&&zone.phase<ZONE_PHASES.length-1){zone.phase++;zone.state='wait';zone.t=0;const n=ZONE_PHASES[zone.phase];zone.to={c:nextZoneTarget(zone.center,n.r),r:n.r};}}
   zone.wall.scale.set(Math.max(.01,zone.r),1,Math.max(.01,zone.r));zone.group.position.set(zone.center.x,groundY(zone.center.x,zone.center.z)-2,zone.center.z);zone.mat.uniforms.time.value=clock;
  }
  const outside=p=>Math.hypot(p.x-zone.center.x,p.z-zone.center.z)-zone.r;
  const zoneDps=()=>ZONE_PHASES[Math.max(0,zone.phase)].dps;

  /* ---------------------------------------------------------------- combatants */
  function randomCharacter(){
   const s=window.GardenCharacterSchema,a={};
   if(s){for(const [k,v] of Object.entries(s.numbers||{}))a[k]=rand(v.min,v.max);for(const [k,v] of Object.entries(s.colors||{}))a[k]=pick(v.swatches||[v.default]);for(const [k,v] of Object.entries(s.choices||{}))a[k]=pick(Object.keys(v.options));}
   a.height=rand(165,192);a.weight=rand(60,92);a.eyewear='none';return a;
  }
  function makeBot(i,pos,face){
   let model=null;try{model=window.GardenCharacter.create(T,randomCharacter());}catch(e){model=window.GardenCharacter.create(T,{},true);}
   const r=new T.Group();r.add(model.root);r.position.copy(pos);r.rotation.y=face;root.add(r);
   model.root.traverse(n=>{n.castShadow=true;n.userData.noHit=true;});
   const hand=new T.Group();hand.position.set(-.2,1.28,.32);r.add(hand);
   const b={id:'bot'+i,name:BOT_NAMES[i%BOT_NAMES.length],bot:true,root:r,model,hand,hp:100,shield:SHIELD_BOT,shieldMax:SHIELD_BOT,dodgeT:0,lastFlinch:-9,bashT:0,armor:0,garment:null,alive:true,kills:0,
    weapons:{axe:{loaded:0}},weapon:'axe',reserve:{},heals:{bandage:0,medkit:0},
    state:'rush',target:null,goal:null,path:[],repath:0,think:rand(0,.3),fireT:0,reloadT:0,aimT:0,strafe:Math.random()<.5?1:-1,strafeT:0,stride:0,
    skill:rand(.42,.68),reaction:rand(.35,.7),seen:null,deathT:0,lastHurt:-9,heading:face,healT:0};
   setBotWeapon(b,'axe');bots.push(b);return b;
  }
  function setBotWeapon(b,id){
   b.weapon=id;b.hand.clear();const m=combat.weaponModel(id);
   if(m){if(id==='axe'){m.rotation.set(-1.2,0,0);m.position.set(0,-.05,-.1);}else{m.rotation.set(0,Math.PI,0);}b.hand.add(m);m.traverse(n=>{n.userData.noHit=true;n.castShadow=true;});}
  }
  const W=id=>combat.weapons.find(w=>w.id===id);
  function botBestWeapon(b){const order=['sniper','rifle','smg','pump','pistol','axe'];for(const id of order){if(b.weapons[id]&&(id==='axe'||b.weapons[id].loaded>0||(b.reserve[W(id).ammo]||0)>0))return id;}return 'axe';}

  function combatants(){return [player,...bots].filter(c=>c&&c.alive);}
  function posOf(c){return c.bot?c.root.position:new T.Vector3(camera.position.x,camera.position.y-PLAYER_EYE,camera.position.z);}
  function eyeOf(c){const p=posOf(c);return new T.Vector3(p.x,p.y+(c.bot?EYE:PLAYER_EYE),p.z);}

  // Ray vs capsule (body) and sphere (head), analytic.
  function rayCapsule(o2,d,a,b,r){
   const ba=b.clone().sub(a),oa=o2.clone().sub(a);const baba=ba.dot(ba),bard=ba.dot(d),baoa=ba.dot(oa),rdoa=d.dot(oa),oaoa=oa.dot(oa);
   const A=baba-bard*bard,Bq=baba*rdoa-baoa*bard,C=baba*oaoa-baoa*baoa-r*r*baba,h=Bq*Bq-A*C;
   if(h>=0){const t=(-Bq-Math.sqrt(h))/A,y=baoa+t*bard;if(y>0&&y<baba&&t>0)return t;}
   for(const c of [a,b]){const oc=o2.clone().sub(c),bb=oc.dot(d),cc=oc.dot(oc)-r*r,hh=bb*bb-cc;if(hh>0){const t=-bb-Math.sqrt(hh);if(t>0)return t;}}
   return null;
  }
  function raySphere(o2,d,c,r){const oc=o2.clone().sub(c),b=oc.dot(d),cc=oc.dot(oc)-r*r,h=b*b-cc;if(h<0)return null;const t=-b-Math.sqrt(h);return t>0?t:null;}
  function hitTest(origin,dir,maxDist,exclude){
   let best=null;
   for(const c of combatants()){if(c===exclude)continue;const p=posOf(c),scale=c.bot?1:1.02;
    const head=new T.Vector3(p.x,p.y+(c.bot?1.6:1.62),p.z);const th=raySphere(origin,dir,head,.15);
    const tb=rayCapsule(origin,dir,new T.Vector3(p.x,p.y+.3,p.z),new T.Vector3(p.x,p.y+1.38*scale,p.z),.27);
    let t=null,headHit=false;if(th!=null&&(tb==null||th<=tb+.05)){t=th;headHit=true;}else t=tb;
    if(t!=null&&t<maxDist&&(!best||t<best.distance))best={c,distance:t,head:headHit};}
   if(!best)return null;best.point=origin.clone().addScaledVector(dir,best.distance);return best;
  }

  // Halo-style shields: hits drain the recharging shield first, then armour soaks part of the rest, then health.
  // The night zone ignores shields and armour. After SHIELD_DELAY seconds without damage the shield refills.
  function chime(freqs,gain=.08,step=.07){try{const ac=chime.ac||=new (window.AudioContext||window.webkitAudioContext)();if(ac.state!=='running')return;const t=ac.currentTime;
   freqs.forEach((f,i)=>{const o2=ac.createOscillator(),g=ac.createGain();o2.type='triangle';o2.frequency.value=f;g.gain.setValueAtTime(0,t+i*step);g.gain.linearRampToValueAtTime(gain,t+i*step+.01);g.gain.exponentialRampToValueAtTime(.0001,t+i*step+.22);o2.connect(g);g.connect(ac.destination);o2.start(t+i*step);o2.stop(t+i*step+.25);});}catch{}}
  // How hard a killing or heavy blow throws a body, by weapon.
  const FORCE={sniper:4.6,pump:4,rifle:2.6,smg:2.2,pistol:2.2,axe:3.4,melee:3.1,c4:6.2};
  function blowDirection(target,attacker,meta){if(meta.dir)return meta.dir.clone().setY(0).normalize();const from=attacker&&attacker!==target?posOf(attacker):null;const d=from?posOf(target).clone().sub(from).setY(0):new T.Vector3(0,0,1);return d.lengthSq()>1e-6?d.normalize():new T.Vector3(0,0,1);}
  function damage(target,amount,attacker,meta={}){
   if(!target?.alive||phase==='ended')return {killed:false};
   if(phase==='countdown')return {killed:false};
   if(!target.bot&&godMode)return {killed:false};
   let a=amount,shielded=0;
   if(target.shield>0&&meta.kind!=='zone'){shielded=Math.min(target.shield,a);target.shield-=shielded;a-=shielded;if(target.shield<=0&&target===player){chime([520,330,196],.09,.05);hud?.shieldBroken?.();}}
   if(target.armor>0&&meta.kind!=='zone'&&a>0){const absorb=Math.min(target.armor,a*.65);target.armor-=absorb;a-=absorb;}
   target.hp-=a;target.lastHurt=clock;
   if(target.bot){target.seen=attacker&&attacker!==target?attacker:target.seen;if(target.state!=='fight'&&attacker&&attacker!==target){target.state='fight';target.target=attacker;target.aimT=target.reaction*.5;}
    // Hit reactions: heavy blows knock the bot down into a ragdoll (it gets back up); light ones flinch it, at most
    // every 0.7 s so a spray cannot pin it down. Either way it side-steps out of the line of fire.
    if(target.hp-a>0&&meta.kind!=='zone'){const heavy=meta.blast||['sniper','axe','melee'].includes(meta.weapon)||(meta.weapon==='pump'&&amount>=30)||amount>=45;
     const dir=blowDirection(target,attacker,meta);if(heavy){target.model.motion?.hit?.(dir,2.2);}else if(clock-target.lastFlinch>.7){target.lastFlinch=clock;target.model.motion?.hit?.(dir,.7);}
     target.dodgeT=.38;target.strafe=Math.random()<.5?1:-1;}}
   else{combat.hurt(attacker&&attacker!==target?eyeOf(attacker):null,a+(amount-a)*.4+shielded*.55);if(meta.kind==='zone')combat.hurt(null,a*.4);hud.update();}
   if(target.hp<=0){kill(target,attacker,meta);return {killed:true};}
   return {killed:false};
  }
  function kill(target,attacker,meta){
   target.alive=false;target.hp=0;target.deathT=clock;
   if(attacker&&attacker!==target)attacker.kills++;
   const how=meta.kind==='zone'?'THE NIGHT':meta.weapon?W(meta.weapon)?.name||meta.weapon.toUpperCase():'';
   pushFeed(attacker&&attacker!==target?`${nameOf(attacker)} <i>${how}${meta.head?' · HEAD':''}</i> ${nameOf(target)}`:`${nameOf(target)} <i>${how||'FELL'}</i>`);
   // Drop what they carried.
   const p=posOf(target);let k=0;const spot=()=>{const a=k++*1.3;return [p.x+Math.cos(a)*.7,p.z+Math.sin(a)*.7];};
   if(target.bot){
    for(const id of Object.keys(target.weapons)){if(id==='axe')continue;const [x,z]=spot();const it=rollItem({weapon:id});it.loaded=target.weapons[id].loaded;dropItem(it,x,z);}
    for(const [type,n] of Object.entries(target.reserve)){if(n>0&&type!=='c4'){const [x,z]=spot();dropItem({type:'ammo',ammo:type,count:n,rarity:'common',label:AMMO_LABEL[type]+' AMMO ×'+n},x,z);}}
    if(target.garment){const [x,z]=spot();dropItem({type:'armor',armor:target.garment.armor,garment:target.garment,rarity:target.garment.rarity,label:target.garment.name.toUpperCase()+' · '+target.garment.armor+' ARMOR'},x,z);}
    target.hand.clear();
    target.model.motion?.knockdown?.(blowDirection(target,attacker,meta),meta.kind==='zone'?1.3:(FORCE[meta.weapon]||2.4)*(meta.head?1.15:1),{stay:true});
   }else{
    combat.holster();finish(false);
   }
   if(phase==='live'&&combatants().length<=1){const last=combatants()[0];finish(last===player);}
   hud?.update();
  }
  const nameOf=c=>c===player?'YOU':c.name;

  /* ---------------------------------------------------------------- pathfinding */
  function buildGrid(){
   const PF=root_PF();if(!PF)return;
   const w=Math.ceil(B[1]-B[0]),h=Math.ceil(B[3]-B[2]);const g=new PF.Grid(w,h);const p=new T.Vector3();
   for(let x=0;x<w;x++)for(let z=0;z<h;z++){p.set(B[0]+x+.5,0,B[2]+z+.5);if(blocked(p))g.setWalkableAt(x,z,false);}
   grid=g;finder=new PF.AStarFinder({diagonalMovement:PF.DiagonalMovement.OnlyWhenNoObstacles});
  }
  function root_PF(){return window.NightPathfinding;}
  function findPath(from,to){
   if(!grid)return [to.clone()];
   const c=v=>[clamp(Math.floor(v.x-B[0]),0,grid.width-1),clamp(Math.floor(v.z-B[2]),0,grid.height-1)];
   const [ax,az]=c(from),[bx,bz]=c(to);
   try{const path=finder.findPath(ax,az,bx,bz,grid.clone());if(!path.length)return [to.clone()];
    const out=[];for(let i=2;i<path.length;i+=3)out.push(new T.Vector3(B[0]+path[i][0]+.5,0,B[2]+path[i][1]+.5));out.push(to.clone());return out;}catch{return [to.clone()];}
  }

  /* ---------------------------------------------------------------- bot brain */
  function botWants(b,l){
   const it=l.item;
   if(it.type==='weapon'){const cur=['axe','pistol','pump','smg','rifle','sniper'].indexOf(b.weapon);return !b.weapons[it.weapon]&&['axe','pistol','pump','smg','rifle','sniper'].indexOf(it.weapon)>cur-1?3:0;}
   if(it.type==='armor')return it.armor>b.armor+5?2.5:0;
   if(it.type==='ammo')return Object.keys(b.weapons).some(id=>W(id)?.ammo===it.ammo)?1.5:0;
   if(it.type==='heal')return (b.heals.bandage+b.heals.medkit<3)?1:0;
   return 0;
  }
  function botTake(b,l){
   const it=l.item;
   if(it.type==='weapon'){b.weapons[it.weapon]={loaded:it.loaded};const [t,n]=AMMO_FOR[it.weapon]||[];if(t)b.reserve[t]=(b.reserve[t]||0)+Math.round(n*.5);setBotWeapon(b,botBestWeapon(b));}
   else if(it.type==='armor'){b.armor=it.armor;b.garment=it.garment;tintBot(b);}
   else if(it.type==='ammo')b.reserve[it.ammo]=(b.reserve[it.ammo]||0)+it.count;
   else if(it.type==='heal')b.heals[it.heal]+=it.count;
   removeLoot(l);
  }
  function tintBot(b){/* garments read as a colour band on the torso */const col=new T.Color().setHSL(Math.random(),.35,.5);b.model.root.traverse(n=>{if(n.isMesh&&n.material?.name==='shirt'){n.material=n.material.clone();n.material.color.copy(col);}});}

  function openChest(c,by){
   if(c.open)return;c.open=true;c.openT=clock;
   const n=1+(Math.random()<.55?1:0);let any=false;
   for(let i=0;i<n;i++){const it=rollItem(weighted(CENTER_TABLE));if(!it)continue;any=true;const a=c.group.rotation.y+rand(-.8,.8)+Math.PI/2;
    const l=dropItem(it,c.pos.x+Math.cos(a)*.15,c.pos.z+Math.sin(a)*.15,new T.Vector3(Math.cos(a)*rand(1.2,2),3.2,Math.sin(a)*rand(1.2,2)));l.y=c.pos.y+.5;l.group.position.y=l.y;}
   if(!any)dropItem(rollItem('bandage'),c.pos.x+.8,c.pos.z);
   c.glow.visible=false;
  }

  function updateBot(b,dt){
   const p=b.root.position;
   if(!b.alive){if(b.model.motion?.downAmount?.()>0){b.model.animate?.(clock,0);return;}const k=clamp((clock-b.deathT)/.6,0,1);b.root.rotation.x=-k*k*Math.PI/2*.96;b.root.position.y=groundY(p.x,p.z)+k*.15;return;}
   if(b.frozen){b.model.animate?.(clock,0);return;}
   // Zone damage
   if(phase==='live'&&outside(p)>0){b.zoneTick=(b.zoneTick||0)+dt;if(b.zoneTick>=1){b.zoneTick=0;damage(b,zoneDps(),null,{kind:'zone'});if(!b.alive)return;}}
   if(b.model.motion?.downAmount?.()>0){b.model.animate?.(clock,0);return;}
   if(clock-b.lastHurt>SHIELD_DELAY&&b.shield<b.shieldMax)b.shield=Math.min(b.shieldMax,b.shield+30*dt);
   b.think-=dt;b.fireT-=dt;b.reloadT-=dt;b.aimT-=dt;b.strafeT-=dt;b.repath-=dt;b.dodgeT-=dt;b.bashT-=dt;
   if(phase==='countdown'){b.model.animate?.(clock,0);return;}
   const eye=eyeOf(b);
   // Perception: closest visible enemy (staggered).
   if(b.think<=0){b.think=rand(.22,.38);
    let best=null,bd=1e9;const sight=b.weapon==='sniper'?120:b.weapon==='rifle'?70:45;
    const attacked=b.seen&&b.seen.alive&&clock-b.lastHurt<4?b.seen:null;
    const reach=b.state==='rush'?4.5:b.weapon==='axe'?9:sight;
    for(const c of combatants()){if(c===b)continue;const d=posOf(c).distanceTo(p);if((d<reach||c===attacked&&d<sight)&&d<bd&&los(eye,eyeOf(c))){best=c;bd=d;}}
    if(best&&(b.state!=='fight'||b.target!==best)){if(b.target!==best)b.aimT=b.reaction;b.target=best;b.state='fight';}
    if(b.state==='fight'&&b.target&&!attacked&&b.weapon==='axe'&&posOf(b.target).distanceTo(p)>12){b.state='loot';b.target=null;b.goal=null;}
    if(!best&&b.state==='fight'&&(!b.target?.alive||posOf(b.target).distanceTo(p)>60)){b.state='roam';b.target=null;b.goal=null;}
    // Heal when safe
    if(b.state!=='fight'&&b.hp<60&&(b.heals.medkit||b.heals.bandage)&&clock-b.lastHurt>4){if(b.heals.medkit){b.heals.medkit--;b.hp=Math.min(100,b.hp+60);}else{b.heals.bandage--;b.hp=Math.min(75,b.hp+15);}}
    // Zone pressure
    if(phase==='live'&&b.state!=='fight'&&(outside(p)>-4||(zone.state==='shrink'&&Math.hypot(p.x-zone.to.c.x,p.z-zone.to.c.z)>zone.to.r-3))){b.state='zone';b.goal=zone.state==='shrink'?zone.to.c.clone():zone.center.clone();b.goal.x+=rand(-3,3);b.goal.z+=rand(-3,3);b.path=findPath(p,b.goal);}
    // Loot decisions
    if(b.state==='rush'){const c=chests.filter(c=>!c.open).sort((x,y)=>x.pos.distanceTo(p)-y.pos.distanceTo(p))[0];if(c){if(b.goal!==c.pos){b.goal=c.pos;b.path=[c.pos.clone()];}}else b.state='loot';}
    if(b.state==='loot'||b.state==='roam'){
     const want=loot.map(l=>({l,s:botWants(b,l)/(1+l.pos.distanceTo(p)*.08)})).filter(x=>x.s>.05&&x.l.pos.distanceTo(p)<70).sort((x,y)=>y.s-x.s)[0];
     if(want){if(b.goal!==want.l.pos){b.goal=want.l.pos;b.path=findPath(p,want.l.pos);}b.state='loot';}
     else if(!b.goal||p.distanceTo(b.goal)<2.5){const lm=pick(layout.landmarks);b.goal=new T.Vector3(lm.x+rand(-3,3),0,lm.z+lm.d/2+3+rand(-2,2));if(phase==='live'&&outside(b.goal)>-3)b.goal=zone.center.clone();b.path=findPath(p,b.goal);b.state='roam';}
    }
   }
   // Interact
   if(b.state==='rush'||b.state==='loot'){
    for(const c of chests)if(!c.open&&c.pos.distanceTo(p)<1.4){openChest(c,b);b.goal=null;b.state='loot';}
    for(const l of loot.slice())if(!l.vel&&l.pos.distanceTo(p)<1.3&&botWants(b,l)>0)botTake(b,l);
   }
   // Movement + combat
   let move=new T.Vector3(),speed=3.6;
   if(b.state==='fight'&&b.target?.alive){
    const tp=posOf(b.target),to=tp.clone().sub(p);to.y=0;const dist=to.length();to.normalize();
    b.heading=Math.atan2(to.x,to.z);
    const id=b.weapon,w=W(id);
    if(id==='axe'){move.copy(to);speed=5;if(dist<1.8&&b.fireT<=0){b.fireT=.75;setTimeout(()=>{if(b.alive&&b.target?.alive&&posOf(b.target).distanceTo(b.root.position)<2.2)damage(b.target,w.dmg*.8,b,{weapon:'axe'});},350);}}
    else{
     let ideal=id==='pump'?6:id==='smg'?12:id==='pistol'?14:id==='sniper'?45:24;
     if(b.target===player&&player.shield<=0)ideal*=.55; // smells blood: closes in while your shield is down
     if(b.strafeT<=0){b.strafeT=rand(.35,1.1);b.strafe*=Math.random()<.6?-1:1;}
     if(dist<2.2&&b.bashT<=0){b.bashT=1.1;setTimeout(()=>{if(b.alive&&b.target?.alive&&posOf(b.target).distanceTo(b.root.position)<2.6)damage(b.target,45,b,{weapon:'melee'});},180);}
     const side=new T.Vector3(to.z,0,-to.x).multiplyScalar(b.strafe);move.copy(side).addScaledVector(to,dist>ideal+4?1:dist<ideal-4?-.7:0);speed=dist>ideal+10?4.8:2.6;
     if(b.dodgeT>0){move.copy(side).multiplyScalar(1.6).addScaledVector(to,.2);speed=6.5;}
     const gun=b.weapons[id];
     if(gun.loaded<=0&&b.reloadT<=0){const r=b.reserve[w.ammo]||0;if(r>0){b.reloadT=id==='pump'?2.4:2;b.pendingReload=true;}else{delete b.weapons[id];setBotWeapon(b,botBestWeapon(b));}}
     if(b.pendingReload&&b.reloadT<=0){const r=b.reserve[w.ammo]||0,take=Math.min(w.mag-gun.loaded,r);gun.loaded+=take;b.reserve[w.ammo]=r-take;b.pendingReload=false;}
     if(b.aimT<=0&&b.fireT<=0&&gun.loaded>0&&b.reloadT<=0&&dist<(w.range||80)){
      b.fireT=Math.max(w.interval,id==='sniper'?2.2:id==='pump'?1:w.auto?w.interval*1.6:.42)*rand(1,1.4);gun.loaded--;botShoot(b,b.target,w,dist);}
    }
   }else if(b.path.length){
    const wp=b.path[0];const to=wp.clone().sub(p);to.y=0;if(to.length()<.8){b.path.shift();}else{move.copy(to.normalize());b.heading=Math.atan2(move.x,move.z);}
    speed=b.state==='rush'||b.state==='zone'?5:3.6;
   }else if(b.goal&&b.state!=='fight'){b.path=findPath(p,b.goal);}
   // Steering + collisions (with separation so bots don't stack)
   for(const o2 of bots){if(o2===b||!o2.alive)continue;const dx=p.x-o2.root.position.x,dz=p.z-o2.root.position.z,d=Math.hypot(dx,dz);if(d<1.1&&d>1e-4){move.x+=dx/d*(1.1-d)*2.2;move.z+=dz/d*(1.1-d)*2.2;}}
   if(move.lengthSq()>0){move.normalize().multiplyScalar(speed*dt);const next=p.clone().add(move);
    if(!blocked(next)&&next.x>B[0]+1&&next.x<B[1]-1&&next.z>B[2]+1&&next.z<B[3]-1){p.x=next.x;p.z=next.z;}
    else if(b.goal&&b.repath<=0){b.repath=1.5;b.path=findPath(p,b.goal);}
    b.stride=Math.min(1,b.stride+dt*4);}else b.stride=Math.max(0,b.stride-dt*4);
   p.y=groundY(p.x,p.z);
   const dh=((b.heading-b.root.rotation.y+Math.PI*3)%TAU)-Math.PI;b.root.rotation.y+=dh*Math.min(1,dt*8);
   b.model.animate?.(clock,Math.min(1,b.stride*(speed/4.2)));
  }
  function botShoot(b,target,w,dist){
   const from=b.hand.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.05,0));
   const aim=eyeOf(target);aim.y-=rand(.1,.55);
   const moving=target===player?(player.speed||0):target.stride*3.6;
   let p=b.skill*clamp(1.15-dist/((w.range||80)*.8),.12,1)*(1-clamp(moving/7,0,.45));
   if(w.id==='pump')p=clamp(1.2-dist/18,0,1)*.9;
   const hit=Math.random()<p;
   const dir=aim.clone().sub(from).normalize();
   if(!hit){const off=new T.Vector3(rand(-1,1),rand(-.5,1),rand(-1,1)).multiplyScalar(dist*.04+.3);dir.copy(aim.clone().add(off).sub(from).normalize());}
   const far=from.clone().addScaledVector(dir,w.range||120),wt=segBlocked(from,far),wallD=wt===null?999:wt*(w.range||120);
   const th=hit?hitTest(from,dir,wallD,b):null;
   if(th){const head=Math.random()<.12;const dmg=w.dmg*(w.id==='pump'?clamp(1.3-dist/20,.3,1.2)*5:1)*(head?1.8:1);
    combat.remoteShot({from,to:th.point,weapon:w.id});damage(th.c,dmg,b,{weapon:w.id,head,dir});}
   else{const end=wt===null?from.clone().addScaledVector(dir,Math.min(60,dist+20)):from.clone().addScaledVector(dir,wallD);combat.remoteShot({from,to:end,weapon:w.id});}
  }

  /* ---------------------------------------------------------------- player */
  function playerTake(l){
   const it=l.item;const ars=combat.arsenal;
   if(it.type==='weapon'){
    const inv=ars.inspect();const guns=inv.owned.filter(id=>!['axe','c4'].includes(id));
    if(inv.owned.includes(it.weapon)){ars.addAmmo(W(it.weapon).ammo,it.loaded);toast('+'+it.loaded+' '+AMMO_LABEL[W(it.weapon).ammo]);removeLoot(l);return;}
    if(guns.length>=2){const cur=combat.inspect().weapon;const swap=guns.includes(cur)?cur:guns[0];const loaded=ars.drop(swap);const d=rollItem({weapon:swap});d.loaded=loaded;const p=posOf(player);dropItem(d,p.x+rand(-.5,.5),p.z+rand(-.5,.5));}
    ars.give(it.weapon,it.loaded);const [t,n]=AMMO_FOR[it.weapon]||[];if(t&&!(inv.reserve[t]>0))ars.addAmmo(t,Math.round(n*.5));combat.equip(it.weapon);
   }else if(it.type==='armor'){
    if(player.garment&&player.armor>0){const p=posOf(player);dropItem({type:'armor',armor:Math.round(player.armor),garment:player.garment,rarity:player.garment.rarity,label:player.garment.name.toUpperCase()+' · '+Math.round(player.armor)+' ARMOR'},p.x+.6,p.z);}
    player.armor=it.armor;player.armorMax=Math.max(it.armor,player.garment?.armor||0);player.garment=it.garment;player.worn.add(it.garment);
   }else if(it.type==='ammo')ars.addAmmo(it.ammo,it.count);
   else if(it.type==='heal')player.heals[it.heal]+=it.count;
   else if(it.type==='c4'){const inv=ars.inspect();if(!inv.owned.includes('c4'))ars.give('c4',0);ars.addAmmo('c4',it.count);}
   toast(it.label);removeLoot(l);hud.update();
  }
  function useHeal(){
   if(!player?.alive||player.healing)return;const kind=player.heals.medkit&&player.hp<70?'medkit':player.heals.bandage&&player.hp<75?'bandage':player.heals.medkit&&player.hp<100?'medkit':null;
   if(!kind){toast(player.hp>=100?'FULL HEALTH':'NOTHING TO HEAL WITH');return;}
   player.healing={kind,t:0,dur:kind==='medkit'?3.2:1.6};
  }
  function updatePlayer(dt){
   if(!player.alive)return;
   const p=posOf(player);
   if(clock-player.lastHurt>SHIELD_DELAY&&player.shield<player.shieldMax){if(!player.recharging){player.recharging=true;chime([392,523,659],.06);}player.shield=Math.min(player.shieldMax,player.shield+45*dt);hud.update();}else if(player.shield>=player.shieldMax)player.recharging=false;
   if(player.last){player.speed=Math.hypot(p.x-player.last.x,p.z-player.last.z)/Math.max(dt,1e-3);}player.last=p.clone();
   if(phase==='live'&&outside(p)>0){player.zoneTick=(player.zoneTick||0)+dt;if(player.zoneTick>=1){player.zoneTick=0;damage(player,zoneDps(),null,{kind:'zone'});}}
   o.setNight(phase==='idle'?null:clamp((outside(p)+2)/10,0,.85));
   if(player.healing){const h=player.healing;h.t+=dt;if(clock-player.lastHurt<.05&&h.t>.2){player.healing=null;toast('HEAL INTERRUPTED');}
    else if(h.t>=h.dur){player.heals[h.kind]--;player.hp=Math.min(h.kind==='medkit'?100:75,player.hp+(h.kind==='medkit'?60:15));player.healing=null;}}
   // Chest + pickup prompts
   const fwd=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);let best=null,bs=0;
   for(const c of chests){if(c.open)continue;const d=c.pos.distanceTo(p);if(d<2.2){const s=(2.2-d)+Math.max(0,fwd.dot(c.pos.clone().sub(camera.position).normalize()));if(s>bs){bs=s;best={chest:c};}}}
   for(const l of loot){if(l.vel)continue;const d=Math.hypot(l.pos.x-p.x,l.pos.z-p.z);if(d<2){const s=(2-d)+Math.max(0,fwd.dot(l.pos.clone().sub(camera.position).normalize()))*1.2;if(s>bs){bs=s;best={loot:l};}}}
   player.focus=best;hud.prompt(best?best.chest?'OPEN CHEST':(best.loot.item.type==='weapon'&&combat.arsenal.inspect().owned.filter(id=>!['axe','c4'].includes(id)).length>=2&&!combat.arsenal.inspect().owned.includes(best.loot.item.weapon)?'SWAP FOR ':'PICK UP ')+best.loot.item.label:null,best?.loot?.item.rarity);
  }
  function interact(){
   if(phase!=='live'||!player?.alive)return;const f=player.focus;if(!f)return;
   if(f.chest)openChest(f.chest,player);else playerTake(f.loot);
  }

  /* ---------------------------------------------------------------- HUD */
  function buildHud(){
   const host=o.hudHost;const el=document.createElement('div');el.id='battle-hud';
   el.innerHTML=`<div class="ar-top"><b class="ar-alive">8</b><span>ALIVE</span><em class="ar-zone"></em></div>
    <canvas class="ar-map" width="180" height="160" aria-label="Arena map"></canvas>
    <div class="ar-feed" aria-live="polite"></div>
    <div class="ar-count" aria-live="assertive"></div>
    <div class="ar-announce"></div>
    <div class="ar-prompt"><kbd>F</kbd><span></span></div>
    <div class="ar-vitals"><div class="ar-bar ar-shield"><i></i><span></span></div><div class="ar-bar ar-armor"><i></i><span></span></div><div class="ar-bar ar-hp"><i></i><span></span></div><div class="ar-heals"></div><div class="ar-heal-progress"><i></i></div></div>
    <div class="ar-end" hidden><div class="ar-end-card"><span class="ar-end-kicker"></span><h2></h2><p class="ar-end-stats"></p><div class="ar-loadout"></div><div class="ar-end-actions"><button class="ar-again">PLAY AGAIN</button><button class="ar-leave">LEAVE ARENA</button></div></div></div>
    <button class="ar-exit" title="Leave the arena">LEAVE</button>`;
   host.appendChild(el);const q=s=>el.querySelector(s);
   q('.ar-again').onclick=()=>{start();};q('.ar-leave').onclick=q('.ar-exit').onclick=()=>exit();
   let toastT=0,annT=0;const map=q('.ar-map').getContext('2d');
   const toMap=(x,z)=>[(x-B[0])/(B[1]-B[0])*180,(z-B[2])/(B[3]-B[2])*160];
   return {el,
    update(){
     q('.ar-alive').textContent=combatants().length;
     if(player){const sh=Math.max(0,player.shield||0);q('.ar-shield i').style.width=(player.shieldMax?sh/player.shieldMax*100:0)+'%';q('.ar-shield span').textContent=sh>0?'SHIELD '+Math.ceil(sh):'SHIELD DOWN';q('.ar-shield').classList.toggle('down',sh<=0);
      const hp=Math.max(0,player.hp),ar=Math.max(0,player.armor);q('.ar-hp i').style.width=hp+'%';q('.ar-hp span').textContent=Math.ceil(hp)+' HP';
      q('.ar-armor i').style.width=(player.armorMax?ar/player.armorMax*100:0)+'%';q('.ar-armor span').textContent=player.garment?`${Math.ceil(ar)} · ${player.garment.name.toUpperCase()}`:'NO ARMOR';
      q('.ar-heals').innerHTML=`<kbd>H</kbd> BANDAGE ×${player.heals.bandage} · MEDKIT ×${player.heals.medkit}`;
      q('.ar-heal-progress').style.opacity=player.healing?1:0;if(player.healing)q('.ar-heal-progress i').style.width=(player.healing.t/player.healing.dur*100)+'%';}
     if(zone){const ph=ZONE_PHASES[Math.max(0,zone.phase)],left=Math.max(0,(zone.state==='wait'?ph.wait:ph.shrink)-zone.t);
      q('.ar-zone').textContent=phase!=='live'?'':zone.state==='wait'?`NIGHT FALLS IN ${Math.floor(left/60)}:${String(Math.ceil(left)%60).padStart(2,'0')}`:`NIGHT CLOSING · ${Math.ceil(left)}s`;
      el.classList.toggle('in-dark',!!player?.alive&&outside(posOf(player))>0);}
     // minimap
     map.clearRect(0,0,180,160);map.fillStyle='rgba(18,24,20,.55)';map.fillRect(0,0,180,160);
     map.fillStyle='rgba(230,226,214,.5)';for(const l of layout.landmarks){const [x,y]=toMap(l.x-l.w/2,l.z-l.d/2);map.fillRect(x,y,l.w/(B[1]-B[0])*180,l.d/(B[3]-B[2])*160);}
     map.strokeStyle='rgba(230,226,214,.25)';map.beginPath();const [rx1,ry1]=toMap(11.7,B[2]),[rx2,ry2]=toMap(11.7,B[3]);map.moveTo(rx1,ry1);map.lineTo(rx2,ry2);map.stroke();
     if(zone){const [zx,zy]=toMap(zone.center.x,zone.center.z),rr=zone.r/(B[1]-B[0])*180;map.save();map.fillStyle='rgba(4,8,16,.55)';map.beginPath();map.rect(0,0,180,160);map.arc(zx,zy,Math.max(0,rr),0,TAU,true);map.fill('evenodd');map.restore();
      map.strokeStyle='#e9e6dc';map.lineWidth=1.5;map.beginPath();map.arc(zx,zy,Math.max(0,rr),0,TAU);map.stroke();
      if(phase==='live'){const [tx,ty]=toMap(zone.to.c.x,zone.to.c.z);map.setLineDash([3,3]);map.strokeStyle='rgba(255,255,255,.7)';map.beginPath();map.arc(tx,ty,zone.to.r/(B[1]-B[0])*180,0,TAU);map.stroke();map.setLineDash([]);}}
     for(const c of chests){if(c.open)continue;const [x,y]=toMap(c.pos.x,c.pos.z);map.fillStyle='#ffd27a';map.fillRect(x-1.5,y-1.5,3,3);}
     if(player?.alive){const p=posOf(player),[x,y]=toMap(p.x,p.z);const f=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);map.save();map.translate(x,y);map.rotate(Math.atan2(f.x,-f.z));map.fillStyle='#fff';map.beginPath();map.moveTo(0,-6);map.lineTo(4,4);map.lineTo(-4,4);map.fill();map.restore();}
    },
    prompt(text,rarity){const p=q('.ar-prompt');p.classList.toggle('show',!!text);if(text){p.querySelector('span').textContent=text;p.style.setProperty('--rar','#'+new T.Color(RARITY[rarity]||RARITY.common).getHexString());}},
    count(n){const c=q('.ar-count');c.textContent=n>0?n:'';c.classList.toggle('show',n>0);},
    announce(t){const a=q('.ar-announce');a.textContent=t;a.classList.remove('show');void a.offsetWidth;a.classList.add('show');clearTimeout(annT);annT=setTimeout(()=>a.classList.remove('show'),2600);},
    toast(t){this.announce(t);},
    feed(){q('.ar-feed').innerHTML=feed.slice(-5).map(f=>`<div>${f.html}</div>`).join('');},
    end(won){
     const card=q('.ar-end');card.hidden=false;const place=won?1:combatants().length+1;
     q('.ar-end-kicker').textContent=won?'LAST ONE STANDING':'YOU FELL AT NIGHT';q('.ar-end h2').textContent=won?'#1 · EDEN IS YOURS':`#${place} OF 8`;
     q('.ar-end-stats').textContent=`${player.kills} ELIMINATIONS · ${Math.floor((clock-matchStart)/60)}:${String(Math.floor(clock-matchStart)%60).padStart(2,'0')} SURVIVED`;
     const worn=[...player.worn];q('.ar-loadout').innerHTML=worn.length?`<span>WORN THIS MATCH</span>`+worn.map(g=>`<button class="ar-garment" data-id="${g.id}">${g.image?`<img src="${g.image}" alt="">`:''}<b>${g.name}</b><small>${g.price||''} · SHOP</small></button>`).join(''):'<span>NO PIECES WORN · FIND ARMOR IN THE CHESTS</span>';
     q('.ar-loadout').querySelectorAll('button').forEach(b=>b.onclick=()=>o.openShop?.(b.dataset.id));
     document.exitPointerLock?.();
    },
    shieldBroken(){const bar=q('.ar-shield');bar.classList.remove('broke');void bar.offsetWidth;bar.classList.add('broke');},
    hideEnd(){q('.ar-end').hidden=true;}
   };
  }
  function toast(t){hud?.toast(t);}
  function announce(t){hud?.announce(t);}
  function pushFeed(html){feed.push({html,t:clock});hud?.feed();}

  /* ---------------------------------------------------------------- lifecycle */
  async function build(){
   if(built)return;built=true;
   root=new T.Group();root.name='Arena';scene.add(root);
   if(!window.GardenCharacterSchema){try{const r=await fetch('/character-schema.json?v=3');if(r.ok)window.GardenCharacterSchema=await r.json();}catch{}}
   buildGrid();
   hud=buildHud();
   document.addEventListener('keydown',e=>{if(!active||e.ctrlKey||e.metaKey||['INPUT','TEXTAREA'].includes(e.target.tagName))return;const k=e.key.toLowerCase();if(k==='f'){e.preventDefault();interact();}if(k==='h'){e.preventDefault();useHeal();}});
  }
  function clearMatch(){
   for(const b of bots)b.root.parent?.remove(b.root);bots=[];
   for(const c of chests)c.group.parent?.remove(c.group);chests=[];
   for(const l of loot)l.group.parent?.remove(l.group);loot=[];feed=[];
   if(zone){zone.group.parent?.remove(zone.group);zone=null;}
  }
  async function start(){
   await build();hud.el.classList.add('on');hud.hideEnd();hud.el.classList.add('loading');hud.announce('PREPARING THE ARENA…');
   await combat.ready();hud.el.classList.remove('loading');
   clearMatch();active=true;phase='countdown';countdown=5;clock=0;ended=null;
   o.setNight(0);combat.setHudMode('arena');document.body.classList.add('battle-on');
   // Centre cache: one chest in the middle, six around it.
   makeChest(CENTER.x,CENTER.z,0);for(let i=0;i<6;i++){const a=i/6*TAU+.3;makeChest(CENTER.x+Math.cos(a)*4.6,CENTER.z+Math.sin(a)*4.6,-a+Math.PI/2);}
   // Landmark loot along each building's approach + random floor spawns.
   for(const lm of layout.landmarks){const list=LANDMARK_LOOT[lm.id]||['armor','bandage'];list.forEach((spec,i)=>{const x=lm.x-lm.w/2+1.5+(i/(list.length-1||1))*(lm.w-3),z=lm.z+lm.d/2+2.2+(i%2)*.9;const p=new T.Vector3(x,0,z);if(!blocked(p))dropItem(rollItem(spec),x,z);});}
   for(let i=0;i<10;i++){const x=rand(B[0]+6,B[1]-6),z=rand(B[2]+6,B[3]-6),p=new T.Vector3(x,0,z);if(blocked(p)||Math.hypot(x-CENTER.x,z-CENTER.z)<A.r)continue;dropItem(rollItem(pick(['ammo','armor','bandage',{weapon:pick(['pistol','pump','smg'])}])),x,z);}
   zone=buildZone();
   // Ring spawn: 8 evenly spaced slots facing the cache.
   const slots=[];for(let i=0;i<8;i++){const a=i/8*TAU;let x=CENTER.x+Math.cos(a)*A.ring,z=CENTER.z+Math.sin(a)*A.ring;for(let k=0;k<6&&blocked(new T.Vector3(x,0,z));k++){x=CENTER.x+Math.cos(a)*(A.ring-k*1.5);z=CENTER.z+Math.sin(a)*(A.ring-k*1.5);}slots.push([x,z]);}
   const me=Math.random()*8|0;
   player={alive:true,hp:100,shield:SHIELD_PLAYER,shieldMax:SHIELD_PLAYER,armor:0,armorMax:0,garment:null,worn:new Set(),heals:{bandage:0,medkit:0},kills:0,lastHurt:-9};
   slots.forEach(([x,z],i)=>{if(i===me){o.placePlayer(x,z,CENTER.x,CENTER.z);combat.syncLook();return;}const pos=new T.Vector3(x,groundY(x,z),z);makeBot(i,pos,Math.atan2(CENTER.x-x,CENTER.z-z));});
   combat.arsenal.set({owned:['axe'],reserve:{},loaded:{}});combat.equip('axe');
   matchStart=0;hud.update();hud.feed();hud.announce('BREAK THY RULE · ARENA');
  }
  function finish(won){if(phase==='ended')return;phase='ended';ended={won,at:clock};setTimeout(()=>hud.end(won),won?600:1400);}
  function exit(){
   active=false;phase='idle';clearMatch();document.body.classList.remove('battle-on');hud?.el.classList.remove('on');hud?.hideEnd();o.setNight(null);combat.arsenal.set(null);combat.setHudMode('');combat.holster();player=null;o.onExit?.();
  }

  function update(time,dt){
   if(!active)return;
   clock+=dt;
   if(phase==='countdown'){countdown-=dt;hud.count(Math.ceil(countdown));if(countdown<=0){phase='live';matchStart=clock;hud.count(0);hud.announce('GO · THE CACHE IS OPEN');}}
   updateZone(dt);
   for(const b of bots)updateBot(b,dt);
   if(player)updatePlayer(dt);
   // Loot physics + idle motion
   for(const l of loot){
    if(l.vel){l.vel.y-=9.8*dt;l.group.position.addScaledVector(l.vel,dt);const gy=groundY(l.group.position.x,l.group.position.z);if(l.group.position.y<=gy){l.group.position.y=gy;l.vel=null;l.pos.copy(l.group.position);l.y=gy;}}
    else{l.group.position.y=l.y+.08+Math.sin(clock*2+l.phase)*.04;l.group.children[0].rotation.y=clock*.8+l.phase;}
    if(l.group.userData.beam)l.group.userData.beam.lookAt(camera.position.x,l.group.userData.beam.getWorldPosition(new T.Vector3()).y,camera.position.z);
   }
   for(const c of chests){if(c.open){const k=clamp((clock-c.openT)/.45,0,1);c.lidPivot.rotation.x=-k*1.9*(1-.08*Math.sin(k*9)*(1-k));}}
   if(Math.floor(clock*4)!==Math.floor((clock-dt)*4))hud.update();
  }

  return {
   start,exit,update,
   active:()=>active,
   canMove:()=>!active||phase==='live'||phase==='ended',
   canAct:()=>!active||(phase==='live'&&!!player?.alive),
   shotHook(origin,dir,maxDist){if(!active)return null;const h=hitTest(origin,dir,maxDist,player);if(!h)return null;return {...h,apply:(dmg,meta)=>damage(h.c,dmg,player,{...meta,dir:dir.clone()})};},
   onExplosion(p,radius,dmg){if(!active)return;for(const c of combatants()){const d=posOf(c).distanceTo(p);if(d<radius&&los(p.clone().add(new T.Vector3(0,.4,0)),eyeOf(c)))damage(c,dmg*Math.pow(1-d/radius,1.2),player,{weapon:'c4',blast:true,dir:posOf(c).clone().sub(p).setY(0).normalize()});}},
   inspect:()=>({active,phase,clock:+clock.toFixed(1),alive:combatants().length,player:player&&{hp:Math.round(player.hp),shield:Math.round(player.shield),armor:Math.round(player.armor),garment:player.garment?.name||null,heals:player.heals,kills:player.kills},
    bots:bots.map(b=>({name:b.name,alive:b.alive,hp:Math.round(b.hp),shield:Math.round(b.shield),down:+(b.model.motion?.downAmount?.()||0).toFixed(2),state:b.state,weapon:b.weapon,armor:b.armor,x:+b.root.position.x.toFixed(1),z:+b.root.position.z.toFixed(1)})),
    zone:zone&&{phase:zone.phase,state:zone.state,r:+zone.r.toFixed(1),x:+zone.center.x.toFixed(1),z:+zone.center.z.toFixed(1)},chests:chests.filter(c=>c.open).length+'/'+chests.length,loot:loot.length,arsenal:combat.arsenal.inspect()}),
   _debug:{get bots(){return bots;},get player(){return player;},get loot(){return loot;},get chests(){return chests;},interact,damage,god(v=true){godMode=v;},place:(x,z,lx,lz,dp=0)=>{o.placePlayer(x,z,lx,lz);combat.syncLook(dp);},skip(t){countdown=0;clock+=t||0;},setZone(r){if(zone){zone.r=r;}}}
  };
 }
 root.createBattleArena=createArena;
})(window);
