'use strict';
// Fist fighting for the garden: first-person fists, health, blocking and combos for the visitor;
// a goofy fight brain for the Violet Trickster (he hits back, tackles, laughs and breakdances);
// ragdoll knockouts; and hooks so visitors can trade punches through the shared room.
window.createFistCombat=function({T,scene,camera,residents,jesterId='violet-trickster',reduced=false,stage,getPlayer,blocked=()=>false,groundHeight=()=>0,knockPlayer=()=>{},canAct=()=>true,requestDraw=()=>{},hitStop=()=>{}}){
 const now=()=>performance.now()/1000,rand=(a,b)=>a+Math.random()*(b-a),pick=list=>list[Math.floor(Math.random()*list.length)];
 const clamp=T.MathUtils.clamp,tmp=new T.Vector3(),tmp2=new T.Vector3();
 const PUNCHES={
  jab:{damage:8,impact:.1,recover:.26,reach:1.75,power:1.6,label:'JAB'},
  cross:{damage:12,impact:.13,recover:.34,reach:1.8,power:2.2,label:'CROSS'},
  power:{damage:22,impact:.25,recover:.62,reach:1.9,power:4,label:'HAYMAKER'}
 };
 const LINES={
  provoked:['Oh, it\'s ON!','Did you just boop me?','Square up, apple-eater!','Rude!!','You want a dance-off? FIGHT-off!'],
  hurt:['Ow!','Ha! Tickles!','My hat!!','Not the face!','Oof!','Hey, I bruise like a plum!'],
  landed:['Boop!','Pow-pow!','Jester jab!','Hehehe!','Bonk!'],
  tackle:['HUT HUT!','Incoming!!','TACKLE TIME!','Here comes the Fool!'],
  playerDown:['Get rekt!','Nap time!','The Fool wins again!','Ha-HA!','Stay down, sprout!'],
  ko:['...ow.','I meant to do that.','*sees stars*','Five more minutes...'],
  getup:['I\'m okay!','Totally fine!','Breakdance break!','Shake it off, shake it off!'],
  blocked:['Nope!','Too slow!','Denied!'],
  dance:['Watch this!','Spin to win!','Hat-spin, baby!']
 };
 // ---------- Sound (synthesised, no assets) ----------
 let audio=null;
 function sfx(kind){
  try{
   audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();
   const t=audio.currentTime,out=audio.createGain();out.gain.value=.32;out.connect(audio.destination);
   const noise=(duration,filterType,from,to,gain)=>{const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);const src=audio.createBufferSource();src.buffer=buffer;const f=audio.createBiquadFilter();f.type=filterType;f.frequency.setValueAtTime(from,t);f.frequency.exponentialRampToValueAtTime(to,t+duration);const g=audio.createGain();g.gain.value=gain;src.connect(f).connect(g).connect(out);src.start(t);};
   const tone=(type,from,to,duration,gain,delay=0)=>{const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(from,t+delay);o.frequency.exponentialRampToValueAtTime(to,t+delay+duration);g.gain.setValueAtTime(0,t+delay);g.gain.linearRampToValueAtTime(gain,t+delay+.012);g.gain.exponentialRampToValueAtTime(.001,t+delay+duration);o.connect(g).connect(out);o.start(t+delay);o.stop(t+delay+duration+.02);};
   if(kind==='whoosh')noise(.18,'bandpass',600,2600,.6);
   if(kind==='hit'){noise(.11,'lowpass',2400,300,1.4);tone('sine',140,48,.2,1);}
   if(kind==='heavy'){noise(.2,'lowpass',1800,120,1.8);tone('sine',110,38,.35,1.3);}
   if(kind==='block'){tone('square',1300,900,.06,.25);noise(.05,'highpass',3000,5000,.5);}
   if(kind==='thud'){tone('sine',80,30,.45,1.4);noise(.25,'lowpass',500,80,1.2);}
   if(kind==='laugh')for(let i=0;i<5;i++)tone('triangle',470-i*22+Math.random()*30,300-i*18,.13,.5,i*.16);
   if(kind==='boing')tone('sine',220,660,.3,.5);
  }catch{}
 }
 // ---------- DOM: HUD, vignette, knockout banner, touch pad ----------
 const world=stage.closest('#world')||stage.parentElement;
 const hud=document.createElement('div');hud.id='fight-hud';hud.hidden=true;
 hud.innerHTML='<div class="fight-bar fight-you"><span>YOU</span><div class="fight-meter"><i></i></div></div><div class="fight-bar fight-foe" hidden><span>VIOLET TRICKSTER</span><div class="fight-meter"><i></i></div></div><p class="fight-keys">F PUNCH · G HAYMAKER · HOLD Q BLOCK</p>';
 const pop=document.createElement('div');pop.id='fight-pop';pop.setAttribute('aria-live','polite');
 const vignette=document.createElement('div');vignette.id='fight-vignette';
 const ko=document.createElement('div');ko.id='fight-ko';ko.hidden=true;ko.innerHTML='<strong>KNOCKED OUT</strong><span></span><div class="fight-stars"><b>★</b><b>★</b><b>★</b></div>';
 const pad=document.createElement('div');pad.id='fight-pad';pad.setAttribute('aria-label','Fight controls');
 pad.innerHTML='<button data-fight="f" aria-label="Punch">PUNCH</button><button data-fight="g" aria-label="Haymaker">POWER</button><button data-fight="q" aria-label="Block">BLOCK</button>';
 world.append(hud,pop,vignette,ko,pad);
 for(const button of pad.querySelectorAll('button')){
  button.onpointerdown=event=>{event.preventDefault();button.setPointerCapture(event.pointerId);key(button.dataset.fight,true);};
  button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>key(button.dataset.fight,false);
 }
 let popTimer=0;
 function shout(text,tone='hit'){pop.textContent=text;pop.className='show '+tone;clearTimeout(popTimer);void pop.offsetWidth;popTimer=setTimeout(()=>{pop.className='';},700);}
 // ---------- 3D helpers: speech bubbles, KO stars, hit flashes ----------
 function canvasSprite(width,height,paint,scale){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,fog:false,toneMapped:false}));sprite.renderOrder=20;sprite.scale.set(...scale,1);
  sprite.userData.draw=(...args)=>{const c=canvas.getContext('2d');c.clearRect(0,0,width,height);paint(c,...args);texture.needsUpdate=true;};return sprite;
 }
 const bubble=canvasSprite(640,200,(c,text)=>{
  c.fillStyle='#fffdf5';c.strokeStyle='#2b1d3d';c.lineWidth=7;c.beginPath();c.roundRect(10,10,620,140,44);c.fill();c.stroke();
  c.beginPath();c.moveTo(290,146);c.lineTo(320,190);c.lineTo(352,146);c.closePath();c.fill();c.stroke();c.fillStyle='#fffdf5';c.fillRect(296,138,52,14);
  c.fillStyle='#4a1d6e';c.font='700 52px "Comic Sans MS","Chalkboard SE",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,320,82,580);
 },[1.7,.53]);bubble.visible=false;scene.add(bubble);
 const starTexture=canvasSprite(64,64,c=>{c.fillStyle='#ffd84a';c.strokeStyle='#8a5a00';c.lineWidth=3;c.beginPath();for(let i=0;i<10;i++){const r=i%2?12:30,a=i*Math.PI/5-Math.PI/2;c.lineTo(32+Math.cos(a)*r,32+Math.sin(a)*r);}c.closePath();c.fill();c.stroke();},[.2,.2]);starTexture.userData.draw();
 const stars=new T.Group();for(let i=0;i<4;i++){const s=starTexture.clone();s.material=starTexture.material;stars.add(s);}stars.visible=false;scene.add(stars);
 const flashes=[];
 for(let i=0;i<5;i++){
  const words=['POW!','BAM!','BONK!','WHAP!','THWACK!'];
  const s=canvasSprite(256,256,(c,word)=>{c.translate(128,128);c.fillStyle='#ffe14d';c.strokeStyle='#d12f6d';c.lineWidth=8;c.beginPath();for(let k=0;k<24;k++){const r=k%2?70:118,a=k*Math.PI/12;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();c.stroke();c.rotate(-.18);c.fillStyle='#d12f6d';c.font='900 58px Impact,"Arial Black",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(word,0,4,200);},[.7,.7]);
  s.userData.draw(words[i]);s.visible=false;s.userData.born=-9;scene.add(s);flashes.push(s);
 }
 let flashIndex=0;
 function flash(position,big=false){const s=flashes[flashIndex++%flashes.length];s.position.copy(position);s.userData.born=now();s.userData.big=big;s.visible=true;}
 let bubbleUntil=0,bubbleText='';
 function say(group,force=false){if(!force&&now()<bubbleUntil-1.2)return;const text=typeof group==='string'&&!LINES[group]?group:pick(LINES[group]);if(text!==bubbleText)bubble.userData.draw(text);bubbleText=text;bubbleUntil=now()+2.1;}
 // ---------- First-person fists ----------
 if(!camera.parent)scene.add(camera);
 let arms;
 try{arms=window.createFistViewModel(T,camera,{reduced});}catch(error){console.warn('First-person arms unavailable',error);arms={update(){},setSkin(){},camera:()=>({yaw:0,roll:0,pitch:0,lunge:0}),inspect:()=>({visible:false})};}
 function setSkin(character){arms.setSkin(character);}
 // ---------- Player state ----------
 const stats={swings:0,landed:0,missed:0,last:null};
 const player={dodgeUntil:0,landedAt:-9,hp:100,downStart:0,downUntil:0,down:false,ko:false,blocking:false,attack:null,readyAt:0,nextHand:0,combo:0,comboUntil:0,flash:0,shake:0,rollSign:1,fightUntil:0,seq:0,lastHurt:-9};
 let network=null;
 function fighting(){return now()<player.fightUntil||jester.mode!=='path'||player.down;}
 function key(name,pressed,repeat=false){
  if(name==='q'){if(pressed&&(!canAct()||player.down))return true;player.blocking=pressed;if(pressed){player.attack=null;player.fightUntil=now()+8;}requestDraw();return true;}
  if(!pressed||repeat)return name==='f'||name==='g';
  if(name==='f')punch(player.nextHand?'cross':'jab');else if(name==='g')punch('power');else return false;
  return true;
 }
 function punch(kind){
  const t=now();if(!canAct()||player.down||t<player.readyAt)return false;
  if(player.attack&&!player.attack.resolved){player.attack.resolved=true;resolve(player.attack);}
  const spec=PUNCHES[kind],hand=kind==='jab'?0:1;player.nextHand=kind==='jab'?1:0;
  const attack={kind,spec,hand,start:t,resolved:false};player.blocking=false;player.attack=attack;
  // Impact is timed, not frame-bound, so punches still land on slow devices.
  setTimeout(()=>{if(!attack.resolved){attack.resolved=true;resolve(attack);requestDraw();}},spec.impact*1000);player.readyAt=t+spec.recover*.85;player.fightUntil=t+8;player.seq++;
  sfx('whoosh');requestDraw();return true;
 }
 function forwardOf(p){return tmp2.copy(p.forward).setY(0).normalize();}
 function resolve(attack){
  const p=getPlayer();if(!p)return;const forward=forwardOf(p).clone(),feet=new T.Vector3(p.position.x,0,p.position.z);
  const t=now();if(t>player.comboUntil)player.combo=0;
  const multiplier=Math.min(1.6,1+player.combo*.15),damage=Math.round(attack.spec.damage*multiplier);
  const candidates=[];
  const root=jester.entry?.root;
  if(root){const at=jester.ragdoll?.active?jester.ragdoll.pelvisPosition():root.position;const d=Math.hypot(at.x-feet.x,at.z-feet.z);candidates.push({type:'jester',at,d});}
  for(const target of network?.targets()||[])candidates.push({type:'visitor',id:target.id,name:target.name,at:target.root.position,d:Math.hypot(target.root.position.x-feet.x,target.root.position.z-feet.z),ko:target.ko});
  const hit=candidates.filter(c=>{if(c.d>attack.spec.reach+.35)return false;tmp.set(c.at.x-feet.x,0,c.at.z-feet.z);if(tmp.lengthSq()<.04)return true;return tmp.normalize().dot(forward)>Math.cos(.7);}).sort((a,b)=>a.d-b.d)[0];
  stats.swings++;if(!hit){stats.missed++;attack.missed=true;stats.last={miss:candidates.map(c=>({type:c.type,d:+c.d.toFixed(2)}))};return;}
  const direction=tmp.set(hit.at.x-feet.x,0,hit.at.z-feet.z);if(direction.lengthSq()<1e-4)direction.copy(forward);direction.normalize();
  const contact=new T.Vector3(hit.at.x,(p.position.y-1.75)+1.45,hit.at.z).addScaledVector(direction,-.35);
  let outcome='hit';
  if(hit.type==='jester')outcome=jester.takeHit({damage,direction:direction.clone(),kind:attack.kind,power:attack.spec.power,contact});
  else if(!hit.ko){network.hit({target:hit.id,kind:attack.kind,damage,direction:[direction.x,direction.z]});}
  else outcome='ragdoll';
  stats.landed++;stats.last={type:hit.type,outcome,damage};
  if(outcome==='blocked'){sfx('block');shout('BLOCKED','block');hitStop(35);player.shake=Math.max(player.shake,.1);player.combo=0;return;}
  player.combo++;player.comboUntil=t+1.15;attack.landed=true;attack.freeze=attack.kind==='power'||outcome==='ko'?.11:.065;player.landedAt=t;
  sfx(attack.kind==='power'||outcome==='ko'?'heavy':'hit');flash(contact,attack.kind==='power');
  // Impact: a short frame hold scaled to the blow, and a jolt through your own view.
  hitStop(outcome==='ko'?170:{jab:45,cross:65,power:110}[attack.kind]||50);player.shake=Math.max(player.shake,attack.kind==='power'||outcome==='ko'?.3:.14);
  shout(outcome==='ko'?'K.O.!':player.combo>2?player.combo+' HIT COMBO':attack.spec.label,outcome==='ko'?'ko':'hit');
 }
 function hurt({damage,direction,kind='jab',from='jester'}){
  if(player.down)return 'down';const t=now(),p=getPlayer();if(!p)return 'none';
  // Inside a dodge the blow whiffs past.
  if(t<player.dodgeUntil){player.fightUntil=t+8;sfx('whoosh');shout('DODGED','block');return 'dodged';}
  const forward=forwardOf(p);player.fightUntil=t+8;player.lastHurt=t;
  if(player.blocking&&kind!=='tackle'&&forward.dot(direction)<-.2){damage*=.2;player.shake=.12;sfx('block');shout('BLOCKED','block');}
  else{player.flash=1;player.shake=kind==='uppercut'||kind==='power'?.65:.38;sfx(kind==='tackle'?'thud':'hit');hitStop(kind==='uppercut'||kind==='power'||kind==='tackle'?120:70);}
  player.hp=Math.max(0,player.hp-damage);
  knockPlayer({direction,distance:kind==='tackle'?1.4:kind==='uppercut'||kind==='power'?.8:.3});
  if(player.hp<=0)knockDown(5.5,true);else if(kind==='tackle')knockDown(2.4,false);
  updateHud();requestDraw();return player.down?'down':'hit';
 }
 function knockDown(duration,out){
  const t=now();player.down=true;player.ko=out;player.downStart=t;player.downUntil=t+duration;player.attack=null;player.blocking=false;player.rollSign=Math.random()<.5?-1:1;
  if(out){ko.hidden=false;sfx('thud');}
  jester.onPlayerDown(out);
 }
 // ---------- The Violet Trickster's fight brain ----------
 const jester={entry:null,ragdoll:null,hp:100,mode:'path',since:0,layers:new Map(),current:'',lastProvoked:-99,attackReady:0,tackleReady:0,koUntil:0,afterKo:false,tackle:null,attack:null,push:new T.Vector3(),danceRound:-1,
  takeHit,onPlayerDown};
 function ensureJester(){
  if(jester.entry?.root)return true;const entry=residents.get(jesterId);if(!entry?.root||!entry.moves)return false;
  jester.entry=entry;entry.controller={active:false,mode:'path',animation:''};
  try{jester.ragdoll=window.createRagdoll(T,{object:entry.root,rig:'jester',groundHeight:(x,z)=>groundHeight(x,z)});}catch(error){console.warn('Jester ragdoll unavailable',error);}
  return true;
 }
 function meta(name){return jester.entry.moves?.meta[name]||{loop:true,duration:jester.entry.actions[name]?.getClip().duration||1};}
 function setMode(mode){jester.mode=mode;jester.since=now();if(jester.entry){jester.entry.controller.mode=mode;jester.entry.controller.active=mode!=='path';}}
 function play(name,{fade=.18,speed=1,restart=true}={}){
  if(!jester.entry.actions[name])return;
  for(const layer of jester.layers.values())layer.target=0;
  let layer=jester.layers.get(name);if(!layer){layer={time:0,weight:0};jester.layers.set(name,layer);}
  if(restart)layer.time=0;Object.assign(layer,{target:1,fade:Math.max(.001,fade),speed});jester.current=name;jester.entry.controller.animation=name;
 }
 function clipTime(name){return jester.layers.get(name)?.time||0;}
 function animate(dt){
  const list=[];
  for(const [name,layer] of jester.layers){
   const info=meta(name);layer.time+=dt*(layer.speed??1);
   const step=dt/(layer.fade||.18);layer.weight=layer.target>layer.weight?Math.min(layer.target,layer.weight+step):Math.max(layer.target,layer.weight-step);
   if(layer.weight<=0&&layer.target===0){jester.layers.delete(name);continue;}
   const duration=info.duration||1,time=info.loop?layer.time%duration:Math.min(layer.time,duration-.001);list.push([name,time,layer.weight]);
  }
  residents.pose(jester.entry,list);
 }
 function activate(){
  if(jester.mode!=='path')return;jester.layers.clear();
  for(const [name,action] of Object.entries(jester.entry.actions)){const w=action.getEffectiveWeight();if(w>0)jester.layers.set(name,{time:action.time,weight:w,target:0,fade:.2,speed:1});}
  setMode('engage');play('Guard',{fade:.22});
 }
 function face(target,dt,rate=9){const root=jester.entry.root,yaw=Math.atan2(target.x-root.position.x,target.z-root.position.z);const delta=Math.atan2(Math.sin(yaw-root.rotation.y),Math.cos(yaw-root.rotation.y));root.rotation.y+=clamp(delta,-rate*dt,rate*dt);return Math.abs(delta);}
 function stepJester(direction,distance){
  const root=jester.entry.root,next=root.position.clone().addScaledVector(direction,distance);
  next.x=clamp(next.x,-20,20);next.z=clamp(next.z,-19.6,25.6);
  const tryAt=v=>{if(blocked(v))return false;root.position.x=v.x;root.position.z=v.z;return true;};
  if(!tryAt(next)&&!tryAt(new T.Vector3(next.x,0,root.position.z)))tryAt(new T.Vector3(root.position.x,0,next.z));
  root.position.y=groundHeight(root.position.x,root.position.z);
 }
 function headPosition(){const root=jester.entry.root;return jester.ragdoll?.active?jester.ragdoll.pelvisPosition().add(tmp.set(0,.75,0)):tmp.copy(root.position).setY(root.position.y+2.15);}
 function takeHit({damage,direction,kind,power,contact}){
  if(!ensureJester())return 'miss';const t=now();
  if(jester.ragdoll?.active){jester.ragdoll.push('spine',direction.clone().multiplyScalar(power*1.4).setY(1.2));if(Math.random()<.4)say('hurt');return 'ragdoll';}
  if(jester.mode==='getup')return 'blocked';
  const fresh=jester.mode==='path'||t-jester.lastProvoked>12;activate();jester.lastProvoked=t;
  if(['engage','attack'].includes(jester.mode)&&!fresh&&kind!=='power'&&Math.random()<.2){play('Guard',{fade:.06});say('blocked');jester.hp-=Math.round(damage*.25);return 'blocked';}
  jester.hp-=damage;updateHud();
  if(jester.hp<=0){
   jester.hp=0;jester.afterKo=true;
   if(jester.ragdoll){jester.ragdoll.start({impulse:direction.clone().multiplyScalar(kind==='power'?4.6:3.2),lift:kind==='power'?3.4:1.8,at:contact,spin:rand(-1.5,1.5)});setMode('ko');jester.koUntil=t+4;}
   say('ko',true);sfx('boing');return 'ko';
  }
  setMode('hit');play('Hit',{fade:.05});jester.push.copy(direction).multiplyScalar(kind==='power'?1.6:.7);
  if(fresh)say('provoked',true);else if(Math.random()<.45)say('hurt');
  return 'hit';
 }
 function onPlayerDown(out){
  if(jester.mode==='path'||jester.mode==='ko')return;
  say('playerDown',true);sfx('laugh');
  if(['engage','attack','hit'].includes(jester.mode)){setMode('taunt');play('Taunt',{fade:.2});}
  if(out)jester.lastProvoked=-99;
 }
 function startAttack(){
  const roll=Math.random(),name=roll<.48?'Jab':roll<.85?'Cross':'Uppercut';
  setMode('attack');jester.attack={name,landed:false};play(name,{fade:.08});
 }
 function getUp(next){
  const info=jester.ragdoll.recover(),root=jester.entry.root,p=getPlayer();
  root.position.set(info.pelvis.x,groundHeight(info.pelvis.x,info.pelvis.z),info.pelvis.z);
  root.rotation.set(0,p?Math.atan2(p.position.x-root.position.x,p.position.z-root.position.z):info.yaw,0);root.updateMatrixWorld(true);
  jester.layers.clear();jester.layers.set(next,{time:0,weight:1,target:1,fade:.2,speed:1});jester.current=next;jester.entry.controller.animation=next;
  setMode('getup');jester.getupNext=next;
 }
 function updateJester(t,dt){
  if(!ensureJester())return false;
  const entry=jester.entry,root=entry.root,p=getPlayer();
  const feet=p?new T.Vector3(p.position.x,0,p.position.z):null,toPlayer=feet?new T.Vector3(feet.x-root.position.x,0,feet.z-root.position.z):new T.Vector3(0,0,99),dist=toPlayer.length();
  const dir=dist>1e-4?toPlayer.clone().divideScalar(dist):new T.Vector3(0,0,1);
  if(jester.mode==='path'){
   jester.hp=Math.min(100,jester.hp+dt*20);
   if(entry.animation==='Breakdance'&&dist<8){const round=residents.pathState(jesterId)?.round;if(round!==jester.danceRound){jester.danceRound=round;say('dance');}}
   return false;
  }
  const since=t-jester.since,mode=jester.mode;
  if(mode==='ko'||mode==='tumble'){
   jester.ragdoll.step(dt);
   if(t>jester.koUntil&&(jester.ragdoll.settled||t>jester.koUntil+2.5)){getUp(mode==='ko'?'Dizzy':'Guard');if(mode==='ko')say('getup',true);}
   return true;
  }
  animate(dt);
  if(mode==='getup'){
   jester.ragdoll.blend(since/.85);
   if(since>=.85){if(jester.afterKo){setMode('dizzy');}else if(jester.tackle?.landed){setMode('taunt');play('Taunt',{fade:.2});sfx('laugh');}else{setMode('engage');play('Guard');}}
   return true;
  }
  if(mode==='dizzy'){if(since>2.2){setMode('celebrate');play('Breakdance',{fade:.3});jester.hp=100;jester.afterKo=false;jester.lastProvoked=-99;}return true;}
  if(mode==='celebrate'){
   if(clipTime('Breakdance')>=meta('Breakdance').duration-.05){setMode(t-jester.lastProvoked<6?'engage':'return');play(jester.mode==='engage'?'Guard':'Walk',{fade:.3});}
   return true;
  }
  if(mode==='taunt'){face(feet||root.position,dt,4);if(since>2.3){if(player.down&&player.ko){setMode('celebrate');play('Breakdance',{fade:.3});}else{setMode('engage');play('Guard');}}return true;}
  if(mode==='hit'){
   const shove=jester.push.length();if(since<.25&&shove>0)stepJester(jester.push.clone().divideScalar(shove),dt*shove*8*(.25-since));
   if(clipTime('Hit')>=meta('Hit').duration-.02){setMode('engage');play('Guard',{fade:.15});}
   return true;
  }
  if(mode==='attack'){
   face(feet,dt,5);const a=jester.attack,info=meta(a.name),time=clipTime(a.name);
   if(info.source!=='procedural'&&time<.4)stepJester(dir,dt*1.2);
   if(!a.landed&&time>=(info.hit??info.duration*.35)){
    a.landed=true;const facing=new T.Vector3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y)).dot(dir);
    if(dist<1.7&&facing>.6&&!player.down){const result=hurt({damage:a.name==='Uppercut'?16:a.name==='Cross'?10:7,direction:dir.clone(),kind:a.name==='Uppercut'?'uppercut':'jab'});if(result!=='down'||player.down){if(Math.random()<.35&&!player.down)say('landed');}}
    else sfx('whoosh');
   }
   if(time>=info.duration-.02){setMode('engage');play('Guard',{fade:.12});jester.attackReady=t+rand(.45,1.1);}
   return true;
  }
  if(mode==='tackle'){
   const k=jester.tackle,time=clipTime('Tackle'),info=meta('Tackle');
   const speed=time<.14?0:time<.62?7.6:Math.max(0,7.6-(time-.62)*24);stepJester(k.direction,speed*dt);
   if(!k.landed&&time>.16&&time<.75){const reach=Math.hypot(root.position.x+k.direction.x*.45-(feet?.x??999),root.position.z+k.direction.z*.45-(feet?.z??999));if(reach<1&&!player.down){k.landed=true;hurt({damage:18,direction:k.direction.clone(),kind:'tackle'});}}
   if(time>=info.duration-.02){
    if(jester.ragdoll){jester.ragdoll.start({impulse:k.direction.clone().multiplyScalar(k.landed?1.6:3.4),lift:.6,spin:rand(-2.5,2.5)});setMode('tumble');jester.koUntil=t+(k.landed?.9:1.6);if(!k.landed)say('Oof... missed!',true);}
    else{setMode('engage');play('Guard');}
   }
   return true;
  }
  if(mode==='return'){
   const path=residents.pathState(jesterId);if(!path){setMode('path');return false;}
   const to=new T.Vector3(path.position.x-root.position.x,0,path.position.z-root.position.z),d=to.length();
   if(d<.3||since>25){setMode('path');jester.layers.clear();return true;}
   face(path.position,dt,6);stepJester(to.normalize(),Math.min(d,dt*1.6));if(jester.current!=='Walk')play('Walk',{fade:.3,restart:false});jester.layers.get('Walk').speed=1.35;
   if(t-jester.lastProvoked<3){setMode('engage');play('Guard');}
   return true;
  }
  // engage
  if(!p||dist>19||(t-jester.lastProvoked>15&&dist>5)){setMode('return');play('Walk',{fade:.3});return true;}
  if(player.down){face(feet,dt,4);if(jester.current!=='Taunt')play('Taunt',{fade:.3});return true;}
  face(feet,dt);
  if(dist>2.6&&dist<7.5&&t>jester.tackleReady&&since>.8&&Math.random()<dt*.5){
   jester.tackleReady=t+rand(6,10);jester.tackle={direction:dir.clone(),landed:false};setMode('tackle');play('Tackle',{fade:.08});say('tackle',true);sfx('boing');return true;
  }
  if(dist<1.45&&t>jester.attackReady){startAttack();return true;}
  if(dist>1.2){const speed=Math.min(3.6,1.1+dist*.7);stepJester(dir,dt*speed);if(jester.current!=='Walk')play('Walk',{fade:.18,restart:false});jester.layers.get('Walk').speed=speed/1.2;}
  else if(jester.current!=='Guard')play('Guard',{fade:.2});
  return true;
 }
 // ---------- HUD + view effects ----------
 function updateHud(){
  hud.querySelector('.fight-you i').style.width=player.hp+'%';
  hud.querySelector('.fight-you').classList.toggle('low',player.hp<30);
  const foe=hud.querySelector('.fight-foe');foe.hidden=jester.mode==='path'||jester.mode==='return';foe.querySelector('i').style.width=Math.max(0,jester.hp)+'%';
 }
 function updateFists(t,dt){
  const a=player.attack;
  arms.update(t,dt,{show:fighting()&&!player.down&&canAct(),blocking:player.blocking,hurtAge:t-player.lastHurt,landedAge:t-player.landedAt,leadHand:0,
   attack:a&&{kind:a.kind,hand:a.hand,elapsed:t-a.start,impact:a.spec.impact,recover:a.spec.recover,freeze:a.freeze||0,landed:!!a.landed,missed:!!a.missed}});
 }
 function update(time,dt){
  const t=now();dt=Math.min(dt||.016,.05);let busy=false;
  // Halo-style recovery: five seconds without taking a hit and your health climbs back.
  if(!player.down&&player.hp<100&&t-player.lastHurt>5){player.hp=Math.min(100,player.hp+14*dt);updateHud();busy=true;}
  if(player.attack){const a=player.attack;if(!a.resolved&&t-a.start>=a.spec.impact){a.resolved=true;resolve(a);}if(t-a.start>a.spec.recover+(a.freeze||0))player.attack=null;busy=true;}
  if(player.down&&t>=player.downUntil){player.down=false;if(player.ko){player.ko=false;player.hp=100;}ko.hidden=true;updateHud();}
  if(player.down){ko.querySelector('span').textContent=player.ko?'Back up in '+Math.ceil(player.downUntil-t)+'…':'';busy=true;}
  if(!player.down&&t-player.lastHurt>6&&player.hp<100){player.hp=Math.min(100,player.hp+dt*6);updateHud();busy=true;}
  player.flash=Math.max(0,player.flash-dt*2.2);player.shake=Math.max(0,player.shake-dt*1.8);
  vignette.style.opacity=String(Math.max(player.flash*.85,player.hp<30?.25+.1*Math.sin(t*6):0));
  busy=updateJester(t,dt)||busy;
  updateFists(t,dt);
  // Speech bubble and KO stars ride the jester's head.
  if(jester.entry?.root&&t<bubbleUntil){bubble.visible=true;bubble.position.copy(headPosition()).y+=.42;bubble.material.opacity=Math.min(1,(bubbleUntil-t)*3);busy=true;}else bubble.visible=false;
  stars.visible=!!jester.entry&&(jester.mode==='ko'||jester.mode==='dizzy');
  if(stars.visible){const head=headPosition().clone();stars.children.forEach((s,i)=>{const a=t*3.2+i*Math.PI/2;s.position.set(head.x+Math.cos(a)*.3,head.y-.25+Math.sin(t*5+i)*.04,head.z+Math.sin(a)*.3);});}
  for(const s of flashes){const age=t-s.userData.born;s.visible=age<.32;if(s.visible){const k=age/.32,size=(s.userData.big?1:.7)*(.6+k*.8);s.scale.set(size,size,1);s.material.opacity=1-k*k;s.material.rotation=k*.3;busy=true;}}
  const visible=fighting()||player.hp<100;hud.hidden=!visible;if(visible)updateHud();
  world.classList.toggle('fighting',visible);
  return busy||fighting()||player.shake>0||player.flash>0;
 }
 function cameraEffect(){
  const t=now(),offset=new T.Vector3(),body=arms.camera();let drop=0,roll=body.roll,pitch=body.pitch,yaw=body.yaw;
  if(body.lunge)offset.addScaledVector(camera.getWorldDirection(tmp).setY(0).normalize(),body.lunge);
  if(player.shake>0&&!reduced)offset.add(tmp2.set(rand(-1,1),rand(-1,1),rand(-1,1)).multiplyScalar(player.shake*.05));
  if(player.down){
   const fall=Math.min(1,(t-player.downStart)/.42),rise=Math.max(0,1-(player.downUntil-t)/.75);
   const bounce=fall<1?1-Math.pow(1-fall,3):1+Math.sin((t-player.downStart-.42)*14)*Math.exp(-(t-player.downStart-.42)*6)*.04;
   const amount=bounce*(1-rise*rise*(3-2*rise));drop=1.42*amount;roll+=.95*amount*player.rollSign;pitch+=.55*amount;
  }
  return {offset,drop,roll,pitch,yaw};
 }
 return {
  update,key,punch,hurt,cameraEffect,setSkin,
  setNetwork(adapter){network=adapter;},
  canMove:()=>!player.down,
  // A side-step: blows that land in the next 0.35 s miss.
  dodge(){if(player.down)return false;player.dodgeUntil=now()+.35;player.fightUntil=now()+8;sfx('whoosh');requestDraw();return true;},
  // Squaring up: a fight is on, or the jester is close enough to throw a punch at.
  engaged(){if(fighting())return true;const p=getPlayer(),r=residents.get(jesterId)?.root;return !!p&&!!r&&Math.hypot(p.position.x-r.position.x,p.position.z-r.position.z)<3.5;},
  receive(event){return hurt({damage:clamp(Number(event.damage)||0,0,25),direction:new T.Vector3(event.direction?.[0]||0,0,event.direction?.[1]||1).normalize(),kind:['jab','cross','power','tackle'].includes(event.kind)?event.kind:'jab',from:event.from});},
  netState:()=>({hp:Math.round(player.hp),down:player.down,ko:player.ko,block:player.blocking,punch:{seq:player.seq,hand:player.attack?.hand??player.nextHand,kind:player.attack?.kind||'jab'}}),
  inReach(id){if(id!==jesterId||!jester.entry?.root)return false;const p=getPlayer();return !!p&&Math.hypot(p.position.x-jester.entry.root.position.x,p.position.z-jester.entry.root.position.z)<2.3;},
  provoke(){if(ensureJester()){activate();jester.lastProvoked=now();say('provoked',true);requestDraw();}},
  inspect:()=>({stats:{...stats},player:{hp:Math.round(player.hp),down:player.down,ko:player.ko,blocking:player.blocking,combo:player.combo,attack:player.attack?.kind||null},jester:{mode:jester.mode,hp:Math.round(jester.hp),animation:jester.current,ragdoll:jester.ragdoll?.inspect()||null},bubble:bubble.visible?bubbleText:null,arms:arms.inspect()})
 };
};
