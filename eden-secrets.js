'use strict';
// The garden's mystery layer: the painted sky glitches, a bird bonks into it, the stage crew's
// backstage sits behind the north wall (with a weather lever), and a door is stitched into the sky.
// (The Gilded Sentinel and the Azure Oracle statues were removed.)
// Progress is kept per visitor (localStorage); interactables share one on-screen prompt and the E key.
window.createEdenSecrets=function({T,scene,camera,renderer,garden,combat,reduced=false,stage,getPlayer,requestDraw=()=>{},canAct=()=>true,addPickable=()=>{},shared=null}){
 const now=()=>performance.now()/1000,rand=(a,b)=>a+Math.random()*(b-a),pick=list=>list[Math.floor(Math.random()*list.length)];
 const sky=garden.skybox,door=sky.door,world=stage.closest('#world')||stage.parentElement;
 // ---------- Progress ----------
 const KEY='eden-secrets-v1';
 const progress=(()=>{let data={};try{data=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
  data.glitches??=[];data.found??=[];data.ring??={wins:0,losses:0,best:null,history:[]};return data;})();
 function save(){try{localStorage.setItem(KEY,JSON.stringify(progress));}catch{}}
 // On the Eden server (server/world.mjs) progress also follows the account, and only ever grows.
 const api=window.showroomDeployment?.socialApi,online=!!api&&window.showroomDeployment?.mode!=='preview';
 async function call(action,body){
  const response=await fetch(api+action,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||'Request failed'),{status:response.status});return data;
 }
 const SYNCED=['jesterBeaten','doorOpened','lever','toll','wraps'];
 const changeListeners=[];
 function adopt(remote){
  if(!remote||typeof remote!=='object')return;let grew=false;
  for(const key of ['glitches','found'])for(const v of remote[key]||[])if(!progress[key].includes(v)){progress[key].push(v);grew=true;}
  for(const key of SYNCED)if(remote[key]&&!progress[key]){progress[key]=true;grew=true;}
  if((remote.roadMeters||0)>(progress.roadMeters||0)){progress.roadMeters=remote.roadMeters;grew=true;}
  if(grew){save();for(const fn of changeListeners)fn(progress);}
 }
 let pushTimer=0,signedIn=false;
 function push(){if(!online||!signedIn)return;clearTimeout(pushTimer);pushTimer=setTimeout(()=>{const {glitches,found,roadMeters}=progress;call('progress',{progress:{glitches,found,roadMeters,...Object.fromEntries(SYNCED.map(k=>[k,!!progress[k]]))}}).then(d=>adopt(d.progress)).catch(error=>{if(error.status===401)signedIn=false;});},1500);}
 function checkAccount(){if(online)call('me').then(d=>{signedIn=!!d.user;if(d.user?.progress)adopt(d.user.progress);push();}).catch(()=>{});}
 checkAccount();setInterval(checkAccount,60000);
 function changed(){save();for(const fn of changeListeners)fn(progress);push();}
 const worthy=()=>progress.glitches.length>=3||progress.jesterBeaten||progress.doorOpened;
 // ---------- Toasts ----------
 const toast=document.createElement('div');toast.id='eden-toast';toast.setAttribute('role','status');world.append(toast);
 let toastTimer=0;
 function notify(text,kind=''){toast.textContent=text;toast.className='show '+kind;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.className='';},4200);}
 // ---------- Sound (tiny synth) ----------
 let audio=null;
 function tone(type,from,to,duration,gain=.3,delay=0){try{audio??=new (window.AudioContext||window.webkitAudioContext)();const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+duration);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+duration+.05);}catch{}}
 const sfx={bonk:()=>{tone('sine',520,180,.18,.25);tone('triangle',90,50,.25,.3);},glitch:()=>{tone('square',60,58,.25,.05);tone('sawtooth',1800,900,.08,.03,.05);},lever:()=>{tone('square',140,90,.12,.12);tone('sine',60,40,.6,.2,.1);},chime:()=>{for(let i=0;i<3;i++)tone('sine',660*1.26**i,660*1.26**i,.5,.08,i*.12);},stone:()=>tone('sine',90,70,.6,.18)};
 // ---------- Speech bubbles ----------
 function bubble(color='#2b1d3d',ink='#3d2a12'){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=300;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));sprite.renderOrder=21;sprite.scale.set(2.3,.9,1);sprite.visible=false;scene.add(sprite);
  let until=0;
  return {sprite,say(text,seconds=4){const c=canvas.getContext('2d');c.clearRect(0,0,768,300);c.fillStyle='#fbf6e9';c.strokeStyle=color;c.lineWidth=6;c.beginPath();c.roundRect(8,8,752,236,36);c.fill();c.stroke();c.beginPath();c.moveTo(350,242);c.lineTo(384,292);c.lineTo(418,242);c.fill();c.stroke();c.fillStyle='#fbf6e9';c.fillRect(354,234,60,12);
   c.fillStyle=ink;c.font='italic 600 34px Georgia,serif';c.textAlign='center';c.textBaseline='middle';const words=text.split(' '),lines=[''];for(const w of words){const next=(lines.at(-1)+' '+w).trim();if(c.measureText(next).width>700&&lines.at(-1))lines.push(w);else lines[lines.length-1]=next;}
   lines.slice(0,5).forEach((l,i,a)=>c.fillText(l,384,126+(i-(a.length-1)/2)*40));texture.needsUpdate=true;until=now()+seconds;sprite.visible=true;requestDraw();},
   update(position){const t=now();sprite.visible=t<until;if(sprite.visible){sprite.position.copy(position);sprite.material.opacity=Math.min(1,(until-t)*2.5);}return sprite.visible;}};
 }
 // ---------- Interactables (shared prompt + E key) ----------
 const interactables=[];
 const prompt=document.createElement('button');prompt.id='eden-prompt';prompt.hidden=true;world.append(prompt);
 let focused=null;prompt.onclick=()=>{focused?.action();stage.querySelector('canvas')?.focus({preventScroll:true});requestDraw();};
 function register(item){interactables.push({radius:3,enabled:()=>true,...item});}
 function nearest(position){let best=null;for(const item of interactables){if(!item.enabled())continue;const d=Math.hypot(position.x-item.position.x,position.z-item.position.z);if(d<item.radius&&(!best||d<best.d))best={item,d};}return best?.item||null;}
 function interact(){const p=getPlayer();if(!p)return false;const item=nearest(p.position);if(!item)return false;item.action();requestDraw();return true;}
 function updatePrompt(){
  const p=getPlayer();focused=p&&canAct()?nearest(p.position):null;
  if(!focused){prompt.hidden=true;return;}
  const point=focused.position.clone().setY(focused.position.y+(focused.height??1.6)).project(camera);
  if(point.z<-1||point.z>1||Math.abs(point.x)>.95||Math.abs(point.y)>.9){prompt.hidden=true;return;}
  const fine=matchMedia('(pointer: fine)').matches,label=(typeof focused.label==='function'?focused.label():focused.label)+(fine?'  (E)':'');
  prompt.hidden=false;if(prompt.textContent!==label)prompt.textContent=label;
  prompt.style.left=T.MathUtils.clamp((point.x+1)*stage.clientWidth/2,110,stage.clientWidth-110)+'px';prompt.style.top=Math.max(125,(1-point.y)*stage.clientHeight/2)+'px';
 }
 // ---------- Glitches + the bird that hits the sky ----------
 const SUN=new T.Vector3(-.38,.32,-.8).normalize();
 let nextGlitch=now()+rand(14,22),lastKind='';
 function witness(kind,text){
  if(progress.glitches.includes(kind))return;progress.glitches.push(kind);changed();
  notify(text+' ('+Math.min(3,progress.glitches.length)+'/3)','mystery');sfx.chime();
  if(progress.glitches.length===3)setTimeout(()=>notify('The sky has been lying to you. Somewhere, a door is stitched into it.','mystery'),4600);
 }
 const forward=()=>camera.getWorldDirection(new T.Vector3());
 function glitch(){
  const kinds=['sun','seams','bird'].filter(k=>k!==lastKind),kind=pick(kinds);lastKind=kind;
  if(kind==='sun'){sky.glitch('sun',{strength:1});sfx.glitch();if(forward().dot(SUN)>.55)witness('sun','The sun just skipped like a scratched record');}
  else if(kind==='seams'){sky.glitch('seams',{strength:1});sfx.glitch();witness('seams','For a second, the sky showed its seams');}
  else launchBird();
 }
 const bird=new T.Group();bird.name='Confused bird';bird.visible=false;scene.add(bird);
 {const feathers=new T.MeshStandardMaterial({color:0x3a3530,roughness:.8}),belly=new T.MeshStandardMaterial({color:0xc9a27a,roughness:.8}),beak=new T.MeshStandardMaterial({color:0xe0a43a,roughness:.5});
  const body=new T.Mesh(new T.SphereGeometry(.11,14,10),feathers);body.scale.set(.8,.75,1.4);bird.add(body);
  const chest=new T.Mesh(new T.SphereGeometry(.09,12,8),belly);chest.position.set(0,-.03,.06);chest.scale.set(.8,.7,1.1);bird.add(chest);
  const headMesh=new T.Mesh(new T.SphereGeometry(.065,12,10),feathers);headMesh.position.set(0,.06,.15);bird.add(headMesh);
  const bill=new T.Mesh(new T.ConeGeometry(.02,.07,8),beak);bill.rotation.x=Math.PI/2;bill.position.set(0,.05,.23);bird.add(bill);
  const tail=new T.Mesh(new T.BoxGeometry(.09,.012,.14),feathers);tail.position.set(0,0,-.19);bird.add(tail);
  for(const s of [-1,1]){const pivot=new T.Group();pivot.position.set(s*.06,.03,0);const wing=new T.Mesh(new T.BoxGeometry(.26,.012,.13),feathers);wing.position.x=s*.13;pivot.add(wing);pivot.userData.side=s;bird.add(pivot);}}
 let flight=null;
 function launchBird(){
  if(flight)return;const walls=[[rand(-14,8),rand(7,12),door.z+.05,0,1],[sky.bounds.maxX-.05,rand(7,12),rand(-10,20),-1,0],[sky.bounds.minX+.05,rand(7,12),rand(-10,20),1,0]];
  const [x,y,z,nx,nz]=pick(walls),hit=new T.Vector3(x,y,z),from=hit.clone().add(new T.Vector3(nx*22+rand(-4,4),rand(-2,1),nz*22+rand(-4,4)));
  from.x=T.MathUtils.clamp(from.x,-19,19);from.z=T.MathUtils.clamp(from.z,-18,25);
  flight={phase:'fly',from,hit,start:now(),duration:from.distanceTo(hit)/9,velocity:new T.Vector3(),spin:rand(-8,8)};bird.visible=true;bird.position.copy(from);bird.lookAt(hit);
 }
 function updateBird(t,dt){
  if(!flight)return false;const f=flight;
  const wings=bird.children.filter(c=>c.userData.side);
  if(f.phase==='fly'){
   const k=Math.min(1,(t-f.start)/f.duration);bird.position.lerpVectors(f.from,f.hit,k);bird.position.y+=Math.sin(k*Math.PI)*1.2;bird.lookAt(f.hit);
   wings.forEach(w=>{w.rotation.z=w.userData.side*Math.sin(t*28)*.9;});
   if(k>=1){f.phase='fall';sky.glitch('flash',{at:f.hit,strength:1});sfx.bonk();f.velocity.set(-(f.hit.x-f.from.x),2,-(f.hit.z-f.from.z)).setLength(2.2);f.velocity.y=1.5;
    if(forward().dot(f.hit.clone().sub(camera.position).normalize())>.5)witness('bird','A bird just flew straight into the sky');}
  }else if(f.phase==='fall'){
   f.velocity.y-=9.8*dt;bird.position.addScaledVector(f.velocity,dt);bird.rotation.x+=f.spin*dt;bird.rotation.z+=f.spin*.6*dt;wings.forEach(w=>{w.rotation.z=w.userData.side*.2;});
   if(bird.position.y<=.08){bird.position.y=.08;f.phase='dazed';f.start=t;bird.rotation.set(0,bird.rotation.y,Math.PI/2.2);}
  }else if(f.phase==='dazed'){
   bird.rotation.y+=dt*2;if(t-f.start>3.5){f.phase='leave';f.start=t;bird.rotation.set(0,bird.rotation.y,0);}
  }else{
   const k=t-f.start;bird.position.y+=dt*(3+k*4);bird.position.x+=dt*2;wings.forEach(w=>{w.rotation.z=w.userData.side*Math.sin(t*30)*.9;});if(k>3){bird.visible=false;flight=null;}
  }
  return true;
 }
 // ---------- Backstage behind the north wall ----------
 const back=new T.Group();back.name='Backstage of the sky';scene.add(back);
 const steel=new T.MeshStandardMaterial({color:0x5d6466,metalness:.7,roughness:.42}),dark=new T.MeshStandardMaterial({color:0x22272a,roughness:.7,metalness:.2});
 const ply=new T.MeshStandardMaterial({color:0x8d7656,roughness:.9}),glow=new T.MeshStandardMaterial({color:0xfff4d8,emissive:0xffe9b8,emissiveIntensity:2.2,roughness:.3});
 // Two lighting towers rise above the wall beside the door: the garden's "sun" is a lamp on a pole.
 for(const x of [door.x-7.2,door.x+7.2]){
  const pole=new T.Mesh(new T.CylinderGeometry(.12,.16,27,10),steel);pole.position.set(x,13.5,door.z-1.4);back.add(pole);
  for(let y=4;y<26;y+=4){const rung=new T.Mesh(new T.CylinderGeometry(.03,.03,.7,6),steel);rung.rotation.z=Math.PI/2;rung.position.set(x,y,door.z-1.25);back.add(rung);}
  const rig=new T.Group();rig.position.set(x,27.2,door.z-1.1);rig.rotation.x=-.55;back.add(rig);
  const housing=new T.Mesh(new T.BoxGeometry(1.6,1.1,1.2),dark);rig.add(housing);const lens=new T.Mesh(new T.PlaneGeometry(1.35,.85),glow);lens.position.z=.61;rig.add(lens);
  const yoke=new T.Mesh(new T.TorusGeometry(.85,.05,6,16,Math.PI),steel);yoke.rotation.z=Math.PI;yoke.position.y=-.1;rig.add(yoke);
 }
 // Stage control booth with the weather lever.
 const booth=new T.Group();booth.name='Stage control booth';booth.position.set(7.2,0,-26.2);back.add(booth);
 const shell=new T.Mesh(new T.BoxGeometry(2.6,2.5,2.2),new T.MeshStandardMaterial({color:0x2f3436,roughness:.75}));shell.position.y=1.25;booth.add(shell);
 const roof=new T.Mesh(new T.BoxGeometry(2.9,.12,2.5),dark);roof.position.y=2.56;booth.add(roof);
 const screen=new T.Mesh(new T.PlaneGeometry(1.5,.7),new T.MeshStandardMaterial({color:0x0b1a14,emissive:0x2bd38a,emissiveIntensity:.6}));screen.position.set(0,1.75,1.105);booth.add(screen);
 const label=document.createElement('canvas');label.width=512;label.height=128;{const c=label.getContext('2d');c.fillStyle='#1d2224';c.fillRect(0,0,512,128);c.fillStyle='#f3d27a';c.font='700 42px monospace';c.textAlign='center';c.fillText('STAGE CONTROL',256,58);c.font='22px monospace';c.fillStyle='#d9d4c4';c.fillText('SKY · SUN · WEATHER — CREW ONLY',256,98);}
 const labelTexture=new T.CanvasTexture(label);labelTexture.colorSpace=T.SRGBColorSpace;
 const sign=new T.Mesh(new T.PlaneGeometry(2.2,.55),new T.MeshBasicMaterial({map:labelTexture}));sign.position.set(0,2.95,1.12);booth.add(sign);
 const signPost=new T.Mesh(new T.BoxGeometry(2.3,.62,.06),dark);signPost.position.set(0,2.95,1.08);booth.add(signPost);
 const panel=new T.Mesh(new T.BoxGeometry(.9,.7,.18),dark);panel.position.set(0,1.05,1.19);booth.add(panel);
 const lamps=[0xffd58a,0xff8a5c,0x5c7dff].map((c,i)=>{const m=new T.Mesh(new T.SphereGeometry(.045,10,8),new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.15}));m.position.set(-.28+i*.28,1.28,1.29);booth.add(m);return m;});
 const lever=new T.Group();lever.position.set(0,.9,1.3);booth.add(lever);
 const handle=new T.Mesh(new T.CylinderGeometry(.025,.025,.42,8),steel);handle.position.y=.21;lever.add(handle);
 const knob=new T.Mesh(new T.SphereGeometry(.06,12,10),new T.MeshStandardMaterial({color:0xb3262a,roughness:.4}));knob.position.y=.43;lever.add(knob);
 knob.userData.onPick=()=>pullLever();handle.userData.onPick=knob.userData.onPick;addPickable(knob);addPickable(handle);
 // Cables snake from the booth to the wall.
 for(const [dx,dz] of [[-4,1],[3,.6],[9,.9]]){const curve=new T.CatmullRomCurve3([new T.Vector3(7.2,.04,-25),new T.Vector3(7.2+dx*.5,.04,-24+dz),new T.Vector3(7.2+dx,.04,door.z-2.2)]);back.add(new T.Mesh(new T.TubeGeometry(curve,24,.035,6),dark));}
 back.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=true;}});
 const STAGES=[{value:0,name:'DAY',text:'The crew\'s sun comes back on.'},{value:.5,name:'DUSK',text:'The stage lights dim to dusk.'},{value:1,name:'NIGHT',text:'Someone cut the sun. Night falls on the set.'}];
 let stageIndex=0,leverAnim=0;
 function setWeather(index){stageIndex=index;const s=STAGES[index];if(!garden.nightRoad)void garden.pyramid;garden.nightRoad?.setStage(s.value);leverAnim=now();sfx.lever();lamps.forEach((l,i)=>{l.material.emissiveIntensity=i===index?2.4:.15;});requestDraw();}
 const worldListeners=[];
 shared?.onLive?.(data=>{
  if(data.t!=='world')return;
  const index=STAGES.findIndex(s=>s.value===data.weather?.stage);
  if(index>=0&&index!==stageIndex){setWeather(index);if(data.weather.by)notify(data.weather.by+' pulled the weather lever: '+STAGES[index].name+'.','mystery');}
  for(const fn of worldListeners)fn(data);
 });
 function pullLever(){
  setWeather((stageIndex+1)%STAGES.length);notify(STAGES[stageIndex].text,'mystery');
  // In the shared room everyone's sky follows the lever (server/world.mjs).
  if(shared?.live?.()&&shared.canFight?.())shared.send({t:'weather',stage:STAGES[stageIndex].value});
  if(!progress.lever){progress.lever=true;changed();}
 }
 register({position:new T.Vector3(7.2,0,-24.6),radius:2.4,height:1.3,label:()=>'PULL THE WEATHER LEVER · '+STAGES[(stageIndex+1)%3].name,action:pullLever});
 // The door is the way into the open match; opening it is remembered as progress.
 function tryDoor(){
  if(!progress.doorOpened){progress.doorOpened=true;changed();}
  return true;
 }
 // ---------- Jester knows ----------
 combat?.on('jesterKO',()=>{
  const first=!progress.jesterBeaten;progress.jesterBeaten=true;changed();
  if(first)setTimeout(()=>{combat.jesterSay('Psst… the sky has a door. Behind the sign.');notify('The Fool whispered something about a door…','mystery');},7000);
 });
 // ---------- Frame update ----------
 function update(time,dt){
  const t=now(),p=getPlayer();let busy=false;
  if(!reduced&&p&&p.position.z>door.z&&t>nextGlitch&&canAct()){glitch();nextGlitch=t+rand(24,42);}
  busy=updateBird(t,dt)||busy;
  if(t-leverAnim<4){const k=Math.min(1,(t-leverAnim)/.25);lever.rotation.x=(stageIndex%2?.7:-.7)*k;busy=true;}
  updatePrompt();
  return busy;
 }
 return {
  update,interact,register,notify,tryDoor,progress,changed,onChange(fn){changeListeners.push(fn);},worthy,
  onWorld(fn){worldListeners.push(fn);},call,get online(){return online&&signedIn;},
  blocks(p){
   const b=booth.position;if(Math.abs(p.x-b.x)<1.6&&Math.abs(p.z-b.z)<1.4)return true;
   return false;
  },
  inspect:()=>({progress:JSON.parse(JSON.stringify(progress)),worthy:worthy(),stage:STAGES[stageIndex].name,online:online&&signedIn,bird:flight?.phase||null,interactables:interactables.length})
 };
};
