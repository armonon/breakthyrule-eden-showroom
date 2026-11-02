'use strict';
// World extras that tie the garden to the collection and give the road and the ring some beats:
// three hidden garments, hourly timed drops, the mile marker, the Fool's toll gate (a riddle),
// and Fight Night bouts in the amphitheater with a personal Fools' Ladder and the Fool's Wraps.
window.createEdenExtras=function({T,scene,camera,garden,combat,secrets,collection,reduced=false,stage,getPlayer,inspectGarment,expeditionActive=()=>false,ambience=null,requestDraw=()=>{},addPickable=()=>{}}){
 const now=()=>performance.now()/1000,progress=secrets.progress,world=stage.closest('#world')||stage.parentElement;
 const door=garden.skybox.door,roadX=door.x,theater=window.showroomAmphitheaterPosition;
 const stone=new T.MeshStandardMaterial({color:0xc9c4b2,roughness:.9}),iron=new T.MeshStandardMaterial({color:0x2a2c2d,metalness:.6,roughness:.45});
 function textPlane(width,height,draw,px=512){const c=document.createElement('canvas');c.width=px;c.height=Math.round(px*height/width);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:texture,roughness:.9}));mesh.userData.redraw=(...args)=>{draw(c.getContext('2d'),c.width,c.height,...args);texture.needsUpdate=true;};mesh.userData.redraw();return mesh;}
 const glowTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),grad=g.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(255,236,170,.9)');grad.addColorStop(.4,'rgba(255,214,120,.35)');grad.addColorStop(1,'rgba(255,214,120,0)');g.fillStyle=grad;g.fillRect(0,0,128,128);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;})();
 function glow(size){const s=new T.Sprite(new T.SpriteMaterial({map:glowTexture,transparent:true,depthWrite:false,blending:T.AdditiveBlending,fog:false}));s.scale.set(size,size,1);return s;}
 function indexOf(...needles){for(const n of needles){const i=collection.findIndex(c=>(c.name+' '+(c.model||'')).toLowerCase().includes(n));if(i>=0)return i;}return 0;}
 async function garmentModel(index,height=.55){
  const item=collection[index],url=item.rackModel||item.model;let model;
  if(url&&window.showroomAssets&&window.prepareCollectionModel){try{model=window.prepareCollectionModel(T,(await window.showroomAssets.model(url)).scene);}catch{}}
  if(!model){const image=item.images?.[0]||item.image;const t=new T.TextureLoader().load(image);t.colorSpace=T.SRGBColorSpace;model=new T.Mesh(new T.PlaneGeometry(.5,.6),new T.MeshStandardMaterial({map:t,side:T.DoubleSide,transparent:true,alphaTest:.1}));model.userData.size=[.5,.6,.01];}
  const size=model.userData.size||[1,1,1];model.scale.setScalar(height/Math.max(.01,size[1]));return model;
 }
 // ---------- Hidden garments ----------
 const hidden=[
  {id:'backstage',index:indexOf('hermetic','hoodie'),at:new T.Vector3(9.15,.95,-24.7),reach:5,hint:'behind the curtain'},
  {id:'road',index:indexOf('star gate','stargate','all-seeing','all seeing'),at:new T.Vector3(roadX-3.4,1.0,-47),reach:5,hint:'along the bricks',requires:()=>!!progress.toll},
  {id:'tree',index:indexOf('eternal','adonai','cross'),at:new T.Vector3(1.75,3.55,-6.2),reach:9,hint:'in the oldest tree'}
 ];
 function placeHidden(h){
  if(progress.found.includes(h.id)||h.group||(h.requires&&!h.requires()))return;
  const group=new T.Group();group.position.copy(h.at);group.name='Hidden garment: '+h.id;scene.add(group);h.group=group;
  const halo=glow(.9);group.add(halo);
  if(h.id==='backstage'){const crate=new T.Mesh(new T.BoxGeometry(.7,.6,.7),new T.MeshStandardMaterial({color:0x7a5b3a,roughness:.9}));crate.position.set(h.at.x,.3,h.at.z);scene.add(crate);}
  if(h.id==='road'){const plinth=new T.Mesh(new T.CylinderGeometry(.32,.38,.65,16),stone);plinth.position.set(h.at.x,.32,h.at.z);scene.add(plinth);}
  garmentModel(h.index,.5).then(model=>{model.traverse(n=>{if(n.isMesh){n.userData.onPick=()=>claim(h);addPickable(n);}});halo.userData.onPick=()=>claim(h);group.add(model);h.model=model;requestDraw();});
 }
 for(const h of hidden)placeHidden(h);
 function claim(h){
  const p=getPlayer();if(!p||Math.hypot(p.position.x-h.at.x,p.position.z-h.at.z)>h.reach){secrets.notify('Something glints there. Get closer.');return;}
  if(progress.found.includes(h.id))return;progress.found.push(h.id);secrets.changed();h.group.traverse(n=>{n.userData.onPick=null;n.layers.set(31);});h.group.removeFromParent();
  secrets.notify('Found: '+collection[h.index].name+' — hidden '+h.hint+' ('+progress.found.length+'/3)','found');
  inspectGarment(h.index);
 }
 // ---------- Hourly drops (same schedule for every visitor, no server needed) ----------
 const DROP_AT=new T.Vector3(4.6,0,15.4),DROP_MINUTES=10;
 const force=new URLSearchParams(location.search).get('drop')==='1',forcedAt=Date.now();
 const crate=new T.Group();crate.name='The Drop';crate.visible=false;scene.add(crate);
 {const logo=new T.TextureLoader().load('/logo.png');logo.colorSpace=T.SRGBColorSpace;
  const body=new T.Mesh(new T.BoxGeometry(1,1,1),[...Array(6)].map((_,i)=>new T.MeshStandardMaterial({color:i===2||i===3?0x1d1d1f:0xf3f0e8,map:i===2||i===3?null:logo,roughness:.6,metalness:.1})));body.position.y=.5;crate.add(body);
  for(const y of [.04,.96])for(const z of [-.5,.5]){const band=new T.Mesh(new T.BoxGeometry(1.04,.06,.04),iron);band.position.set(0,y,z);crate.add(band);}
  crate.traverse(n=>{if(n.isMesh){n.castShadow=true;n.userData.onPick=()=>openDrop();addPickable(n);}});}
 const beam=new T.Mesh(new T.CylinderGeometry(.55,.9,40,24,1,true),new T.MeshBasicMaterial({color:0xfff1c4,transparent:true,opacity:.22,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,fog:false}));beam.position.set(DROP_AT.x,20,DROP_AT.z);beam.visible=false;scene.add(beam);
 const chip=document.createElement('div');chip.id='eden-drop';chip.hidden=true;world.append(chip);chip.onclick=()=>openDrop(true);
 function dropState(){
  const ms=force?Date.now()-forcedAt:Date.now()%3600000,minutes=ms/60000,hour=Math.floor((force?forcedAt:Date.now())/3600000);
  return {live:minutes<DROP_MINUTES,age:ms/1000,untilNext:(3600000-ms)/1000,featured:hour%collection.length};
 }
 function openDrop(fromChip=false){const s=dropState();if(!s.live)return;const p=getPlayer();if(!fromChip&&p&&Math.hypot(p.position.x-DROP_AT.x,p.position.z-DROP_AT.z)>9){secrets.notify('The Drop is live by the east lawn. Walk over to open it.');return;}inspectGarment(s.featured);if(!progress.drops?.includes(Math.floor(Date.now()/3600000))){(progress.drops??=[]).push(Math.floor(Date.now()/3600000));progress.drops=progress.drops.slice(-24);secrets.changed();}}
 let dropAnnounced=false;
 function updateDrop(t){
  const s=dropState(),format=x=>Math.floor(x/60)+':'+String(Math.floor(x%60)).padStart(2,'0');
  crate.visible=beam.visible=s.live;
  if(s.live){
   const fall=Math.min(1,s.age/6),ease=1-(1-fall)**3;crate.position.set(DROP_AT.x,30*(1-ease),DROP_AT.z);crate.rotation.y=reduced?0:t*.3;
   beam.material.opacity=.22*(fall<1?1:Math.max(.25,1-(s.age-6)/30));
   chip.hidden=false;chip.textContent='THE DROP · LIVE · '+collection[s.featured].name.toUpperCase();
   if(!dropAnnounced){dropAnnounced=true;secrets.notify('THE DROP is falling into the garden: '+collection[s.featured].name,'found');}
  }else{dropAnnounced=false;chip.hidden=s.untilNext>600;chip.textContent='NEXT DROP · '+format(s.untilNext);}
  return s.live&&s.age<7;
 }
 // ---------- Mile marker ----------
 const marker=new T.Group();marker.position.set(roadX+2.9,0,-36.5);marker.rotation.y=Math.PI;scene.add(marker);
 const post=new T.Mesh(new T.BoxGeometry(.5,1.5,.32),stone);post.position.y=.75;post.castShadow=true;marker.add(post);
 const plaque=textPlane(.46,.62,(c,w,h)=>{c.fillStyle='#e7e0cc';c.fillRect(0,0,w,h);c.fillStyle='#3b3226';c.textAlign='center';c.font='600 40px Georgia';c.fillText('YOU HAVE',w/2,90);c.fillText('WALKED',w/2,140);c.font='700 96px Georgia';c.fillText(String(Math.floor(progress.roadMeters||0)),w/2,265);c.font='600 34px Georgia';c.fillText('METRES OF',w/2,330);c.fillText('THE LONG',w/2,375);c.fillText('BRICK ROAD',w/2,420);c.font='italic 26px Georgia';c.fillText('(your steps only)',w/2,480);},360);
 plaque.position.set(.255,1.05,0);plaque.rotation.y=Math.PI/2;marker.add(plaque);
 let last=null,shownMeters=Math.floor(progress.roadMeters||0);
 function updateMiles(){
  const p=getPlayer();if(!p){last=null;return;}const at=p.position;
  if(last&&at.z<door.z-.5&&!expeditionActive()){const d=Math.hypot(at.x-last.x,at.z-last.z);if(d<3){progress.roadMeters=(progress.roadMeters||0)+d;}}
  last=at.clone();const m=Math.floor(progress.roadMeters||0);if(m-shownMeters>=5){shownMeters=m;plaque.userData.redraw();secrets.changed();}
 }
 // ---------- The Fool's toll (a roadside booth; answering reveals the road's hidden garment) ----------
 const TOLL=new T.Vector3(roadX-4.4,0,-25.2),tollGroup=new T.Group();tollGroup.name='The Fool\'s toll';tollGroup.position.copy(TOLL);scene.add(tollGroup);
 for(const s of [-1,1]){const pillar=new T.Mesh(new T.BoxGeometry(.45,2.2,.45),stone);pillar.position.set(0,1.1,s*1.3);pillar.castShadow=true;tollGroup.add(pillar);const cap=new T.Mesh(new T.ConeGeometry(.38,.45,4),stone);cap.rotation.y=Math.PI/4;cap.position.set(0,2.42,s*1.3);tollGroup.add(cap);}
 const arm=new T.Group();arm.position.set(.05,1.0,-1.1);tollGroup.add(arm);
 const bar=new T.Mesh(new T.BoxGeometry(.1,.12,2.3),new T.MeshStandardMaterial({color:0x6b2ea3,roughness:.6}));bar.position.z=1.15;arm.add(bar);
 for(let i=0;i<3;i++){const stripe=new T.Mesh(new T.BoxGeometry(.105,.125,.3),new T.MeshStandardMaterial({color:0xf2ead8}));stripe.position.z=.4+i*.75;arm.add(stripe);}
 const bells=[];for(let i=0;i<3;i++){const b=new T.Mesh(new T.SphereGeometry(.05,10,8),new T.MeshStandardMaterial({color:0xe2c25a,metalness:.8,roughness:.3}));b.position.set(0,-.12,.6+i*.7);arm.add(b);bells.push(b);}
 const tollSign=textPlane(1.6,.62,(c,w,h)=>{c.fillStyle='#2a2238';c.fillRect(0,0,w,h);c.fillStyle='#f3d27a';c.textAlign='center';c.font='700 52px Georgia';c.fillText('THE FOOL\'S TOLL',w/2,80);c.font='italic 30px Georgia';c.fillStyle='#e8ddff';c.fillText('Pay in wit, not coin.',w/2,140);c.fillText('The road repays the honest.',w/2,180);},512);
 tollSign.position.set(.26,1.75,0);tollSign.rotation.y=Math.PI/2;tollGroup.add(tollSign);
 let armLift=progress.toll?1:0;
 const RIDDLES=[
  {q:'The more of me you take, the more you leave behind. What am I?',a:['Footsteps','Time','Breath'],c:0},
  {q:'I have a door but no house, a sky but no weather. Where are you?',a:['A dream','A stage set','A painting'],c:1},
  {q:'What can you catch but never throw?',a:['A cold','A ball','A punch'],c:0},
  {q:'A fool and his money are soon parted. What is a fool and his riddle?',a:['Soon solved','Never answered','Still a fool'],c:2},
  {q:'What has keys but opens no locks?',a:['A jailer','A piano','A door'],c:1},
  {q:'What breaks the moment you say its name?',a:['Silence','A promise','A mirror'],c:0}
 ];
 const dialog=document.createElement('dialog');dialog.id='toll-dialog';dialog.innerHTML='<header><h2>The Fool\'s toll</h2><button class="icon-button" data-close aria-label="Close">✕</button></header><p class="toll-question"></p><div class="toll-answers"></div><p class="toll-note" role="status"></p>';document.body.append(dialog);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 let riddleIndex=Math.floor(Math.random()*RIDDLES.length);
 function askRiddle(){
  if(progress.toll){secrets.notify('The toll is paid. The Fool bows you through.');return;}
  const r=RIDDLES[riddleIndex%RIDDLES.length];dialog.querySelector('.toll-question').textContent=r.q;dialog.querySelector('.toll-note').textContent='';
  dialog.querySelector('.toll-answers').replaceChildren(...r.a.map((text,i)=>{const b=document.createElement('button');b.textContent=text;b.onclick=()=>{
   if(i===r.c){progress.toll=true;secrets.changed();dialog.close();placeHidden(hidden[1]);secrets.notify('Correct! The arm lifts with a jingle — and something glints further down the brick road.','found');ambience?.chime?.();requestDraw();}
   else{riddleIndex++;dialog.querySelector('.toll-note').textContent='HA-HA! Wrong. The Fool offers another…';setTimeout(()=>{if(dialog.open)askRiddle();},1300);}
  };return b;}));
  if(!dialog.open)dialog.showModal();
 }
 secrets.register({position:TOLL.clone().setX(TOLL.x+1.2),radius:2.6,height:1.4,enabled:()=>!progress.toll,label:'ANSWER THE FOOL\'S TOLL',action:askRiddle});
 // ---------- Fight Night ----------
 let sharedLadder=[];
 const bellAt=new T.Vector3(theater.x+5.6,0,theater.z+4.4);
 const bellPost=new T.Mesh(new T.CylinderGeometry(.06,.08,1.6,10),iron);bellPost.position.set(bellAt.x,.8,bellAt.z);scene.add(bellPost);
 const bell=new T.Mesh(new T.CylinderGeometry(.08,.22,.26,20,1,true),new T.MeshStandardMaterial({color:0xd6b14a,metalness:.9,roughness:.25,side:T.DoubleSide}));bell.position.set(bellAt.x,1.72,bellAt.z);scene.add(bell);
 const board=textPlane(1.2,.8,(c,w,h)=>{const r=progress.ring;c.fillStyle='#1e1a2b';c.fillRect(0,0,w,h);c.fillStyle='#f3d27a';c.textAlign='center';c.font='700 46px Georgia';c.fillText('FOOLS\' LADDER',w/2,64);
  if(sharedLadder.length){c.font='26px Georgia';c.fillStyle='#efe7ff';sharedLadder.slice(0,4).forEach((e,i)=>c.fillText((i+1)+'. '+e.name+' · '+e.wins+'W'+(e.best?' · '+e.best.toFixed(1)+'s':''),w/2,112+i*36,w-30));c.font='italic 22px Georgia';c.fillStyle='#bcb2d6';c.fillText('You: '+r.wins+'W '+r.losses+'L'+(r.best?' · best '+r.best.toFixed(1)+'s':''),w/2,282);return;}
  c.font='30px Georgia';c.fillStyle='#efe7ff';c.fillText('Wins '+r.wins+'   ·   Losses '+r.losses,w/2,130);c.fillText(r.best?'Fastest K.O. '+r.best.toFixed(1)+'s':'No K.O. yet',w/2,180);c.font='italic 24px Georgia';c.fillStyle='#bcb2d6';c.fillText('Ring the bell to fight the Trickster',w/2,240);c.fillText(secrets.online?'(the room\'s ladder appears after a bout)':'(your record, on this device)',w/2,280);},480);
 board.position.set(bellAt.x+.9,1.25,bellAt.z);board.rotation.y=-Math.PI/4;scene.add(board);
 const boardPost=new T.Mesh(new T.BoxGeometry(.08,1.2,.08),iron);boardPost.position.set(bellAt.x+.9,.6,bellAt.z-.05);scene.add(boardPost);
 const banner=document.createElement('div');banner.id='eden-bout';banner.hidden=true;world.append(banner);
 let bout=null;
 function ringBell(){
  if(bout)return;const p=getPlayer();if(!p)return;
  const forward=p.forward.clone().setY(0).normalize(),at=p.position.clone().setY(0).addScaledVector(forward,2.6),yaw=Math.atan2(-forward.x,-forward.z);
  if(!combat?.startBout(at,yaw)){secrets.notify('The Trickster is still seeing stars. Try again in a moment.');return;}
  bout={start:now(),dealt:0,taken:0};ambience?.setCrowd?.(1);ambience?.bell?.();banner.hidden=false;requestDraw();
 }
 function endBout(result){
  if(!bout)return;const seconds=now()-bout.start,r=progress.ring;bout=null;combat.endBout();ambience?.setCrowd?.(0);
  if(result==='win'){r.wins++;r.best=r.best?Math.min(r.best,seconds):seconds;}else r.losses++;
  r.history=[{result,seconds:+seconds.toFixed(1),at:Date.now()},...(r.history||[])].slice(0,10);secrets.changed();board.userData.redraw();
  // Signed in to the Eden server: the bout goes on the room's ladder (server/world.mjs).
  if(secrets.online)secrets.call('ladder',{result,seconds:+seconds.toFixed(1)}).then(d=>{sharedLadder=d.ladder||[];board.userData.redraw();}).catch(()=>{});
  banner.textContent=result==='win'?'YOU WIN · K.O. IN '+seconds.toFixed(1)+'s':result==='decision'?'DECISION · THE JUDGES SCORE IT YOURS':'THE FOOL WINS';banner.className='show '+result;
  setTimeout(()=>{banner.hidden=true;banner.className='';},4000);
  if(result!=='loss'&&!progress.wraps){progress.wraps=true;secrets.changed();combat.setWraps(true);setTimeout(()=>secrets.notify('Unlocked: the Fool\'s Wraps. Your hands are taped in violet.','found'),1500);}
 }
 combat?.on('landed',e=>{if(bout&&e.target==='jester')bout.dealt+=e.damage;});
 combat?.on('jesterKO',()=>{if(bout)endBout('win');});
 combat?.on('playerKO',()=>{if(bout)endBout('loss');});
 if(progress.wraps)combat?.setWraps(true);
 secrets.onChange(p=>{if(p.wraps)combat?.setWraps(true);});
 secrets.onWorld(data=>{if(Array.isArray(data.ladder)){sharedLadder=data.ladder;board.userData.redraw();}});
 secrets.register({position:bellAt,radius:2.6,height:1.9,enabled:()=>!bout,label:'RING THE BELL · FIGHT NIGHT',action:ringBell});
 bell.userData.onPick=()=>{const p=getPlayer();if(p&&Math.hypot(p.position.x-bellAt.x,p.position.z-bellAt.z)<4)ringBell();};addPickable(bell);
 const ROUND=120;
 function updateBout(){
  if(!bout)return false;const left=ROUND-(now()-bout.start),state=combat.inspect();
  banner.textContent='FIGHT NIGHT · '+Math.max(0,Math.ceil(left))+'s · TRICKSTER '+state.jester.hp+' HP';
  if(left<=0){endBout(bout.dealt>=60&&state.player.hp>=state.jester.hp?'decision':'loss');}
  return true;
 }
 function update(time,dt){
  const t=now();let busy=false;
  for(const h of hidden)if(h.group?.parent){h.group.rotation.y=reduced?0:t*.6;h.group.position.y=h.at.y+(reduced?0:Math.sin(t*1.6)*.04);}
  busy=updateDrop(t)||busy;updateMiles();busy=updateBout()||busy;
  const target=progress.toll?1:0;if(Math.abs(armLift-target)>.001){armLift+=Math.sign(target-armLift)*Math.min(Math.abs(target-armLift),dt*.9);busy=true;}
  arm.rotation.x=-armLift*1.35;bells.forEach((b,i)=>{b.position.y=-.12+Math.sin(t*9+i)*.02*(armLift>0&&armLift<1?1:0);});
  bell.rotation.z=bout&&now()-bout.start<1.2?Math.sin(t*30)*.3:0;
  return busy;
 }
 return {
  update,
  blocks(next){return Math.hypot(next.x-bellAt.x,next.z-bellAt.z)<.35||(Math.abs(next.x-TOLL.x)<.5&&Math.abs(Math.abs(next.z-TOLL.z)-1.3)<.45);},
  inspect:()=>({hidden:hidden.map(h=>({id:h.id,found:progress.found.includes(h.id),loaded:!!h.model})),drop:dropState(),toll:!!progress.toll,roadMeters:Math.round(progress.roadMeters||0),bout:bout?{seconds:+(now()-bout.start).toFixed(1),dealt:bout.dealt}:null,ring:progress.ring})
 };
};
