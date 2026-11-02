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
 // The forever match: no rounds and no night zone. Dying puts you back in after a few seconds; kills, headshots and
 // events add to your score; weapon pads and chests restock; an event comes round every EVENT_GAP seconds.
 const RESPAWN_PLAYER=3,SPAWN_PROTECT=2,PAD_RESTOCK=30,CHEST_RESTOCK=60,EVENT_FIRST=25,EVENT_GAP=75;
 const POINTS={kill:10,head:3,bounty:25,hillTick:3,page:15};
 // Day and night (seconds): night brings the Attendant and the lost pages.
 const CYCLE={day:300,dusk:25,night:150,dawn:25},NIGHT_MAX=.86,ATTENDANT={speed:3.9,hit:55,every:1.4,stun:150,stunFor:8};
 const SUPPLY_TABLE=[[30,{weapon:'sniper'}],[30,{weapon:'rifle'}],[20,'c4'],[20,{weapon:'smg'}]];
 const STREAKS={2:'DOUBLE KILL',3:'TRIPLE KILL',4:'OVERKILL'},SPREES={5:'KILLING SPREE',10:'RAMPAGE',15:'UNTOUCHABLE'};
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
  let pads=[],event=null,nextEventAt=0,eventIndex=0,suspended=false,entering=false,savedArsenal=null;
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
   else if(item.type==='page'){const m=new T.Mesh(new T.PlaneGeometry(.32,.42),new T.MeshStandardMaterial({color:0xf3e6c4,emissive:0xffcf7a,emissiveIntensity:.8,roughness:.9,side:T.DoubleSide}));m.position.y=.32;m.rotation.x=-.25;g.add(m);}
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
   if(phase!=='live'||!zone)return;
   const P=ZONE_PHASES[Math.max(0,zone.phase)];
   zone.t+=dt;
   if(zone.phase<0){zone.phase=0;zone.state='wait';zone.t=0;zone.to={c:nextZoneTarget(zone.center,ZONE_PHASES[0].r),r:ZONE_PHASES[0].r};zone.from={c:zone.center.clone(),r:zone.r};}
   const ph=ZONE_PHASES[zone.phase];
   if(zone.state==='wait'&&zone.t>=ph.wait){zone.state='shrink';zone.t=0;zone.from={c:zone.center.clone(),r:zone.r};announce('NIGHT IS CLOSING IN');}
   if(zone.state==='shrink'){const k=clamp(zone.t/ph.shrink,0,1),e=k*k*(3-2*k);zone.center.lerpVectors(zone.from.c,zone.to.c,e);zone.r=lerp(zone.from.r,zone.to.r,e);
    if(k>=1&&zone.phase<ZONE_PHASES.length-1){zone.phase++;zone.state='wait';zone.t=0;const n=ZONE_PHASES[zone.phase];zone.to={c:nextZoneTarget(zone.center,n.r),r:n.r};}}
   zone.wall.scale.set(Math.max(.01,zone.r),1,Math.max(.01,zone.r));zone.group.position.set(zone.center.x,groundY(zone.center.x,zone.center.z)-2,zone.center.z);zone.mat.uniforms.time.value=clock;
  }
  const outside=p=>zone?Math.hypot(p.x-zone.center.x,p.z-zone.center.z)-zone.r:-999;
  const zoneDps=()=>zone?ZONE_PHASES[Math.max(0,zone.phase)].dps:0;

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
  // Bots flash when hit: cyan off the shield, white on the body.
  const FLASH={shield:new T.Color(0x45d6ff),body:new T.Color(0xffffff)};
  function flashBot(b,kind){
   if(!b.flashMats){b.flashMats=[];b.model.root.traverse(n=>{for(const m of n.isMesh?(Array.isArray(n.material)?n.material:[n.material]):[])if(m?.emissive&&!b.flashMats.includes(m)){m.userData.baseEmissive??=m.emissive.clone();b.flashMats.push(m);}});}
   b.flashT=.14;b.flashColor=FLASH[kind];
  }
  function updateFlash(b,dt){
   if(!(b.flashT>0))return;b.flashT=Math.max(0,b.flashT-dt);const k=b.flashT/.14;
   for(const m of b.flashMats)m.emissive.copy(m.userData.baseEmissive).lerp(b.flashColor,k*.85);
  }
  function damage(target,amount,attacker,meta={}){
   if(!target?.alive||phase==='ended')return {killed:false};
   if(phase==='countdown')return {killed:false};
   if(!target.bot&&godMode)return {killed:false};
   if(target===player&&clock<(player.protectUntil||0))return {killed:false};
   let a=amount,shielded=0;
   const raw=meta.kind==='zone'||meta.kind==='attendant';
   if(target.shield>0&&!raw){shielded=Math.min(target.shield,a);target.shield-=shielded;a-=shielded;if(target===player)hud?.shieldHit?.(shielded/40+(target.shield<=0?.5:0));if(target.shield<=0&&target===player){chime([520,330,196],.09,.05);hud?.shieldBroken?.();}}
   if(target.bot&&meta.kind!=='zone')flashBot(target,shielded>0&&a<=0?'shield':'body');
   if(target.armor>0&&!raw&&a>0){const absorb=Math.min(target.armor,a*.65);target.armor-=absorb;a-=absorb;}
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
   if(attacker&&attacker!==target){
    attacker.kills++;attacker.score=(attacker.score||0)+POINTS.kill+(meta.head?POINTS.head:0);
    attacker.multi=clock-(attacker.lastKillT??-9)<4?(attacker.multi||1)+1:1;attacker.lastKillT=clock;attacker.streak=(attacker.streak||0)+1;
    const call=SPREES[attacker.streak]||STREAKS[Math.min(4,attacker.multi)];
    if(call){if(attacker===player)announce(call);else if(SPREES[attacker.streak])pushFeed(`${nameOf(attacker)} <i>${call}</i>`);}
    if(event?.kind==='bounty'&&event.target===target){attacker.score+=POINTS.bounty;endEvent(`${nameOf(attacker)} CLAIMED THE BOUNTY · +${POINTS.bounty}`);}
   }
   target.deaths=(target.deaths||0)+1;target.streak=0;target.multi=0;
   const how=meta.kind==='attendant'?'THE ATTENDANT':meta.kind==='zone'?'THE NIGHT':meta.weapon?W(meta.weapon)?.name||meta.weapon.toUpperCase():'';
   pushFeed(attacker&&attacker!==target?`${nameOf(attacker)} <i>${how}${meta.head?' · HEAD':''}</i> ${nameOf(target)}`:`${nameOf(target)} <i>${how||'FELL'}</i>`);
   // Drop what they carried.
   const p=posOf(target);let k=0;const spot=()=>{const a=k++*1.3;return [p.x+Math.cos(a)*.7,p.z+Math.sin(a)*.7];};
   if(target.bot){
    for(const id of Object.keys(target.weapons)){if(id==='axe')continue;const [x,z]=spot();const it=rollItem({weapon:id});it.loaded=target.weapons[id].loaded;dropItem(it,x,z);}
    for(const [type,n] of Object.entries(target.reserve)){if(n>0&&type!=='c4'){const [x,z]=spot();dropItem({type:'ammo',ammo:type,count:n,rarity:'common',label:AMMO_LABEL[type]+' AMMO ×'+n},x,z);}}
    if(target.garment){const [x,z]=spot();dropItem({type:'armor',armor:target.garment.armor,garment:target.garment,rarity:target.garment.rarity,label:target.garment.name.toUpperCase()+' · '+target.garment.armor+' ARMOR'},x,z);}
    target.hand.clear();
    target.model.motion?.knockdown?.(blowDirection(target,attacker,meta),meta.kind==='zone'?1.3:(FORCE[meta.weapon]||(meta.kind==='attendant'?5.2:2.4))*(meta.head?1.15:1),{stay:true});
   }else{
    if(player.pages){const q=posOf(player);for(let i=0;i<player.pages;i++)dropItem({type:'page',rarity:'epic',label:'LOST PAGE'},q.x+rand(-1,1),q.z+rand(-1,1));player.pages=0;}
    combat.holster();player.respawnAt=clock+RESPAWN_PLAYER;player.killedBy=attacker&&attacker!==target?nameOf(attacker):null;
    announce(player.killedBy?`TAKEN BY ${player.killedBy}`:'YOU FELL');o.onDeath?.();
   }
   if(target.bot)target.respawnAt=clock+rand(6,10);
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
   if(c.open||c.dropping)return;c.open=true;c.openT=clock;
   const n=1+(Math.random()<.55?1:0);let any=false;
   if(c.supply){for(const spec of [weighted(SUPPLY_TABLE),'medkit','armor',{ammo:'rifle'}]){const it=rollItem(spec);if(!it)continue;const a=rand(0,TAU);const l=dropItem(it,c.pos.x+Math.cos(a)*.2,c.pos.z+Math.sin(a)*.2,new T.Vector3(Math.cos(a)*rand(1.4,2.4),3.6,Math.sin(a)*rand(1.4,2.4)));l.y=c.pos.y+.5;l.group.position.y=l.y;}c.glow.visible=false;c.restockAt=Infinity;if(event?.kind==='supply'&&event.chest===c)endEvent(`${nameOf(by)} TOOK THE SUPPLY DROP`);return;}
   c.restockAt=clock+CHEST_RESTOCK;
   for(let i=0;i<n;i++){const it=rollItem(weighted(CENTER_TABLE));if(!it)continue;any=true;const a=c.group.rotation.y+rand(-.8,.8)+Math.PI/2;
    const l=dropItem(it,c.pos.x+Math.cos(a)*.15,c.pos.z+Math.sin(a)*.15,new T.Vector3(Math.cos(a)*rand(1.2,2),3.2,Math.sin(a)*rand(1.2,2)));l.y=c.pos.y+.5;l.group.position.y=l.y;}
   if(!any)dropItem(rollItem('bandage'),c.pos.x+.8,c.pos.z);
   c.glow.visible=false;
  }

  function updateBot(b,dt){
   updateFlash(b,dt);
   const p=b.root.position;
   if(!b.alive){if(b.respawnAt&&clock>=b.respawnAt){respawnBot(b);return;}if(b.model.motion?.downAmount?.()>0){b.model.animate?.(clock,0);return;}const k=clamp((clock-b.deathT)/.6,0,1);b.root.rotation.x=-k*k*Math.PI/2*.96;b.root.position.y=groundY(p.x,p.z)+k*.15;return;}
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
    if(zone&&phase==='live'&&b.state!=='fight'&&(outside(p)>-4||(zone.state==='shrink'&&Math.hypot(p.x-zone.to.c.x,p.z-zone.to.c.z)>zone.to.r-3))){b.state='zone';b.goal=zone.state==='shrink'?zone.to.c.clone():zone.center.clone();b.goal.x+=rand(-3,3);b.goal.z+=rand(-3,3);b.path=findPath(p,b.goal);}
    // Events pull bots in: a landed supply crate within 80 m, and most of them go for the hill.
    if(event&&b.state!=='fight'){
     if(event.kind==='supply'&&!event.chest.open&&!event.chest.dropping&&event.chest.pos.distanceTo(p)<80){if(b.goal!==event.chest.pos){b.goal=event.chest.pos;b.path=findPath(p,event.chest.pos);}b.state='loot';}
     else if(event.kind==='hill'&&(b.id.charCodeAt(b.id.length-1)+eventIndex)%5<3&&Math.hypot(p.x-event.pos.x,p.z-event.pos.z)>3){if(b.goal!==event.pos){b.goal=event.pos;b.path=findPath(p,event.pos);}b.state='roam';}
    }
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
   if(it.type==='page'){player.pages=(player.pages||0)+1;toast(`LOST PAGE · ${player.pages} CARRIED · BRING THEM TO THE MOON TEMPLE`);removeLoot(l);hud.update();return;}
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
   el.innerHTML=`<div class="ar-top"><b class="ar-alive">0</b><span class="ar-top-label">SCORE</span><em class="ar-zone"></em></div>
    <div class="ar-board" hidden></div>
    <canvas class="ar-map" width="180" height="160" aria-label="Arena map"></canvas>
    <div class="ar-feed" aria-live="polite"></div>
    <div class="ar-count" aria-live="assertive"></div>
    <div class="ar-announce"></div>
    <div class="ar-prompt"><kbd>F</kbd><span></span></div>
    <div class="ar-vitals"><div class="ar-shimmer"></div><div class="ar-bar ar-shield"><i></i><span></span></div><div class="ar-bar ar-armor"><i></i><span></span></div><div class="ar-bar ar-hp"><i></i><span></span></div><div class="ar-heals"></div><div class="ar-heal-progress"><i></i></div></div>
    <div class="ar-end" hidden><div class="ar-end-card"><span class="ar-end-kicker"></span><h2></h2><p class="ar-end-stats"></p><div class="ar-loadout"></div><div class="ar-end-actions"><button class="ar-again">PLAY AGAIN</button><button class="ar-leave">LEAVE ARENA</button></div></div></div>
    <button class="ar-exit" title="Leave the arena">LEAVE</button>`;
   host.appendChild(el);const q=s=>el.querySelector(s);
   q('.ar-again').onclick=()=>{start();};q('.ar-leave').onclick=q('.ar-exit').onclick=()=>exit();
   let toastT=0,annT=0;const map=q('.ar-map').getContext('2d');
   const toMap=(x,z)=>[(x-B[0])/(B[1]-B[0])*180,(z-B[2])/(B[3]-B[2])*160];
   return {el,
    update(){
     const everyone=[player,...bots].filter(Boolean).sort((a,b)=>(b.score||0)-(a.score||0));
     q('.ar-alive').textContent=player?.score||0;q('.ar-top-label').textContent=player?`SCORE · #${everyone.indexOf(player)+1} OF ${everyone.length}`:'SCORE';
     const un=untilNight(),mm=x=>`${Math.floor(x/60)}:${String(Math.floor(x)%60).padStart(2,'0')}`;
     // A single countdown on screen: the independent night clock. Events show their name only.
     q('.ar-zone').textContent=(un>0?`NIGHT IN ${mm(un)}`:`DAWN IN ${mm(-un)}`)+(event?` · ${event.label}`:'')+(player?.pages?` · ${player.pages} PAGE${player.pages>1?'S':''} CARRIED`:'');
     const board=q('.ar-board');if(!board.hidden)board.innerHTML='<h3>BEYOND EDEN · OPEN MATCH</h3><table><tr><th></th><th>SCORE</th><th>KILLS</th><th>DEATHS</th></tr>'+everyone.map((c,i)=>`<tr class="${c===player?'me':''}"><td>${i+1}. ${nameOf(c)}${event?.kind==='bounty'&&event.target===c?' ★':''}</td><td>${c.score||0}</td><td>${c.kills||0}</td><td>${c.deaths||0}</td></tr>`).join('')+'</table>';
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
     if(attendant){const [x,y]=toMap(attendant.pos.x,attendant.pos.z);map.fillStyle='#b23cff';map.beginPath();map.arc(x,y,3.5+Math.sin(clock*8),0,TAU);map.fill();}
     if(event){const at=event.kind==='bounty'?(event.target?.alive?posOf(event.target):null):event.pos;if(at){const [x,y]=toMap(at.x,at.z),pulse=3+Math.sin(clock*6)*1.2;
      map.strokeStyle=map.fillStyle=event.kind==='supply'?'#ffd27a':event.kind==='hill'?'#7fe3ff':event.kind==='pages'?'#f3e6c4':'#ff6b5a';map.lineWidth=1.5;map.beginPath();
      if(event.kind==='hill'){map.arc(x,y,event.r/(B[1]-B[0])*180+pulse*.4,0,TAU);map.stroke();}else{map.arc(x,y,pulse,0,TAU);map.fill();}}}
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
    // Your shield taking a hit: a cyan shimmer around the edge of the screen, stronger with the damage.
    shieldHit(k){const el=q('.ar-shimmer');el.style.setProperty('--k',Math.min(1,.35+k).toFixed(2));el.classList.remove('on');void el.offsetWidth;el.classList.add('on');},
    shieldBroken(){const bar=q('.ar-shield');bar.classList.remove('broke');void bar.offsetWidth;bar.classList.add('broke');},
    hideEnd(){q('.ar-end').hidden=true;}
   };
  }
  function toast(t){hud?.toast(t);}
  function announce(t){hud?.announce(t);}
  function pushFeed(html){feed.push({html,t:clock});hud?.feed();}

  /* ---------------------------------------------------------------- forever match: spawns, kits, events */
  const DOOR_SPAWN=()=>new T.Vector3(11.7+rand(-1.5,1.5),0,-24.6);
  // Landmarks near the middle of the district: event sites and bot spawns.
  function nearLandmarks(){return layout.landmarks.filter(l=>Math.hypot(l.x-CENTER.x,l.z-CENTER.z)<65);}
  function farSpawn(){
   const others=combatants().map(posOf);let best=null,bestD=-1;
   for(let i=0;i<10;i++){const lm=pick(nearLandmarks()),p=new T.Vector3(lm.x+rand(-4,4),0,lm.z+lm.d/2+rand(4,8));if(blocked(p))continue;
    const d=others.length?Math.min(...others.map(o2=>o2.distanceTo(p))):99;if(d>bestD){bestD=d;best=p;}}
   return best||new T.Vector3(CENTER.x+rand(-6,6),0,CENTER.z+rand(-6,6));
  }
  function kitBot(b){b.weapons={axe:{loaded:0},pistol:{loaded:12}};b.reserve={pistol:24};setBotWeapon(b,'pistol');}
  function kitPlayer(){combat.arsenal.set({owned:['axe','pistol'],reserve:{pistol:24},loaded:{pistol:12}});combat.equip('pistol');}
  function respawnBot(b){
   const i=bots.indexOf(b),keep={name:b.name,kills:b.kills||0,deaths:b.deaths||0,score:b.score||0};
   b.root.parent?.remove(b.root);try{window.GardenCharacter.dispose?.(b.model);}catch{}
   const spot=farSpawn(),nb=makeBot(Number(b.id.slice(3))||0,new T.Vector3(spot.x,groundY(spot.x,spot.z),spot.z),rand(0,TAU));
   bots.pop();bots[i]=nb;Object.assign(nb,keep);kitBot(nb);nb.state='roam';
  }
  function respawnPlayer(){
   const spot=DOOR_SPAWN();
   Object.assign(player,{alive:true,hp:100,shield:SHIELD_PLAYER,armor:0,armorMax:0,garment:null,lastHurt:-9,healing:null,respawnAt:null,protectUntil:clock+SPAWN_PROTECT});
   o.placePlayer(spot.x,spot.z,spot.x,spot.z-6);combat.syncLook();kitPlayer();hud.count(0);hud.update();announce('BACK IN · '+SPAWN_PROTECT+'s PROTECTED');
  }
  function leader(){return [player,...bots].filter(c=>c&&(c.score||0)>0).sort((a,b)=>(b.score||0)-(a.score||0))[0]||null;}
  function hillRing(pos){
   const M=materials(),g=new T.Group();g.position.set(pos.x,groundY(pos.x,pos.z)+.04,pos.z);
   const ring=new T.Mesh(new T.PlaneGeometry(13,13),new T.MeshBasicMaterial({map:M.ring,color:0x7fe3ff,transparent:true,opacity:.75,depthWrite:false,blending:T.AdditiveBlending}));ring.rotation.x=-Math.PI/2;g.add(ring);
   const beam=new T.Mesh(new T.CylinderGeometry(6,6,6,48,1,true),new T.MeshBasicMaterial({map:M.beam,color:0x7fe3ff,transparent:true,opacity:.22,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));beam.position.y=3;g.add(beam);
   g.traverse(n=>{n.userData.noHit=true;n.raycast=()=>{};});root.add(g);return g;
  }
  function startEvent(){
   let kind=['supply','hill','bounty'][eventIndex++%3];if(kind==='bounty'&&!leader())kind='supply';
   const lm=pick(nearLandmarks());
   if(kind==='supply'){
    const x=lm.x+rand(-3,3),z=lm.z+lm.d/2+6,c=makeChest(x,z,rand(0,TAU));c.supply=true;c.dropping=true;c.group.position.y=c.pos.y+34;
    event={kind,chest:c,until:clock+75,label:'SUPPLY DROP · '+lm.name.toUpperCase(),pos:c.pos.clone()};announce('SUPPLY DROP INBOUND · '+lm.name.toUpperCase());
   }else if(kind==='hill'){
    const pos=new T.Vector3(lm.x,0,lm.z+lm.d/2+6);event={kind,pos,r:6,until:clock+60,tick:0,ring:hillRing(pos),label:'HOLD THE HILL · '+lm.name.toUpperCase()};announce('HOLD THE HILL · '+lm.name.toUpperCase());
   }else{const t=leader();event={kind,target:t,until:clock+60,label:'BOUNTY · '+nameOf(t)};announce(t===player?'THERE IS A BOUNTY ON YOU':`BOUNTY ON ${nameOf(t)} · +${POINTS.bounty}`);}
   hud.update();
  }
  function endEvent(msg){if(!event)return;if(event.ring)event.ring.parent?.remove(event.ring);event=null;nextEventAt=clock+EVENT_GAP;if(msg)announce(msg);hud?.update();}
  function updateEvent(dt){
   if(!event){if(clock>=nextEventAt)startEvent();return;}
   if(clock>event.until){endEvent(event.kind==='hill'?'THE HILL IS CLOSED':event.kind==='bounty'?'THE BOUNTY RAN OUT':'');return;}
   if(event.kind==='supply'){const c=event.chest;if(c.dropping){c.group.position.y=Math.max(c.pos.y,c.group.position.y-dt*11);c.group.rotation.y+=dt*.6;if(c.group.position.y<=c.pos.y){c.dropping=false;announce('THE SUPPLY DROP HAS LANDED');o.onImpact?.(c.pos,.8);}}}
   if(event.kind==='hill'){
    event.ring.children[1].material.opacity=.16+.1*Math.sin(clock*3);event.tick+=dt;
    if(event.tick>=1){event.tick=0;const inside=combatants().filter(c=>{const q=posOf(c);return Math.hypot(q.x-event.pos.x,q.z-event.pos.z)<event.r;});
     if(inside.length===1){inside[0].score=(inside[0].score||0)+POINTS.hillTick;if(inside[0]===player)hud.prompt?.('HOLDING THE HILL · +'+POINTS.hillTick,'rare');}
     else if(inside.length>1&&inside.includes(player))hud.prompt?.('CONTESTED','epic');}
   }
   if(event.kind==='bounty'&&!event.target)endEvent();
  }
  // ---- night: the Attendant hunts and the lost pages scatter
  let attendant=null,lastNight=0,beatAt=0;
  const smooth01=t=>t*t*(3-2*t);
  // One independent clock: the day/night cycle runs on real time, the same for everyone and whether or not you are
  // in the match, so walking in never resets it.
  const worldClock=()=>Date.now()/1000;
  function nightLevel(){const total=CYCLE.day+CYCLE.dusk+CYCLE.night+CYCLE.dawn;let t=worldClock()%total;if(t<CYCLE.day)return 0;t-=CYCLE.day;if(t<CYCLE.dusk)return smooth01(t/CYCLE.dusk);t-=CYCLE.dusk;if(t<CYCLE.night)return 1;t-=CYCLE.night;return 1-smooth01(Math.min(1,t/CYCLE.dawn));}
  function untilNight(){const total=CYCLE.day+CYCLE.dusk+CYCLE.night+CYCLE.dawn,t=worldClock()%total;return t<CYCLE.day?CYCLE.day-t:t<CYCLE.day+CYCLE.dusk+CYCLE.night?-(CYCLE.day+CYCLE.dusk+CYCLE.night-t):total-t+CYCLE.day;}
  const temple=()=>{const lm=layout.landmarks.find(l=>l.id==='temple')||layout.landmarks[0];return new T.Vector3(lm.x,0,lm.z+lm.d/2+3);};
  function startPages(){
   if(event)endEvent();
   for(let i=0;i<6;i++){const lm=pick(nearLandmarks()),x=lm.x+rand(-lm.w/2,lm.w/2),z=lm.z+lm.d/2+rand(3,9);if(!blocked(new T.Vector3(x,0,z)))dropItem({type:'page',rarity:'epic',label:'LOST PAGE'},x,z);}
   event={kind:'pages',until:clock+CYCLE.night+CYCLE.dusk,label:'LOST PAGES · BRING THEM TO THE MOON TEMPLE',pos:temple()};
  }
  function updateNight(dt){
   const n=nightLevel();o.setNight(n*NIGHT_MAX);
   if(n>.5&&lastNight<=.5){announce('NIGHT FALLS · THE ATTENDANT IS HUNTING');startPages();}
   if(n<=.5&&lastNight>.5){announce('DAWN · THE ATTENDANT RETREATS');if(event?.kind==='pages')endEvent();for(const l of loot.filter(l=>l.item.type==='page'))removeLoot(l);}
   lastNight=n;
   // Pages are worth points at the Moon Temple.
   if(player?.alive&&player.pages&&posOf(player).distanceTo(temple())<6){const k=player.pages;player.score=(player.score||0)+k*POINTS.page;player.pages=0;announce(`${k} PAGE${k>1?'S':''} DELIVERED · +${k*POINTS.page}`);hud.update();}
   const w=garden.district?.watcher;if(!w)return;
   if(n<.6){if(attendant){attendant=null;w.visible=false;}return;}
   if(!attendant){const spot=farSpawn();attendant={pos:spot,stunUntil:0,hurt:0,hitT:0};w.visible=true;}
   const a=attendant,targets=combatants();let target=null,bd=1e9;
   for(const c of targets){const d=posOf(c).distanceTo(a.pos);if(d<bd){bd=d;target=c;}}
   a.hitT-=dt;
   if(target&&clock>=a.stunUntil){
    const to=posOf(target).clone().sub(a.pos).setY(0),d=to.length();
    if(d>1.2)a.pos.addScaledVector(to.normalize(),Math.min(d-1.1,ATTENDANT.speed*dt));
    w.rotation.y=Math.atan2(to.x,to.z);
    if(d<1.6&&a.hitT<=0){a.hitT=ATTENDANT.every;damage(target,ATTENDANT.hit,null,{kind:'attendant',blast:true,dir:to.clone().normalize()});chime([62,41],.16,.09);if(target===player)o.onImpact?.(a.pos,1.2);}
   }
   w.position.set(a.pos.x,groundY(a.pos.x,a.pos.z)+Math.sin(clock*1.7)*.06+(clock<a.stunUntil?-.4:0),a.pos.z);
   // A heartbeat that quickens as it closes in on you.
   if(player?.alive){const d=posOf(player).distanceTo(a.pos);if(d<28&&clock>=beatAt){beatAt=clock+.35+d/28*1.2;chime([55,46],.13,.11);}}
  }
  function hurtAttendant(amount){
   const a=attendant;if(!a||clock<a.stunUntil)return;a.hurt+=amount;
   if(a.hurt>=ATTENDANT.stun){a.hurt=0;a.stunUntil=clock+ATTENDANT.stunFor;announce('THE ATTENDANT IS STUNNED');chime([330,247,185],.1,.06);}
  }
  function restock(){
   for(const pad of pads){if(loot.includes(pad.l))continue;if(!pad.respawnAt)pad.respawnAt=clock+PAD_RESTOCK;else if(clock>=pad.respawnAt){pad.l=dropItem(rollItem(pad.spec),pad.x,pad.z);pad.respawnAt=0;}}
   for(const c of chests)if(c.open&&!c.supply&&c.restockAt&&clock>=c.restockAt){c.open=false;c.lidPivot.rotation.x=0;c.glow.visible=true;c.restockAt=0;}
  }

  /* ---------------------------------------------------------------- lifecycle */
  async function build(){
   if(built)return;built=true;
   root=new T.Group();root.name='Arena';scene.add(root);
   if(!window.GardenCharacterSchema){try{const r=await fetch('/character-schema.json?v=3');if(r.ok)window.GardenCharacterSchema=await r.json();}catch{}}
   buildGrid();
   hud=buildHud();
   document.addEventListener('keydown',e=>{if(!active||e.ctrlKey||e.metaKey||['INPUT','TEXTAREA'].includes(e.target.tagName))return;const k=e.key.toLowerCase();if(k==='f'){e.preventDefault();interact();}if(k==='h'){e.preventDefault();useHeal();}if(e.key==='Tab'){e.preventDefault();const b=hud.el.querySelector('.ar-board');b.hidden=false;hud.update();}});
   document.addEventListener('keyup',e=>{if(e.key==='Tab'&&hud)hud.el.querySelector('.ar-board').hidden=true;});
  }
  function clearMatch(){
   for(const b of bots)b.root.parent?.remove(b.root);bots=[];
   for(const c of chests)c.group.parent?.remove(c.group);chests=[];
   for(const l of loot)l.group.parent?.remove(l.group);loot=[];feed=[];
   if(zone){zone.group.parent?.remove(zone.group);zone=null;}
   if(event?.ring)event.ring.parent?.remove(event.ring);event=null;attendant=null;lastNight=0;if(garden.district?.watcher)garden.district.watcher.visible=false;
  }
  // Beyond Eden is always on: walking through the hidden door starts the match (or picks it up where you left it),
  // walking back into the garden pauses it. walkIn: keep the player where they are instead of placing them.
  async function start({walkIn=false}={}){
   entering=true;
   try{
    await build();hud.el.classList.add('on');hud.hideEnd();hud.el.classList.add('loading');hud.announce('ENTERING BEYOND EDEN…');
    await combat.ready();hud.el.classList.remove('loading');
    clearMatch();pads=[];event=null;eventIndex=0;active=true;suspended=false;phase='live';countdown=0;clock=0;ended=null;matchStart=0;nextEventAt=EVENT_FIRST;
    o.setNight(0);combat.setHudMode('arena');document.body.classList.add('battle-on');
    // Centre cache: one chest in the middle, six around it; they restock a minute after being opened.
    makeChest(CENTER.x,CENTER.z,0);for(let i=0;i<6;i++){const a=i/6*TAU+.3;makeChest(CENTER.x+Math.cos(a)*4.6,CENTER.z+Math.sin(a)*4.6,-a+Math.PI/2);}
    // Weapon pads along each building's approach: whatever is taken comes back PAD_RESTOCK seconds later.
    for(const lm of layout.landmarks){const list=LANDMARK_LOOT[lm.id]||['armor','bandage'];list.forEach((spec,i)=>{const x=lm.x-lm.w/2+1.5+(i/(list.length-1||1))*(lm.w-3),z=lm.z+lm.d/2+2.2+(i%2)*.9;const p=new T.Vector3(x,0,z);if(!blocked(p))pads.push({spec,x,z,l:dropItem(rollItem(spec),x,z),respawnAt:0});});}
    for(let i=0;i<10;i++){const x=rand(B[0]+6,B[1]-6),z=rand(B[2]+6,B[3]-6),p=new T.Vector3(x,0,z);if(blocked(p)||Math.hypot(x-CENTER.x,z-CENTER.z)<A.r)continue;dropItem(rollItem(pick(['ammo','armor','bandage',{weapon:pick(['pistol','pump','smg'])}])),x,z);}
    player={alive:true,hp:100,shield:SHIELD_PLAYER,shieldMax:SHIELD_PLAYER,armor:0,armorMax:0,garment:null,worn:new Set(),heals:{bandage:0,medkit:0},kills:0,deaths:0,score:0,lastHurt:-9,protectUntil:SPAWN_PROTECT};
    if(!walkIn){const spot=DOOR_SPAWN();o.placePlayer(spot.x,spot.z,spot.x,spot.z-6);combat.syncLook();}
    for(let i=0;i<7;i++){const spot=farSpawn(),b=makeBot(i,new T.Vector3(spot.x,groundY(spot.x,spot.z),spot.z),rand(0,TAU));kitBot(b);b.state='roam';b.score=0;b.deaths=0;}
    kitPlayer();hud.update();hud.feed();hud.announce('BEYOND EDEN · OPEN MATCH');
   }finally{entering=false;}
  }
  function suspend(){
   if(!active)return;active=false;suspended=true;savedArsenal=combat.arsenal.inspect();
   document.body.classList.remove('battle-on');hud?.el.classList.remove('on');o.setNight(null);combat.holster();if(garden.district?.watcher)garden.district.watcher.visible=false;combat.arsenal.set(null);combat.setHudMode('');
  }
  function resume(){
   active=true;suspended=false;hud.el.classList.add('on');document.body.classList.add('battle-on');combat.setHudMode('arena');o.setNight(0);
   combat.arsenal.set(savedArsenal&&savedArsenal.owned?.length?savedArsenal:{owned:['axe','pistol'],reserve:{pistol:24},loaded:{pistol:12}});
   if(player&&!player.alive)player.respawnAt=Math.min(player.respawnAt??clock,clock+1);
   hud.update();announce('BACK BEYOND EDEN');
  }
  async function enter(){if(active||entering)return;if(suspended&&player){resume();return;}await start({walkIn:true});}
  function finish(won){if(phase==='ended')return;phase='ended';ended={won,at:clock};setTimeout(()=>hud.end(won),won?600:1400);}
  // LEAVE: back to the garden; the match waits there for you.
  function exit(){suspend();o.onExit?.();}

  function update(time,dt){
   if(!active)return;
   clock+=dt;
   if(phase==='countdown'){countdown-=dt;hud.count(Math.ceil(countdown));if(countdown<=0){phase='live';matchStart=clock;hud.count(0);hud.announce('GO · THE CACHE IS OPEN');}}
   updateZone(dt);updateNight(dt);if(event?.kind!=='pages'&&nightLevel()<.5)updateEvent(dt);
   if(Math.floor(clock)!==Math.floor(clock-dt))restock();
   if(player&&!player.alive&&player.respawnAt!=null){const left=player.respawnAt-clock;if(left<=0)respawnPlayer();else hud.count(Math.ceil(left));}
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
   start,exit,update,enter,suspend,
   active:()=>active,busy:()=>active||entering,suspended:()=>suspended,dead:()=>active&&!!player&&!player.alive,
   canMove:()=>!active||phase==='live'||phase==='ended',
   canAct:()=>!active||(phase==='live'&&!!player?.alive),
   shotHook(origin,dir,maxDist){if(!active)return null;const h=hitTest(origin,dir,maxDist,player);
    if(attendant){const a=attendant.pos,t=rayCapsule(origin,dir,new T.Vector3(a.x,a.y+.5,a.z),new T.Vector3(a.x,a.y+3,a.z),.45);if(t!=null&&t<maxDist&&(!h||t<h.distance))return {c:null,distance:t,head:false,point:origin.clone().addScaledVector(dir,t),apply:dmg=>{hurtAttendant(dmg);return {killed:false};}};}
    if(!h)return null;return {...h,apply:(dmg,meta)=>damage(h.c,dmg,player,{...meta,dir:dir.clone()})};},
   onExplosion(p,radius,dmg){if(!active)return;if(attendant&&attendant.pos.distanceTo(p)<radius)hurtAttendant(dmg);for(const c of combatants()){const d=posOf(c).distanceTo(p);if(d<radius&&los(p.clone().add(new T.Vector3(0,.4,0)),eyeOf(c)))damage(c,dmg*Math.pow(1-d/radius,1.2),player,{weapon:'c4',blast:true,dir:posOf(c).clone().sub(p).setY(0).normalize()});}},
   inspect:()=>({active,phase,clock:+clock.toFixed(1),alive:combatants().length,event:event&&{kind:event.kind,label:event.label},night:+nightLevel().toFixed(2),attendant:attendant&&{x:+attendant.pos.x.toFixed(1),z:+attendant.pos.z.toFixed(1),stunned:clock<attendant.stunUntil},pages:player?.pages||0,nextEvent:+(nextEventAt-clock).toFixed(1),pads:pads.length,player:player&&{alive:player.alive,score:player.score||0,deaths:player.deaths||0,hp:Math.round(player.hp),shield:Math.round(player.shield),armor:Math.round(player.armor),garment:player.garment?.name||null,heals:player.heals,kills:player.kills},
    bots:bots.map(b=>({name:b.name,score:b.score||0,kills:b.kills||0,alive:b.alive,hp:Math.round(b.hp),shield:Math.round(b.shield),down:+(b.model.motion?.downAmount?.()||0).toFixed(2),state:b.state,weapon:b.weapon,armor:b.armor,x:+b.root.position.x.toFixed(1),z:+b.root.position.z.toFixed(1)})),
    zone:zone&&{phase:zone.phase,state:zone.state,r:+zone.r.toFixed(1),x:+zone.center.x.toFixed(1),z:+zone.center.z.toFixed(1)},chests:chests.filter(c=>c.open).length+'/'+chests.length,loot:loot.length,arsenal:combat.arsenal.inspect()}),
   _debug:{get bots(){return bots;},get player(){return player;},get loot(){return loot;},get chests(){return chests;},interact,damage,god(v=true){godMode=v;},place:(x,z,lx,lz,dp=0)=>{o.placePlayer(x,z,lx,lz);combat.syncLook(dp);},skip(t){countdown=0;clock+=t||0;},setZone(r){if(zone){zone.r=r;}}}
  };
 }
 root.createBattleArena=createArena;
})(window);
