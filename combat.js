'use strict';
/*
 * Eden combat system.
 *
 * Weapons: WITNESS 9mm pistol, JUDGMENT 12ga pump, CAIN felling axe, REVELATION C4.
 * Models are built locally. Licensed recorded sound and effect resources are cached
 * during warm-up; procedural sound remains available if recordings fail to load.
 *
 * Shooting mechanic: TRUE SHOT.
 *   Hold right mouse to focus. A ring closes on the crosshair. When it locks (gold) you
 *   have a short window where the next shot is perfect: zero spread, double impact and a
 *   gold tracer. Hold too long and your breath runs out: the ring opens and the weapon sways.
 *   Firing resets the ring, so rhythm beats spam. The axe uses the same ring as a wind-up
 *   for a TRUE CHOP.
 *
 * Integration surface (all provided by app.js):
 *   createCombat({T,scene,camera,renderer,stage,sky,reduced,requestDraw,canAct,getLook,setLook,
 *                 placePlayer,movement})
 */
(function(root){
 const TAU=Math.PI*2;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const lerp=(a,b,t)=>a+(b-a)*t;
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 const seg=(t,a,b)=>clamp((t-a)/(b-a),0,1);
 const easeOut=t=>1-(1-t)**3;
 const easeIn=t=>t*t*t;
 const rand=(a,b)=>a+Math.random()*(b-a);

 // Critically-damped-ish spring used for every procedural motion channel.
 // Keyframed pose curves: keys = [[time, [x,y,z,rx,ry,rz], ease]] with ease 'in' | 'out' | 'io' (default).
 const EASE={in:t=>t*t*t,out:t=>1-(1-t)**3,io:t=>t*t*(3-2*t),lin:t=>t};
 function keyPose(keys,t,scale=1){const out=[0,0,0,0,0,0];if(t<=keys[0][0])return keys[0][1].slice();
  for(let i=1;i<keys.length;i++){const [t1,p1,e]=keys[i],[t0,p0]=keys[i-1];if(t<=t1){const k=(EASE[e]||EASE.io)((t-t0)/(t1-t0));for(let j=0;j<6;j++)out[j]=(p0[j]+(p1[j]-p0[j])*k)*scale;return out;}}
  return keys[keys.length-1][1].map(v=>v*scale);}
 // Axe chop: wind up over the right shoulder, accelerate down-left through the crosshair, follow through, recover.
 const AXE_KEYS=[[0,[0,0,0,0,0,0]],[.15,[.02,.05,.05,.55,-.12,-.18],'out'],[.2,[.025,.06,.055,.62,-.14,-.2]],[.27,[-.13,-.02,-.12,-.55,.3,.55],'in'],[.33,[-.2,-.08,-.08,-.85,.42,.75],'out'],[.56,[0,0,0,0,0,0]]];
 function Spring(k=180,d=18){this.x=0;this.v=0;this.k=k;this.d=d;}
 Spring.prototype.step=function(target,dt){const a=this.k*(target-this.x)-this.d*this.v;this.v+=a*dt;this.x+=this.v*dt;return this.x;};
 Spring.prototype.kick=function(v){this.v+=v;};

 const GLOW=5; // render layer for bloom emitters
 const WEAPONS=[
  {id:'pistol',slot:1,name:'WITNESS',kind:'9MM PISTOL',mag:12,interval:.11,focusTime:.34,window:.32,dmg:30,botDmg:17,ammo:'pistol',range:60},
  {id:'pump',slot:2,name:'JUDGMENT',kind:'12GA PUMP',mag:6,interval:.2,focusTime:.6,window:.36,dmg:11,ammo:'shells',range:35},
  {id:'axe',slot:3,name:'CAIN',kind:'FELLING AXE',mag:0,interval:.1,focusTime:.55,window:.3,dmg:55},
  {id:'c4',slot:4,name:'REVELATION',kind:'C4 CHARGE',mag:3,interval:.2,focusTime:1,window:1,dmg:150,ammo:'c4'},
  {id:'smg',slot:5,name:'PSALM',kind:'.45 SMG',mag:30,interval:.068,auto:true,focusTime:.3,window:.35,dmg:15,ammo:'smg',range:70,hip:.05,aim:.012,heat:.004,rec:{z:.45,x:1.3,yaw:.03,pitch:.014},snd:'smg'},
  {id:'rifle',slot:6,name:'EXODUS',kind:'7.62 RIFLE',mag:30,interval:.1,auto:true,focusTime:.42,window:.3,dmg:17,ammo:'rifle',range:160,hip:.045,aim:.004,heat:.003,rec:{z:.75,x:2.1,yaw:.035,pitch:.022},snd:'rifle'},
  {id:'sniper',slot:7,name:'GENESIS',kind:'BOLT SNIPER',mag:5,interval:1.1,focusTime:.75,window:.45,dmg:95,ammo:'sniper',range:300,hip:.1,aim:0,scope:true,rec:{z:2.2,x:5.5,yaw:.03,pitch:.085},snd:'sniper'},
  // Always with you (never dropped or looted): what comes up when you attack with empty hands.
  {id:'fists',slot:8,name:'FISTS',kind:'BARE HANDS',mag:0,interval:.05,focusTime:1,window:1,dmg:20}
 ];
 // Variants: other guns of the same class (same slot, ammo, loot table and bot behaviour; own model, name and feel).
 // Models in models/combat/variants (CC0, see models/combat/CREDITS.md), already in weapon space; points from
 // tools/combat/align_guns notes. stats override the class entry while that variant is carried.
 const VARIANTS={
  pistol:[
   {id:'elder',name:'ELDER',kind:'.45 PISTOL',file:'1911.glb',points:{muzzle:[0,.07,-.18],sight:[0,.09,-.06]},stats:{interval:.14}},
   {id:'pilgrim',name:'PILGRIM',kind:'9MM TOGGLE PISTOL',file:'luger.glb',points:{muzzle:[0,.078,-.18],sight:[0,.09,-.06]},stats:{interval:.12}},
   {id:'zealot',name:'ZEALOT',kind:'9MM COMPACT',file:'makarov.glb',points:{muzzle:[0,.078,-.13],sight:[0,.09,-.06]},stats:{interval:.1}},
   {id:'serpent',name:'SERPENT',kind:'9MM MACHINE PISTOL',file:'tec9.glb',points:{muzzle:[0,.058,-.26],sight:[0,.09,-.06]},stats:{interval:.085}}
  ],
  smg:[
   {id:'choir',name:'CHOIR',kind:'9MM SMG',file:'mp5.glb',points:{muzzle:[0,.13,-.375],sight:[0,.193,-.125]},stats:{interval:.075,rec:{z:.38,x:1.1,yaw:.025,pitch:.012}}},
   {id:'locust',name:'LOCUST',kind:'.45 MACHINE PISTOL',file:'mac10.glb',points:{muzzle:[0,.111,-.175],sight:[0,.155,-.125]},stats:{interval:.05,hip:.06,rec:{z:.55,x:1.6,yaw:.045,pitch:.018}},left:[-.03,.0,-.12]},
   {id:'brazen',name:'BRAZEN',kind:'.45 GREASE GUN',file:'greasegun.glb',points:{muzzle:[0,.146,-.485],sight:[0,.2,-.125]},stats:{interval:.1,rec:{z:.4,x:1.1,yaw:.02,pitch:.012}}},
   {id:'shepherd',name:'SHEPHERD',kind:'9MM DRUM SMG',file:'suomi.glb',points:{muzzle:[0,.133,-.515],sight:[0,.165,-.125]},stats:{interval:.06}}
  ],
  rifle:[
   {id:'vigil',name:'VIGIL',kind:'5.56 CARBINE',file:'m4a1.glb',points:{muzzle:[0,.093,-.62],sight:[0,.155,-.125]},stats:{interval:.085,rec:{z:.6,x:1.7,yaw:.03,pitch:.018}}},
   {id:'watchman',name:'WATCHMAN',kind:'7.62 BATTLE RIFLE',file:'m14.glb',points:{muzzle:[0,.1,-.64],sight:[0,.128,-.125]},stats:{interval:.13,rec:{z:.9,x:2.6,yaw:.04,pitch:.028}}}
  ],
  sniper:[
   {id:'oracle',name:'ORACLE',kind:'.308 BOLT RIFLE',file:'m700.glb',points:{muzzle:[0,.129,-.892],sight:[0,.15,-.125]},stats:{interval:1}},
   {id:'deacon',name:'DEACON',kind:'.30 LEVER RIFLE',file:'leveraction.glb',points:{muzzle:[0,.114,-.892],sight:[0,.135,-.125]},stats:{interval:.6,scope:false,zoom:1.8}}
  ],
  // Thrown explosives share the C4 slot and its pouch: no remote, they bounce and go off on a fuse.
  c4:[
   {id:'frag',name:'TRUMPET',kind:'FRAG GRENADE',file:'fraggrenade.glb',fuse:2.4,radius:7.5,dmg:130,speed:11,bounce:.38},
   {id:'pipe',name:'JERICHO',kind:'PIPE BOMB',file:'pipebomb.glb',fuse:3.2,radius:9.5,dmg:165,speed:9,bounce:.25}
  ],
  pump:[
   {id:'lament',name:'LAMENT',kind:'12GA PUMP',file:'shotgun870.glb',points:{muzzle:[0,.098,-.715],sight:[0,.115,-.125]},stats:{interval:.22}}
  ]
 };
 const VARIANT_STATS=['name','kind','interval','rec','hip','aim','scope','zoom'];
 const BASE_STATS=Object.fromEntries(WEAPONS.map(w=>[w.id,Object.fromEntries(VARIANT_STATS.map(k=>[k,w[k]]))]));
 const variantOfSpec=(id,vid)=>vid&&VARIANTS[id]?.find(v=>v.id===vid)||null;

 function createCombat(o){
  const {T,scene,camera,renderer,stage}=o;
  const hudHost=stage.parentElement,mobile=o.mobile??matchMedia('(pointer:coarse)').matches,sceneryQuery=window.createNearestSceneryQuery(T);
  let touchMode=false,built=false,armed=false,locked=false,current=null,previous=null,lastTime=0,scoped=false,arsenal=null;
  let yaw=0,pitch=0,buttons={left:false,right:false},pendingFire=false;
  const RECOIL_RECOVERY={pistol:[150,22,.25],smg:[190,26,.15],rifle:[135,21,.5],pump:[85,17,1.6],sniper:[65,15,2]};
  const look={fovPulse:0,kickPitch:new Spring(120,16),kickYaw:new Spring(120,16),shake:0};
  const stats={hits:0,trueShots:0,shots:0,bodyHits:0,headHits:0,kills:0};
  let lastCamPos=null,speedSmoothed=0,bobPhase=0,verticalVel=0,lastY=0;
  let viewHemi=null,viewRim=null,fillBase=null,env,M,viewScene,viewCamera,sunView,world,fxGroup,flashLight,blastLight,raycaster,hud,audio=null;
  const models={},state={},particles=[],shells=[],decals=[],tracers=[],charges=[],targets=[],debris=[];

  /* ------------------------------------------------------------ textures */
  function canvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);return c;}
  function tex(c,srgb=true,repeat=false){const t=new T.CanvasTexture(c);if(srgb)t.colorSpace=T.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(repeat){t.wrapS=t.wrapT=T.RepeatWrapping;}return t;}
  function noise(ctx,w,h,count,size,alpha,light=255){for(let i=0;i<count;i++){const v=Math.random()*light|0;ctx.fillStyle=`rgba(${v},${v},${v},${Math.random()*alpha})`;const s=Math.random()*size+.5;ctx.fillRect(Math.random()*w,Math.random()*h,s,s);}}
  function woodCanvas(base,dark,light){
   return canvas(512,128,(ctx,w,h)=>{ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
    for(let i=0;i<180;i++){const y=Math.random()*h,amp=rand(1,5),f=rand(.006,.02),ph=Math.random()*TAU;ctx.strokeStyle=Math.random()<.6?dark:light;ctx.globalAlpha=rand(.08,.35);ctx.lineWidth=rand(.4,2.2);ctx.beginPath();for(let x=0;x<=w;x+=8)ctx.lineTo(x,y+Math.sin(x*f+ph)*amp);ctx.stroke();}
    ctx.globalAlpha=1;for(let i=0;i<6;i++){const x=Math.random()*w,y=Math.random()*h;const g=ctx.createRadialGradient(x,y,0,x,y,rand(4,10));g.addColorStop(0,dark);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-12,y-12,24,24);}
    noise(ctx,w,h,2500,1.5,.08,60);});
  }
  function buildTextures(){
   const wear=tex(canvas(256,256,(ctx,w,h)=>{ctx.fillStyle='#7a7a7a';ctx.fillRect(0,0,w,h);noise(ctx,w,h,9000,2,.25);for(let i=0;i<40;i++){ctx.strokeStyle=`rgba(40,40,40,${rand(.1,.3)})`;ctx.lineWidth=rand(.3,1);ctx.beginPath();const x=Math.random()*w,y=Math.random()*h;ctx.moveTo(x,y);ctx.lineTo(x+rand(-40,40),y+rand(-6,6));ctx.stroke();}}),false,true);
   const stipple=tex(canvas(256,256,(ctx,w,h)=>{ctx.fillStyle='#808080';ctx.fillRect(0,0,w,h);for(let i=0;i<5200;i++){const v=Math.random()<.5?30:230;ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.beginPath();ctx.arc(Math.random()*w,Math.random()*h,rand(.6,1.6),0,TAU);ctx.fill();}}),false,true);
   stipple.repeat.set(18,18);wear.repeat.set(4,4);
   const walnut=tex(woodCanvas('#4a2a17','#24120a','#7a4a2a'),true,true);
   const hickory=tex(woodCanvas('#b98a55','#6d4626','#dcb27c'),true,true);
   const axe=tex(canvas(512,256,(ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,w,0);g.addColorStop(0,'#1b1c1e');g.addColorStop(.58,'#232427');g.addColorStop(.66,'#5b5d61');g.addColorStop(.74,'#a9acb1');g.addColorStop(1,'#d7d9dc');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){const x=rand(.66,1)*w;ctx.strokeStyle=`rgba(255,255,255,${rand(.03,.12)})`;ctx.beginPath();ctx.moveTo(x,Math.random()*h);ctx.lineTo(x+rand(-30,30),Math.random()*h);ctx.stroke();}
    noise(ctx,w*.6,h,4000,2.5,.2,90);ctx.fillStyle='rgba(190,190,190,.5)';ctx.font='bold 22px Georgia';ctx.save();ctx.translate(w*.33,h*.55);ctx.fillText('CAIN',0,0);ctx.restore();}));
   const c4=tex(canvas(512,256,(ctx,w,h)=>{ctx.fillStyle='#5c5f45';ctx.fillRect(0,0,w,h);noise(ctx,w,h,6000,2,.12);for(let i=0;i<14;i++){ctx.strokeStyle=`rgba(255,255,240,${rand(.04,.1)})`;ctx.lineWidth=rand(2,8);ctx.beginPath();ctx.moveTo(0,Math.random()*h);ctx.bezierCurveTo(w*.3,Math.random()*h,w*.6,Math.random()*h,w,Math.random()*h);ctx.stroke();}
    ctx.fillStyle='rgba(18,18,14,.85)';ctx.font='bold 30px "Arial Narrow",Arial';ctx.fillText('CHARGE, DEMOLITION',28,70);ctx.font='bold 24px "Arial Narrow",Arial';ctx.fillText('COMPOSITION C-4  /  REVELATION',28,108);ctx.font='18px "Arial Narrow",Arial';ctx.fillText('LOT BTR-0001  ·  1.25 LB  ·  EDEN ARMORY',28,140);ctx.strokeStyle='rgba(18,18,14,.7)';ctx.lineWidth=3;ctx.strokeRect(14,24,w-28,138);}));
   const label=tex(canvas(256,64,(ctx,w,h)=>{ctx.fillStyle='#1c1c1c';ctx.fillRect(0,0,w,h);ctx.fillStyle='#bdbdbd';ctx.font='bold 20px "Arial Narrow",Arial';ctx.fillText('WITNESS  9×19',14,40);}));
   const soft=tex(canvas(128,128,(ctx,w,h)=>{const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.4,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}));
   const puff=tex(canvas(128,128,(ctx)=>{for(let i=0;i<16;i++){const x=64+rand(-24,24),y=64+rand(-24,24),r=rand(18,40);const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}}));
   const flash=tex(canvas(256,256,(ctx,w,h)=>{ctx.translate(128,128);ctx.globalCompositeOperation='lighter';for(let i=0;i<7;i++){ctx.rotate(TAU/7+rand(-.2,.2));const len=rand(70,124);const g=ctx.createLinearGradient(0,0,len,0);g.addColorStop(0,'rgba(255,240,200,.95)');g.addColorStop(1,'rgba(255,140,40,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(len,0);ctx.lineTo(0,9);ctx.fill();}const g=ctx.createRadialGradient(0,0,0,0,0,58);g.addColorStop(0,'rgba(255,255,240,1)');g.addColorStop(.35,'rgba(255,200,90,.85)');g.addColorStop(1,'rgba(255,90,10,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,58,0,TAU);ctx.fill();}));
   // Muzzle flashes after high-speed photographs: a white-hot core, a short yellow bloom, 4-6 ragged orange prongs that
   // taper to forked tips, and loose sparks. Four variants; each shot picks one, rotated and scaled at random.
   const flashes=[0,1,2,3].map(v=>tex(canvas(256,256,(ctx)=>{ctx.translate(128,128);ctx.globalCompositeOperation='lighter';const prongs=4+(v%3);
    for(let i=0;i<prongs;i++){ctx.save();ctx.rotate(i/prongs*TAU+rand(-.35,.35));const len=rand(62,122),wid=rand(7,15);
     const g=ctx.createLinearGradient(0,0,len,0);g.addColorStop(0,'rgba(255,248,222,.95)');g.addColorStop(.35,'rgba(255,198,92,.75)');g.addColorStop(.75,'rgba(255,112,32,.32)');g.addColorStop(1,'rgba(255,70,10,0)');
     ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-wid);for(let k=1;k<=6;k++)ctx.lineTo(len*k/6,-wid*(1-k/6)+rand(-3,3));ctx.lineTo(len*1.05,rand(-5,5));for(let k=6;k>=1;k--)ctx.lineTo(len*k/6,wid*(1-k/6)+rand(-3,3));ctx.lineTo(0,wid);ctx.closePath();ctx.fill();ctx.restore();}
    for(let i=0;i<18;i++){const a=rand(0,TAU),r=rand(22,92);ctx.fillStyle=`rgba(255,${190+(rand(0,60)|0)},120,${rand(.15,.5).toFixed(2)})`;ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,rand(.8,2.2),0,TAU);ctx.fill();}
    const g=ctx.createRadialGradient(0,0,0,0,0,62);g.addColorStop(0,'rgba(255,255,250,1)');g.addColorStop(.18,'rgba(255,246,212,.95)');g.addColorStop(.45,'rgba(255,190,92,.42)');g.addColorStop(1,'rgba(255,120,40,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,62,0,TAU);ctx.fill();})));
   const hole=tex(canvas(64,64,(ctx)=>{let g=ctx.createRadialGradient(32,32,0,32,32,30);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.18,'rgba(10,8,6,1)');g.addColorStop(.3,'rgba(40,34,28,.7)');g.addColorStop(1,'rgba(40,34,28,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);}));
   const splat=tex(canvas(64,64,(ctx)=>{let g=ctx.createRadialGradient(32,32,0,32,32,30);g.addColorStop(0,'rgba(180,182,186,1)');g.addColorStop(.25,'rgba(120,122,126,.95)');g.addColorStop(.45,'rgba(60,60,62,.6)');g.addColorStop(1,'rgba(60,60,62,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);}));
   const scorch=tex(canvas(256,256,(ctx)=>{for(let i=0;i<40;i++){const x=128+rand(-50,50),y=128+rand(-50,50),r=rand(30,90);const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(8,6,4,.35)');g.addColorStop(1,'rgba(8,6,4,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);}}));
   const chop=tex(canvas(64,32,(ctx)=>{ctx.fillStyle='rgba(235,205,160,.95)';ctx.beginPath();ctx.ellipse(32,16,30,5,0,0,TAU);ctx.fill();ctx.fillStyle='rgba(60,35,15,.8)';ctx.fillRect(4,15,56,2);}));
   const paint=tex(canvas(256,256,(ctx,w,h)=>{ctx.fillStyle='#e9e6dc';ctx.fillRect(0,0,w,h);noise(ctx,w,h,3000,2,.08,120);}));
   return {wear,stipple,walnut,hickory,axe,c4,label,soft,puff,flash,flashes,hole,splat,scorch,chop,paint};
  }

  function buildEnvironment(){
   const pm=new T.PMREMGenerator(renderer);const s=new T.Scene();
   const geo=new T.SphereGeometry(20,48,24),colors=[],p=geo.attributes.position,c=new T.Color();
   for(let i=0;i<p.count;i++){const y=p.getY(i)/20;if(y>0)c.setRGB(lerp(1.05,.62,y),lerp(1.0,.78,y),lerp(.92,1.0,y));else c.setRGB(lerp(.55,.12,-y),lerp(.55,.15,-y),lerp(.42,.08,-y));colors.push(c.r*1.1,c.g*1.1,c.b*1.1);}
   geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
   s.add(new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide})));
   const panel=(x,y,z,w,h,i,col=0xffffff)=>{const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(col).multiplyScalar(i),side:T.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);s.add(m);};
   panel(-8,12,-14,8,8,2.6,0xffe2b0);panel(12,6,6,10,3,2.2);panel(-14,4,8,6,8,1.4,0xdfe9ff);panel(0,-6,12,14,2,.5,0x9caa70);
   const rt=pm.fromScene(s,.03);pm.dispose();geo.dispose();return rt.texture;
  }

  function buildMaterials(tx){
   const base={envMap:env};
   const steel=new T.MeshPhysicalMaterial({...base,color:0x2c2e33,metalness:1,roughness:.42,roughnessMap:tx.wear,clearcoat:.25,clearcoatRoughness:.35,envMapIntensity:1.1});
   return {
    steel,
    steelDark:new T.MeshPhysicalMaterial({...base,color:0x18191b,metalness:.9,roughness:.55,roughnessMap:tx.wear}),
    bright:new T.MeshPhysicalMaterial({...base,color:0x9a9da3,metalness:1,roughness:.22,roughnessMap:tx.wear}),
    tin:new T.MeshPhysicalMaterial({...base,color:0xb8924e,metalness:1,roughness:.26,clearcoat:.4}),
    polymer:new T.MeshStandardMaterial({...base,color:0x1f2022,metalness:0,roughness:.64,bumpMap:tx.stipple,bumpScale:.6}),
    polymerSmooth:new T.MeshStandardMaterial({...base,color:0x202123,metalness:0,roughness:.46}),
    walnut:new T.MeshPhysicalMaterial({...base,map:tx.walnut,roughness:.5,clearcoat:.55,clearcoatRoughness:.3,bumpMap:tx.walnut,bumpScale:.15}),
    hickory:new T.MeshPhysicalMaterial({...base,map:tx.hickory,roughness:.58,clearcoat:.25,clearcoatRoughness:.5,bumpMap:tx.hickory,bumpScale:.2}),
    rubber:new T.MeshStandardMaterial({...base,color:0x141414,roughness:.92}),
    brass:new T.MeshPhysicalMaterial({...base,color:0xd2a656,metalness:1,roughness:.24,clearcoat:.3}),
    hull:new T.MeshPhysicalMaterial({...base,color:0x8a1612,roughness:.42,clearcoat:.5}),
    axeHead:new T.MeshPhysicalMaterial({...base,map:tx.axe,metalness:1,roughness:.33,roughnessMap:tx.wear,clearcoat:.2}),
    c4:new T.MeshPhysicalMaterial({...base,map:tx.c4,roughness:.55,clearcoat:.6,clearcoatRoughness:.25}),
    putty:new T.MeshStandardMaterial({...base,color:0xd8d2b8,roughness:.85}),
    tape:new T.MeshPhysicalMaterial({...base,color:0x2c2d2a,roughness:.35,clearcoat:.5}),
    label:new T.MeshStandardMaterial({...base,map:tx.label,roughness:.5}),
    tritium:new T.MeshStandardMaterial({color:0x0a1a0a,emissive:0x66ff7a,emissiveIntensity:2.2}),
    led:new T.MeshStandardMaterial({color:0x220000,emissive:0xff2a1a,emissiveIntensity:0}),
    wireRed:new T.MeshStandardMaterial({...base,color:0x9b1c16,roughness:.4}),
    wireBlk:new T.MeshStandardMaterial({...base,color:0x111111,roughness:.4}),
    paint:new T.MeshPhysicalMaterial({...base,map:tx.paint,metalness:.15,roughness:.55,clearcoat:.3}),
    frameSteel:new T.MeshStandardMaterial({...base,color:0x3b3e42,metalness:.8,roughness:.5,roughnessMap:tx.wear}),
    post:new T.MeshStandardMaterial({...base,map:tx.hickory,color:0xd9c3a2,roughness:.8,bumpMap:tx.hickory,bumpScale:.4})
   };
  }

  /* ------------------------------------------------------------ geometry helpers */
  function shape(points){const s=new T.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
  function roundedRect(x,y,w,h,r){const s=new T.Shape();s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  function extrude(s,thick,bevel=.0015,segments=3){const bt=Math.min(bevel,thick*.45);const g=new T.ExtrudeGeometry(s,{depth:Math.max(.0005,thick-2*bt),bevelEnabled:bevel>0,bevelThickness:bt,bevelSize:bevel,bevelSegments:segments,curveSegments:16});g.translate(0,0,-(thick-2*bt)/2);g.computeVertexNormals();return g;}
  function mesh(g,m,parent,pos,rot){const x=new T.Mesh(g,m);if(pos)x.position.set(...pos);if(rot)x.rotation.set(...rot);x.castShadow=true;x.receiveShadow=true;parent&&parent.add(x);return x;}
  function box(w,h,d,m,parent,pos,rot,bevel=.0012){return mesh(extrude(roundedRect(-w/2,-h/2,w,h,Math.min(bevel*1.5,w*.3,h*.3)),d,bevel,2),m,parent,pos,rot);}
  function cyl(r1,r2,len,m,parent,pos,rot,seg=24){return mesh(new T.CylinderGeometry(r1,r2,len,seg),m,parent,pos,rot);}
  // Cylinder whose axis lies along +X (gun forward in model space).
  function barrel(r,len,m,parent,x,y,z=0,seg=28){const c=cyl(r,r,len,m,parent,[x+len/2,y,z],[0,0,Math.PI/2],seg);return c;}
  function tube(points,r,m,parent,seg=24){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(new T.TubeGeometry(curve,seg,r,10,false),m,parent);}
  function remapUV(g){g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x),(p.getY(i)-b.min.y)/(b.max.y-b.min.y));uv.needsUpdate=true;}

  /* ------------------------------------------------------------ weapon models (model space: +X forward, +Y up, +Z right) */
  function buildPistol(){
   const g=new T.Group(),p={};
   // Frame + dust cover rail
   mesh(extrude(shape([[.018,.084],[.182,.084],[.186,.09],[.186,.104],[.02,.104],[.012,.096]]),.0225,.0018),M.polymerSmooth,g);
   for(let i=0;i<3;i++)box(.006,.004,.024,M.polymerSmooth,g,[.13+i*.014,.082,0]);
   // Grip with stippling, beavertail and front strap
   const grip=mesh(extrude(shape([[-.012,.1],[.07,.1],[.074,.092],[.07,.086],[.064,.07],[.059,.052],[.062,.042],[.056,.028],[.05,.014],[.046,-.004],[.004,-.004],[-.004,.004],[-.006,.06],[-.012,.088],[-.024,.096],[-.02,.103]]),.0305,.003,4),M.polymer,g);
   grip.geometry.attributes.uv&&remapUV(grip.geometry);
   // Trigger guard
   tube([[.064,.085],[.066,.064],[.084,.058],[.118,.06],[.126,.074],[.124,.086]],.0034,M.polymerSmooth,g);
   p.trigger=mesh(extrude(shape([[0,0],[.004,0],[.007,-.012],[.004,-.022],[.0,-.024],[.002,-.012]]),.006,.0012),M.steelDark,g,[.086,.084,0]);
   // Slide (moves along -X when firing)
   p.slide=new T.Group();g.add(p.slide);
   mesh(extrude(shape([[-.004,.104],[.19,.104],[.192,.112],[.188,.133],[-.0,.133],[-.006,.128],[-.006,.108]]),.0235,.0022,3),M.steel,p.slide);
   for(let i=0;i<7;i++){box(.0018,.022,.0245,M.steelDark,p.slide,[.008+i*.0042,.119,0],null,.0004);box(.0018,.018,.0245,M.steelDark,p.slide,[.158+i*.0042,.12,0],null,.0004);}
   box(.032,.011,.0005,M.steelDark,p.slide,[.07,.12,.0126],null,0);
   const lab=mesh(new T.PlaneGeometry(.05,.0095),M.label,p.slide,[.112,.117,.01245]);lab.material=M.label;
   // Ejection port + TiN barrel hood
   box(.034,.012,.004,M.steelDark,p.slide,[.06,.128,.0105],null,.0006);
   box(.03,.009,.016,M.tin,g,[.06,.126,0],null,.0008);
   barrel(.0062,.01,M.tin,p.slide,.19,.12,0,20);cyl(.0044,.0044,.0115,M.steelDark,p.slide,[.1955,.12,0],[0,0,Math.PI/2],16);
   // Sights with tritium
   const rear=new T.Group();p.slide.add(rear);rear.position.set(.012,.136,0);
   box(.008,.007,.0075,M.steelDark,rear,[0,0,-.0055]);box(.008,.007,.0075,M.steelDark,rear,[0,0,.0055]);
   mesh(new T.SphereGeometry(.0011,10,8),M.tritium,rear,[.0042,.0005,-.0055]);mesh(new T.SphereGeometry(.0011,10,8),M.tritium,rear,[.0042,.0005,.0055]);
   box(.0048,.0075,.0034,M.steelDark,p.slide,[.182,.1365,0]);mesh(new T.SphereGeometry(.0013,10,8),M.tritium,p.slide,[.1794,.1375,0]);
   // Slide stop / takedown lever details on left side
   box(.024,.0035,.003,M.steelDark,g,[.1,.098,-.0128]);box(.009,.005,.003,M.steelDark,g,[.135,.096,-.0125]);
   // Magazine: body hidden in grip + baseplate
   p.mag=new T.Group();g.add(p.mag);
   mesh(extrude(shape([[.002,.085],[.05,.085],[.044,.0],[-.002,.0]]),.022,.001),M.steelDark,p.mag);
   box(.052,.007,.032,M.polymerSmooth,p.mag,[.022,-.004,0],[0,0,-.12],.002);
   p.mag.userData.home=p.mag.position.clone();
   p.muzzle=new T.Object3D();p.muzzle.position.set(.205,.12,0);p.slide.add(p.muzzle);
   p.ejector=new T.Object3D();p.ejector.position.set(.06,.13,.015);g.add(p.ejector);
   p.sight=new T.Object3D();p.sight.position.set(.1,.1385,0);g.add(p.sight);
   return {group:g,parts:p};
  }

  function buildPump(){
   const g=new T.Group(),p={};
   // Receiver
   mesh(extrude(shape([[0,0],[.205,0],[.215,.012],[.215,.058],[.2,.066],[.03,.066],[.0,.058]]),.036,.0035,4),M.steel,g);
   box(.06,.018,.002,M.steelDark,g,[.13,.042,.0185],null,.0005);// ejection port
   box(.06,.008,.02,M.steelDark,g,[.12,.002,0],null,.001);// loading port
   box(.16,.004,.012,M.steelDark,g,[.12,.07,0],null,.0008);// top rib
   for(let i=0;i<4;i++)cyl(.0026,.0026,.038,M.bright,g,[.04+i*.045,.035,0],[Math.PI/2,0,0],12);
   // Barrel, vent rib, bead, magazine tube, cap
   barrel(.0118,.5,M.steel,g,.2,.046);barrel(.0135,.03,M.steel,g,.19,.046);
   box(.48,.0045,.009,M.steelDark,g,[.45,.0605,0],null,.0006);
   for(let i=0;i<12;i++)box(.004,.006,.005,M.steelDark,g,[.23+i*.04,.0575,0],null,0);
   mesh(new T.SphereGeometry(.0032,14,10),M.brass,g,[.692,.066,0]);
   barrel(.0108,.42,M.steel,g,.2,.014);barrel(.0122,.024,M.steel,g,.62,.014);
   cyl(.006,.006,.04,M.steel,g,[.66,.03,0],[0,0,0],12);// barrel band
   // Fore-end (wood, ribbed) on action bars
   p.fore=new T.Group();g.add(p.fore);
   const pts=[];const L=.2;for(let i=0;i<=40;i++){const x=i/40*L;const rib=(x>.02&&x<.18)?(Math.sin(x*190)>.2?.0028:0):0;const r=.024+rib-Math.abs(x-L/2)*.02*0;pts.push(new T.Vector2(i===0||i===40?.0115:r,x));}
   const fe=mesh(new T.LatheGeometry(pts,40),M.walnut,p.fore,[.28,.018,0],[0,0,-Math.PI/2]);fe.scale.set(1,1,.92);
   cyl(.0026,.0026,.11,M.bright,p.fore,[.24,.012,.012],[0,0,Math.PI/2],10);cyl(.0026,.0026,.11,M.bright,p.fore,[.24,.012,-.012],[0,0,Math.PI/2],10);
   // Trigger group, guard, safety
   mesh(extrude(shape([[.02,0],[.15,0],[.15,-.014],[.02,-.014]]),.03,.002),M.steelDark,g);
   tube([[.06,-.012],[.064,-.04],[.09,-.05],[.13,-.045],[.14,-.016]],.0042,M.steelDark,g);
   p.trigger=mesh(extrude(shape([[0,0],[.005,0],[.008,-.016],[.004,-.028],[0,-.03],[.002,-.016]]),.007,.0012),M.bright,g,[.092,-.012,0]);
   cyl(.0045,.0045,.04,M.brass,g,[.04,.062,0],[Math.PI/2,0,0],12);
   // Stock: wrist + comb + butt + recoil pad
   const stock=mesh(extrude(shape([[.004,.058],[-.06,.054],[-.17,.042],[-.33,.032],[-.37,.034],[-.372,-.098],[-.33,-.098],[-.2,-.04],[-.11,-.06],[-.07,-.07],[-.05,-.064],[-.04,-.03],[.004,-.004]]),.04,.006,5),M.walnut,g);
   stock.geometry.computeBoundingBox();remapUV(stock.geometry);M.walnut.map.repeat.set(1,1);
   box(.022,.135,.044,M.rubber,g,[-.383,-.032,0],[0,0,.05],.004);
   p.muzzle=new T.Object3D();p.muzzle.position.set(.705,.046,0);g.add(p.muzzle);
   p.ejector=new T.Object3D();p.ejector.position.set(.13,.044,.02);g.add(p.ejector);
   p.sight=new T.Object3D();p.sight.position.set(.4,.069,0);g.add(p.sight);
   p.port=new T.Object3D();p.port.position.set(.12,-.006,0);g.add(p.port);
   p.shell=buildShellMesh(true);p.shell.visible=false;g.add(p.shell);
   return {group:g,parts:p};
  }

  function buildShellMesh(shotgun){
   const s=new T.Group();
   if(shotgun){cyl(.0104,.0104,.052,M.hull,s,[0,.013,0],null,18);cyl(.0108,.0108,.018,M.brass,s,[0,-.021,0],null,18);cyl(.0112,.0112,.0016,M.brass,s,[0,-.03,0],null,18);}
   else{cyl(.0046,.0049,.0185,M.brass,s,null,null,14);cyl(.0052,.0052,.0014,M.brass,s,[0,-.0093,0],null,14);}
   s.rotation.z=Math.PI/2;const w=new T.Group();w.add(s);return w;
  }

  function buildAxe(){
   const g=new T.Group(),p={};
   // Handle: curved hickory profile, model +X up the handle, head at the far end.
   const handlePts=[];const L=.72;
   for(let i=0;i<=24;i++){const t=i/24,x=t*L,c=Math.sin(t*Math.PI*1.6)*.012,w=lerp(.017,.013,smooth(t*1.4))+(t<.08?.004*(1-t/.08):0)+(t>.86?.002:0);handlePts.push([x,c+w]);}
   for(let i=24;i>=0;i--){const t=i/24,x=t*L,c=Math.sin(t*Math.PI*1.6)*.012,w=lerp(.017,.013,smooth(t*1.4))+(t<.08?.004*(1-t/.08):0)+(t>.86?.002:0);handlePts.push([x,c-w]);}
   const hg=extrude(shape(handlePts),.022,.008,5);remapUV(hg);mesh(hg,M.hickory,g);
   // Head: tapered forged head, sharp polished bit facing +Y.
   const hp=[[-.03,-.03],[.03,-.03],[.034,.02],[.05,.06],[.074,.098],[.082,.112],[.07,.116],[-.06,.116],[-.072,.112],[-.064,.098],[-.042,.06],[-.034,.02]];
   const head=extrude(shape(hp),.032,.002,2);
   const pos=head.attributes.position;
   for(let i=0;i<pos.count;i++){const y=pos.getY(i),t=clamp((y+.03)/.146,0,1);pos.setZ(i,pos.getZ(i)*lerp(1,.07,Math.pow(t,1.35)));}
   head.computeVertexNormals();remapUV(head);
   const hm=mesh(head,M.axeHead,g,[L-.035,.005,0],[0,0,0]);hm.geometry.rotateZ(0);
   // Head: also flip uv so polished edge is at +Y
   const uv=head.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getY(i),uv.getX(i));uv.needsUpdate=true;
   box(.064,.03,.034,M.axeHead,g,[L-.035,-.012,0],null,.003);// poll
   box(.012,.032,.024,M.steelDark,g,[L-.035,.0,0],null,.002);// wedge
   // Grip wrap near the knob
   for(let i=0;i<14;i++)cyl(.0205,.0205,.0055,M.tape,g,[.04+i*.0058,.0005,0],[0,0,Math.PI/2],18);
   p.blade=new T.Object3D();p.blade.position.set(L-.035,.12,0);g.add(p.blade);
   return {group:g,parts:p};
  }

  function buildC4Block(){
   const g=new T.Group();
   const b=box(.17,.06,.04,M.c4,g,[0,0,0],null,.004);remapUV(b.geometry);
   box(.012,.064,.044,M.tape,g,[-.05,0,0],null,.002);box(.012,.064,.044,M.tape,g,[.05,0,0],null,.002);
   // Detonator: receiver box with LED and antenna, cap pushed into the block
   const det=new T.Group();det.position.set(.0,.038,0);g.add(det);
   box(.05,.016,.03,M.polymerSmooth,det,[0,0,0],null,.002);
   const led=mesh(new T.SphereGeometry(.0028,10,8),M.led.clone(),det,[.016,.0085,.008]);
   cyl(.0012,.0012,.07,M.steelDark,det,[-.02,.035,-.008],[0,0,.2],8);
   cyl(.0035,.0035,.012,M.bright,det,[.01,.009,-.006],null,10);
   tube([[-.016,.004,.012],[-.04,.0,.022],[-.075,-.012,.022],[-.085,-.025,.01]],.0016,M.wireRed,g,16);
   tube([[-.012,.004,.014],[-.032,-.002,.024],[-.07,-.018,.024],[-.082,-.03,.012]],.0016,M.wireBlk,g,16);
   cyl(.0034,.0034,.03,M.bright,g,[-.088,-.02,.0],[0,0,Math.PI/2],10);
   led.layers.enable(GLOW);g.userData.led=led;return g;
  }
  function buildC4(){
   const g=new T.Group(),p={};
   p.block=buildC4Block();g.add(p.block);
   p.remote=new T.Group();
   box(.04,.085,.022,M.polymerSmooth,p.remote,[0,0,0],null,.004);
   cyl(.0025,.0025,.09,M.steelDark,p.remote,[-.012,.085,0],null,8);mesh(new T.SphereGeometry(.004,10,8),M.steelDark,p.remote,[-.012,.13,0]);
   p.remoteLed=mesh(new T.SphereGeometry(.004,10,8),M.led.clone(),p.remote,[.01,.03,.012]);
   p.button=box(.02,.012,.012,M.hull,p.remote,[0,.0,.012],null,.002);
   p.muzzle=new T.Object3D();p.muzzle.position.set(.1,0,0);g.add(p.muzzle);
   p.sight=new T.Object3D();g.add(p.sight);
   return {group:g,parts:p};
  }

  /* ------------------------------------------------------------ viewmodel rigs (view space: -Z forward) */
  const RIG={
   pistol:{hip:[.13,-.155,-.36],hipRot:[0,.02,0],ads:.27,sprint:[.05,-.06,.02],sprintRot:[-.55,.55,.25],scale:1},
   pump:{hip:[.15,-.17,-.34],hipRot:[0,.035,0],ads:.2,sprint:[.03,-.08,.04],sprintRot:[-.35,.75,.35],scale:1},
   axe:{hip:[.2,-.36,-.4],hipRot:[.0,-.15,-.12],ads:0,sprint:[.02,-.06,.04],sprintRot:[-.25,.3,.2],scale:1},
   c4:{hip:[.14,-.11,-.4],hipRot:[.25,.45,-.2],ads:0,sprint:[0,-.08,.04],sprintRot:[-.3,.3,.2],scale:1}
  };
  function buildViewmodels(){
   const defs={pistol:buildPistol,pump:buildPump,axe:buildAxe,c4:buildC4};
   for(const id in defs){
    const built=defs[id](),holder=new T.Group(),model=built.group;
    holder.add(model);
    if(id==='axe'){model.rotation.set(0,Math.PI/2,0);model.rotateZ(1.25);model.position.set(-.05,0,.22);} // handle up and forward
    else if(id==='c4'){model.rotation.set(0,Math.PI/2,0);model.position.set(0,0,0);}
    else{model.rotation.y=Math.PI/2;model.position.set(0,-.1,.1);}
    holder.visible=false;viewScene.add(holder);
    const rig=RIG[id];
    let adsPos=null;
    if(rig.ads){holder.position.set(0,0,0);holder.rotation.set(0,0,0);holder.updateMatrixWorld(true);const s=built.parts.sight.getWorldPosition(new T.Vector3());adsPos=[-s.x,-s.y,-rig.ads-s.z];}
    models[id]={holder,model,parts:built.parts,rig,adsPos};
   }
   {const mk=()=>new T.Object3D();models.fists={holder:new T.Group(),model:new T.Group(),parts:{muzzle:mk(),sight:mk(),ejector:mk()},rig:RIG.axe,adsPos:null};}
   // Realistic-only guns: empty holders until combat-arms.js delivers the models.
   for(const id of ['smg','rifle','sniper']){const holder=new T.Group();holder.visible=false;viewScene.add(holder);const mk=()=>new T.Object3D();models[id]={holder,model:new T.Group(),parts:{muzzle:mk(),sight:mk(),ejector:mk()},rig:{hip:[.13,-.15,-.27],hipRot:[0,0,0],sprint:[0,-.08,0],sprintRot:[-.3,.6,.3],ads:0},adsPos:null,pending:true};holder.add(models[id].model);}
   if(models.c4){models.c4.parts.remote.position.set(-.3,-.17,-.36);models.c4.parts.remote.rotation.set(.25,.35,-.05);models.c4.parts.remote.visible=false;viewScene.add(models.c4.parts.remote);}
  }

  // Realistic models + IK arms (combat-arms.js). Procedural models above stay as the fallback.
  let armsRig=null;
  const GLB_RIG={
   pistol:{hip:[.1,-.11,-.27],hipRot:[0,0,0],sprint:[.04,-.07,.02],sprintRot:[-.5,.6,.2],ads:.27},
   pump:{hip:[.14,-.14,-.26],hipRot:[0,0,0],sprint:[.03,-.08,.04],sprintRot:[-.3,.7,.3],ads:.36},
   axe:{hip:[.17,-.14,-.36],hipRot:[-.25,.25,.3],sprint:[.02,-.06,.04],sprintRot:[-.25,.3,.2],ads:0},
   smg:{hip:[.14,-.16,-.33],hipRot:[0,0,0],sprint:[.03,-.08,.04],sprintRot:[-.35,.7,.3],ads:.27},
   rifle:{hip:[.13,-.15,-.26],hipRot:[0,0,0],sprint:[.03,-.08,.04],sprintRot:[-.3,.7,.3],ads:.3},
   sniper:{hip:[.13,-.15,-.26],hipRot:[0,0,0],sprint:[.03,-.08,.04],sprintRot:[-.3,.7,.3],ads:.1}
  };
  // Put one realistic model (class base or a variant) in a class's holder and rebuild its parts and aim point.
  const baseGuns={},variants={},baseGrips={};
  function wireGun(id,w){
   const m=models[id];if(!w||!m)return;
   if(m.glbModel&&m.glbModel!==w.model)m.holder.remove(m.glbModel);
   m.model.visible=false;m.holder.add(w.model);m.glbModel=w.model;m.pending=false;
   const old=m.parts;m.parts={...w.parts,glb:true,shell:old.shell,trigger:null,mag:null};
   if(id==='pistol'){let mag=w.model.userData.mag;if(!mag){mag=new T.Group();box(.018,.095,.03,M.steelDark,mag,[0,-.004,0],null,.002);box(.022,.008,.036,M.steelDark,mag,[0,-.052,.002],null,.002);
    mag.rotation.x=-.25;mag.position.set(0,-.012,.03);mag.visible=false;w.model.add(mag);w.model.userData.mag=mag;}
    m.parts.mag=mag;m.parts.magHome=new T.Vector3(0,-.012,.03);m.parts.magAxis=new T.Vector3(0,-1,0).applyEuler(mag.rotation).normalize();}
   if(old.shell){w.model.add(old.shell);old.shell.visible=false;}
   m.rig={...m.rig,...GLB_RIG[id]};
   if(m.rig.ads){const h=m.holder,pp=h.position.clone(),pr=h.rotation.clone();h.position.set(0,0,0);h.rotation.set(0,0,0);h.updateMatrixWorld(true);const sp=m.parts.sight.getWorldPosition(new T.Vector3());m.adsPos=[-sp.x,-sp.y,-m.rig.ads-sp.z];h.position.copy(pp);h.rotation.copy(pr);}
  }
  // Carry a variant (or the class base with vid null): stats now, model once it has loaded.
  function applyVariant(id,vid){
   const W=WEAPONS.find(x=>x.id===id),v=variantOfSpec(id,vid),b=BASE_STATS[id];if(!W||!b)return;
   variants[id]=v?v.id:null;
   for(const k of VARIANT_STATS){if(b[k]===undefined)delete W[k];else W[k]=b[k];}
   if(v)Object.assign(W,v.stats||{},{name:v.name,kind:v.kind});
   hud?.update();
   if(id==='c4'){heldThrowable(v);return;}
   const R=armsRig;if(!R||!baseGuns[id])return;
   const G=R.grips[id];if(G){baseGrips[id]=baseGrips[id]||G.left;G.left=v?.left&&G.left?{...baseGrips[id],pos:v.left}:baseGrips[id];}
   if(!v){wireGun(id,baseGuns[id]);return;}
   R.loadVariant(id,v).then(gun=>{if(variants[id]===v.id)wireGun(id,gun);requestFrame();}).catch(e=>{console.warn('Variant model unavailable',v.file,e);});
  }
  // Grenade models (variants of the C4 slot), centred on the hand's hold point; one copy in the hand, clones thrown.
  const throwableModels={};
  function throwableModel(v){
   return throwableModels[v.file]||(throwableModels[v.file]=window.showroomAssets.model('/models/combat/variants/'+v.file).then(gltf=>{
    const g=new T.Group(),s=gltf.scene;s.traverse(x=>{if(x.isMesh){x.castShadow=false;x.frustumCulled=false;x.userData.noHit=true;}});
    const box=new T.Box3().setFromObject(s),c=box.getCenter(new T.Vector3());s.position.sub(c);g.add(s);g.userData.size=box.getSize(new T.Vector3());return g;}));
  }
  function heldThrowable(v){
   const m=models.c4;if(!m)return;
   if(m.held){m.holder.remove(m.held);m.held=null;}
   m.model.visible=!v;if(!v||!window.showroomAssets)return;
   throwableModel(v).then(g=>{if(variants.c4!==v.id)return;const h=g.clone();h.position.set(.035,-.03,-.02);h.rotation.set(-.3,.2,.4);m.holder.add(h);m.held=h;m.model.visible=false;requestFrame();}).catch(e=>console.warn('Grenade model unavailable',v.file,e));
  }
  function upgradeModels(){
   const R=armsRig;if(!R)return;
   if(R.arms){viewScene.add(R.arms.group);R.arms.group.visible=armed;}
   for(const id of ['pistol','pump','axe','smg','rifle','sniper']){
    const w=R.weapons[id],m=models[id];if(!w||!m)continue;
    baseGuns[id]=w;wireGun(id,variants[id]?null:w);
    if(variants[id])applyVariant(id,variants[id]);
   }
  }
  function poseArms(w,s,m){
   const A=armsRig?.arms;if(!A)return;
   const usable=(m.parts.glb||w.id==='c4')&&!scoped;A.group.visible=usable&&equipBlend>.02;if(!usable)return;
   const opt={};
   if(w.id==='pump')opt.leftSpace=m.parts.fore;
   const a=s.action;
   if(a?.leftAway!=null){opt.leftAway=a.leftAway;opt.leftOffset=a.leftOffset;}
   if(a?.rightAway!=null){opt.rightAway=a.rightAway;opt.rightOffset=a.rightOffset;}
   if(a?.leftGrip){opt.leftGrip=a.leftGrip;opt.leftSpace=a.leftSpace;}
   const G=armsRig.grips[w.id]||{};
   const bend=(curl,add,idx=0)=>curl.map((c,i)=>i!==idx?c:Array.isArray(c)?c.map(v=>v+add):c+add);
   // Trigger finger: squeeze on each shot.
   if(w.ammo&&w.id!=='c4'&&G.right&&!a?.rightAway){const since=lastTime-s.lastFire;if(since<.09)opt.rightGrip={...G.right,curl:bend(G.right.curl,28*(1-since/.09))};}
   // Thumb on the slide release.
   if(a?.thumb&&G.right)opt.rightGrip={...G.right,thumbCurl:G.right.thumbCurl.map(v=>v+35)};
   if(w.id==='c4'){const r=m.parts.remote;if(r.visible){opt.leftSpace=r;const press=lastTime-(state.c4press||-9);opt.leftGrip=press<.18?{...G.remote,thumbCurl:G.remote.thumbCurl.map(v=>v+40)}:G.remote;}}
   armsRig.pose(w.id,m.holder,opt);
  }

  /* ------------------------------------------------------------ world: range, effects */
  let hitListAt=-1e9,hitWorld=null;const hitList=[];
  function worldHits(origin,dir,far){
   const now=performance.now(),worldName=window.breakThyRuleShowroom?.worlds()?.world();
   if(now-hitListAt>300||hitWorld!==worldName){hitListAt=now;hitWorld=worldName;hitList.length=0;scene.traverseVisible(ob=>{
    if(!ob.isMesh||ob.isSkinnedMesh||ob===o.sky||ob.userData.noHit)return;
    for(let v=ob.parent;v;v=v.parent)if(v===fxGroup||v.userData.noHit)return;
    const mat=Array.isArray(ob.material)?ob.material[0]:ob.material;
    if(!mat||!mat.visible||mat.transparent&&mat.opacity<.25||ob.isInstancedMesh&&mat.alphaTest>.1)return;
    if(!ob.geometry.boundingSphere)ob.geometry.computeBoundingSphere();if(ob.geometry.boundingSphere?.radius>90)return;hitList.push(ob);
   });}
   raycaster.set(origin,dir);raycaster.near=.02;raycaster.far=far;return sceneryQuery.hit(raycaster,hitList);
  }
  // Ground height: a downward ray against static scenery only (no animated characters, instanced foliage or effects),
  // gathered every few seconds, with results cached per 25 cm cell. Ray-testing skinned characters vertex by vertex
  // was the main cause of hitches when bots spread over Beyond Eden.
  let groundList=null,groundListAt=-1e9;const groundCache=new Map(),groundDown=new T.Vector3(0,-1,0),groundFrom=new T.Vector3();
  function groundMeshes(){
   const now=performance.now();if(groundList&&now-groundListAt<3000)return groundList;groundListAt=now;groundCache.clear();groundList=[];
   scene.traverseVisible(ob=>{if(!ob.isMesh||ob.isSkinnedMesh||ob.isInstancedMesh||ob===o.sky||ob.userData.noHit)return;const g=ob.geometry;if(!g?.attributes?.position)return;
    for(let v=ob.parent;v;v=v.parent)if(v===fxGroup||v.userData.noHit||v.userData.characterStyle)return;
    if(ob.material&&(ob.material.visible===false||(ob.material.transparent&&ob.material.opacity<.25)))return;
    if(!g.boundingSphere)g.computeBoundingSphere();if(!(g.boundingSphere?.radius<=90))return;if(!g.boundingBox)g.computeBoundingBox();groundList.push(ob);});
   return groundList;
  }
  function groundAt(x,z,from=12){
   const supported=o.groundAt?.(x,z,from);if(Number.isFinite(supported))return supported;
   const list=groundMeshes(),key=Math.round(x*4)+':'+Math.round(z*4)+':'+Math.round(from*2);let y=groundCache.get(key);if(y!==undefined)return y;
   raycaster.set(groundFrom.set(x,from,z),groundDown);raycaster.near=.02;raycaster.far=40;const hit=raycaster.intersectObjects(list,false)[0];
   y=hit?hit.point.y:0;if(groundCache.size>20000)groundCache.clear();groundCache.set(key,y);return y;
  }
  let touchAway=-1e9;function awayFrom(dx){if(!assist.target||Math.abs(dx)<=2)return;lensPosition(asEye);asTo.copy(assist.point).sub(asEye);let off=Math.atan2(asTo.x,-asTo.z)-yaw;off=Math.atan2(Math.sin(off),Math.cos(off));if(Math.sign(dx)!==Math.sign(off))touchAway=lastTime;}
  let wallPull=0,wallTarget=0,wallAt=-1e9;const wallEye=new T.Vector3(),wallDir=new T.Vector3();
  function updateWallPull(dt){if(lastTime-wallAt>.06){wallAt=lastTime;lensPosition(wallEye);camera.getWorldDirection(wallDir);raycaster.set(wallEye,wallDir);raycaster.near=.02;raycaster.far=.85;const hit=sceneryQuery.hit(raycaster,groundMeshes());wallTarget=hit?clamp((.85-hit.distance)/.65,0,1):0;}wallPull+=(wallTarget-wallPull)*(1-Math.exp(-dt*20));}
  function targetOf(object){let v=object;while(v){if(v.userData.target)return v.userData.target;v=v.parent;}return null;}

  let rangeOn=false,rangeRoot=null;
  // The range lives in its own group, shown only while the player is at the range (never in a battle). It stands on the
  // brick road beyond the sky box's hidden door (z -21.5), so everything sits 12 m further out than it first did.
  function buildRange(){
   const roadX=11.7,DZ=-12;rangeRoot=new T.Group();rangeRoot.name='Firing range targets';rangeRoot.visible=rangeOn;world.add(rangeRoot);
   const add=(t)=>{targets.push(t);return t;};
   const plate=(x,z,kind)=>{
    z+=DZ;const y=groundAt(x,z),stand=new T.Group();stand.position.set(x,y,z);rangeRoot.add(stand);
    const H=kind==='gong'?1.9:1.75;
    for(const s of [-1,1]){cyl(.022,.026,H,M.frameSteel,stand,[s*.42,H/2,0],null,12);mesh(new T.CylinderGeometry(.05,.07,.06,12),M.frameSteel,stand,[s*.42,.03,0]);}
    cyl(.02,.02,.9,M.frameSteel,stand,[0,H,0],[0,0,Math.PI/2],12);
    const pivot=new T.Group();pivot.position.set(0,H,0);stand.add(pivot);
    for(const s of [-1,1])cyl(.004,.004,.18,M.bright,pivot,[s*.08,-.09,0],null,6);
    let geo;
    if(kind==='gong')geo=extrude(new T.Shape().absarc(0,0,.3,0,TAU),.014,.002,2);
    else{const s=new T.Shape();s.moveTo(-.2,-.62);s.lineTo(.2,-.62);s.lineTo(.2,-.2);s.quadraticCurveTo(.2,-.12,.1,-.12);s.lineTo(.08,-.08);s.absarc(0,.0,.1,-.9,Math.PI+.9,false);s.lineTo(-.1,-.12);s.quadraticCurveTo(-.2,-.12,-.2,-.2);s.closePath();geo=extrude(s,.014,.002,2);}
    remapUV(geo);
    const face=mesh(geo,M.paint,pivot,[0,kind==='gong'?-.48:-.26,0]);
    const t=add({kind:'plate',root:stand,pivot,face,swing:new Spring(26,1.6),twist:new Spring(30,2.2),down:0,downT:0,radius:.5});
    stand.userData.target=t;return t;
   };
   const post=(x,z)=>{
    z+=DZ;const y=groundAt(x,z),r=new T.Group();r.position.set(x,y,z);rangeRoot.add(r);
    const pivot=new T.Group();r.add(pivot);
    const log=cyl(.13,.15,1.55,M.post,pivot,[0,.775,0],null,22);log.material=M.post;
    cyl(.135,.135,.012,M.putty,pivot,[0,1.552,0],null,22);
    const t=add({kind:'post',root:r,pivot,face:log,swing:new Spring(60,6),twist:new Spring(60,6),down:0,downT:0,radius:.35});r.userData.target=t;return t;
   };
   plate(roadX-.75,-22,'plate');plate(roadX+.75,-22,'plate');plate(roadX,-30,'plate');plate(roadX-1,-40,'plate');plate(roadX+1,-40,'gong');plate(roadX,-55,'gong');
   post(roadX-2.4,-14.5);post(roadX+2.4,-14.5);post(roadX-1.6,-17.6);
   renderer.shadowMap.needsUpdate=true;
  }

  function spriteMat(map,additive){return new T.SpriteMaterial({map,transparent:true,depthWrite:false,blending:additive?T.AdditiveBlending:T.NormalBlending,fog:false});}
  let poolsReady=false,decalCursor=0;const effectZero=new T.Vector3(),effectNormal=new T.Vector3(),effectLook=new T.Vector3(),effectUp=new T.Vector3(0,1,0),effectDir=new T.Vector3();
  function spawn(opts){
   let p=particles.find(q=>!q.alive&&q.additive===!!opts.additive&&q.map===opts.map);
   if(!p){if(poolsReady||particles.length>=400)return null;const s=new T.Sprite(spriteMat(opts.map,opts.additive));s.userData.noHit=true;if(opts.additive)s.layers.enable(GLOW);fxGroup.add(s);p={sprite:s,additive:!!opts.additive,map:opts.map,vel:new T.Vector3(),c0:new T.Color(),c1:new T.Color()};particles.push(p);}
   p.alive=true;p.t=0;p.life=opts.life;p.s0=opts.size[0];p.s1=opts.size[1];p.a0=opts.alpha??1;p.gravity=opts.gravity??0;p.drag=opts.drag??1.5;p.c0.set(opts.color??0xffffff);p.c1.set(opts.color1??opts.color??0xffffff);p.spin=opts.spin??rand(-1,1);p.fadeIn=opts.fadeIn??0;
   p.sprite.position.copy(opts.pos);p.vel.copy(opts.vel||effectZero);p.sprite.material.rotation=Math.random()*TAU;p.sprite.visible=true;p.sprite.renderOrder=opts.additive?3:2;return p;
  }
  function warmEffectPools(){
   if(poolsReady)return;
   for(const [map,additive,count]of [[tx.soft,false,120],[tx.puff,false,128],[tx.soft,true,128],[tx.flash,true,24]])for(let i=0;i<count;i++)spawn({map,additive,pos:effectZero,life:1,size:[.1,.1]});
   for(const p of particles){p.alive=false;p.sprite.visible=false;}
   buildChips();
   for(let i=0;i<32;i++)tracer(effectZero,effectUp,false);for(const t of tracers){t.alive=false;t.mesh.visible=false;}
   const plane=new T.PlaneGeometry(1,1);
   for(let i=0;i<90;i++){const d=new T.Mesh(plane,new T.MeshStandardMaterial({map:tx.hole,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.9,envMap:env}));d.userData.noHit=true;d.visible=false;world.add(d);decals.push(d);}
   for(const [kind,count]of [['pistol',40],['pump',16],['mag',8]])for(let i=0;i<count;i++){let mesh;if(kind==='mag'){mesh=new T.Group();const mag=models.pistol.parts.mag;for(const ch of mag.children)mesh.add(ch.clone());}else mesh=buildShellMesh(kind==='pump');mesh.traverse(o=>o.userData.noHit=true);mesh.visible=false;world.add(mesh);shells.push({kind,mesh,vel:new T.Vector3(),spin:new T.Vector3(),age:99,bounces:4});}
   for(const [name,count,glow]of [['explosion01',3,true],['explosion02',3,true],['cloud',54,false],['wisp',96,false]])for(let i=0;i<count;i++)spawnFlip(name,{pos:effectZero,size:[.1,.1],life:1,glow});
   for(const f of flips){f.alive=false;f.mesh.visible=false;}poolsReady=true;
  }
  function updateParticles(dt){
   updateChips(dt);
   for(const p of particles){if(!p.alive)continue;p.t+=dt;const k=p.t/p.life;if(k>=1){p.alive=false;p.sprite.visible=false;continue;}
    p.vel.y-=p.gravity*dt;p.vel.multiplyScalar(Math.exp(-p.drag*dt));p.sprite.position.addScaledVector(p.vel,dt);
    const s=lerp(p.s0,p.s1,easeOut(k));p.sprite.scale.set(s,s,s);p.sprite.material.rotation+=p.spin*dt;
    const fade=p.fadeIn?Math.min(1,k/p.fadeIn):1;p.sprite.material.opacity=p.a0*fade*(1-k)**1.5;p.sprite.material.color.copy(p.c0).lerp(p.c1,k);}
  }

  function decal(hit,map,size,life=40){
   const n=hit.face?effectNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld):effectNormal.set(0,1,0);
   const d=decals[decalCursor++%decals.length];if(!d)return;
   d.material.map=map;d.material.opacity=1;d.visible=true;
   world.attach(d);d.position.copy(hit.point).addScaledVector(n,.003);d.lookAt(effectLook.copy(d.position).add(n));d.rotateZ(Math.random()*TAU);d.scale.set(size,size,size);
   d.userData.life=life;d.userData.born=lastTime;
   if(!hit.object.isInstancedMesh&&!hit.object.isSkinnedMesh)hit.object.attach(d);
  }

  // Chips: small solid pieces knocked off what was hit, thrown, bounced and left for a moment. One draw call.
  let chips=null;const chipList=[],chipM=new T.Matrix4(),chipQ=new T.Quaternion(),chipE=new T.Euler(),chipS=new T.Vector3(),chipC=new T.Color();
  function buildChips(){
   const n=mobile?32:96,g=new T.TetrahedronGeometry(1,0);chips=new T.InstancedMesh(g,new T.MeshStandardMaterial({roughness:.95,flatShading:true}),n);chips.name='Impact chips';chips.frustumCulled=false;chips.userData.noHit=true;chips.raycast=()=>{};chips.castShadow=false;chips.receiveShadow=true;
   for(let i=0;i<n;i++){chips.setMatrixAt(i,chipM.makeScale(0,0,0));chips.setColorAt(i,chipC.set(0xffffff));chipList.push({alive:false,p:new T.Vector3(),v:new T.Vector3(),r:new T.Vector3(),w:new T.Vector3(),s:new T.Vector3()});}
   world.add(chips);
  }
  let chipNext=0;
  function chip(pos,vel,color,size,{flat=1,float=0,life=2.6}={}){
   if(!chips)return;const i=chipNext++%chipList.length,c=chipList[i];c.alive=true;c.t=0;c.life=life;c.float=float;c.p.copy(pos);c.v.copy(vel);c.r.set(rand(0,TAU),rand(0,TAU),rand(0,TAU));c.w.set(rand(-22,22),rand(-22,22),rand(-22,22));c.s.set(size*rand(.6,1.3),size*flat*rand(.6,1.2),size*rand(.6,1.3));c.floor=null;c.still=false;
   chips.setColorAt(i,chipC.copy(color).multiplyScalar(rand(.7,1.15)));chips.instanceColor.needsUpdate=true;
  }
  function updateChips(dt){
   if(!chips)return;let any=false;
   for(let i=0;i<chipList.length;i++){const c=chipList[i];if(!c.alive)continue;any=true;c.t+=dt;
    if(c.t>=c.life){c.alive=false;chips.setMatrixAt(i,chipM.makeScale(0,0,0));continue;}
    if(c.float){c.v.y+=(-.7-c.v.y)*(1-Math.exp(-4*dt));c.v.x*=Math.exp(-2*dt);c.v.z*=Math.exp(-2*dt);}else c.v.y-=9.81*dt;
    if(!c.still){c.p.addScaledVector(c.v,dt);c.r.addScaledVector(c.w,dt*(c.float?.3:1));}
    if(!c.still&&(c.floor===null||c.p.y<c.floor+.1))c.floor=groundAt(c.p.x,c.p.z,c.p.y+.3);
    if(c.p.y<c.floor+c.s.y*.5){c.p.y=c.floor+c.s.y*.5;c.v.y=Math.abs(c.v.y)>.5&&!c.float?-c.v.y*.28:0;c.v.x*=.5;c.v.z*=.5;c.w.multiplyScalar(.35);if(c.v.y===0&&c.v.lengthSq()<.004)c.still=true;}
    const end=Math.min(1,(c.life-c.t)/.35);chips.setMatrixAt(i,chipM.compose(c.p,chipQ.setFromEuler(chipE.set(c.r.x,c.r.y,c.r.z)),chipS.copy(c.s).multiplyScalar(end)));}
   if(any)chips.instanceMatrix.needsUpdate=true;
  }
  // What a bullet met, for the footage look: the ground's own kind where it is ground, else what the thing is called or made of.
  function kindOf(hit,n,mat){
   const name=(hit.object.name||'')+' '+(mat?.name||'')+' '+(hit.object.parent?.name||'');
   if(/sandbag|terracotta|\bpots?\b|amphora|planter/i.test(name))return 'clay';
   if(/leaf|leaves|foliage|flower|fern|grass|shrub|hedge|\bivy|\bplants?\b/i.test(name))return 'leaf';
   if(/glass|window/i.test(name))return 'glass';
   if(/wood|crate|timber|plank|bark|cart|barrel-wood|signpost|barricade|bench|door/i.test(name))return 'wood';
   if(/\biron\b|steel|bronze|metal|barrel|hydrant|\blamp|\bgate\b|portcullis|chandelier|anvil|container|drum/i.test(name)||mat?.metalness>.5)return 'metal';
   if(n.y>.7&&hit.point.y<.12&&hit.point.z<-20){const g=root.edenMatrix?.ground?.(hit.point.x,hit.point.z);if(g?.wet)return 'water';if(g?.type==='earth')return 'earth';if(g?.type==='asphalt')return 'asphalt';}
   const c=mat?.color;return c&&c.r-c.b>.12?'plaster':'stone';
  }
  const STUFF={stone:[0x6f6b64,0xb3ada2,.016],asphalt:[0x2b2b2c,0x6a6865,.014],plaster:[0x8c7a62,0xc9b79c,.02],clay:[0x8a4a30,0xa8785c,.018],earth:[0x2e2419,0x4f4233,.022],wood:[0x8a6238,0xa58a64,.022],leaf:[0x2c3417,0x3f4a22,.026],glass:[0x9fb4ba,0xb8c4c8,.012],metal:[0x3a3a3c,0x77777a,.008],water:[0x8f9aa3,0xa9b4bc,.01]};
  const iN=new T.Vector3(),iR=new T.Vector3(),iV=new T.Vector3(),iP=new T.Vector3(),iCol=new T.Color(),iDust=new T.Color();
  function realImpact(hit,dir,power,n,mat,kind){
   const [solid,dusty,size]=STUFF[kind],k=Math.min(2,power),few=mobile?.5:1,count=v=>Math.max(1,Math.round(v*few));
   iCol.set(solid);iDust.set(dusty);if(mat?.color&&['stone','plaster','clay'].includes(kind)&&!mat.map){iCol.lerp(mat.color,.5);iDust.lerp(mat.color,.35);}
   // Out along the face, leaning to where the round would have gone on.
   iN.copy(n);iR.copy(dir).reflect(n).lerp(n,.45).normalize();iP.copy(hit.point).addScaledVector(n,.015);
   const spray=(lo,hi,wide)=>iV.copy(iR).multiplyScalar(rand(lo,hi)).add(effectLook.set(rand(-wide,wide),rand(-wide*.4,wide),rand(-wide,wide)));
   if(kind==='water'){for(let i=0;i<count(10*k);i++)spawn({map:tx.soft,pos:iP,vel:spray(.4,1.4,.7).setY(rand(1.2,3.4)),life:rand(.25,.55),size:[.02,.012],alpha:.5,color:iDust,gravity:9.8,drag:.3});spawn({map:tx.puff,pos:iP,vel:iV.set(0,.5,0),life:.5,size:[.06,.3],alpha:.22,color:iDust,drag:2});}
   else if(kind==='metal'){for(let i=0;i<count(9*k);i++)spawn({map:tx.soft,additive:true,pos:iP,vel:spray(2,6,2),life:rand(.1,.32),size:[.022,.004],color:0xffdfa0,color1:0xff5a10,gravity:9,drag:.8});spawn({map:tx.puff,pos:iP,vel:iV.copy(iR).multiplyScalar(.4),life:.7,size:[.03,.2],alpha:.2,color:iDust,drag:2});}
   else{
    const dust={earth:.8,plaster:1.2,stone:1,asphalt:.8,clay:1.1,wood:.45,leaf:.1,glass:.15}[kind]??1;
    // A fast jet, then the cloud it leaves hanging, then grit falling back down the face.
    for(let i=0;i<count(4*k*dust);i++)spawn({map:tx.puff,pos:iP,vel:spray(1.2,3.4,.5),life:rand(.25,.5),size:[.03,.26],alpha:.5*Math.min(1,dust),color:iDust,gravity:.2,drag:5});
    for(let i=0;i<count(3*k*dust);i++)spawn({map:tx.puff,pos:iP,vel:spray(.15,.6,.18),life:rand(1.4,2.6),size:[.10,.62],alpha:.22*Math.min(1,dust),color:iDust,gravity:.04,drag:1.6,fadeIn:.1});
    if(n.y<.5&&dust>.6)for(let i=0;i<count(3);i++)spawn({map:tx.soft,pos:iP,vel:iV.set(rand(-.15,.15),rand(-.2,.1),rand(-.15,.15)).addScaledVector(n,.2),life:rand(.5,.9),size:[.012,.02],alpha:.5,color:iDust,gravity:5,drag:.6});
    if(['stone','asphalt'].includes(kind)&&Math.random()<.35*k)for(let i=0;i<count(3);i++)spawn({map:tx.soft,additive:true,pos:iP,vel:spray(2,5,1.5),life:rand(.05,.14),size:[.014,.004],color:0xffe0a0,color1:0xff6a18,gravity:10,drag:.5});
    const n2={leaf:5,wood:6,glass:8,earth:6}[kind]||5;
    for(let i=0;i<count(n2*k);i++)chip(iP,spray(kind==='leaf'?.2:.8,kind==='leaf'?1:3.2,kind==='leaf'?.6:1.1),iCol,size*rand(.4,1.1),kind==='leaf'?{flat:.06,float:1,life:rand(1.6,3)}:kind==='wood'?{flat:.22,life:rand(1.6,3)}:kind==='glass'?{flat:.15}:{life:rand(1.8,3.4)});
   }
   if(hit.object.isMesh&&!hit.object.isInstancedMesh&&!['water','leaf'].includes(kind))decal(hit,kind==='metal'?tx.splat:tx.hole,{wood:.032,metal:.045,earth:.06,plaster:.06,clay:.05}[kind]||.042);
   if(kind==='metal')sfx.ding(hit.point,power);else if(kind==='wood'||kind==='leaf')sfx.wood(hit.point,power*(kind==='leaf'?.35:1));else sfx.dirt(hit.point,!['earth','water'].includes(kind));
  }
  function impact(hit,dir,power=1,isTrue=false){
   const t=targetOf(hit.object);
   const n=hit.face?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):dir.clone().negate();
   const mat=Array.isArray(hit.object.material)?hit.object.material[0]:hit.object.material;
   const metal=t?.kind==='plate'||(mat?.metalness>.5);
   const wood=t?.kind==='post'||mat===M.post||/wood|crate|timber|plank|bark/i.test(hit.object.name+' '+mat?.name);
   const col=mat?.color?mat.color.clone():new T.Color(0x8a7a60);
   if(!t&&real())realImpact(hit,dir,power,n,mat,kindOf(hit,n,mat));
   else if(metal){
    for(let i=0;i<(isTrue?18:9);i++)spawn({map:tx.soft,additive:true,pos:hit.point,vel:n.clone().multiplyScalar(rand(1,4)).add(new T.Vector3(rand(-3,3),rand(-1,4),rand(-3,3))),life:rand(.15,.4),size:[.03,.008],color:0xffd08a,color1:0xff5a10,gravity:9,drag:.6});
    spawn({map:tx.soft,additive:true,pos:hit.point,life:.08,size:[.18,.3],color:0xfff0c0});
    decal(hit,tx.splat,isTrue?.07:.05);sfx.ding(hit.point,power);
   }else if(wood){
    for(let i=0;i<10*power;i++)spawn({map:tx.soft,pos:hit.point,vel:n.clone().multiplyScalar(rand(1,3)).add(new T.Vector3(rand(-1.5,1.5),rand(0,2.5),rand(-1.5,1.5))),life:rand(.4,.9),size:[.025,.015],color:0xd8b483,gravity:9.8,drag:.4,spin:rand(-12,12)});
    spawn({map:tx.puff,pos:hit.point,vel:n.clone().multiplyScalar(.4),life:.8,size:[.08,.35],alpha:.35,color:0xcfb894});
    decal(hit,tx.hole,.035);sfx.wood(hit.point,power);
   }else{
    const dust=col.clone().lerp(new T.Color(0xb8aa8a),.5);
    for(let i=0;i<6;i++)spawn({map:tx.puff,pos:hit.point,vel:n.clone().multiplyScalar(rand(.4,1.6)).add(new T.Vector3(rand(-.4,.4),rand(.2,1.2),rand(-.4,.4))),life:rand(.6,1.2),size:[.06,.42],alpha:.55,color:dust,gravity:-.1,drag:2.2});
    for(let i=0;i<6;i++)spawn({map:tx.soft,pos:hit.point,vel:n.clone().multiplyScalar(rand(1,3)).add(new T.Vector3(rand(-1,1),rand(.5,2.5),rand(-1,1))),life:rand(.3,.6),size:[.02,.012],color:col.clone().multiplyScalar(.6),gravity:9.8,drag:.3});
    // Hard surfaces spark and scorch: a few hot streaks off the face and a sooty ring around the hole.
    const hard=!/grass|leaf|foliage|flower/i.test(hit.object.name||'')&&(mat?.roughness??1)<.97;
    if(hard){for(let i=0;i<4+Math.round(3*power);i++)spawn({map:tx.soft,additive:true,pos:hit.point,vel:n.clone().multiplyScalar(rand(2,5)).add(new T.Vector3(rand(-2.5,2.5),rand(-.5,3),rand(-2.5,2.5))),life:rand(.08,.22),size:[.022,.005],color:0xffe0a0,color1:0xff6a18,gravity:12,drag:.5});
     spawn({map:tx.soft,additive:true,pos:hit.point,life:.05,size:[.1,.18],color:0xffe6b8});}
    if(hit.object.isMesh&&!hit.object.isInstancedMesh){decal(hit,tx.hole,.04);if(hard)decal(hit,tx.scorch,.16,30);}
    sfx.dirt(hit.point,hard);
   }
   if(t){
    stats.hits++;if(isTrue)stats.trueShots++;
    const local=t.pivot.worldToLocal(hit.point.clone());
    t.swing.kick(-dir.z*power*(t.kind==='post'?1.2:5)*Math.sign(local.y||1)*-1);t.twist.kick(clamp(local.x,-.3,.3)*power*(t.kind==='post'?2:12));
    hud.hitmarker(isTrue);
   }
   return t;
  }

  function bloodPuff(p,dir){
   for(let i=0;i<5;i++)spawn({map:tx.puff,pos:p,vel:dir.clone().multiplyScalar(rand(.4,1.4)).add(new T.Vector3(rand(-.3,.3),rand(-.1,.4),rand(-.3,.3))),life:rand(.25,.5),size:[.05,.28],alpha:.7,color:0x6a0f0c,color1:0x3a0806,gravity:1.5,drag:3});
  }
  function tracer(from,to,gold){
   let tr=tracers.find(x=>!x.alive);
   if(!tr){if(poolsReady||tracers.length>=32)return;const m=new T.Mesh(new T.CylinderGeometry(1,1,1,6,1,true),new T.MeshBasicMaterial({color:0xffd9a0,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));m.userData.noHit=true;fxGroup.add(m);m.layers.enable(GLOW);tr={mesh:m};tracers.push(tr);}
   const d=effectDir.copy(to).sub(from),len=d.length();
   tr.alive=true;tr.t=0;tr.life=gold?.16:.07;tr.mesh.visible=true;tr.mesh.material.color.set(gold?0xffc24a:0xffe2b0);
   tr.mesh.position.copy(from).addScaledVector(d,.5);tr.mesh.quaternion.setFromUnitVectors(effectUp,d.normalize());tr.mesh.scale.set(gold?.006:.0035,len,gold?.006:.0035);
  }

  function ejectShell(kind){
   const m=models[current.id],port=m.parts.ejector.getWorldPosition(new T.Vector3());
   const pos=viewToWorld(port.clone());
   const type=kind==='pump'?'pump':'pistol';let s=null;for(const q of shells)if(q.kind===type){if(!s||q.age>s.age)s=q;if(!q.mesh.visible){s=q;break;}}
   s.kind=type;s.mesh.visible=true;s.mesh.position.copy(pos);
   const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion),back=new T.Vector3(0,0,1).applyQuaternion(camera.quaternion);
   s.vel.copy(right).multiplyScalar(rand(1.8,2.8)).addScaledVector(up,rand(1.6,2.6)).addScaledVector(back,rand(.1,.6));
   s.spin.set(rand(-20,20),rand(-30,30),rand(-20,20));s.ground=groundAt(pos.x,pos.z,pos.y+.3);s.bounces=0;s.age=0;s.real=real();s.rest=false;s.wall=null;
   // Brass to the calibre, carrying your own movement; the one wall it could reach on the way down is found once, now.
   s.mesh.scale.setScalar(s.real&&type==='pistol'?({rifle:1.55,sniper:2.1,smg:1.15}[current.id]||1):1);s.size=s.mesh.scale.x;
   if(s.real){s.vel.add(bodyVel);shellDir.copy(s.vel).setY(0);const reach=shellDir.length();if(reach>.3&&!mobile){shellDir.divideScalar(reach);const h=worldHits(pos,shellDir,2.2);if(h&&h.face&&!h.object.isInstancedMesh){s.wall=(s.wallN||=new T.Vector3()).copy(h.face.normal).transformDirection(h.object.matrixWorld).setY(0);s.wallAt=(s.wallP||=new T.Vector3()).copy(h.point);if(s.wall.lengthSq()<.2)s.wall=null;else s.wall.normalize();}}}
  }
  // Beyond Eden's footage look (app.js bodycam): everything here that is only for it asks this.
  const real=()=>!!root.bodycam?.active?.();
  // The post chain the body camera's look lives in (app.js window.edenPost): its barrel bend, weapon mask and hit jolt.
  const lensPost=()=>o.post||root.edenPost||null;
  const shellDir=new T.Vector3(),bodyVel=new T.Vector3(),flatQ=new T.Quaternion(),shellE=new T.Euler();
  // What a surface gives back: bounce, grip and how loudly brass rings on it.
  const GIVE={earth:[.10,.35,.12],brick:[.36,.6,1],paving:[.42,.66,1],stone:[.46,.7,1.1],concrete:[.4,.64,1],asphalt:[.34,.55,.8],wet:[.08,.4,.1]};
  function underfoot(x,z,y=0){if(y>.25)return 'stone';const g=root.edenMatrix?.ground?.(x,z);return !g?.type?'brick':g.wet?'wet':g.type;}
  function shellStep(s,dt){
   const p=s.mesh.position;s.vel.y-=9.81*dt;s.vel.multiplyScalar(Math.exp(-.12*dt));p.addScaledVector(s.vel,dt);
   s.mesh.rotation.x+=s.spin.x*dt;s.mesh.rotation.y+=s.spin.y*dt;s.mesh.rotation.z+=s.spin.z*dt;
   if(s.wall&&Math.hypot(p.x-s.wallAt.x,p.z-s.wallAt.z)<.35&&Math.abs(p.y-s.wallAt.y)<1.6){const d=(p.x-s.wallAt.x)*s.wall.x+(p.z-s.wallAt.z)*s.wall.z,v=s.vel.dot(s.wall);if(d<.012&&v<0){p.addScaledVector(s.wall,.012-d);s.vel.addScaledVector(s.wall,-1.45*v);s.spin.multiplyScalar(-.7);if(s.bounces<2)sfx.tink(s.kind,p,.7);}}
   const floor=s.ground+.0055*s.size;
   if(p.y>floor)return;
   // Off an edge or onto a step: look again under where it has got to.
   s.ground=groundAt(p.x,p.z,p.y+.3);if(p.y>s.ground+.0055*s.size)return;p.y=s.ground+.0055*s.size;
   const [give,grip,ring]=GIVE[underfoot(p.x,p.z,s.ground)]||GIVE.brick,hit=-s.vel.y;
   if(hit>.25&&s.bounces<4&&ring>.2)sfx.tink(s.kind,p,ring*Math.min(1,hit/4)*(s.bounces?.6:1));
   if(ring<=.12&&!s.bounces)spawn({map:tx.puff,pos:p,vel:effectVel.set(0,.25,0),life:.35,size:[.02,.09],alpha:.3,color:ring<.11?0x9aa4ad:0x4a3d2c,gravity:.4,drag:2});
   s.vel.y=hit>.35?hit*give:0;s.vel.x=s.vel.x*grip+rand(-.12,.12)*hit*.4;s.vel.z=s.vel.z*grip+rand(-.12,.12)*hit*.4;s.spin.multiplyScalar(grip*.8);s.bounces++;
   // Down: it rolls a little on its side and stops.
   if(s.vel.y===0||s.bounces>9){s.vel.y=0;const roll=Math.hypot(s.vel.x,s.vel.z);s.vel.x*=Math.exp(-5*dt);s.vel.z*=Math.exp(-5*dt);s.spin.set(0,s.spin.y*.8,0);s.mesh.quaternion.slerp(flatQ.setFromEuler(shellE.set(Math.PI/2,0,s.mesh.rotation.y)),Math.min(1,dt*16));if(roll<.03||s.bounces>70){s.rest=true;s.bounces=Math.max(4,s.bounces);}}
  }
  const effectVel=new T.Vector3();
  function updateShells(dt){
   for(const s of shells){if(!s.mesh.visible)continue;s.age+=dt;
    if(s.age>(s.real?30:14)){s.mesh.visible=false;continue;}
    if(s.real){if(!s.rest)shellStep(s,dt);continue;}
    if(s.bounces<4){s.vel.y-=9.8*dt;s.mesh.position.addScaledVector(s.vel,dt);s.mesh.rotation.x+=s.spin.x*dt;s.mesh.rotation.y+=s.spin.y*dt;s.mesh.rotation.z+=s.spin.z*dt;
     if(s.mesh.position.y<s.ground+.006){s.mesh.position.y=s.ground+.006;if(s.bounces===0)sfx.tink(s.kind,s.mesh.position);s.vel.y*=-.32;s.vel.x*=.55;s.vel.z*=.55;s.spin.multiplyScalar(.45);s.bounces++;if(s.bounces>=4){s.mesh.rotation.x=0;s.mesh.rotation.z=Math.PI/2*Math.sign(Math.random()-.5);}}}
   }
  }

  /* ------------------------------------------------------------ C4 */
  function throwCharge(){
   const gv=variantOfSpec('c4',variants.c4);
   if(gv)return throwGrenade(gv);
   if(charges.filter(c=>!c.done&&!c.fuse).length>=WEAPONS[3].mag){hud.toast('Detonate before placing more · '+controlHint('detonate','G'));return false;}
   if(arsenal){if(!(arsenal.reserve.c4>0)){hud.toast('NO CHARGES LEFT');return false;}arsenal.reserve.c4--;}
   const g=buildC4Block();g.traverse(x=>x.userData.noHit=true);world.add(g);
   const start=viewToWorld(new T.Vector3(.15,-.12,-.45));start.y-=o.lensDrop?.()||0;
   const dir=aimForward();
   g.position.copy(start);
   const c={group:g,vel:dir.multiplyScalar(8.5).add(new T.Vector3(0,2.2,0)),spin:new T.Vector3(rand(-9,9),rand(-6,6),rand(-9,9)),stuck:false,done:false,age:0,led:g.userData.led};
   charges.push(c);sfx.throw();return true;
  }
  function throwGrenade(v){
   if(arsenal){if(!(arsenal.reserve.c4>0)){hud.toast('NONE LEFT');return false;}arsenal.reserve.c4--;}
   const g=new T.Group();world.add(g);
   throwableModel(v).then(src=>{const k=src.clone();g.add(k);}).catch(()=>{const b=buildC4Block();g.add(b);});
   const start=viewToWorld(new T.Vector3(.15,-.08,-.45));start.y-=o.lensDrop?.()||0;g.position.copy(start);
   const dir=aimForward();
   charges.push({group:g,vel:dir.multiplyScalar(v.speed).add(new T.Vector3(0,3,0)),spin:new T.Vector3(rand(-12,12),rand(-8,8),rand(-12,12)),stuck:false,done:false,age:0,fuse:v.fuse,radius:v.radius,dmg:v.dmg,bounce:v.bounce,rest:false});
   sfx.throw();hud.update();return true;
  }
  // A thrown grenade: bounces off what it meets, rolls to a stop, and goes off when its fuse runs out.
  function stepGrenade(c,dt){
   if(c.age>=c.fuse){c.done=true;explode(c);return;}
   if(c.rest)return;
   const pos=c.group.position,step=c.vel.clone().multiplyScalar(dt),len=step.length();
   const h=len>1e-4?worldHits(pos,step.clone().normalize(),len+.05):null;
   if(h){const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new T.Vector3(0,1,0);
    pos.copy(h.point).addScaledVector(n,.05);const vn=c.vel.dot(n);c.vel.addScaledVector(n,-(1+c.bounce)*vn).multiplyScalar(.7);c.spin.multiplyScalar(.6);
    if(Math.abs(vn)>1.2)sfx.stick(h.point);}
   else{c.vel.y-=9.8*dt;pos.add(step);}
   const floor=groundAt(pos.x,pos.z,pos.y+.5)+.05;
   if(pos.y<floor){pos.y=floor;if(c.vel.y<0){const vy=-c.vel.y;c.vel.y=vy*c.bounce;c.vel.x*=.7;c.vel.z*=.7;if(vy>1.2)sfx.stick(pos.clone());}}
   if(pos.y<=floor+.01&&c.vel.lengthSq()<.05){c.rest=true;c.vel.set(0,0,0);}
   c.group.rotation.x+=c.spin.x*dt;c.group.rotation.y+=c.spin.y*dt;c.group.rotation.z+=c.spin.z*dt;
  }
  function updateCharges(dt){
   for(const c of charges){if(c.done)continue;c.age+=dt;
    if(c.fuse){stepGrenade(c,dt);continue;}
    if(!c.stuck){
     const step=c.vel.clone().multiplyScalar(dt),len=step.length();
     const h=len>0?worldHits(c.group.getWorldPosition(new T.Vector3()),step.clone().normalize(),len+.04):null;
     if(h){
      const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):new T.Vector3(0,1,0);
      c.group.position.copy(h.point).addScaledVector(n,.022);
      c.group.quaternion.setFromUnitVectors(new T.Vector3(0,-1,0),n.clone().negate());c.group.rotateY(Math.random()*TAU);
      c.stuck=true;c.host=targetOf(h.object);
      if(c.host)c.host.pivot.attach(c.group);
      sfx.stick(h.point);
     }else{c.vel.y-=9.8*dt;c.group.position.add(step);c.group.rotation.x+=c.spin.x*dt;c.group.rotation.y+=c.spin.y*dt;c.group.rotation.z+=c.spin.z*dt;
      if(c.age>6){c.done=true;world.remove(c.group);}}
    }
    c.led.material.emissiveIntensity=(Math.floor(c.age*2.5)%2===0)?4:.2;
   }
  }
  function detonate(){
   const live=charges.filter(c=>!c.done&&!c.fuse);
   if(!live.length){hud.toast('No charges placed');return;}
   const r=models.c4.parts;state.c4press=lastTime;r.remoteLed.material.emissiveIntensity=6;sfx.beep();
   live.forEach((c,i)=>{c.done=true;setTimeout(()=>explode(c),260+i*140);});
  }
  /* ------------------------------------------------------------ flipbooks (Unity Labs CC0 Houdini sims, models/combat/vfx) */
  const FLIP_SRC={
   explosion02:{file:'explosion02_5x5.webp',cols:5,frames:25},
   explosion01:{file:'explosion01_5x5.webp',cols:5,frames:25},
   cloud:{file:'cloud01_8x8.webp',cols:8,frames:64},
   wisp:{file:'wispysmoke01_8x8.webp',cols:8,frames:64}
  };
  const flipBooks={},flips=[],embers=[],heat=[];
  // Billboards in view space. vWorldY / vDepth give cheap "soft particles": the sprite fades where it meets the
  // ground plane under it and right in front of the camera, so smoke never shows a hard cut line.
  const FLIP_VERT='uniform float rot;varying vec2 vUv;varying float vWorldY,vDepth;void main(){vUv=uv*.98+.01;vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.);vec2 sc=vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));float c=cos(rot),s=sin(rot);vec2 p=position.xy*sc;p=vec2(c*p.x-s*p.y,s*p.x+c*p.y);mv.xy+=p;vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);vWorldY=(modelMatrix[3].xyz+right*p.x+up*p.y).y;vDepth=-mv.z;gl_Position=projectionMatrix*mv;}';
  const FLIP_FRAG=`uniform sampler2D map;uniform float cols,frames,frame,opacity,glow,light,groundY,soft;uniform vec2 near;uniform vec3 tint;varying vec2 vUv;varying float vWorldY,vDepth;
   vec4 cell(float f){float c=mod(f,cols),r=floor(f/cols);return texture2D(map,(vec2(c,cols-1.-r)+vUv)/cols);}
   void main(){float f=clamp(frame,0.,frames-1.),f0=floor(f);vec4 a=mix(cell(f0),cell(min(f0+1.,frames-1.)),f-f0);
   #ifdef GLOW
    float lum=max(a.r,max(a.g,a.b));float sf=smoothstep(0.,soft,vWorldY-groundY);gl_FragColor=vec4(a.rgb*a.rgb*smoothstep(.3,.95,lum)*a.a*glow*sf,1.);
   #else
    float lum=max(a.r,max(a.g,a.b));float fire=smoothstep(.45,.9,lum);float sun=mix(.72,1.12,smoothstep(.15,.85,vUv.y));
    vec3 col=a.rgb*mix(vec3(light*sun),vec3(1.),fire)*mix(tint,vec3(1.),fire);
    float sf=smoothstep(0.,soft,vWorldY-groundY)*smoothstep(near.x,near.y,vDepth);gl_FragColor=vec4(col,a.a*opacity*sf);
   #endif
   }`;
  function flipBook(name){
   if(flipBooks[name])return flipBooks[name];const src=FLIP_SRC[name];
   const t=new T.TextureLoader().load('/models/combat/vfx/'+src.file,()=>requestFrame());t.generateMipmaps=true;t.minFilter=T.LinearMipmapLinearFilter;
   return flipBooks[name]={tex:t,...src};
  }
  const flipGeo=new T.PlaneGeometry(1,1);
  function spawnFlip(name,opts){
   const fb=flipBook(name);
   let f=flips.find(x=>!x.alive&&x.name===name&&!!x.glowMesh===!!opts.glow);
   if(!f){
    if(poolsReady)return null;
    const uni=()=>({map:{value:fb.tex},cols:{value:fb.cols},frames:{value:fb.frames},frame:{value:0},opacity:{value:1},glow:{value:1},light:{value:1},tint:{value:new T.Color(1,1,1)},rot:{value:0},groundY:{value:-99},soft:{value:.6},near:{value:new T.Vector2(.25,1.4)}});
    const m=new T.Mesh(flipGeo,new T.ShaderMaterial({uniforms:uni(),vertexShader:FLIP_VERT,fragmentShader:FLIP_FRAG,transparent:true,depthWrite:false}));
    m.frustumCulled=false;m.renderOrder=2;m.userData.noHit=true;fxGroup.add(m);
    let gm=null;if(opts.glow){gm=new T.Mesh(flipGeo,new T.ShaderMaterial({uniforms:m.material.uniforms,vertexShader:FLIP_VERT,fragmentShader:FLIP_FRAG,defines:{GLOW:1},transparent:true,depthWrite:false,blending:T.AdditiveBlending}));gm.frustumCulled=false;gm.layers.set(GLOW);m.add(gm);}
    f={name,mesh:m,glowMesh:gm,vel:new T.Vector3()};flips.push(f);
   }
   const u=f.mesh.material.uniforms;
   f.alive=true;f.t=-(opts.delay||0);f.life=opts.life;f.s0=opts.size[0];f.s1=opts.size[1];f.curve=opts.curve||1;f.loop=opts.loop||0;f.start=opts.start||0;
   f.a0=opts.alpha??1;f.fadeIn=opts.fadeIn||0;f.drag=opts.drag??.6;f.rise=opts.rise||0;f.spin=opts.spin||0;f.night=opts.night!==false;
   f.vel.copy(opts.vel||effectZero);f.mesh.position.copy(opts.pos);u.rot.value=opts.rot??Math.random()*TAU;u.glow.value=opts.glowGain||0;u.groundY.value=opts.groundY??-99;u.soft.value=opts.soft??.6;if(opts.near)u.near.value.fromArray(opts.near);else u.near.value.set(.25,1.4);if(Array.isArray(opts.tint))u.tint.value.setRGB(...opts.tint);else u.tint.value.set(opts.tint??0xffffff);
   f.mesh.visible=false;f.mesh.scale.setScalar(f.s0);return f;
  }
  function updateFlips(dt){
   const night=clamp(-(camera.position.z+11)/30,0,1);
   for(const f of flips){if(!f.alive)continue;f.t+=dt;if(f.t<0)continue;const k=f.t/f.life;
    if(k>=1){f.alive=false;f.mesh.visible=false;continue;}
    f.mesh.visible=true;const u=f.mesh.material.uniforms,fb=flipBooks[f.name];
    u.frame.value=f.loop?(f.start+f.t*f.loop)%fb.frames:Math.pow(k,f.curve)*(fb.frames-1);
    f.vel.y+=f.rise*dt;f.vel.multiplyScalar(Math.exp(-f.drag*dt));f.mesh.position.addScaledVector(f.vel,dt);
    f.mesh.scale.setScalar(lerp(f.s0,f.s1,easeOut(k)));u.rot.value+=f.spin*dt;
    const fade=(f.fadeIn?Math.min(1,k/f.fadeIn):1)*(f.loop?Math.min(1,(1-k)/.35):1);u.opacity.value=f.a0*fade;
    u.light.value=f.night?lerp(1,.32,night):1;
   }
  }

  function updateEmbers(dt){
   for(let i=embers.length-1;i>=0;i--){const e=embers[i];e.t+=dt;
    e.vel.y-=9.8*dt;e.vel.multiplyScalar(Math.exp(-.35*dt));e.pos.addScaledVector(e.vel,dt);
    if(e.pos.y<e.ground+.05){e.pos.y=e.ground+.05;e.vel.multiplyScalar(.3);e.vel.y=Math.abs(e.vel.y)*.3;}
    const heatK=1-e.t/e.life;
    spawn({map:tx.soft,additive:true,pos:e.pos,life:.09,size:[.16*heatK+.04,.1],color:0xffd08a,color1:0xff5a10});
    e.next-=dt;if(e.next<=0&&heatK>.15){e.next=.085;spawnFlip('wisp',{groundY:e.ground,soft:.3,pos:e.pos.clone(),size:[.25,rand(.9,1.4)],life:rand(1,1.5),loop:24,start:rand(0,63),fadeIn:.05,alpha:.45*heatK+.1,vel:new T.Vector3(0,.5,0),rise:.2,drag:1.2,spin:rand(-.5,.5),tint:[.75,.72,.68]});}
    if(e.t>=e.life)embers.splice(i,1);}
  }
  // Heat haze: copy the rendered frame and redraw it through a noise-displaced billboard over the fireball.
  let heatFX=null;
  function renderHeat(){
   if(!heat.length)return;
   if(!heatFX){
    const ft=new T.FramebufferTexture(4,4);
    // mask: the weapon drawn in front of the lens (Beyond Eden, eden-post overlayMask), in the picture's unbent coordinates:
    // the haze is in the air beyond it, so it neither covers the weapon nor drags the weapon's pixels into the shimmer.
    const mat=new T.ShaderMaterial({uniforms:{frame:{value:ft},res:{value:new T.Vector2()},time:{value:0},amount:{value:0},mask:{value:null},masked:{value:0},lens:{value:0},aspect:{value:1}},transparent:true,depthWrite:false,depthTest:true,
     vertexShader:'varying vec2 vUv;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(0.,0.,0.,1.);mv.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));gl_Position=projectionMatrix*mv;}',
     fragmentShader:`uniform sampler2D frame,mask;uniform vec2 res;uniform float time,amount,masked,lens,aspect;varying vec2 vUv;
      vec2 bend(vec2 v){vec2 q=(v-.5)*vec2(aspect,1.);return .5+(v-.5)*(1.-lens*(1.-dot(q,q)/(aspect*aspect*.25+.25)));}
      float held(vec2 s){return masked>0.?clamp(texture2D(mask,bend(s)).a,0.,1.):0.;}
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 c=vUv-.5;float m=smoothstep(.5,.1,length(c*vec2(1.,.8)));
       vec2 q=vUv*6.+vec2(0.,-time*2.2);vec2 d=vec2(n(q)-.5,n(q+7.3)-.5);
       vec2 s=gl_FragCoord.xy/res,uv=s+d*amount*m*.035;uv=mix(uv,s,held(uv));gl_FragColor=vec4(texture2D(frame,uv).rgb,m*min(1.,amount*3.)*(1.-held(s)));}`});
    const mesh=new T.Mesh(new T.PlaneGeometry(1,1),mat);mesh.frustumCulled=false;const sc=new T.Scene();sc.add(mesh);
    heatFX={ft,mat,mesh,scene:sc,size:new T.Vector2(),origin:new T.Vector2()};
   }
   renderer.getDrawingBufferSize(heatFX.size);
   if(heatFX.ft.image.width!==heatFX.size.x||heatFX.ft.image.height!==heatFX.size.y){heatFX.ft.dispose();heatFX.ft=new T.FramebufferTexture(heatFX.size.x,heatFX.size.y);heatFX.mat.uniforms.frame.value=heatFX.ft;}
   renderer.copyFramebufferToTexture(heatFX.ft,heatFX.origin);
   heatFX.mat.uniforms.res.value.copy(heatFX.size);heatFX.mat.uniforms.time.value=lastTime;
   {const P=lensPost(),mask=P?.overlayMask?.()||null,u=heatFX.mat.uniforms;u.mask.value=mask;u.masked.value=mask?1:0;u.lens.value=mask?P.bend?.()||0:0;u.aspect.value=heatFX.size.x/heatFX.size.y;}
   const auto=renderer.autoClear;renderer.autoClear=false;
   for(const hz of heat){const k=hz.t/hz.life;heatFX.mesh.position.copy(hz.pos);heatFX.mesh.scale.setScalar(hz.size*(.8+k*.4));heatFX.mat.uniforms.amount.value=Math.sin(Math.min(1,k*4)*Math.PI/2)*(1-k);renderer.render(heatFX.scene,camera);}
   renderer.autoClear=auto;
  }

  function explode(c){
   const p=c.group.getWorldPosition(new T.Vector3());c.group.parent?.remove(c.group);
   blastLight.position.copy(p).add(new T.Vector3(0,.6,0));state.blast=1;
   {const eye=camera.getWorldPosition(new T.Vector3()),dir=blastLight.position.clone().sub(eye),len=dir.length();const h=worldHits(eye,dir.normalize(),len);state.blastSeen=!h||h.distance>len-1.2?1:.12;}
   const seen=state.blastSeen??1,ground=groundAt(p.x,p.z,p.y+1);
   // Core flash: a very short white-hot burst that drives bloom and the lens flare.
   spawn({map:tx.soft,additive:true,pos:p.clone().add(new T.Vector3(0,.5,0)),life:.1,size:[1.4,2.6],color:0xfff6e0,color1:0xffa040});
   // Simulated fireball + secondary lobe (Houdini flipbooks), fire part also rendered into the bloom buffer.
   spawnFlip('explosion02',{groundY:ground,soft:.9,pos:p.clone().add(new T.Vector3(0,1.25,0)),size:[4.6,5.8],life:2.9,curve:.72,glow:true,glowGain:2.4*seen,vel:new T.Vector3(0,.6,0),rise:.25});
   spawnFlip('explosion01',{groundY:ground,soft:.9,pos:p.clone().add(new T.Vector3(rand(-.7,.7),1.6,rand(-.7,.7))),size:[3.4,4.6],life:2.7,curve:.8,delay:.07,glow:true,glowGain:1.6*seen,vel:new T.Vector3(rand(-.4,.4),1,rand(-.4,.4)),rise:.3});
   // Rolling smoke column that outlives the fireball.
   for(let i=0;i<7;i++)spawnFlip('cloud',{groundY:ground,soft:1.4,pos:p.clone().add(new T.Vector3(rand(-.8,.8),rand(1,2.4),rand(-.8,.8))),size:[2.4,rand(5,7.5)],life:rand(7,10),loop:rand(5,8),start:rand(0,63),delay:rand(.35,.9),fadeIn:.12,alpha:rand(.55,.75),vel:new T.Vector3(rand(-.6,.6),i<3?rand(.05,.25):rand(.35,.8),rand(-.6,.6)),rise:i<3?0:.035,drag:.35,spin:rand(-.08,.08),tint:[1.55,1.45,1.35]});
   // Dust skirt kicked out along the ground by the shockwave.
   for(let i=0;i<10;i++){const a=i/10*TAU+rand(-.2,.2);spawnFlip('cloud',{groundY:ground,soft:.8,pos:new T.Vector3(p.x,ground+.95,p.z),size:[.8,rand(2.2,3)],life:rand(3,4.5),loop:6,start:rand(0,63),fadeIn:.05,alpha:.6,vel:new T.Vector3(Math.cos(a)*rand(7,10),.4,Math.sin(a)*rand(7,10)),drag:2.4,rise:.05,tint:[1.7,1.55,1.3]});}
   for(let i=0;i<46;i++)spawn({map:tx.soft,additive:true,pos:p,vel:new T.Vector3(rand(-1,1),rand(.2,1.4),rand(-1,1)).normalize().multiplyScalar(rand(6,16)),life:rand(.4,1.2),size:[.07,.02],color:0xffd27a,color1:0xff4a00,gravity:9.8,drag:.6});
   for(let i=0;i<26;i++)spawn({map:tx.soft,pos:p,vel:new T.Vector3(rand(-1,1),rand(.4,1.6),rand(-1,1)).normalize().multiplyScalar(rand(3,9)),life:rand(1,1.8),size:[.05,.04],color:0x2a2620,gravity:9.8,drag:.3,spin:rand(-10,10)});
   const g=worldHits(p.clone().add(new T.Vector3(0,.5,0)),new T.Vector3(0,-1,0),3);if(g)decal(g,tx.scorch,3.2,120);
   // Burning fragments on ballistic arcs, each trailing smoke.
   for(let i=0;i<7;i++){const a=Math.random()*TAU,up=rand(5,11),out=rand(3,8);embers.push({pos:p.clone().add(new T.Vector3(0,.4,0)),vel:new T.Vector3(Math.cos(a)*out,up,Math.sin(a)*out),t:0,life:rand(1.6,2.8),next:0,ground});}
   // Heat haze over the fireball.
   heat.push({pos:p.clone().add(new T.Vector3(0,1.6,0)),t:0,life:2.2,size:7.5});
   const dist0=camera.position.distanceTo(p);
   if(dist0<14){hud.flash(clamp(1.15-dist0/12,.15,.95));sfx.deafen(clamp(1.2-dist0/12,.1,1));}
   o.onExplosion?.(p,c.radius||6.5,c.dmg||WEAPONS[3].dmg,{player:!c.remote});
   for(const t of targets){const tp=t.root.getWorldPosition(new T.Vector3());const d=tp.distanceTo(p);if(d<6.5){const f=1-d/6.5;t.swing.kick(f*14*(Math.random()<.5?-1:1));t.twist.kick(f*8*(Math.random()-.5));if(d<3.2&&!t.down){t.down=1;t.downT=lastTime;t.fallDir=Math.atan2(tp.x-p.x,tp.z-p.z);}}}
   const dist=camera.position.distanceTo(p);look.shake=Math.max(look.shake,clamp(1.6-dist/20,.15,1.6));
   sfx.boom(p,dist);requestFrame();
  }

  /* ------------------------------------------------------------ audio (procedural) */
  const recorded=root.createCombatAudio?.({camera,T});
  const sfx=(()=>{
   let ctx=null,master,verb,noiseBuf,muffle=null;
   function init(){if(ctx)return ctx;const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ctx=new C();
    master=ctx.createDynamicsCompressor();master.threshold.value=-10;master.ratio.value=6;const out=ctx.createGain();out.gain.value=.8;muffle=ctx.createBiquadFilter();muffle.type='lowpass';muffle.frequency.value=18000;master.connect(muffle).connect(out).connect(ctx.destination);
    verb=ctx.createConvolver();const len=ctx.sampleRate*2.2,ir=ctx.createBuffer(2,len,ctx.sampleRate);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++){const t=i/ctx.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-t*2.6)*(t<.05?t/.05:1)*(1+.5*Math.sin(t*40));}}verb.buffer=ir;const vg=ctx.createGain();vg.gain.value=.35;verb.connect(vg).connect(master);
    noiseBuf=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const n=noiseBuf.getChannelData(0);for(let i=0;i<n.length;i++)n[i]=Math.random()*2-1;recorded?.load(ctx,master);master=window.beyondAudio?.input()||master;return ctx;}
   function pan(pos){const p=ctx.createStereoPanner();if(pos){const v=pos.clone().project(camera);p.pan.value=clamp(v.x,-1,1)*.7;}return p;}
   function dist(pos){return pos?clamp(1/(1+camera.position.distanceTo(pos)*.08),.12,1):1;}
   function noise(t,{dur,type='lowpass',f0,f1,q=.7,gain=1,attack=.001,send=.3,pos=null,curve=3}){
    const s=ctx.createBufferSource();s.buffer=noiseBuf;s.playbackRate.value=rand(.9,1.1);const f=ctx.createBiquadFilter();f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,t);if(f1)f.frequency.exponentialRampToValueAtTime(f1,t+dur);
    const g=ctx.createGain();const amp=gain*dist(pos);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(amp,t+attack);g.gain.setTargetAtTime(0,t+attack,dur/curve);
    const p=pan(pos);s.connect(f).connect(g).connect(p).connect(master);if(send){const sg=ctx.createGain();sg.gain.value=send;p.connect(sg).connect(verb);}
    s.start(t,Math.random()*2);s.stop(t+dur*2+.1);
   }
   function tone(t,{f0,f1,dur,type='sine',gain=.5,send=.1,pos=null}){const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1)o.frequency.exponentialRampToValueAtTime(f1,t+dur);const g=ctx.createGain();const amp=gain*dist(pos);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);const p=pan(pos);o.connect(g).connect(p).connect(master);if(send){const sg=ctx.createGain();sg.gain.value=send;p.connect(sg).connect(verb);}o.start(t);o.stop(t+dur+.05);}
   function voiceAt(t,{pos,seed=.5,dur=.3,f0=210,f1=145,scream=false,gain=.5}){
    const base=lerp(.78,1.32,seed),o=ctx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(f0*base,t);
    if(scream){o.frequency.linearRampToValueAtTime(f0*base*1.35,t+dur*.22);o.frequency.exponentialRampToValueAtTime(f1*base,t+dur);}else o.frequency.exponentialRampToValueAtTime(f1*base,t+dur);
    const vib=ctx.createOscillator(),vg=ctx.createGain();vib.frequency.value=scream?7.5:5;vg.gain.value=f0*base*(scream?.06:.025);vib.connect(vg).connect(o.frequency);
    const g=ctx.createGain(),amp=gain*dist(pos);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(amp,t+.02);g.gain.setValueAtTime(amp,t+dur*.6);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    const sum=ctx.createGain(),p=pan(pos);for(const [f,q] of scream?[[860,6],[1260,7],[2850,9]]:[[650,5],[1080,6],[2450,8]]){const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f*lerp(.9,1.15,seed);bp.Q.value=q;o.connect(bp).connect(sum);}
    sum.connect(g).connect(p).connect(master);const sg=ctx.createGain();sg.gain.value=.35;p.connect(sg).connect(verb);
    o.start(t);vib.start(t);o.stop(t+dur+.05);vib.stop(t+dur+.05);noise(t,{dur:dur*.8,type:'bandpass',f0:1800,q:1,gain:gain*.18,send:.2,pos,attack:.02});
   }
   const go=fn=>(...a)=>{if(!init())return;if(ctx.state==='suspended'){ctx.resume().catch(()=>{});return;}fn(ctx.currentTime,...a);};
   return {
    init:()=>init(),
    pistol:go((t,isTrue)=>{if(recorded?.shot('pistol',t))return;noise(t,{dur:.005,type:'highpass',f0:3000,gain:1.4,send:0});noise(t,{dur:.11,f0:6000,f1:500,gain:1.3,send:.6});tone(t,{f0:160,f1:45,dur:.13,gain:.9});noise(t+.01,{dur:.35,f0:1400,f1:200,gain:.25,send:.9});if(isTrue){tone(t+.02,{f0:2200,dur:.5,gain:.12,send:.6});tone(t+.02,{f0:3300,dur:.35,gain:.06,send:.6});}}),
    pump:go((t,isTrue)=>{if(recorded?.shot('pump',t))return;noise(t,{dur:.008,type:'highpass',f0:2000,gain:1.4,send:0});noise(t,{dur:.22,f0:4000,f1:250,gain:1.6,send:.8});tone(t,{f0:110,f1:32,dur:.25,gain:1.2});noise(t+.02,{dur:.6,f0:900,f1:120,gain:.35,send:1});if(isTrue){tone(t+.02,{f0:1700,dur:.6,gain:.12,send:.6});tone(t+.02,{f0:2550,dur:.4,gain:.06,send:.6});}}),
    smg:go((t,isTrue)=>{if(recorded?.shot('smg',t))return;noise(t,{dur:.004,type:'highpass',f0:3500,gain:1.1,send:0});noise(t,{dur:.07,f0:5500,f1:700,gain:1,send:.5});tone(t,{f0:190,f1:70,dur:.08,gain:.6});noise(t+.01,{dur:.22,f0:1500,f1:250,gain:.18,send:.8});if(isTrue)tone(t+.02,{f0:2400,dur:.3,gain:.08,send:.5});}),
    rifle:go((t,isTrue)=>{if(recorded?.shot('rifle',t))return;noise(t,{dur:.006,type:'highpass',f0:2500,gain:1.5,send:0});noise(t,{dur:.13,f0:6500,f1:420,gain:1.4,send:.7});tone(t,{f0:140,f1:40,dur:.16,gain:1});noise(t+.015,{dur:.45,f0:1200,f1:160,gain:.3,send:1});if(isTrue)tone(t+.02,{f0:2000,dur:.45,gain:.1,send:.6});}),
    sniper:go((t,isTrue)=>{if(recorded?.shot('sniper',t))return;noise(t,{dur:.008,type:'highpass',f0:2000,gain:1.8,send:0});noise(t,{dur:.25,f0:7000,f1:300,gain:1.8,send:.9});tone(t,{f0:95,f1:28,dur:.32,gain:1.4});noise(t+.03,{dur:1.1,f0:900,f1:90,gain:.45,send:1.3,curve:2.5});if(isTrue)tone(t+.03,{f0:1600,dur:.7,gain:.12,send:.7});}),
    remote:go((t,kind,pos)=>{if(recorded?.shot(kind,t,pos))return;const d=camera.position.distanceTo(pos),tt=t+d/343,far=clamp(d/120,0,1);const g=clamp(1.4-d/70,.12,1);
     noise(tt,{dur:kind==='sniper'?.3:.12,f0:lerp(5000,900,far),f1:200,gain:1.1*g,send:.9,pos});tone(tt,{f0:kind==='pump'||kind==='sniper'?100:150,f1:40,dur:.15,gain:.6*g,pos});
     if(d>25)noise(tt+.05,{dur:.6,f0:600,f1:120,gain:.25*g,send:1.2,pos});}),
    hurt:go((t,a)=>{tone(t,{f0:120,f1:70,dur:.12,gain:Math.min(.5,a/60)});noise(t,{dur:.08,f0:700,f1:200,gain:Math.min(.6,a/50),send:.1});}),
    click:go((t,f=3200,g=.25)=>{if(recorded?.play((current?.id||'pistol')+'-mechanical',{time:t,gain:g}))return;noise(t,{dur:.012,type:'bandpass',f0:f,q:3,gain:g,send:.05});tone(t,{f0:f*.7,dur:.03,gain:g*.2,type:'triangle',send:0});}),
    rack:go((t,back)=>{if(recorded?.play((current?.id||'pistol')+'-mechanical',{time:t,gain:.5,pitch:back?.95:1.05}))return;noise(t,{dur:.06,type:'bandpass',f0:back?1300:1900,f1:back?700:2600,q:1.5,gain:.5,send:.1});noise(t+.055,{dur:.02,type:'bandpass',f0:3400,q:4,gain:.5,send:.05});}),
    dry:go(t=>{if(recorded?.play((current?.id||'pistol')+'-dry',{time:t,gain:.5}))return;noise(t,{dur:.01,type:'bandpass',f0:4200,q:6,gain:.3,send:0});}),
    // Weight under every shot: a sub-bass thump, the action cycling, and a long low tail into the space.
    weight:go((t,id)=>{if(recorded?.inspect().ready){tone(t,{f0:62,f1:28,dur:.12,gain:.18,send:0});return;}const k={pistol:.7,smg:.55,rifle:.9,pump:1.2,sniper:1.4}[id]||.7;tone(t,{f0:62,f1:28,dur:.16+.08*k,gain:.75*k,send:0});noise(t+.035,{dur:.025,type:'bandpass',f0:2600,q:3,gain:.22,send:.05});noise(t+.09,{dur:.5+.3*k,type:'lowpass',f0:520,f1:90,gain:.17*k,send:1.2,curve:2.2});}),
    // A bullet meeting a body: low thump and wet slap; a sharper crack on the head; a heavier fall on a kill.
    flesh:go((t,pos,head,kill)=>{if(recorded?.play(head?'head':'body',{time:t,pos,gain:.85})){if(kill)recorded.play('kill',{time:t,pos,gain:.8,delay:.045});return;}tone(t,{f0:head?190:125,f1:42,dur:.1,gain:.75,pos,send:.05});noise(t,{dur:.075,type:'bandpass',f0:head?2300:950,q:1.2,gain:.95,pos,send:.12});if(head)noise(t,{dur:.02,type:'highpass',f0:4200,gain:.85,pos,send:.05});if(kill)noise(t+.03,{dur:.2,type:'lowpass',f0:620,f1:110,gain:.85,pos,send:.3});}),
    // The hit tick (heard as the hitmarker): crisp on the body, a bright ping on the head, a low double hit on a kill.
    hitTick:go((t,head,kill)=>{tone(t,{f0:head?2600:1900,dur:.04,type:'triangle',gain:.22,send:0});if(head)tone(t+.03,{f0:3400,dur:.08,gain:.15,send:.05});if(kill){tone(t+.05,{f0:1250,f1:620,dur:.13,gain:.26,send:.1});tone(t,{f0:80,f1:40,dur:.2,gain:.5,send:0});}}),
    // Voices: a sawtooth throat through three vowel formants, vibrato and breath; each enemy has its own pitch.
    pain:go((t,pos,seed=.5,dmg=15)=>{if(recorded?.play(seed<.5?'voice-a-pain':'voice-b-pain',{time:t,pos,gain:.65}))return;voiceAt(t,{pos,seed,dur:rand(.2,.32),f0:rand(200,240),f1:rand(130,160),gain:Math.min(.55,.25+dmg/60)});}),
    scream:go((t,pos,seed=.5)=>{if(recorded?.play(seed<.5?'voice-a-death':'voice-b-death',{time:t,pos,gain:.9}))return;voiceAt(t,{pos,seed,dur:rand(.8,1.05),f0:rand(280,330),f1:rand(140,170),scream:true,gain:.7});}),
    whoosh:go((t,heavy)=>{noise(t,{dur:heavy?.34:.24,type:'bandpass',f0:300,f1:heavy?1400:1800,q:1.2,gain:heavy?.7:.45,attack:.08,send:.1,curve:2});}),
    wood:go((t,pos,p=1)=>{if(recorded?.play('wood',{time:t,pos,gain:p*.6}))return;tone(t,{f0:210,f1:120,dur:.12,gain:.6*p,type:'triangle',pos});noise(t,{dur:.08,f0:1800,f1:400,gain:.6*p,pos,send:.3});}),
    ding:go((t,pos,p=1)=>{if(recorded?.play('metal',{time:t,pos,gain:p*.65}))return;const base=rand(480,560);[[1,.32],[2.71,.16],[4.1,.09],[5.8,.05]].forEach(([m,g])=>tone(t,{f0:base*m,dur:1.4/m+.3,gain:g*Math.min(1.5,p),pos,send:.4}));noise(t,{dur:.01,type:'highpass',f0:4000,gain:.4,pos});}),
    dirt:go((t,pos,hard=false)=>{if(recorded?.play(hard?'stone':'dirt',{time:t,pos,gain:.5}))return;noise(t,{dur:.06,f0:1500,f1:300,gain:.25,pos,send:.1});}),
    nearMiss:go((t,pos)=>recorded?.play('near-miss',{time:t,pos,gain:.3})),
    tink:go((t,kind,pos,loud=1)=>{if(recorded?.play('casing',{time:t,pos,gain:(kind==='pump'?.14:.1)*loud})||loud<1)return;const f=kind==='pump'?900:rand(3600,4400);tone(t,{f0:f,dur:kind==='pump'?.08:.2,gain:.06,pos,send:.05,type:kind==='pump'?'triangle':'sine'});tone(t+.09,{f0:f*1.04,dur:.12,gain:.03,pos,send:0});}),
    throw:go(t=>noise(t,{dur:.2,type:'bandpass',f0:500,f1:1500,q:1,gain:.3,attack:.05})),
    stick:go((t,pos)=>{tone(t,{f0:140,f1:90,dur:.08,gain:.35,pos});noise(t,{dur:.04,f0:900,gain:.2,pos});}),
    beep:go(t=>{tone(t,{f0:2600,dur:.07,type:'square',gain:.08,send:0});tone(t+.11,{f0:2600,dur:.07,type:'square',gain:.08,send:0});}),
    arm:go(t=>{tone(t,{f0:1900,dur:.05,type:'square',gain:.05,send:0});}),
    boom:go((t,pos,d)=>{const far=clamp(d/40,0,1),tt=t+d/343;noise(tt,{dur:.02,type:'highpass',f0:1200,gain:1.6*(1-far*.7),send:.3});noise(tt,{dur:2.4,f0:2400*(1-far*.6),f1:60,gain:1.9,send:1.2,curve:2.2});tone(tt,{f0:62,f1:22,dur:1.6,gain:1.6});noise(tt+.25,{dur:1.8,type:'bandpass',f0:500,f1:120,q:.6,gain:.4,send:1});}),
    ring:go(t=>{tone(t,{f0:1250,dur:.12,gain:.05,send:.2});}),
    deafen:go((t,amount)=>{if(!muffle)return;const f=muffle.frequency;f.cancelScheduledValues(t);f.setValueAtTime(lerp(9000,450,amount),t+.02);f.exponentialRampToValueAtTime(18000,t+1.2+amount*3.5);
     const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=rand(3400,3900);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05*amount,t+.15);g.gain.exponentialRampToValueAtTime(.0001,t+1.5+amount*3);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+5);}),
    swap:go(t=>{noise(t,{dur:.05,type:'bandpass',f0:1600,q:2,gain:.25});noise(t+.07,{dur:.03,type:'bandpass',f0:2600,q:3,gain:.25});})
   };
  })();

  /* ------------------------------------------------------------ HUD */
  function buildHUD(){
   const el=document.createElement('div');el.id='combat-hud';el.setAttribute('aria-live','polite');
   el.innerHTML=`
    <div class="ch-cross"><i class="ch-t"></i><i class="ch-b"></i><i class="ch-l"></i><i class="ch-r"></i><i class="ch-dot"></i></div>
    <svg class="ch-ring" viewBox="-60 -60 120 120" aria-hidden="true"><circle class="ch-ring-target" r="9"/><circle class="ch-ring-live" r="46"/></svg>
    <div class="ch-hit"><i></i><i></i><i></i><i></i></div>
    <div class="ch-true">TRUE SHOT</div>
    <div class="ch-toast"></div>
    <div class="ch-flash"></div>
    <div class="ch-ammo"><span class="ch-name"></span><span class="ch-count"><b></b><small></small></span><span class="ch-mag"><i></i></span><span class="ch-state"></span><span class="ch-guard" title="Guard"><i></i></span></div>
    <div class="ch-zoom"></div>
    <div class="ch-slots"></div>
    <div class="ch-scope" aria-hidden="true"><i></i></div>
    <div class="ch-hurt"></div>
    <div class="ch-score"></div>
    <div class="ch-keys">LMB FIRE · RMB MELEE · R RELOAD · 1–7 OR Q SWAP · WHEEL OR PINCH ZOOM · G DETONATE · X, 0 OR SAME NUMBER PUT AWAY</div>
    <button class="ch-lock" type="button"><strong>CLICK TO ENGAGE</strong><span>MOUSE TO AIM · ESC TO RELEASE · X TO PUT AWAY</span></button>
    <button class="ch-putaway" type="button">PUT AWAY WEAPON <b>X</b></button>`;
   hudHost.appendChild(el);
   const q=s=>el.querySelector(s);

   q('.ch-lock').onclick=e=>{e.stopPropagation();requestLock();};
   q('.ch-putaway').onclick=e=>{e.stopPropagation();holster();};
   let toastTimer=0,hitTimer=0,trueTimer=0;const cache=new Map();
   const set=(node,key,val,fn)=>{if(cache.get(key)===val)return;cache.set(key,val);fn(node,val);};
   const text=(sel,val)=>set(q(sel),sel,val,(n,v)=>{n.textContent=v;});
   const cls=(name,on)=>set(el,'c:'+name,on,(n,v)=>n.classList.toggle(name,v));
   return {el,reset(){cache.delete('active');},
    toast(text){const t=q('.ch-toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);},
    // Markers restart their CSS animation on the next frame instead of reading offsetWidth, which forced a full
    // layout of the page on every hit (a stutter in every gunfight).
    hitmarker(isTrue,kill,head=false){const h=q('.ch-hit');h.classList.remove('show','gold','kill','head');clearTimeout(hitTimer);requestAnimationFrame(()=>{h.classList.add('show');if(isTrue)h.classList.add('gold');if(head)h.classList.add('head');if(kill)h.classList.add('kill');hitTimer=setTimeout(()=>h.classList.remove('show'),kill?460:head?260:190);});},
    trueShot(){const t=q('.ch-true');t.classList.remove('show');clearTimeout(trueTimer);requestAnimationFrame(()=>{t.classList.add('show');trueTimer=setTimeout(()=>t.classList.remove('show'),700);});},
    hurt(a,angle){const f=q('.ch-hurt');f.style.setProperty('--a',angle.toFixed(2)+'rad');f.style.transition='none';f.style.opacity=Math.min(1,a);requestAnimationFrame(()=>{f.style.transition='opacity .7s ease-out';f.style.opacity=0;});},
    flash(a){const f=q('.ch-flash');f.style.transition='none';f.style.opacity=a;requestAnimationFrame(()=>{f.style.transition='opacity .9s ease-out';f.style.opacity=0;});},
    update(){
     cls('locked',locked||touchMode);
     if(!current)return;
     const w=current,s=state[w.id];
     text('.ch-name',w.name+' / '+w.kind);
     const ids=slotIds(),slotHints=ids.map((id,i)=>controlHint('weapon'+(i+1),String(i+1))),holsterHint=controlHint('holster','X / 0');
     text('.ch-keys',controlHint('fire','Left mouse')+' FIRE · '+controlHint('aim','Right mouse')+' AIM / MELEE · '+controlHint('bash','B')+' BASH (HOLD: SLAM) · '+controlHint('guard','Z')+' BLOCK · '+controlHint('reload','R')+' RELOAD · '+controlHint('swap','Q')+' SWAP · WHEEL OR PINCH ZOOM · '+controlHint('detonate','G')+' DETONATE · '+holsterHint+' PUT AWAY');
     text('.ch-lock span','MOUSE TO AIM · ESC TO RELEASE · '+holsterHint+' TO PUT AWAY');text('.ch-putaway b',holsterHint);
     set(el,'slots',ids.map(id=>id+':'+WEAPONS.find(x=>x.id===id).name).join(',')+'|'+slotHints.join(',')+'|'+holsterHint,()=>{const box=q('.ch-slots');
      // Empty hands first, then every weapon carried, each with its key and what is left in it.
      const hands=document.createElement('button');hands.dataset.id='';hands.className='ch-hands';hands.innerHTML='<b></b>EMPTY HANDS';hands.firstChild.textContent=holsterHint;hands.title='Put the weapon away ('+holsterHint+')';hands.onclick=e=>{e.stopPropagation();holster();};
      box.replaceChildren(hands,...ids.map((id,i)=>{const W=WEAPONS.find(x=>x.id===id),b=document.createElement('button');b.dataset.id=id;b.innerHTML=`<b></b><span>${W.name}</span><small></small>`;b.firstChild.textContent=slotHints[i];b.title=W.name+' / '+W.kind;b.onclick=e=>{e.stopPropagation();if(current?.id===id)holster();else equip(id);};cache.delete('ammo:'+id);return b;}));cache.delete('active');});
     set(el,'active',w.id,()=>el.querySelectorAll('.ch-slots button').forEach(b=>b.classList.toggle('active',b.dataset.id===w.id)));
     for(const b of el.querySelectorAll('.ch-slots button[data-id]:not(.ch-hands)')){const W=WEAPONS.find(x=>x.id===b.dataset.id),st=state[W.id],r=reserveOf(W);set(b.lastChild,'ammo:'+W.id,W.id==='axe'||W.id==='fists'?'':W.id==='c4'?String(arsenal?arsenal.reserve.c4||0:W.mag):st.ammo+'/'+(r===Infinity?W.mag:r),(n,v)=>{n.textContent=v;});}
     if(w.id==='axe'||w.id==='fists'){text('.ch-count b','∞');text('.ch-count small','');}
     else if(w.id==='c4'){const live=charges.filter(c=>!c.done).length;text('.ch-count b',String(arsenal?arsenal.reserve.c4||0:w.mag-live));text('.ch-count small',live?` · ${live} ARMED`:` / ${w.mag}`);}
     else{const r=reserveOf(w);text('.ch-count b',String(s.ammo));text('.ch-count small',' / '+(r===Infinity?w.mag:r)+(w.id==='pump'&&s.chamber===false&&s.ammo>0?' · PUMP':''));}
     text('.ch-state',s.action?.name==='reload'?'RELOADING':(w.id!=='axe'&&w.id!=='fists'&&w.id!=='c4'&&s.ammo===0?'EMPTY · '+controlHint('reload','R'):''));
     text('.ch-score',stats.shots?`RANGE · ${stats.hits} HITS · ${stats.trueShots} TRUE`:'');
     // Crosshair gap from spread, ring from focus
     const spreadPx=Math.max(4,currentSpread()*stage.clientHeight/(2*Math.tan(camera.fov*Math.PI/360))*1);
     set(el,'gap',Math.min(70,spreadPx).toFixed(0),(n,v)=>n.style.setProperty('--gap',v+'px'));
     const f=s.focus||0,ring=q('.ch-ring-live');
     const r=lerp(46,9,f)+(s.breath>0?Math.sin(lastTime*24)*s.breath*3:0);
     set(ring,'ring',Math.max(8.5,r).toFixed(1),(n,v)=>n.setAttribute('r',v));
     cls('focusing',false); // the crosshair gap shows the spread; a gold dot means settled (TRUE SHOT)
     cls('window',inWindow());cls('winded',(s.breath||0)>.05);
     // Guard: a bar that shows while the block is up or still recovering, red once broken.
     if(guard){const g=q('.ch-guard');set(g.firstChild,'guard',guard.stamina.toFixed(0),(n,v)=>{n.style.width=v+'%';});g.classList.toggle('show',guard.raised||guard.stamina<99||guard.broken());g.classList.toggle('up',guard.raised);g.classList.toggle('broken',guard.broken());cls('guarding',guard.raised);}
     cls('ads',adsBlend>.6&&w.id!=='axe');text('.ch-zoom',adsBlend>.05&&zoomOf(w)?(1+(zoomOf(w)-1)*adsBlend).toFixed(1)+'×'+(scoped?(breath.tired>0?' · RECOVERING':shiftHeld&&breath.hold>0?' · HOLDING '+Math.ceil(BREATH_HOLD-breath.hold):' · '+controlHint('sprint','Shift')+' STEADY'):''):'');
     set(q('.ch-mag i'),'mag',w.mag?(s.ammo/w.mag*100).toFixed(0):'0',(n,v)=>{n.style.width=v+'%';n.parentNode.classList.toggle('low',+v<=25);});cls('melee',w.id==='axe'||w.id==='c4');
    }
   };
  }

  /* ------------------------------------------------------------ weapon state machine */
  let handsBusy=false,adsBlend=0,sprintBlend=0,equipBlend=0,zoomTarget=0,lateral=0,stepDip=0,shiftHeld=false,breath={hold:0,tired:0},sprayIndex=0;
  // Sniper: hold Shift while scoped to steady your breath (4 s), then the sway comes back stronger while you recover.
  const BREATH_HOLD=4,BREATH_TIRED=3;
  // Free aim (the body-camera view in Beyond Eden, o.freeAim): the hands move inside a dead zone in the frame before the
  // view turns, and shots, blows and aim assist follow where the muzzle points rather than the middle of the screen.
  // x/y: the muzzle's angle off the look (radians); yaw/pitch: the look as last sent to the host (recoil included);
  // view/local: that angle as a rotation in the weapon camera's space and in the main camera's.
  const FREE_ZONE={x:.1,y:.075,soft:.3};
  const TURN_SHARE=1; // how much of a quick turn goes straight to the view (the rest moves the gun in the frame first)
  const free={on:false,x:0,y:0,yaw:0,pitch:0,view:new T.Quaternion(),local:new T.Quaternion(),dir:new T.Vector3(),screen:{x:0,y:0}},freeTmp=new T.Vector3(),freeInv=new T.Quaternion(),FREE_FWD=new T.Vector3(0,0,-1);
  const freeZone=()=>{const k=1-clamp(adsBlend/.8,0,1);return k*k*(3-2*k);};
  // Whatever lies outside the zone (it shrinks to nothing down the sights) is handed to the view, so the muzzle keeps its direction.
  function freeClamp(){const k=freeZone(),lx=FREE_ZONE.x*k,ly=FREE_ZONE.y*k;if(k<.02){yaw+=free.x;pitch=clamp(pitch+free.y,-1.35,1.35);free.x=free.y=0;return;}
   const r=Math.hypot(free.x/lx,free.y/ly);if(r>1){const cx=free.x/r,cy=free.y/r;yaw+=free.x-cx;pitch=clamp(pitch+free.y-cy,-1.35,1.35);free.x=cx;free.y=cy;}}
  // Look input in radians. Near the edge of the zone a growing share of an outward push turns the view instead.
  function freeLook(dx,dy){
   if(dy<0&&recoilDebt.y>0)recoilDebt.y=Math.max(0,recoilDebt.y+dy);if(dy<0&&recoilDebt.by>0)recoilDebt.by=Math.max(0,recoilDebt.by+dy);
   if(dx&&Math.sign(dx)!==Math.sign(recoilDebt.x))recoilDebt.x=Math.abs(dx)>=Math.abs(recoilDebt.x)?0:recoilDebt.x+dx;if(dx&&Math.sign(dx)!==Math.sign(recoilDebt.bx))recoilDebt.bx=Math.abs(dx)>=Math.abs(recoilDebt.bx)?0:recoilDebt.bx+dx;
   if(!free.on){yaw+=dx;pitch=clamp(pitch+dy,-1.35,1.35);return;}
   const k=freeZone(),lx=FREE_ZONE.x*k||1e-6,ly=FREE_ZONE.y*k||1e-6,r=Math.hypot(free.x/lx,free.y/ly),outward=dx*free.x/(lx*lx)+dy*free.y/(ly*ly)>0;
   let share=0;if(outward){const t=clamp((r-FREE_ZONE.soft)/(1-FREE_ZONE.soft),0,1);share=t*t*(3-2*t);}
   // A quick turn goes straight to the view, as it did before free aim: only slow, small movements move the gun in the frame.
   {const fast=clamp((Math.hypot(dx,dy)-.002)/.006,0,1);share=Math.max(share,TURN_SHARE*fast*fast*(3-2*fast));}
   yaw+=dx*share;pitch=clamp(pitch+dy*share,-1.35,1.35);free.x+=dx*(1-share);free.y+=dy*(1-share);freeClamp();
  }
  function freeUpdate(dt,sprinting){
   // Phones keep a fixed crosshair: a thumb drag turns the view, it never walks the gun around the frame.
   const on=armed&&!touchMode&&!!o.freeAim?.()&&!((o.thirdPerson?.()||0)>.35);
   if(on!==free.on){free.on=on;document.body.classList.toggle('bodycam-aim',on);if(!on){if(armed){free.endX=free.x;free.endY=free.y;}else{yaw+=free.x;pitch=clamp(pitch+free.y,-1.35,1.35);}free.x=free.y=0;}else{free.endX=free.endY=0;}}
   // The view comes round to where the muzzle was instead of jumping there.
   if(free.endX||free.endY){const k=armed?1-Math.exp(-16*dt):1,dx=free.endX*k,dy=free.endY*k;yaw+=dx;pitch=clamp(pitch+dy,-1.35,1.35);free.endX-=dx;free.endY-=dy;if(Math.hypot(free.endX,free.endY)<.0005)free.endX=free.endY=0;}
   if(!on)return;
   // Sprinting, or hands on a ledge: the weapon comes back to the middle of the body, and the view comes round to where it pointed.
   if(sprinting||handsBusy){const k=Math.exp(-4*dt),nx=free.x*k,ny=free.y*k;yaw+=free.x-nx;pitch=clamp(pitch+free.y-ny,-1.35,1.35);free.x=nx;free.y=ny;}
   freeClamp();
  }
  // Where shots and blows go: along the muzzle with free aim, else along the camera.
  function aimForward(v=new T.Vector3()){if(!free.on)return v.set(0,0,-1).applyQuaternion(camera.quaternion);const y=free.yaw+free.x,p=clamp(free.pitch+free.y,-1.5,1.5);return v.set(Math.sin(y)*Math.cos(p),Math.sin(p),-Math.cos(y)*Math.cos(p));}
  function aimRight(v=new T.Vector3()){if(!free.on)return v.set(1,0,0).applyQuaternion(camera.quaternion);const y=free.yaw+free.x;return v.set(Math.cos(y),0,Math.sin(y));}
  function aimUp(v=new T.Vector3()){if(!free.on)return v.set(0,1,0).applyQuaternion(camera.quaternion);return v.crossVectors(aimRight(freeTmp),aimForward(free.dir)).normalize();}
  // Once the camera is final for the frame: the muzzle direction in camera space (turn lag and sway put the lens a little
  // off the look), for the hands, the weapon camera (its own narrower lens: the angle is rescaled so the muzzle sits over
  // the point it will hit) and the hit marker.
  // The stage's size, kept by a ResizeObserver: reading clientWidth every frame forced a layout whenever the HUD
  // had changed text earlier in the frame.
  const stageSize={w:stage.clientWidth,h:stage.clientHeight};if(window.ResizeObserver)new ResizeObserver(()=>{stageSize.w=stage.clientWidth;stageSize.h=stage.clientHeight;}).observe(stage);
  function syncAim(){
   if(!free.on){free.view.identity();free.local.identity();free.screen.x=free.screen.y=0;if(fistArms?.aim)fistArms.aim(null);return;}
   aimForward(free.dir);freeTmp.copy(free.dir).applyQuaternion(freeInv.copy(camera.quaternion).invert());if(freeTmp.z>-.2)freeTmp.set(0,0,-1);
   free.local.setFromUnitVectors(FREE_FWD,freeTmp);
   const half=Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1),ratio=viewCamera?Math.tan(viewCamera.fov*Math.PI/360)/half:1,tx=freeTmp.x/-freeTmp.z,ty=freeTmp.y/-freeTmp.z;
   free.screen.x=tx/(half*camera.aspect);free.screen.y=ty/half;
   freeTmp.set(tx*ratio,ty*ratio,-1).normalize();free.view.setFromUnitVectors(FREE_FWD,freeTmp);
   fistArms?.aim?.(free.local);
   if(hud?.el){const h=stageSize.h*.5,w=stageSize.w*.5,x=(free.screen.x*w).toFixed(0),y=(-free.screen.y*h).toFixed(0),key=x+','+y;if(key!==free.shown){free.shown=key;hud.el.style.setProperty('--aim-x',x+'px');hud.el.style.setProperty('--aim-y',y+'px');}}
  }
  // Where the picture is taken from: the chest lens in Beyond Eden sits below the eyes the camera rests at between frames.
  function lensPosition(v){camera.getWorldPosition(v);v.y-=o.lensDrop?.()||0;return v;}
  const viewToWorld=v=>camera.localToWorld(v.applyQuaternion(free.view));
  // Rifle and SMG recoil you can learn while aiming: the muzzle climbs, then walks right, left and right again.
  const SPRAY=[0,.2,.45,.6,.35,-.1,-.5,-.75,-.55,-.1,.35,.7,.8,.5,.1,-.3,-.6,-.6,-.3,0];
  document.addEventListener('keydown',e=>{if(!inputBlocked(e)&&inputKey(e)==='shift')shiftHeld=true;});
  document.addEventListener('keyup',onKeyUp);
  root.addEventListener('blur',releaseInputs);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseInputs();});
  root.edenControls?.onChange(()=>{releaseInputs();hud?.update();});
  // Zoom by scrolling the wheel, a two-finger trackpad scroll or pinch, or pinching a touch screen: the weapon comes up
  // to the sights and the view narrows to the weapon's magnification. Heavier weapons sway more, bob harder, swing
  // further behind your turns, come up to the sights slower and slow you down.
  const ZOOM={pistol:1.35,smg:1.55,pump:1.3,rifle:2.2,sniper:4.6},zoomOf=w=>w?.zoom??ZOOM[w?.id];
  // Gun feel, tuned Battlefield-style on purpose (moderate time to kill, heavier recoil with sideways randomness, gentle
  // damage falloff, bullets that travel and drop, suppression). Recoil: every gun climbs along its own learnable pattern
  // (up, then side to side), scaled by `kick` radians a shot, with a first-shot kick, a little random sideways jitter on
  // top, and after a burst the view gives back `recover` of what it climbed: you pull down for the rest.
  const BF={
   pattern:{pistol:[[1,.15],[1,-.1],[1.1,.2],[1,-.25]],
    smg:[[1,.2],[.9,.3],[.8,-.1],[.8,-.35],[.7,-.2],[.7,.25],[.75,.4],[.7,.1],[.7,-.3],[.65,-.4]],
    rifle:[[1,.25],[1,.35],[.9,.1],[.9,-.3],[.85,-.5],[.8,-.2],[.8,.3],[.85,.55],[.8,.2],[.8,-.4],[.8,-.55],[.75,-.1]],
    pump:[[1,.1]],sniper:[[1,.05]]},
   // (no entry: never waits after a sprint)
   kick:{pistol:.013,smg:.0085,rifle:.0125,pump:.045,sniper:.06},
   jitter:{pistol:.35,smg:.5,rifle:.55,pump:.3,sniper:.2},
   first:{pistol:1.2,smg:1.3,rifle:1.6,pump:1,sniper:1},
   recover:.45,
   ads:{pistol:.18,smg:.2,pump:.28,rifle:.3,sniper:.42},
   swap:{pistol:.32,smg:.42,pump:.5,rifle:.5,sniper:.6,axe:.4,c4:.35,fists:.25},
   sprintFire:{pistol:.14,smg:.18,pump:.24,rifle:.26,sniper:.34},
   speed:{pistol:360,smg:400,rifle:715,sniper:850},
   falloff:{pistol:[18,55,.6],smg:[15,60,.55],rifle:[40,140,.7]},
   tracerEvery:{rifle:3,smg:4,sniper:1,pistol:4,pump:2},
   bloom:{smg:.0022,rifle:.0028}
  };
  const recoilDebt={x:0,y:0,back:0,bx:0,by:0};let sprintEndAt=-9,suppress=0,shotCount=0,flightEpoch=0,shownSuppress='';const flights=[];
  const resetRecoil=()=>{recoilDebt.x=recoilDebt.y=recoilDebt.bx=recoilDebt.by=recoilDebt.back=0;};
  const cancelInspect=()=>{const a=current&&state[current.id]?.action;if(a?.name==='inspect')state[current.id].action=null;};
  const falloff=(id,d)=>{const f=BF.falloff[id];if(!f)return 1;return d<=f[0]?1:d>=f[1]?f[2]:lerp(1,f[2],(d-f[0])/(f[1]-f[0]));};
  const WEIGHT={pistol:.2,smg:.45,pump:.62,rifle:.72,sniper:.95,axe:.55,c4:.15};
  const zoomable=()=>!!(current&&zoomOf(current));
  const setting=(k,d)=>window.edenSettings?.get(k)??d;
  const lookScale=()=>setting('sens',1)*lerp(1,setting('adsSens',1),adsBlend),ySign=()=>setting('invertY',false)?-1:1;
  function nudgeZoom(d){if(!zoomable())return false;zoomTarget=clamp(zoomTarget+d,0,1);if(zoomTarget<.04)zoomTarget=0;requestFrame();return true;}
  const anim={posX:new Spring(220,22),posY:new Spring(220,22),posZ:new Spring(260,20),rotX:new Spring(240,20),rotY:new Spring(200,20),rotZ:new Spring(200,20),swayX:new Spring(90,12),swayY:new Spring(90,12),land:new Spring(140,10)};
  function resetState(){for(const w of WEAPONS)state[w.id]={ammo:w.mag,chamber:true,focus:0,windowT:0,breath:0,action:null,lastFire:-9,slide:0};}
  // Hip-fire only (no aim-down-sights, no zoom, no scope). Accuracy settles by itself when you are not firing or
  // sprinting; a fully settled shot is a TRUE SHOT. Spraying blooms the spread, as in CS; moving costs a little.
  function inWindow(){if(!current)return false;const s=state[current.id];return s.focus>=1&&speedSmoothed<(adsBlend>.6?3:2.2);}
  function currentSpread(){
   if(!current)return 0;const s=state[current.id],mv=movementInfo();
   const W=current;let base=W.hip!=null?lerp(W.hip,W.aim,s.focus)+(s.heat||0)*(W.heat||0)*8:current.id==='pump'?lerp(.085,.045,s.focus):current.id==='pistol'?lerp(.022,.0025,s.focus):.02;
   base+=mv.speed*(current.id==='pistol'?.002:current.id==='pump'?.004:current.id==='sniper'?.012:.0045)*(1-adsBlend*.5)+(mv.airborne?(current.id==='pistol'?.025:.05):0);
   // Long bursts open the cone; crouching closes it; being shot at (suppression) opens it.
   if(current.auto)base+=Math.min(14,sprayIndex)*(BF.bloom[current.id]||0)*lerp(1,.5,adsBlend);
   base*=lerp(1,.72,mv.crouch||0)*(1+.9*suppress);
   // Aiming down the sights tightens everything (the shotgun's pattern least).
   return base*lerp(1,current.id==='pump'?.7:.4,adsBlend);
  }
  function movementInfo(){const m=o.movement?.()||{};return {speed:speedSmoothed,sprinting:!!m.sprinting&&speedSmoothed>1,airborne:!!m.airborne,crouch:m.crouch||0};}
  function startAction(name,duration,data={}){const s=state[current.id];s.action={name,t:0,duration,...data};o.onAction?.(name,current.id,duration);}
  function canFire(){if(!current||!(locked||touchMode)||!o.canAct()||guard?.raised)return false;const s=state[current.id];if(equipBlend<.85&&current.id!=='fists')return false;if(s.action?.name==='inspect')s.action=null;if(s.action&&!(s.action.name==='reload'&&current.id==='pump'))return false;if(BF.sprintFire[current.id]!=null&&lastTime-sprintEndAt<BF.sprintFire[current.id])return false;return lastTime-s.lastFire>=current.interval*(current.id==='pump'?lerp(1,.72,adsBlend):1);}
  function reserveOf(w){if(!w.ammo)return Infinity;if(!arsenal)return Infinity;return arsenal.reserve[w.ammo]||0;}

  // Aim assist: a wider visible-target cone, stable target preference, slower
  // look over targets, and bounded tracking while firing, aiming or moving.
  const ASSIST_BASE={cone:.085,coneAds:.055,magnet:.9,frictionCone:.13,friction:.46,pull:3.2,range:90},ASSIST={...ASSIST_BASE};let assistStrength=1;
  function configureAssist(){const selected=window.edenSettings?.get('aimAssist')||'high';assistStrength=({off:0,low:.5,medium:1,high:1.35})[selected]??1;for(const k of ['cone','coneAds','frictionCone'])ASSIST[k]=ASSIST_BASE[k]*Math.sqrt(assistStrength);ASSIST.magnet=Math.min(.97,ASSIST_BASE.magnet*assistStrength);ASSIST.friction=Math.max(.6,1-(1-ASSIST_BASE.friction)*assistStrength*.6);ASSIST.pull=ASSIST_BASE.pull*assistStrength;}
  configureAssist();window.edenSettings?.on(k=>{if(!k||k==='aimAssist')configureAssist();});
  const assist={target:null,angle:Infinity,point:new T.Vector3(),head:false,dist:0,friction:1},asEye=new T.Vector3(),asFwd=new T.Vector3(),asTo=new T.Vector3();
  // Line of sight to an assist point, cached for a tenth of a second while neither you nor the point move much:
  // a full scenery ray per target point per frame was most of a gunfight's CPU time.
  const assistSight=new Map();
  function assistSees(t,pointIndex,p,d){
   const key=t.c||t;let e=assistSight.get(key);if(!e){e=[null,null];assistSight.set(key,e);}
   const c=e[pointIndex];
   if(c&&lastTime-c.at<.12&&c.p.distanceToSquared(p)<.09&&c.eye.distanceToSquared(asEye)<.09)return c.ok;
   const obstacle=worldHits(asEye,asTo,d),ok=!(obstacle&&obstacle.distance<d-.25);
   if(assistSight.size>64)assistSight.clear();
   e[pointIndex]={at:lastTime,ok,p:p.clone(),eye:asEye.clone()};return ok;
  }
  function assistScan(){
   const previous=assist.target?.c;assist.target=null;assist.angle=Infinity;assist.friction=1;let best=Infinity;
   const list=armed&&zoomable()&&assistStrength?o.aimTargets?.():null;if(!list?.length)return;
   lensPosition(asEye);aimForward(asFwd);const far=Math.min(ASSIST.range,current?.range||160);
   for(const t of list)for(let pointIndex=0;pointIndex<2;pointIndex++){const p=pointIndex?t.head:t.chest;if(!p)continue;asTo.copy(p).sub(asEye);const d=asTo.length();if(d<.65||d>far)continue;asTo.divideScalar(d);const a=Math.acos(clamp(asTo.dot(asFwd),-1,1)),score=a*(previous&&previous===t.c? .8:1)*(pointIndex?1.12:1);
    if(a>ASSIST.frictionCone||score>=best)continue;
    if(!assistSees(t,pointIndex,p,d))continue;
    best=score;assist.angle=a;assist.target=t;assist.point.copy(p);assist.head=!!pointIndex;assist.dist=d;
   }
   if(assist.target&&assist.angle<ASSIST.frictionCone)assist.friction=lerp(ASSIST.friction,1,assist.angle/ASSIST.frictionCone);
  }
  // Each enemy keeps a voice: pitch and vowel colour from its id.
  const voiceOf=c=>{const id=String(c?.id??c?.name??'x');let h=7;for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;return (h%1000)/1000;};
  const lastPain=new WeakMap();
  function fire(){
   const w=current,s=state[w.id];
   if(w.id==='fists'){punch(false);return;}
   if(w.id==='axe'){if(s.action)return;const heavy=inWindow();startAction('swing',meleeMove(heavy?'cleave':'chop').recover,{heavy,hit:false});sfx.whoosh(heavy);meleeLunge(heavy?'cleave':'chop');s.focus=0;s.windowT=0;return;}
   if(w.id==='c4'){if(s.action)return;if(throwCharge()){startAction('throw',.55);}return;}
   if(s.action?.name==='reload'&&w.id==='pump'){s.action.cancel=true;return;}
   if(w.id==='pump'&&!s.chamber){if(s.ammo>0&&!s.action){startAction('pump',.42);}else sfx.dry();return;}
   if(models[w.id].pending){hud.toast('LOADING '+w.name+'…');return;}
   if(s.ammo<=0){sfx.dry();s.lastFire=lastTime;if(!w.auto||!s.dryWarned){hud.toast(reserveOf(w)>0?'EMPTY · PRESS R':'NO '+w.ammo.toUpperCase()+' AMMO');s.dryWarned=true;}return;}
   const isTrue=inWindow();
   s.ammo--;s.lastFire=lastTime;stats.shots++;
   // The last quarter of a magazine rattles, higher for each round left; the last one rings.
   if(w.mag>=5&&s.ammo<=Math.ceil(w.mag*.25))setTimeout(()=>sfx.click(s.ammo===0?3400:2100+s.ammo*90,s.ammo===0?.32:.16),45);o.onAction?.('shoot',w.id,.25);
   const origin=lensPosition(new T.Vector3()),forward=aimForward();
   const right=aimRight(),up=aimUp();
   const spread=isTrue?(w.id==='pump'?.022:0):currentSpread();if(w.heat)s.heat=Math.min(1,(s.heat||0)+.12);
   const pellets=w.id==='pump'?9:1;
   const muzzleView=models[w.id].parts.muzzle.getWorldPosition(new T.Vector3());const muzzleWorld=viewToWorld(muzzleView.clone());
   let voiced=false;
   // Aim assist: bend the shot toward a target inside the cone, if nothing stands between.
   assistScan();if(assist.target&&assist.angle<lerp(ASSIST.cone,ASSIST.coneAds,adsBlend)){const to=assist.point.clone().sub(origin).normalize(),los=worldHits(origin,to,assist.dist);if(!los||los.distance>assist.dist-.6)forward.lerp(to,ASSIST.magnet).normalize();}
   for(let i=0;i<pellets;i++){
    const a=Math.random()*TAU,r=Math.sqrt(Math.random())*spread;
    const dir=forward.clone().addScaledVector(right,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r).normalize();
    const range=w.range||160,fl=flight(origin,dir,range,w),h=fl.h,ch=fl.ch,showTracer=i===0&&(BF.tracerEvery[w.id]??1)>0&&shotCount%(BF.tracerEvery[w.id]||1)===0||w.id==='pump'&&i<2;
    // A round with a long way to go lands when it gets there (and has dropped on the way).
    const land=()=>{
    if(ch){stats[ch.head?'headHits':'bodyHits']++;const dmg=w.dmg*(isTrue?1.25:1)*(ch.head?(w.id==='sniper'?2.5:1.8):1)*(w.id==='pump'?clamp(1.25-ch.distance/30,.35,1.1):1)*falloff(w.id,fl.distance);const r=ch.apply(dmg,{head:ch.head,isTrue,weapon:w.id});if(r?.killed)stats.kills++;bloodPuff(ch.point,dir);hud.hitmarker(isTrue||ch.head,r?.killed,ch.head);
     // The body answers: a meaty impact, a hit tick, and a grunt or a scream (one voice per shot, pellets included).
     if(!voiced){voiced=true;sfx.flesh(ch.point,ch.head,r?.killed);sfx.hitTick(ch.head,r?.killed);const v=voiceOf(ch.c);if(r?.killed)sfx.scream(ch.point,v);else if(!ch.c||lastTime-(lastPain.get(ch.c)??-9)>.4){sfx.pain(ch.point,v,dmg);if(ch.c)lastPain.set(ch.c,lastTime);}}if(r?.killed){state.hitStop=.06;o.hitStop?.(70);look.shake=Math.max(look.shake,.2);}else if(ch.head)o.hitStop?.(28);return;}
    if(h)impact(h,fl.dir,(w.id==='pump'?.45:1)*(isTrue?2:1),isTrue);};
    if(showTracer)tracer(muzzleWorld,fl.end,isTrue);
    if(fl.time>.034){const who=ch?.c,life=who?.deaths||0,epoch=flightEpoch;flights.push({at:lastTime+fl.time,land,ok:()=>epoch===flightEpoch&&(!who||who.alive&&(who.deaths||0)===life)});}else land();
   }
   shotCount++;
   if(isTrue){hud.trueShot();}
   // Muzzle flash (view + world light), smoke
   state.flash=1;state.flashVariant=Math.floor(Math.random()*(tx.flashes?.length||1));state.flashRot=rand(0,TAU);state.flashScale=rand(.85,1.2);flashLight.position.copy(muzzleWorld);o.onMuzzleFlash?.(w.id);
   for(let i=0;i<(w.id==='pump'?2:1);i++)spawnFlip('wisp',{pos:muzzleWorld.clone().addScaledVector(forward,.05+i*.08),size:[w.id==='pump'?.22:.14,w.id==='pump'?.75:.45],life:rand(1.1,1.6),loop:28,start:rand(0,63),fadeIn:.06,alpha:w.id==='pump'?.5:.38,vel:forward.clone().multiplyScalar(rand(.5,1.2)).add(new T.Vector3(0,.12,0)),rise:.18,drag:1.6,spin:rand(-.4,.4),tint:0xd9d4cb});
   barrelShot(w.id);
   (sfx[w.snd||w.id]||sfx.pistol)(isTrue);sfx.weight(w.id);
   // Recoil
   const recovery=RECOIL_RECOVERY[w.id]||RECOIL_RECOVERY.pistol;look.kickPitch.k=recovery[0];look.kickPitch.d=recovery[1];look.kickYaw.k=recovery[0]*1.15;look.kickYaw.d=recovery[1];look.fovPulse=Math.max(look.fovPulse||0,recovery[2]);
   const rec=w.rec||(w.id==='pump'?{z:1.7,x:4.6,yaw:.035,pitch:.06}:{z:1.1,x:3.2,yaw:.012,pitch:.022});
   const adsK=lerp(1,.6,adsBlend);
   anim.posZ.kick(rec.z*adsK);anim.rotX.kick(rec.x*adsK);anim.rotY.kick(rand(-1,1)*rec.x*.15);anim.rotZ.kick(rand(-1,1)*rec.x*.2);
   if(lastTime-(state.lastSprayShot??-9)>Math.max(.35,w.interval*2.2))sprayIndex=0;state.lastSprayShot=lastTime;
   // The view itself climbs (and stays climbed); the springs add the snap on top and settle.
   {const P=BF.pattern[w.id]||BF.pattern.pistol,step=sprayIndex<P.length?P[sprayIndex]:P[Math.max(0,P.length-4)+((sprayIndex-P.length)%Math.min(4,P.length))];
    const k=(BF.kick[w.id]||.012)*(touchMode?.55:1)*(sprayIndex===0?(BF.first[w.id]||1):1)*lerp(1,.78,adsBlend)*lerp(1,.75,movementInfo().crouch||0),up=k*step[0],side=k*(step[1]+rand(-1,1)*(BF.jitter[w.id]||.3));
    const before=pitch;pitch=clamp(pitch+up,-1.35,1.35);yaw+=side;recoilDebt.y+=pitch-before;recoilDebt.x+=side;recoilDebt.back=0;}
   look.kickPitch.kick(rec.pitch*10*adsK);look.kickYaw.kick(rand(-1,1)*rec.yaw*8*adsK);sprayIndex++;
   look.shake=Math.max(look.shake,{pump:.34,sniper:.42,rifle:.13,smg:.09,pistol:.11}[w.id]||.1);
   s.focus=Math.min(s.focus,.25);s.windowT=0;s.breath=0;
   if(w.id==='pistol'){s.slideT=0;ejectShell('pistol');if(s.ammo===0)s.lockedBack=true;}
   if(w.id==='smg'||w.id==='rifle')ejectShell('pistol');
   if(w.id==='sniper'&&s.ammo>0)setTimeout(()=>{if(current?.id==='sniper'&&!state.sniper.action)startAction('bolt',.85);},260);
   if(w.id==='pump'){s.chamber=false;const quick=lerp(1,.72,adsBlend);if(s.ammo>0)setTimeout(()=>{if(current?.id==='pump'&&!state.pump.action)startAction('pump',.42*quick);},170*quick);}
   requestFrame();
  }

  // Body camera: after three or more quick shots the hot barrel smokes for a moment once you stop, a thin wisp off the muzzle
  // that keeps your pace at first and then falls behind (not with reduced motion).
  const hot={quick:0,last:-9,until:-9,next:0,k:0,span:1,id:null,seen:false},barrelAt=new T.Vector3(),barrelVel=new T.Vector3();
  function barrelShot(id){
   if(!real()||o.reduced||id==='axe'||id==='fists'||id==='c4'){hot.quick=0;return;}
   hot.quick=lastTime-hot.last<.45&&hot.id===id?hot.quick+1:1;hot.last=lastTime;hot.id=id;
   if(hot.quick>=3){hot.k=Math.min(1,.45+hot.quick*.06);hot.span=lerp(1.3,2.6,hot.k);hot.until=lastTime+hot.span;}
  }
  // Where the muzzle is on the picture, as a point in the world (taken while the frame is drawn, when the lens and the weapon
  // are where the picture sees them; the next update spawns from it): the weapon camera has its own narrower lens, so its view-space
  // position is spread out by the ratio of the two before it is placed in front of the body camera's lens.
  function muzzleOnLens(out){const m=models[current.id];m.holder.updateMatrixWorld(true);m.parts.muzzle.getWorldPosition(out).applyQuaternion(free.view);
   const k=Math.tan(camera.fov*Math.PI/360)/(camera.zoom||1)/Math.tan(viewCamera.fov*Math.PI/360);out.x*=k;out.y*=k;camera.localToWorld(out);return out;}
  function updateBarrel(){
   if(hot.until<=lastTime)return;
   if(!armed||current?.id!==hot.id||!real()||o.reduced||!models[hot.id]?.parts?.muzzle){hot.until=-9;return;}
   if(lastTime-hot.last<.12||lastTime<hot.next)return;hot.next=lastTime+.075;
   if(!hot.seen)return;const left=(hot.until-lastTime)/hot.span;barrelVel.copy(bodyVel).multiplyScalar(.9);barrelVel.x+=rand(-.03,.03);barrelVel.y+=rand(.08,.16);barrelVel.z+=rand(-.03,.03);
   spawnFlip('wisp',{pos:barrelAt,size:[.05,rand(.24,.34)],life:rand(1.1,1.6),loop:16,start:rand(0,63),fadeIn:.12,alpha:.9*hot.k*Math.min(1,left*1.6),vel:barrelVel,rise:.2,drag:.9,spin:rand(-.7,.7),tint:[2.3,2.25,2.2],near:[.04,.16],soft:.05});
  }

  // Where a round goes: straight for a shotgun, otherwise a falling arc in up to four straight pieces (world and
  // characters tested on each), and how long it takes to get there.
  const flUp=new T.Vector3(0,1,0),flA=new T.Vector3(),flB=new T.Vector3(),flD=new T.Vector3();
  function flight(origin,dir,range,w){
   const v=BF.speed[w.id];
   if(!v){const h=worldHits(origin,dir,range),ch=o.shotHook?.(origin,dir,h?h.distance:range,{weapon:w.id,player:true});const d=ch?ch.distance:h?h.distance:range;return {h:ch?null:h,ch,dir,distance:d,time:0,end:ch?ch.point:h?h.point:origin.clone().addScaledVector(dir,range)};}
   const n=range>60?4:2,drop=d=>4.905*(d/v)**2;flA.copy(origin);let travelled=0;
   for(let k=1;k<=n;k++){const d=range*k/n;flB.copy(origin).addScaledVector(dir,d).addScaledVector(flUp,-drop(d));flD.copy(flB).sub(flA);const len=flD.length();flD.multiplyScalar(1/len);
    const h=worldHits(flA,flD,len),ch=o.shotHook?.(flA,flD,h?h.distance:len,{weapon:w.id,player:true});
    if(ch||h){const at=travelled+(ch?ch.distance:h.distance);return {h:ch?null:h,ch,dir:flD.clone(),distance:at,time:at/v,end:(ch?ch.point:h.point).clone()};}
    travelled+=len;flA.copy(flB);}
   return {h:null,ch:null,dir:flD.clone(),distance:range,time:range/v,end:flA.clone()};
  }
  function reload(){
   cancelInspect();
   if(!current||!(locked||touchMode))return;const w=current,s=state[w.id];
   if(w.id==='axe'||w.id==='fists'||w.id==='c4'||s.action||s.ammo>=w.mag&&(w.id!=='pump'||s.chamber))return;
   const have=reserveOf(w);if(have<=0){hud.toast('NO '+w.ammo.toUpperCase()+' AMMO');return;}
   if(w.id==='pistol'){startAction('reload',s.lockedBack?1.62:1.4,{dropped:false,inserted:false,slap:s.lockedBack});}
   if(w.id==='pump'){const need=Math.min(w.mag-s.ammo,have);startAction('reload',.35+need*.48,{loaded:0,need,wasEmpty:!s.chamber});}
   if(w.id==='smg'||w.id==='rifle'||w.id==='sniper'){const empty=s.ammo===0;startAction('reload',(w.id==='sniper'?2.3:1.9)*(empty?1.12:.82),{inserted:false,wasEmpty:empty});} // a tactical reload skips the charging handle
  }

  // Reloading with hands that weigh something: the weapon sags as the support hand leaves it and rides on the wrist, gets
  // lighter when the magazine drops, and is knocked up and settles when the new one is driven home. Timing is untouched.
  let wasRunning=false;
  function reloadWeight(w,a,out){
   if(a.name!=='reload'||!real())return;const h=1+(WEIGHT[w.id]||0)*1.1,away=clamp(w.id==='pump'?a.leftAway==null?0:1-a.leftAway:a.leftAway||0,0,1),t=a.t;
   out.y-=.010*away*h;out.rx-=.045*away*h;out.rz+=.02*Math.sin(t*5.2)*away;out.x+=.0035*Math.sin(t*3.7+1)*away;out.ry+=.015*Math.sin(t*2.9)*away;
   if(o.reduced)return;
   if((a.dropped||a.out)&&!a.felt){a.felt=true;anim.posY.kick(-.7);anim.rotX.kick(.9);}
   if(a.inserted&&!a.seated){a.seated=true;anim.posY.kick(-.9*h);anim.rotX.kick(1.6*h);anim.posZ.kick(.5);look.shake=Math.max(look.shake,.06);}
   if(a.loaded!=null&&a.loaded!==(a.feltLoad||0)){a.feltLoad=a.loaded;anim.rotX.kick(.7);anim.posZ.kick(.3);}
   if((a.slapped||a.charged)&&!a.racked){a.racked=true;anim.rotZ.kick(1.1);anim.posY.kick(.5*h);look.shake=Math.max(look.shake,.05);}
  }
  function updateAction(dt){const w=current,a=state[w.id].action,out=poseAction(dt);if(a)reloadWeight(w,a,out);return out;}
  function poseAction(dt){
   {const st=state[current.id].action;if(st?.name==='inspect'){st.t+=dt;const e=Math.sin(Math.min(1,st.t/st.duration)*Math.PI);if(st.t>=st.duration)state[current.id].action=null;const o2={x:-.05*e,y:.035*e,z:.04*e,rx:.12*e,ry:-.95*e+Math.sin(st.t*2.4)*.12*e,rz:.55*e};return o2;}}
   const w=current,s=state[w.id],m=models[w.id],P=m.parts,a=s.action;
   const out={x:0,y:0,z:0,rx:0,ry:0,rz:0};
   // Pistol slide cycle
   if(w.id==='pistol'){
    s.slideT=(s.slideT??1)+dt;const st=s.slideT;let back=st<.035?st/.035:st<.09?1-(st-.035)/.055:0;if(s.lockedBack)back=Math.max(back,st>.035?.92:back);
    if(P.glb)P.slide.position.z=.02*back;else P.slide.position.x=-.026*back;if(P.trigger)P.trigger.rotation.z=st<.05?-.18:0;
   }
   if(!a)return out;
   a.t+=dt;const t=a.t,k=t/a.duration;
   if(a.name==='pump'){
    const b=seg(t,0,.16),f=seg(t,.2,.36);const pos=easeOut(b)*(1-easeOut(f));
    if(P.glb)P.fore.position.z=.085*pos;else P.fore.position.x=-.085*pos;out.z+=.012*pos;out.rz+=.08*pos;out.rx+=-.03*pos;
    if(t>=.12&&!a.ejected){a.ejected=true;ejectShell('pump');sfx.rack(true);}
    if(t>=.3&&!a.closed){a.closed=true;sfx.rack(false);if(s.ammo>0)s.chamber=true;}
   }
   if(a.name==='reload'&&w.id==='pistol'&&P.glb){
    // Tilt the grip toward the support hand; old mag drops; hand fetches a fresh one, seats it with a slap, returns.
    const tilt=smooth(seg(t,0,.22))*(1-smooth(seg(t,a.duration-.3,a.duration)));
    out.ry+=.55*tilt;out.rz+=.35*tilt;out.rx+=.08*tilt;out.y+=.035*tilt;out.x+=-.05*tilt;out.z+=.03*tilt;
    const ax=P.magAxis;
    if(t<.5){const d=easeIn(seg(t,.16,.42));P.mag.visible=t>.16&&t<.42;P.mag.position.copy(P.magHome).addScaledVector(ax,.16*d);}
    else{const r=1-easeOut(seg(t,.52,.92));P.mag.visible=true;P.mag.position.copy(P.magHome).addScaledVector(ax,.26*r).add(new T.Vector3(-.07*r,0,.03*r));if(t>.98&&t<1.08)P.mag.position.addScaledVector(ax,-.004);}
    if(t>.42&&!a.dropped){a.dropped=true;sfx.click(1800,.3);spawnDroppedMag();}
    if(t>.92&&!a.inserted){a.inserted=true;sfx.click(2400,.45);anim.posY.kick(.35);anim.rotZ.kick(-1.2);loadMag(w,s);}
    if(t>=1.1)P.mag.visible=false;
    // Left hand: support grip -> away (0.12..0.42) -> holding the new mag (0.5..1.0) -> back to support (1.0..1.2)
    if(t<.5){a.leftGrip=undefined;a.leftAway=smooth(seg(t,.12,.42));a.leftOffset=a.leftOffset||new T.Vector3(-.14,-.48,-.08);}
    else if(t<1.02){a.leftGrip=armsRig?.grips.pistol.mag;a.leftSpace=P.mag;a.leftAway=1-smooth(seg(t,.5,.58));a.leftOffset=a.leftOffset||new T.Vector3(-.14,-.48,-.08);if(armsRig)a.magHand=armsRig.gripPos(armsRig.grips.pistol.mag,P.mag,a.magHand);}
    else{a.leftGrip=undefined;a.leftSpace=undefined;a.leftAway=1-smooth(seg(t,1.02,1.22));a.leftOffset=a.magHand||a.leftOffset;}
    if(a.slap){if(t>1.28&&!a.slapped){a.slapped=true;s.lockedBack=false;s.slideT=.06;sfx.rack(false);anim.posZ.kick(-.5);anim.rotX.kick(1.5);}a.thumb=t>1.18&&t<1.34;}
   }
   if(a.name==='reload'&&w.id==='pistol'&&!P.glb){
    const tilt=smooth(seg(t,0,.25))*(1-smooth(seg(t,a.duration-.35,a.duration)));
    out.rz+=.42*tilt;out.rx+=.22*tilt;out.y+=-.02*tilt;out.x+=-.02*tilt;
    const drop=easeIn(seg(t,.22,.5)),rise=1-easeOut(seg(t,.62,1.02));
    const off=t<.56?drop:rise;if(P.mag){P.mag.position.y=-.16*off;P.mag.position.x=-.03*off;P.mag.visible=!(t>.5&&t<.6);}
    a.leftAway=smooth(seg(t,.12,.38))*(1-smooth(seg(t,.78,1.04)));a.leftOffset=a.leftOffset||new T.Vector3(-.16,-.42,-.12);
    if(t>.22&&!a.dropped){a.dropped=true;sfx.click(1800,.3);if(P.mag)spawnDroppedMag();}
    if(t>1.02&&!a.inserted){a.inserted=true;sfx.click(2400,.45);anim.posY.kick(.25);loadMag(w,s);}
    if(a.slap){const sl=seg(t,1.3,1.42);if(sl>0&&!a.slapped){a.slapped=true;s.lockedBack=false;s.slideT=.06;sfx.rack(false);anim.posZ.kick(-.4);}}
   }
   if(a.name==='reload'&&w.id==='pump'){
    const tilt=smooth(seg(t,0,.25))*(1-smooth(seg(t,a.duration-.25,a.duration)));
    out.rz+=-.35*tilt;out.rx+=.15*tilt;out.y+=.03*tilt;out.x+=-.05*tilt;out.z+=.03*tilt;
    const per=.48,local=t-.3,i=Math.floor(local/per),lt=local-i*per;
    if(P.glb&&armsRig){
     // Hand drops from the fore-end, picks shells up from below and thumbs each one into the port.
     const g=armsRig.grips.pump;
     if(!a.foreHand)a.foreHand=armsRig.gripPos(g.left,P.fore);
     a.leftGrip=g.shell;a.leftSpace=P.shell;
     const enter=smooth(seg(t,.05,.3)),exit=smooth(seg(t,a.duration-.28,a.duration-.05));
     a.leftAway=Math.max(1-enter,exit);a.leftOffset=a.foreHand;
     if(local<=0||i>=a.need||a.cancel){P.shell.visible=false;P.shell.position.set(.05,-.2,.12);}
    }
    if(local>0&&i<a.need&&!a.cancel){
     P.shell.visible=lt<.34;const ins=easeOut(seg(lt,.0,.2)),push=easeIn(seg(lt,.22,.32));
     if(P.glb){P.shell.visible=true;const back=smooth(seg(lt,.34,.48));P.shell.position.set(.05*(1-ins)+.05*back,-.2*(1-ins)-.005*ins+push*.02-.2*back,.12*(1-ins)+.03*ins-push*.05+.12*back);P.shell.rotation.set(0,Math.PI/2,0);P.shellHidden=lt>.32&&lt<.36;if(P.shellHidden)P.shell.visible=false;}
     else{P.shell.position.set(.12+.05*(1-ins)-push*.06,-.06+.045*ins+push*.01,.05*(1-ins));P.shell.rotation.set(0,0,Math.PI/2);}
     if(lt>.3&&a.loaded<=i){a.loaded=i+1;s.ammo=Math.min(w.mag,s.ammo+1);if(arsenal)arsenal.reserve.shells=Math.max(0,(arsenal.reserve.shells||0)-1);sfx.click(1400,.4);anim.posY.kick(.12);}
    }else P.shell.visible=false;
    if(a.cancel&&lt>.34){a.duration=Math.min(a.duration,t+.25);}
    if(t>=a.duration&&!s.chamber&&s.ammo>0){s.action=null;P.shell.visible=false;startAction('pump',.42);return out;}
   }
   if(a.name==='reload'&&(w.id==='smg'||w.id==='rifle'||w.id==='sniper')){
    // Tilt toward the support hand; it drops to the vest for a fresh magazine and slaps it home.
    const d=a.duration,tilt=smooth(seg(t,0,.25))*(1-smooth(seg(t,d-.35,d)));
    out.rz+=.42*tilt;out.ry+=.18*tilt;out.rx+=.1*tilt;out.y+=.02*tilt;out.x+=-.03*tilt;
    a.leftAway=smooth(seg(t,.2,.5))*(1-smooth(seg(t,d*.62,d*.8)));a.leftOffset=a.leftOffset||new T.Vector3(-.16,-.5,-.1);
    if(t>.32&&!a.out){a.out=true;sfx.click(1600,.35);}
    if(t>d*.72&&!a.inserted){a.inserted=true;sfx.click(2300,.5);anim.posY.kick(.4);anim.rotZ.kick(-1.4);loadMag(w,s);}
    if(a.wasEmpty&&t>d*.86&&!a.charged){a.charged=true;sfx.rack(false);anim.posZ.kick(-.4);}
   }
   if(a.name==='bolt'){
    // Bolt cycle: right hand leaves the grip, works the bolt up-back-forward-down, returns.
    const up=smooth(seg(t,.05,.22))*(1-smooth(seg(t,.62,.8)));out.rz+=.12*up;out.y+=.01*up;
    a.rightAway=up;a.rightOffset=a.rightOffset||new T.Vector3();
    if(armsRig){armsRig.gripPos(armsRig.grips.sniper.bolt,models.sniper.holder,a.rightOffset);const pull=smooth(seg(t,.25,.4))*(1-smooth(seg(t,.45,.6)));a.rightOffset.z+=.07*pull;}
    if(t>.33&&!a.ejected){a.ejected=true;sfx.rack(true);ejectShell('pistol');}
    if(t>.55&&!a.closed){a.closed=true;sfx.rack(false);}
   }
   if(a.name==='swing'){
    const ts=a.duration/.56,kp=keyPose(AXE_KEYS,t/ts,a.heavy?1.15:1);
    out.x+=kp[0];out.y+=kp[1];out.z+=kp[2];out.rx+=kp[3];out.ry+=kp[4];out.rz+=kp[5];
    if(t/ts>.26&&!a.hit){a.hit=true;meleeHit(a.heavy);}
   }
   if(a.name==='throw'){
    const back=smooth(seg(t,0,.18)),fwd=easeOut(seg(t,.18,.3)),ret=smooth(seg(t,.32,.55));
    out.z+=.06*back*(1-fwd)-.18*fwd*(1-ret);out.y+=.04*back*(1-fwd)+.03*fwd*(1-ret)-.25*fwd*(1-ret);out.rx+=-.4*back*(1-fwd)+.5*fwd*(1-ret);
    P.block.visible=t<.3||t>.42;if(t>.42)out.y+=-.2*(1-smooth(seg(t,.42,.55)));
   }
   if(t>=a.duration){if(a.name==='swing'||a.name==='throw'){}s.action=null;if(w.id==='pump')P.shell.visible=false;if(w.id==='c4')P.block.visible=true;}
   return out;
  }

  function loadMag(w,s){const take=Math.min(w.mag-s.ammo,reserveOf(w));s.ammo+=take;if(arsenal)arsenal.reserve[w.ammo]-=take;s.dryWarned=false;}

  function spawnDroppedMag(){
   const P=models.pistol.parts,s=shells.find(s=>s.kind==='mag'&&!s.mesh.visible)||shells.find(s=>s.kind==='mag');if(!s||!P.mag)return;
   const g=s.mesh,pos=viewToWorld(P.mag.getWorldPosition(effectLook));g.position.copy(pos);g.quaternion.copy(camera.quaternion);g.visible=true;
   s.vel.set(rand(-.3,.3),-1,rand(-.3,.3));s.spin.set(rand(-3,3),rand(-3,3),rand(-3,3));s.ground=groundAt(pos.x,pos.z,pos.y);s.bounces=0;s.age=0;
  }

  // The shared melee core (melee-core.js) sets every melee timing, reach, damage and impact; these are its fallback.
  const MELEE_FALLBACK={bash:{windup:.11,recover:.64,reach:2.4,damage:55,tier:'heavy',label:'BASH'},slam:{windup:.24,recover:.95,reach:2.6,damage:80,tier:'heavy',label:'SLAM'},
   chop:{windup:.26,recover:.56,reach:2.2,damage:55,tier:'light',label:'CHOP'},cleave:{windup:.33,recover:.7,reach:2.2,damage:94,tier:'heavy',label:'CLEAVE'}};
  function meleeMove(id){return root.EdenMelee?.move(id)||MELEE_FALLBACK[id];}
  // One landed blow, felt the same way as every other melee hit in the game.
  function meleeLand(move,killed,{finisher=false,counter=false}={}){
   const M=root.EdenMelee,shake=v=>{look.shake=Math.max(look.shake,v*2.6);};
   if(!M){o.hitStop?.(killed?130:90);shake(.16);return;}
   if(finisher)M.sound('finisher');
   M.land(finisher?'finisher':killed?'ko':move.tier,{hitStop:ms=>o.hitStop?.(ms),shake,label:counter?'COUNTER!':move.tier==='heavy'&&move.label!=='BASH'?move.label:null});
  }
  // How a landed blow is boosted: a finisher (a heavy ending a 3-hit chain) and a counter (right after a parry)
  // each hit half again as hard; a finisher always knocks down.
  function meleeBoost(move){const M=root.EdenMelee,finisher=!!M?.wouldFinish(move.tier),counter=!!M?.takeCounter();return {finisher,counter,scale:(finisher?1.5:1)*(counter?1.5:1)};}
  // Block: hold the guard key to raise your weapon across your body. Raised just before a blow, it parries.
  const guard=root.EdenMelee?.guard()||null;let guardBlend=0;
  function guardInput(down){if(!guard)return;if(down){if(!armed||!o.canAct()||current?.id==='c4')return;if(guard.raise()){zoomTarget=0;anim.posY.kick(-2);root.EdenMelee.sound('whoosh',.35);}}else guard.lower();requestFrame();}
  // A target just past reach: step into it as the blow goes out.
  function meleeLunge(id){
   const M=root.EdenMelee,list=o.aimTargets?.();if(!M||!list?.length||!o.lunge)return;
   const p=lensPosition(new T.Vector3()),f=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion).setY(0).normalize();
   const step=M.lunge(p,f,list.map(t=>t.chest).filter(Boolean),meleeMove(id));if(step)o.lunge({direction:new T.Vector3(step.x,0,step.z),distance:step.distance});
  }
  // Fists (fist-viewmodel.js draws them): click for a left and right by turns, right click or B for the haymaker.
  let fistArms=null,fistHand=0,fistAttack=null,fistReady=0;
  const FIST_MOVES={jab:{windup:.1,recover:.26,reach:1.75,damage:8,tier:'light',label:'JAB'},cross:{windup:.13,recover:.34,reach:1.8,damage:12,tier:'light',label:'CROSS'},haymaker:{windup:.25,recover:.62,reach:1.9,damage:22,tier:'heavy',label:'HAYMAKER'}};
  function punch(heavy){
   const left=fistReady-lastTime;if(left>0){if(left<.3&&!state.punchQueued){state.punchQueued=true;setTimeout(()=>{state.punchQueued=false;if(armed&&current?.id==='fists')punch(heavy);},left*1000+10);}return;}
   const id=heavy?'haymaker':fistHand?'cross':'jab',base=root.EdenMelee?.move(id)||FIST_MOVES[id],move={...base,damage:base.damage*2.4,reach:base.reach+.35};
   guard?.lower();fistAttack={kind:heavy?'power':id,hand:heavy||fistHand?1:0,start:lastTime,impact:base.windup,recover:base.recover,landed:false,missed:false};fistHand=heavy?0:fistHand^1;fistReady=lastTime+base.recover*.85;
   sfx.whoosh(heavy);meleeLunge(id);o.onAction?.('punch','fists',base.recover);
   const a=fistAttack;setTimeout(()=>{if(!armed||current?.id!=='fists'||!o.canAct())return;const struck=bashStrike(move,true);a.landed=struck;a.missed=!struck;requestFrame();},base.windup*1000);
   requestFrame();
  }
  function updateFists(time,dt){
   const show=armed&&current?.id==='fists'&&o.canAct()&&!handsBusy&&!((o.thirdPerson?.()||0)>.35);
   if(!fistArms){if(!show)return;try{fistArms=root.createFistViewModel?.(T,camera,{reduced:!!o.reduced})||{update(){}};}catch(error){console.warn('Fists unavailable',error);fistArms={update(){}};}}
   const a=fistAttack&&time-fistAttack.start<fistAttack.recover?{...fistAttack,elapsed:time-fistAttack.start,freeze:fistAttack.landed?.06:0}:null;
   fistArms.update(time,dt,{show,blocking:!!guard?.raised,attack:a,leadHand:0});
  }
  // B (or right click): a Halo-style melee bash with whatever is in your hands. Hold B for a wound-up slam that hits harder.
  // With the axe, a bash is its heavy swing.
  function bash(heavy=false){
   cancelInspect();
   if(!current||!o.canAct())return;const s=state[current.id];
   if(current.id==='axe'){if(!s.action){startAction('swing',meleeMove('cleave').recover,{heavy:true,hit:false});sfx.whoosh(true);meleeLunge('cleave');}return;}
   if(current.id==='fists'){punch(true);return;}
   const move=meleeMove(heavy?'slam':'bash');
   // Input buffer: a press in the last 0.35 s of the previous blow's recovery is held and thrown the moment it can be,
   // so chains (and combo finishers) don't drop presses.
   const left=(state.bashRecover??.75)-(lastTime-(state.lastBash??-9));
   if(left>0){if(left<.35&&!state.bashQueued){state.bashQueued=true;setTimeout(()=>{state.bashQueued=false;bash(heavy);},left*1000+20);}return;}
   if(s.action&&s.action.name!=='reload')return;
   guard?.lower();
   if(s.action?.name==='reload')s.action=null;
   state.lastBash=lastTime;state.bashRecover=move.windup+move.recover;sfx.whoosh(heavy);root.EdenMelee?.sound(heavy?'swoosh':'whoosh',.6);
   const k=heavy?1.6:1;anim.posZ.kick(-5*k);anim.rotX.kick(-8*k);anim.rotY.kick(5*k);anim.rotZ.kick(-3*k);look.kickPitch.kick(-.5*k);
   meleeLunge(heavy?'slam':'bash');
   setTimeout(()=>{if(armed)bashStrike(move);},move.windup*1000);
  }
  function bashStrike(move=meleeMove('bash'),seek=false){
   const origin=lensPosition(new T.Vector3()),body=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion),f=aimForward(),r=aimRight();
   // Fists go to whoever is in front of you (shoulder width, any height), not only to what is dead under the crosshair.
   const sought=[];if(seek)for(const t of o.aimTargets?.()||[])for(const p of [t.head,t.chest]){if(!p)continue;const d=p.clone().sub(origin),flat=Math.hypot(d.x,d.z);if(flat>move.reach)continue;const along=(d.x*body.x+d.z*body.z)/(flat*Math.hypot(body.x,body.z)||1);if(along>.8){d.normalize();sought.push(d);}}
   for(const off of [0,-.22,.22,...sought]){const d=off.isVector3?off:f.clone().addScaledVector(r,off).normalize();const ch=o.shotHook?.(origin,d,move.reach,{weapon:'melee',player:true});
    if(ch){const boost=meleeBoost(move);const res=ch.apply(move.damage*boost.scale*(ch.head?1.3:1),{head:ch.head,weapon:'melee',melee:true,tier:move.tier,knockdown:move.knockdown||boost.finisher,finisher:boost.finisher,dir:f.clone().setY(0).normalize()});bloodPuff(ch.point,d);hud.hitmarker(move.tier==='heavy'&&move.label!=='BASH',res?.killed);state.hitStop=.08;meleeLand(move,res?.killed,boost);return true;}}
   const h=worldHits(origin,f,move.reach-.3);if(h){impact(h,f,move.tier==='heavy'?2.2:1.4,false);sfx.wood(h.point,.8);look.shake=Math.max(look.shake,.16);state.hitStop=.05;root.EdenMelee?.combo.reset();return true;}
   root.EdenMelee?.whiff();return false;
  }
  function meleeHit(heavy){
   const origin=lensPosition(new T.Vector3()),f=aimForward(),r=aimRight();
   for(const off of [0,-.2,.2]){const d=f.clone().addScaledVector(r,off).normalize();const move=meleeMove(heavy?'cleave':'chop');const ch=o.shotHook?.(origin,d,move.reach,{weapon:'axe',player:true});if(ch){const boost=meleeBoost(move);const res=ch.apply(move.damage*boost.scale*(ch.head?1.4:1),{head:ch.head,isTrue:heavy,weapon:'axe',melee:true,tier:move.tier,knockdown:move.knockdown||boost.finisher,finisher:boost.finisher,dir:f.clone().setY(0).normalize()});bloodPuff(ch.point,d);hud.hitmarker(heavy,res?.killed);state.hitStop=.07;meleeLand(move,res?.killed,boost);anim.posZ.kick(1.2);sfx.wood(ch.point,.7);return;}}
   let hit=null;for(const off of [0,-.18,.18,-.35,.35]){const d=f.clone().addScaledVector(r,off).normalize();const h=worldHits(origin,d,2.1);if(h&&(!hit||targetOf(h.object)&&!targetOf(hit.object)))hit=h;if(hit&&targetOf(hit.object))break;}
   if(!hit){root.EdenMelee?.whiff();return;}
   const t=impact(hit,f,heavy?3.2:1.6,heavy);
   if(t?.kind==='post'||!t)decal(hit,tx.chop,heavy?.16:.11);
   if(heavy)hud.trueShot();
   state.hitStop=heavy?.09:.06;look.shake=Math.max(look.shake,heavy?.35:.18);anim.posZ.kick(1.2);anim.rotX.kick(-2);
   sfx.wood(hit.point,heavy?1.6:1);
  }

  /* ------------------------------------------------------------ input */
  function requestLock(){if(!armed)return;sfx.init();const el=renderer.domElement,fallback=()=>{try{el.requestPointerLock?.()?.catch?.(()=>{});}catch{}};try{const p=el.requestPointerLock?.({unadjustedMovement:true});p?.catch?.(fallback);}catch{fallback();}}
  function onLockChange(){locked=document.pointerLockElement===renderer.domElement;if(!locked)releaseInputs();hud?.update();requestFrame();}
  function onMouseMove(e){if(!locked||!armed||!o.canAct())return;awayFrom(e.movementX);const z=zoomOf(current)||1,sens=.0027*lerp(1,Math.min(.7,1.35/z),adsBlend)*lookScale()*lerp(assist.friction,1,Math.min(1,Math.hypot(e.movementX,e.movementY)/8));freeLook(e.movementX*sens,-e.movementY*sens*ySign());const heavy=1+(WEIGHT[current?.id]||0)*1.6;anim.swayX.kick(-e.movementX*.012*heavy*(1-adsBlend*.6));anim.swayY.kick(e.movementY*.012*heavy*(1-adsBlend*.6));requestFrame();}
  function inputKey(e){return root.edenControls?.key(e)??e.key?.toLowerCase()??'';}
  function controlHint(action,fallback){return root.edenControls?.hint(action)||fallback;}
  function inputBlocked(e){return (window.edenControls?.blockedModifiers(e)??(e.ctrlKey||e.metaKey||e.altKey||e.isComposing))||e.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target?.tagName)||(window.edenControls?.modalOpen?.()??!!document.querySelector('dialog[open]'));}
  // A ground hold (battle-arena.js, a tackle you stayed on) takes melee input first: 'swing' plays the axe swing for
  // its finisher without this file's own hit test, 'bash' the bash kick for a punch thrown with a gun in hand.
  function heldInput(input){
   const r=o.heldStrike?.(input,current?.id==='fists'?null:current?.id||null);if(!r)return false;
   if(r==='swing'&&current?.id==='axe'){if(!state.axe.action){startAction('swing',meleeMove('cleave').recover,{heavy:true,hit:true});sfx.whoosh(true);}}
   else if(r==='bash'){anim.posZ.kick(-5);anim.rotX.kick(-8);anim.rotY.kick(5);anim.rotZ.kick(-3);look.kickPitch.kick(-.5);}
   requestFrame();return true;
  }
  // Attacking with empty hands brings your fists up and throws the first punch.
  function raiseFists(strike=true){if(armed||!built||!(arsenal||rangeOn)||!o.canAct()||o.holding?.())return false;equip('fists');if(armed&&strike){equipBlend=1;punch(false);}return armed;}
  // Q: the next weapon you carry, from empty hands too.
  function cycle(step=1){const ids=slotIds();if(!ids.length||!o.canAct())return;const at=armed?ids.indexOf(current?.id):-1;equip(ids[(at+step+ids.length)%ids.length]);}
  function pressButton(key){
   if(!armed&&(key==='fire'||key==='aim')&&(locked||touchMode)){raiseFists();return;}
   if(!armed||!(locked||touchMode)||!o.canAct())return;
   if((key==='fire'||key==='aim')&&heldInput(key))return;
   if(key==='fire'){buttons.left=true;pendingFire=true;o.cancelSprint?.();}
   if(key==='aim'){cancelInspect();buttons.right=true;if(current?.id==='c4')detonate();else if(setting('aim','wheel')==='hold'&&zoomable()){zoomTarget=1;o.setThird?.(false);}else bash();}
   requestFrame();
  }
  function releaseButton(key){if(key==='fire')buttons.left=false;if(key==='aim'){buttons.right=false;if(setting('aim','wheel')==='hold')zoomTarget=0;}}
  function releaseInputs(){bashHold.cancel();if(typeof guard!=='undefined')guard?.lower();shiftHeld=false;buttons.left=buttons.right=false;pendingFire=false;if(setting('aim','wheel')==='hold')zoomTarget=0;}
  function onMouseDown(e){if(inputBlocked(e))return;if(!armed){if(!locked&&e.target===renderer.domElement&&e.button===0)raiseFists();return;}if(!locked){if(e.target===renderer.domElement&&e.button===0)requestLock();return;}if(root.edenControls)return;e.preventDefault();pressButton(e.button===0?'fire':e.button===2?'aim':'');}
  function onMouseUp(e){if(!root.edenControls)releaseButton(e.button===0?'fire':e.button===2?'aim':'');}
  // B: tap to bash, hold to slam (the shared tap-for-light, hold-for-heavy melee rule).
  const bashHold=root.EdenMelee?.charge({light:()=>bash(false),heavy:()=>bash(true)})||{down:()=>bash(false),up(){},cancel(){}};
  function onKeyUp(e){const k=inputKey(e);if(k==='shift')shiftHeld=false;if(k==='b')bashHold.up();if(k==='z'&&typeof guardInput==='function')guardInput(false);releaseButton(k);}
  function onKey(e){
   if(inputBlocked(e)||e.repeat)return;
   if(root.edenControls&&!['walk','combat','battle'].includes(root.edenControls.context()))return;
   const k=inputKey(e);
   if(k==='fire'||k==='aim'){e.preventDefault();pressButton(k);return;}
   if(/^[1-7]$/.test(k)){if(!o.canAct())return;const id=slotIds()[+k-1];if(!id)return;e.preventDefault();if(armed&&current?.id===id)holster();else equip(id);return;}
   if((k==='0'||k==='`')&&armed){e.preventDefault();holster();return;}
   if(k==='g'&&armed&&o.canAct()&&current?.id==='c4'){e.preventDefault();detonate();return;}
   if(k==='q'&&o.canAct()&&(armed||arsenal)){e.preventDefault();cycle();return;}
   if(!armed||!o.canAct())return;
   if(k==='r'){e.preventDefault();reload();}
   if(k==='b'){e.preventDefault();if(heldInput('b'))return;if(current?.id==='c4')detonate();else bashHold.down();}
   if(k==='z'&&typeof guardInput==='function'){e.preventDefault();guardInput(true);}
   if(k==='x'){e.preventDefault();holster();}
  }

  /* ------------------------------------------------------------ lifecycle */
  let tx;
  function build(){
   if(built)return;built=true;
   tx=buildTextures();env=buildEnvironment();M=buildMaterials(tx);
   viewScene=new T.Scene();viewScene.environment=env;
   viewCamera=new T.PerspectiveCamera(58,1,.01,10);
   viewHemi=new T.HemisphereLight(0xe6f2ff,0x4a4a32,.9);viewScene.add(viewHemi);
   sunView=new T.DirectionalLight(0xfff0d0,2.6);viewScene.add(sunView);viewScene.add(sunView.target);
   viewRim=new T.DirectionalLight(0xbfd6ff,.8);viewRim.position.set(-1,.5,1);viewScene.add(viewRim);
   world=new T.Group();world.name='Eden combat range';scene.add(world);
   fxGroup=new T.Group();fxGroup.name='Combat effects';fxGroup.userData.noHit=true;scene.add(fxGroup);
   // No new lights in the garden scene: adding one would force every garden material to recompile.
   // Flashes and blasts borrow the existing fill light instead (color/intensity/direction changes are free).
   if(o.fill){fillBase={color:o.fill.color.clone(),intensity:o.fill.intensity,position:o.fill.position.clone()};}
   flashLight={position:new T.Vector3()};blastLight={position:new T.Vector3()};
   raycaster=new T.Raycaster();raycaster.camera=camera;raycaster.params.Points.threshold=.001;raycaster.params.Line.threshold=.001;
   buildViewmodels();buildRange();resetState();hud=buildHUD();
   for(const n in FLIP_SRC)flipBook(n);warmEffectPools();
   if(window.createCombatArms&&window.showroomAssets){armsRig=window.createCombatArms(T,{env});armsRig.ready.then(()=>{upgradeModels();requestFrame();}).catch(e=>console.warn('Realistic combat models unavailable; using procedural fallback.',e));}
   document.addEventListener('pointerlockchange',onLockChange);
   onLockChange(); // Prewarming can build weapons after the world already owns pointer lock.
   document.addEventListener('mousemove',onMouseMove);
   document.addEventListener('mousedown',onMouseDown);
   renderer.domElement.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||locked||inputBlocked(e))return;if(armed)requestLock();else raiseFists();});
   document.addEventListener('mouseup',onMouseUp);
   renderer.domElement.addEventListener('contextmenu',e=>{if(armed)e.preventDefault();});
  }
  document.addEventListener('keydown',onKey);
  // Inspect (I): turn the weapon over in the light; firing cancels it.
  document.addEventListener('keydown',e=>{if(e.code!=='KeyI'||e.repeat||!armed||!current||inputBlocked(e)||!o.canAct()||!(locked||touchMode)||root.edenControls&&!['walk','combat','battle'].includes(root.edenControls.context())||['fists','c4'].includes(current.id))return;const st=state[current.id];if(!st.action)startAction('inspect',2.1);});
  // Wheel: zoom in / out with a gun (a mouse notch is a third of the way; trackpad scrolls and pinches, which arrive
  // as ctrl+wheel, are smooth). Scrolling out past hip-fire goes to third person (app.js). Weapons swap on 1-7 and Q.
  let lastWheel=0;
  document.addEventListener('wheel',e=>{
   if(!armed||!locked||document.querySelector('dialog[open]'))return;e.preventDefault();
   const dy=e.deltaMode===1?e.deltaY*33:e.deltaY;
   if(Math.abs(dy)<.5)return;const out=dy>0,t=performance.now();
   // Third person: scrolling in brings you back to first person before it starts aiming.
   if((o.thirdPerson?.()||0)>0){if(!out){o.setThird?.(false);lastWheel=t;}return;}
   if(zoomable()&&(zoomTarget>0||!out)){nudgeZoom(e.ctrlKey?-dy*.022:Math.abs(dy)>=50?-Math.sign(dy)*.34:-dy*.007);lastWheel=t;return;}
   // Already at hip-fire: keep scrolling out (after a short pause in the scroll) to go to third person.
   if(out&&t-lastWheel>220)o.setThird?.(true);lastWheel=t;
  },{passive:false});

  // Pinch on a touch screen.
  let pinch=null;const span=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  renderer.domElement.addEventListener('touchstart',e=>{if(armed&&e.touches.length===2)pinch={d:span(e.touches),z:zoomTarget};},{passive:true});
  renderer.domElement.addEventListener('touchmove',e=>{if(!pinch||e.touches.length!==2)return;e.preventDefault();zoomTarget=pinch.z;nudgeZoom((span(e.touches)/pinch.d-1)*1.4);},{passive:false});
  renderer.domElement.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null;},{passive:true});
  function slotIds(){return arsenal?arsenal.slots():WEAPONS.map(w=>w.id);}
  function equip(id){
   if(!o.canAct())return;
   build();
   if(arsenal&&!arsenal.owned.has(id))return;
   const w=WEAPONS.find(x=>x.id===id);if(!w)return;
   if(current?.id===id&&armed)return;
   if(current&&current.id!==id)previous=current.id;
   if(!armed){const l=o.getLook();yaw=l.yaw;pitch=l.pitch;armed=true;document.body.classList.add('combat-armed');hud.el.classList.add('on');}hud.el.classList.remove('empty');hud.reset?.();
   for(const k in models)models[k].holder.visible=false;
   if(models.c4)models.c4.parts.remote.visible=false;
   if(current&&state[current.id].action){state[current.id].action=null;}
   cancelInspect();resetRecoil();current=w;equipBlend=0;zoomTarget=0;models[id].holder.visible=true;buttons.right=false;
   const s=state[id];s.focus=0;s.windowT=0;s.breath=0;
   sfx.swap();hud.update();
   if(!locked&&!touchMode)requestLock();
   requestFrame();
  }
  function holster(){
   if(!armed)return;cancelInspect();resetRecoil();flights.length=0;flightEpoch++;armed=false;buttons.left=buttons.right=false;o.onAction?.('holster',current?.id,0);
   for(const k in models)models[k].holder.visible=false;if(models.c4)models.c4.parts.remote.visible=false;if(armsRig?.arms)armsRig.arms.group.visible=false;
   document.body.classList.remove('combat-armed');if(arsenal)hud?.el.classList.add('empty');else hud?.el.classList.remove('on');hud?.el.querySelectorAll('.ch-slots button').forEach(b=>b.classList.remove('active'));
   // On desktop the garden keeps mouse look after the weapon is put away (o.keepLock).
   if(document.pointerLockElement===renderer.domElement&&!o.keepLock?.())document.exitPointerLock();
   current=null;adsBlend=0;zoomTarget=0;if(scoped){scoped=false;hud?.el.classList.remove('scoped');}if(camera.zoom!==1){camera.zoom=1;camera.updateProjectionMatrix();}o.requestDraw();
  }
  function setRange(on){if(rangeOn===on)return;rangeOn=on;if(rangeRoot)rangeRoot.visible=on;o.onRange?.(on);renderer.shadowMap.needsUpdate=true;o.requestDraw();}
  function enterRange(){
   build();setRange(true);o.placePlayer(11.7,-24.4,11.7,-42);
   const l=o.getLook();yaw=l.yaw;pitch=l.pitch;
   equip(current?.id||'pistol');
   hud.toast('THE RANGE · steel at 10, 18, 28 and 43 m · posts for the axe');
  }

  let hudFrameAt=-1e9;
  function requestFrame(){o.requestDraw();}

  function update(time,dt){
   if(armed){assistScan();// The pull only helps while you shoot or aim down sights, and pauses for half a second after the thumb or mouse
   // moves away from the target. It used to run whenever you moved (or always, on touch), dragging the view back onto any bot you ran past.
   if((locked||touchMode)&&o.canAct()&&(buttons.left||adsBlend>.1)&&lastTime-touchAway>.5&&assist.target&&assist.angle>.004){asTo.copy(assist.point).sub(lensPosition(asEye)).normalize();const ty=Math.atan2(asTo.x,-asTo.z),tp=Math.asin(clamp(asTo.y,-1,1));let dy=ty-yaw-free.x;dy=Math.atan2(Math.sin(dy),Math.cos(dy));const k=1-Math.exp(-ASSIST.pull*dt*(touchMode?1:.55));yaw+=clamp(dy*k,-dt*.55,dt*.55);{const was=pitch;pitch=clamp(pitch+clamp((tp-pitch-free.y)*k,-dt*.4,dt*.4),-1.35,1.35);const dp=pitch-was;if(dp<0&&recoilDebt.y>0)recoilDebt.y=Math.max(0,recoilDebt.y+dp);}}} // the pull already paid part of the climb back
   // Walking back into the garden or far off down the road ends the range.
   if(rangeOn&&(camera.position.z>-21||Math.hypot(camera.position.x-11.7,camera.position.z+40)>45))setRange(false);
   lastTime=time;
   if(!built)return;
   // Rounds still in the air land, holstered or not (and none that outlived what they were aimed at).
   for(let i=flights.length-1;i>=0;i--)if(lastTime>=flights[i].at){const f=flights[i];flights.splice(i,1);if(f.ok())try{f.land();}catch(e){console.warn(e);}}
   // Effects keep running even when holstered
   updateParticles(dt);updateEmbers(dt);for(let i=heat.length-1;i>=0;i--){heat[i].t+=dt;heat[i].pos.y+=dt*.6;if(heat[i].t>=heat[i].life)heat.splice(i,1);}updateBarrel();updateFlips(dt);updateShells(dt);updateCharges(dt);
   for(const tr of tracers){if(!tr.alive)continue;tr.t+=dt;tr.mesh.material.opacity=1-tr.t/tr.life;if(tr.t>=tr.life){tr.alive=false;tr.mesh.visible=false;}}
   for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.t+=dt;const k=d.t/d.life;if(d.ring){d.mesh.scale.setScalar(1+k*9);d.mesh.material.opacity=.5*(1-k);}if(k>=1){d.mesh.parent?.remove(d.mesh);debris.splice(i,1);}}
   for(const d of decals){const age=time-d.userData.born;if(age>d.userData.life-2)d.material.opacity=Math.max(0,(d.userData.life-age)/2);if(age>d.userData.life)d.visible=false;}
   for(const t of targets){
    t.pivot.rotation.x=t.swing.step(0,dt);t.pivot.rotation.y=t.twist.step(0,dt);
    if(t.down){const age=time-t.downT;const fall=age<.5?easeIn(age/.5):age<6?1:1-smooth((age-6)/1.2);t.root.rotation.x=-fall*(Math.PI/2-.12)*Math.cos(t.fallDir||0);t.root.rotation.z=fall*(Math.PI/2-.12)*Math.sin(t.fallDir||0);if(age>7.2){t.down=0;t.root.rotation.set(0,0,0);}}
   }
   state.flash=Math.max(0,(state.flash||0)-dt*28);state.blast=Math.max(0,(state.blast||0)-dt*1.6);

   freeUpdate(dt,armed&&movementInfo().sprinting);
   updateFists(time,dt);
   if(!armed)return;

   // Movement sampling for bob/sway
   const cp=camera.position;
   if(lastCamPos){const v=Math.hypot(cp.x-lastCamPos.x,cp.z-lastCamPos.z)/Math.max(dt,1e-3);speedSmoothed=lerp(speedSmoothed,Math.min(v,8),1-Math.exp(-10*dt));const vy=(cp.y-lastY)/Math.max(dt,1e-3);if(verticalVel<-1.5&&vy>-.2)anim.land.kick(-Math.min(3,-verticalVel*.6)*(1+(WEIGHT[current?.id]||0)));verticalVel=vy;
    const rx=Math.cos(yaw),rz=Math.sin(yaw),lat=((cp.x-lastCamPos.x)*rx+(cp.z-lastCamPos.z)*rz)/Math.max(dt,1e-3);lateral=lerp(lateral,clamp(lat,-7,7),1-Math.exp(-8*dt));}
   if(lastCamPos&&dt>0){bodyVel.copy(cp).sub(lastCamPos).divideScalar(Math.max(dt,1e-3));if(bodyVel.lengthSq()>144)bodyVel.set(0,0,0);bodyVel.y*=.3;}
   if(!lastCamPos)lastCamPos=new T.Vector3();lastCamPos.copy(cp);lastY=cp.y;
   const mv=movementInfo();
   const prevPhase=bobPhase;bobPhase+=dt*(speedSmoothed>.2?lerp(6,11,clamp(speedSmoothed/6,0,1)):0);
   // Each footfall settles the weapon down a little, harder for heavy ones.
   if(Math.floor(prevPhase/Math.PI)!==Math.floor(bobPhase/Math.PI)&&!mv.airborne){stepDip=Math.min(1,stepDip+.6);
    // At a run every stride lands: the weapon drops, rocks toward the planted foot and comes back late.
    if(real()&&!o.reduced){const run=clamp((speedSmoothed-3)/3.5,0,1)*(1-adsBlend*.8),h=1+(WEIGHT[current?.id]||0)*1.2,foot=Math.floor(bobPhase/Math.PI)%2?1:-1;if(run>0){anim.posY.kick(.75*run*h);anim.rotX.kick(-.55*run*h);anim.rotZ.kick(foot*.75*run*h);anim.posX.kick(foot*.35*run);}}}
   // Breaking into a run heaves it up; stopping lets it swing on.
   if(real()&&!o.reduced){const going=!!mv.sprinting;if(going!==wasRunning){wasRunning=going;const h=1+(WEIGHT[current?.id]||0);anim.posZ.kick(going?.8*h:-1.1*h);anim.rotX.kick(going?-1.2*h:1.9*h);anim.posY.kick(going?-.5*h:1.3*h);}}else wasRunning=false;
   stepDip=Math.max(0,stepDip-dt*5);

   const w=current,s=state[w.id];
   if(mv.sprinting)sprintEndAt=lastTime;
   suppress=Math.max(0,suppress-dt*.55);{const v=suppress>.02?suppress.toFixed(2):'0';if(v!==shownSuppress){shownSuppress=v;hud.el.style.setProperty('--suppress',v);hud.el.classList.toggle('suppressed',v!=='0');}}
   // After a burst the view gives back part of the climb, eased (a held trigger keeps it).
   if(lastTime-s.lastFire>Math.max(.12,w.interval*1.6)&&(recoilDebt.y||recoilDebt.x)){if(!recoilDebt.back){recoilDebt.back=1;recoilDebt.by=recoilDebt.y*BF.recover;recoilDebt.bx=recoilDebt.x*BF.recover;recoilDebt.x=recoilDebt.y=0;}}
   if(recoilDebt.back){const k=1-Math.exp(-dt*9),dy=recoilDebt.by*k,dx=recoilDebt.bx*k;pitch=clamp(pitch-dy,-1.35,1.35);yaw-=dx;recoilDebt.by-=dy;recoilDebt.bx-=dx;if(Math.abs(recoilDebt.by)+Math.abs(recoilDebt.bx)<1e-4)recoilDebt.back=0;}
   if(state.hitStop>0){state.hitStop-=dt;dt*=.08;}
   // Focus / TRUE SHOT state
   const settling=!mv.sprinting&&w.id!=='c4'&&!s.action&&lastTime-s.lastFire>.16&&!buttons.left;
   if(settling){const rate=1/w.focusTime*(1-clamp(speedSmoothed/6,0,.6));s.focus=Math.min(1,s.focus+dt*rate);}
   else if(mv.sprinting||s.action)s.focus=Math.max(0,s.focus-dt*3.2);
   s.windowT=0;s.breath=0;
   // Sights: sprinting drops them, reloading and pumping lower them for the action.
   if(mv.sprinting)zoomTarget=0;
   const wantAds=zoomable()&&!(s.action&&s.action.name!=='bolt')?zoomTarget:0,weight=WEIGHT[w.id]||0;
   adsBlend+=(wantAds-adsBlend)*(1-Math.exp(-(3/(BF.ads[w.id]||(.18+weight*.25)))*dt));if(Math.abs(adsBlend-wantAds)<.002)adsBlend=wantAds;
   sprintBlend=lerp(sprintBlend,mv.sprinting&&!s.action?1:0,1-Math.exp(-8*dt));
   // Both hands on a ledge: the weapon drops out of view and cannot fire until they are free again.
   if(handsBusy){equipBlend=Math.max(0,equipBlend-dt*7);zoomTarget=0;}else equipBlend=Math.min(1,equipBlend+dt*.9/(BF.swap[current?.id]||.45));
   look.fovPulse*=Math.exp(-dt*(w.id==='sniper'?7:11));const punch=look.fovPulse*lerp(1,.3,adsBlend);const zoom=(1+((zoomOf(w)||1)-1)*adsBlend)*Math.tan(camera.fov*Math.PI/360)/Math.tan((camera.fov+punch)*Math.PI/360);if(Math.abs(camera.zoom-zoom)>1e-4){camera.zoom=zoom;camera.updateProjectionMatrix();}

   if(pendingFire&&BF.sprintFire[w.id]!=null&&lastTime-sprintEndAt<BF.sprintFire[w.id]&&!s.action){/* the click waits out the sprint-to-fire moment */}
   else if(pendingFire){pendingFire=false;if(canFire())fire();else if(w.id==='pump'&&s.action?.name==='reload')s.action.cancel=true;}
   else if(w.auto&&buttons.left&&canFire())fire();
   if(s.heat)s.heat=Math.max(0,s.heat-dt*(buttons.left?.6:2.6));
   const wantScope=!!w.scope&&adsBlend>.9;if(wantScope!==scoped){scoped=wantScope;hud.el.classList.toggle('scoped',scoped);}

   // Look with recoil + shake
   const kp=look.kickPitch.step(0,dt),ky=look.kickYaw.step(0,dt);
   look.shake=Math.max(0,look.shake-dt*1.8);
   const sh=look.shake*look.shake;const shx=(Math.sin(time*61)+Math.sin(time*37))*.012*sh,shy=(Math.sin(time*53)+Math.sin(time*29))*.012*sh;
   // Aiming breathes: the sights drift a little, more with heavy weapons and when zoomed in further.
   if(scoped&&shiftHeld&&breath.tired<=0&&speedSmoothed<1.2){breath.hold+=dt;if(breath.hold>=BREATH_HOLD){breath.tired=BREATH_TIRED;breath.hold=0;hud.toast('OUT OF BREATH');}}
   else{if(breath.hold>0&&!shiftHeld)breath.hold=Math.max(0,breath.hold-dt*2);breath.tired=Math.max(0,breath.tired-dt);}
   const steady=scoped&&shiftHeld&&breath.tired<=0&&breath.hold>0;
   const breathSway=adsBlend*(.0012+(WEIGHT[w.id]||0)*.0022)*((zoomOf(w)||1)>3?1.4:1)*(steady?.08:breath.tired>0?2.6:1),idle=.003*(1-adsBlend);
   const swayYaw=Math.sin(time*1.1)*idle+Math.sin(time*2.3)*breathSway,swayPitch=Math.sin(time*1.7)*idle*.8+Math.cos(time*1.9)*breathSway;
   free.yaw=yaw+ky*.05+shx+swayYaw*adsBlend*4;free.pitch=clamp(pitch+kp*.05+shy+swayPitch*adsBlend*4,-1.4,1.4);
   o.setLook(free.yaw,free.pitch);

   // Procedural viewmodel pose
   const m=models[w.id],rig=m.rig,act=updateAction(dt);
   const hip=rig.hip,ads=m.adsPos||hip;
   const heavy=WEIGHT[w.id]||0;
   const bobAmt=clamp(speedSmoothed/6,0,1)*(1-adsBlend*.8)*(mv.airborne?.2:1)*(1+heavy*1.1);
   const bobX=Math.sin(bobPhase)*.013*bobAmt,bobY=-Math.abs(Math.cos(bobPhase))*.014*bobAmt-stepDip*stepDip*.006*(.4+heavy)*(1-adsBlend*.7);
   // Strafing: the weapon trails and tilts against the way you move.
   const latK=lateral/6*(1-adsBlend*.7)*(1+heavy);
   const breathe=Math.sin(time*1.4)*.0016*(1-adsBlend*.7);
   const eq=1-easeOut(equipBlend);
   updateWallPull(dt);
   // Guard: the weapon comes up across the chest, turned flat to take the blow.
   if(guard){guard.raised&&!armed&&guard.lower();root.EdenMelee?.guardTick(guard,dt);guardBlend+=((guard.raised?1:0)-guardBlend)*(1-Math.exp(-18*dt));}
   const gb=guardBlend;
   const tx_=lerp(hip[0],ads[0],adsBlend)+rig.sprint[0]*sprintBlend+bobX+act.x-latK*.012-gb*.11;
   const ty_=lerp(hip[1],ads[1],adsBlend)+rig.sprint[1]*sprintBlend+bobY+breathe+act.y-eq*.22-wallPull*.12+anim.land.step(0,dt)*.02+gb*.07;
   const tz_=lerp(hip[2],ads[2],adsBlend)+rig.sprint[2]*sprintBlend+act.z+wallPull*.3+gb*.06;
   const swx=anim.swayX.step(0,dt),swy=anim.swayY.step(0,dt);
   m.holder.position.set(tx_+swx*.01+anim.posX.step(0,dt)*.01,ty_+swy*.008+anim.posY.step(0,dt)*-.01,tz_+anim.posZ.step(0,dt)*.012);
   const r0=rig.hipRot;
   m.holder.rotation.set(
    lerp(r0[0],0,adsBlend)+rig.sprintRot[0]*sprintBlend+act.rx+anim.rotX.step(0,dt)*.02+swy*.04+eq*-.9-wallPull*.6,
    lerp(r0[1],0,adsBlend)+rig.sprintRot[1]*sprintBlend+act.ry+anim.rotY.step(0,dt)*.02+swx*.06+bobX*1.5,
    lerp(r0[2],0,adsBlend)+rig.sprintRot[2]*sprintBlend+act.rz+anim.rotZ.step(0,dt)*.02+swx*.08+bobX*2-latK*.09+gb*1.15,'YXZ');
   if(w.id==='c4'){const live=charges.some(c=>!c.done);const r=m.parts.remote;r.visible=live||lastTime-(state.c4press||-9)<.6;const press=lastTime-(state.c4press||-9);r.position.set(-.2+bobX,-.16+bobY+(press<.2?-.01:0),-.34);m.parts.button.position.z=press<.15?.008:.012;m.parts.remoteLed.material.emissiveIntensity=press<.6?6:(Math.floor(time*2)%2?2:.2);}
   poseArms(w,s,m);
   // The weapon HUD refreshes 10 times a second from here; equips, pickups and reloads refresh it at once.
   {const t=performance.now();if(t-hudFrameAt>100){hudFrameAt=t;hud.update();}}
  }

  // Called by the host right before it renders the scene, after anything else touched the lights.
  function preRender(){
   if(!built)return;
   if(fillBase){const f=o.fill,fl=state.flash*state.flash,bl=state.blast*state.blast;
    if(fl>.001||bl>.001){const src=bl>fl*.1?blastLight.position:flashLight.position;const dir=src.clone().sub(camera.position);if(dir.lengthSq()<1e-4)dir.set(0,1,0);
     f.position.copy(dir.normalize().multiplyScalar(-20).add(new T.Vector3(0,6,0)));if(bl>fl*.1)f.position.copy(src.clone().sub(camera.position).normalize().multiplyScalar(-1).add(new T.Vector3(0,.4,0)).multiplyScalar(20));
     const near=bl>fl*.1?clamp(1.4-camera.position.distanceTo(src)/40,.25,1.4):1;
     f.color.copy(fillBase.color).lerp(new T.Color(0xffc48a),Math.min(.8,fl*1.2+bl*.7));f.intensity=fillBase.intensity+fl*1.4+bl*2.4*near;state.fillDirty=true;}
    else if(state.fillDirty){f.color.copy(fillBase.color);f.intensity=fillBase.intensity;f.position.copy(fillBase.position);state.fillDirty=false;}}
  }

  function render(){
   if(!built)return;
   if(studioNow!==1&&(viewHidden()||!root.bodycam?.active?.()))dimStudio(1);
   if(!mobile)renderHeat();
   if(armed&&!o.overlayed?.())renderViewmodel();
   renderPost();
  }

  // The view-space flash sprite and its light exist from the start (prewarm compiles them), not from the first shot.
  function ensureViewFlash(){if(viewScene.userData.flash)return;const f=new T.Sprite(new T.SpriteMaterial({map:tx.flashes?.[0]||tx.flash,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));/* adds light, covers nothing: the overlay's alpha stays the gun's */Object.assign(f.material,{blending:T.CustomBlending,blendSrc:T.SrcAlphaFactor,blendDst:T.OneFactor,blendSrcAlpha:T.ZeroFactor,blendDstAlpha:T.OneFactor});f.layers.enable(GLOW);f.visible=false;viewScene.add(f);viewScene.userData.flash=f;const l=new T.PointLight(0xffa850,0,1.2,2);viewScene.add(l);viewScene.userData.flashLight=l;}
  // The weapon is lit by what lights the place it is in (Beyond Eden: o.viewLight, app.js), eased so it does not flicker from
  // one probe to the next. Directions are world directions, turned into the view.
  const viewQ=new T.Quaternion(),lightNow={sky:new T.Color(),ground:new T.Color(),key:new T.Color(),rim:new T.Color(),keyDir:new T.Vector3(0,1,0),rimDir:new T.Vector3(0,1,0),env:0},lightTo={sky:new T.Color(),ground:new T.Color(),key:new T.Color(),rim:new T.Color(),keyDir:new T.Vector3(0,1,0),rimDir:new T.Vector3(0,1,0),env:0};let lightAt=0;
  // Weapon materials carry the studio map themselves, at full strength: dim it with the place.
  const studio=new Map(),weaponSkins=new Map();let studioAt=0,studioNow=1;
  function dimStudio(k){const now=performance.now();if(k!==1&&now-studioAt>1000||k!==studioNow&&!studio.size){studioAt=now;viewScene.traverse(x=>{if(x.isMesh)for(const m of [].concat(x.material))if(m?.envMap&&!studio.has(m))studio.set(m,m.envMapIntensity);});}
   if(k===1&&studioNow===1)return;studioNow=k;for(const [m,base] of studio)m.envMapIntensity=base*k;}
  function viewLight(){
   if(!o.viewLight?.(lightTo)){lightAt=0;dimStudio(1);return false;}
   const now=performance.now(),k=lightAt?1-Math.exp(-Math.min(.2,(now-lightAt)/1000)*7):1;lightAt=now;
   for(const n of ['sky','ground','key','rim'])lightNow[n].lerp(lightTo[n],k);for(const n of ['keyDir','rimDir'])lightNow[n].lerp(lightTo[n],k);lightNow.env+=(lightTo.env-lightNow.env)*k;
   // Not the lens's own turn: the weapon moves inside the frame, and light does not turn with it.
   // The view scene is the camera's frame turned by the free aim (viewCamera looks along free.view): undo both, so a lamp stays
   // where it is in the world as the weapon swings inside the frame, and its highlight slides along the slide as it should.
   viewQ.copy(camera.quaternion).multiply(free.view).invert();
   viewHemi.color.copy(lightNow.sky);viewHemi.groundColor.copy(lightNow.ground);viewHemi.position.set(0,1,0).applyQuaternion(viewQ);viewHemi.intensity=1;
   sunView.position.copy(lightNow.keyDir).normalize().applyQuaternion(viewQ);sunView.target.position.set(0,0,0);sunView.color.copy(lightNow.key);sunView.intensity=1;
   viewRim.position.copy(lightNow.rimDir).normalize().applyQuaternion(viewQ);viewRim.color.copy(lightNow.rim);viewRim.intensity=1;viewScene.environmentIntensity=lightNow.env;dimStudio(lightNow.env);
   return true;
  }
  // Drawn by the post chain in front of the lens (Beyond Eden), or straight onto the finished picture.
  const keyView=new T.Vector3(),keyBlack=new T.Color(0,0,0);
  const viewHidden=()=>!built||!armed||current?.id==='fists'||scoped||(o.thirdPerson?.()||0)>.35||handsBusy&&equipBlend<.04;
  function renderOverlay(){if(viewHidden())return false;renderViewmodel(true);return true;}
  function renderViewmodel(target=false){
   if(viewHidden())return;
   viewCamera.aspect=camera.aspect;viewCamera.updateProjectionMatrix();viewCamera.quaternion.copy(free.view).invert();
   const lit=viewLight(target);
   // Sun direction (world) into view space so the weapon is lit like the garden.
   const sun=new T.Vector3(-23,19,-48).normalize().applyQuaternion(camera.quaternion.clone().invert());
   if(!lit){sunView.position.copy(sun);sunView.target.position.set(0,0,0);}
   const night=clamp(-(camera.position.z+11)/30,0,1);if(!lit){viewHemi.position.set(0,1,0);sunView.color.setHex(0xfff0d0);viewHemi.color.setHex(0xe6f2ff);viewHemi.groundColor.setHex(0x4a4a32);viewRim.color.setHex(0xbfd6ff);viewRim.position.set(-1,.5,1);sunView.intensity=lerp(2.6,.5,night);viewScene.environmentIntensity=lerp(1,.12,night);if(viewRim)viewRim.intensity=lerp(.8,.16,night);if(viewHemi)viewHemi.intensity=lerp(.9,.12,night);}
   // Muzzle flash sprite rendered in view space
   ensureViewFlash();
   if(hot.until>lastTime&&current?.id===hot.id&&models[hot.id]?.parts?.muzzle){muzzleOnLens(barrelAt);hot.seen=true;}else hot.seen=false;
   const fl=viewScene.userData.flash,fll=viewScene.userData.flashLight;
   const fa=state.flash||0;fl.visible=fa>.05&&current&&current.id!=='axe'&&current.id!=='fists'&&current.id!=='c4';
   if(fl.visible){models[current.id].holder.updateMatrixWorld(true);models[current.id].parts.muzzle.getWorldPosition(fl.position);const s=(current.id==='pump'?.32:.2)*(.7+fa*.5)*(state.flashScale||1);fl.scale.set(s,s,s);if(tx.flashes)fl.material.map=tx.flashes[state.flashVariant||0];fl.material.rotation=state.flashRot||0;fl.material.opacity=Math.min(1,fa*1.4);fll.position.copy(fl.position);}
   fll.intensity=fa*fa*3;
   const auto=renderer.autoClear;renderer.autoClear=false;if(!target)renderer.clearDepth();const exposure=renderer.toneMappingExposure;renderer.toneMappingExposure=lit?exposure:exposure*lerp(1,.5,night);armsRig?.setLook?.(real()?1:0);if(armsRig?.setKey){viewCamera.updateMatrixWorld();keyView.copy(sunView.position).normalize().transformDirection(viewCamera.matrixWorldInverse);armsRig.setKey(keyView,lit?sunView.color:keyBlack);}try{renderer.render(viewScene,viewCamera);}finally{armsRig?.setLook?.(0);}renderer.toneMappingExposure=exposure;renderer.autoClear=auto;
  }

  /* ------------------------------------------------------------ bloom + lens flares (shot effects only) */
  // Bloom: emitters on the GLOW layer -> quarter-res HDR buffer -> two blur radii.
  // Lens flare: image-based (screen-space) ghosts and halo generated from the bloom buffer itself,
  // with chromatic aberration, modulated by a lens-dirt texture and a diffraction starburst. Because
  // the flare is derived from the actual bright pixels, its shape, colour and position follow the
  // real muzzle flash / fireball instead of fixed sprites.
  let post=null;
  function lensTextures(){
   const dirt=tex(canvas(512,288,(ctx,w,h)=>{ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    for(let i=0;i<70;i++){const x=Math.random()*w,y=Math.random()*h,r=rand(8,48);const g=ctx.createRadialGradient(x,y,0,x,y,r);const v=rand(.04,.16);g.addColorStop(0,`rgba(255,255,255,${v})`);g.addColorStop(.7,`rgba(255,255,255,${v*.5})`);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
    for(let i=0;i<9;i++){ctx.strokeStyle=`rgba(255,255,255,${rand(.04,.09)})`;ctx.lineWidth=rand(4,14);ctx.lineCap='round';ctx.beginPath();const x=Math.random()*w,y=Math.random()*h;ctx.moveTo(x,y);ctx.bezierCurveTo(x+rand(-80,80),y+rand(-40,40),x+rand(-80,80),y+rand(-40,40),x+rand(-120,120),y+rand(-60,60));ctx.stroke();}
    for(let i=0;i<260;i++){ctx.fillStyle=`rgba(255,255,255,${rand(.08,.35)})`;ctx.beginPath();ctx.arc(Math.random()*w,Math.random()*h,rand(.6,2.2),0,TAU);ctx.fill();}
    const v=ctx.createRadialGradient(w/2,h/2,h*.2,w/2,h/2,w*.62);v.addColorStop(0,'rgba(0,0,0,.55)');v.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=v;ctx.fillRect(0,0,w,h);}),false);
   const star=tex(canvas(512,512,(ctx,w,h)=>{ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);ctx.globalCompositeOperation='lighter';
    // 6-blade aperture: 12 primary spikes plus fine diffraction noise.
    for(let i=0;i<12;i++){ctx.save();ctx.rotate(i*TAU/12+rand(-.01,.01));const len=rand(170,250);const g=ctx.createLinearGradient(0,0,len,0);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-2.2);ctx.lineTo(len,0);ctx.lineTo(0,2.2);ctx.fill();ctx.restore();}
    for(let i=0;i<220;i++){ctx.save();ctx.rotate(Math.random()*TAU);const len=rand(40,200);const g=ctx.createLinearGradient(0,0,len,0);g.addColorStop(0,`rgba(255,255,255,${rand(.03,.1)})`);g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,-.6,len,1.2);ctx.restore();}}),false);
   return {dirt,star};
  }
  function buildPost(){
   const rt=()=>new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType,depthBuffer:false});
   const quadGeo=new T.PlaneGeometry(2,2);
   const vert='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
   const blur=new T.ShaderMaterial({uniforms:{tex:{value:null},dir:{value:new T.Vector2()}},vertexShader:vert,depthTest:false,depthWrite:false,
    fragmentShader:'uniform sampler2D tex;uniform vec2 dir;varying vec2 vUv;void main(){vec4 c=texture2D(tex,vUv)*.227027;c+=texture2D(tex,vUv+dir*1.3846153)*.3162162;c+=texture2D(tex,vUv-dir*1.3846153)*.3162162;c+=texture2D(tex,vUv+dir*3.2307692)*.0702703;c+=texture2D(tex,vUv-dir*3.2307692)*.0702703;gl_FragColor=c;}'});
   // Pseudo lens flare (after J. Chapman): flip the bright buffer through the optical centre, sample ghosts along that axis
   // with per-channel offsets (chromatic aberration), weight towards the centre, add a halo ring.
   const ghost=new T.ShaderMaterial({uniforms:{tex:{value:null},texel:{value:new T.Vector2()},aspect:{value:1}},vertexShader:vert,depthTest:false,depthWrite:false,
    fragmentShader:`uniform sampler2D tex;uniform vec2 texel;uniform float aspect;varying vec2 vUv;
     vec3 bright(vec2 uv){return max(texture2D(tex,uv).rgb-vec3(.8),vec3(0.));}
     vec3 ca(vec2 uv,vec2 dir,float k){return vec3(bright(uv-dir*k).r,bright(uv).g,bright(uv+dir*k).b);}
     float edge(vec2 uv){vec2 e=smoothstep(vec2(0.),vec2(.08),uv)*smoothstep(vec2(0.),vec2(.08),1.-uv);return e.x*e.y;}
     void main(){
      vec2 uv=1.-vUv;vec2 gv=(vec2(.5)-uv)*.42;vec2 dir=normalize(gv+1e-5);float k=texel.x*3.5;vec3 r=vec3(0.);
      for(int i=0;i<6;i++){vec2 o=uv+gv*float(i);float w=length(vec2(.5)-o)/.7071;w=pow(max(0.,1.-w),9.);
       vec3 tint=mix(vec3(1.,.8,.6),vec3(.7,.85,1.),fract(float(i)*.37))*(1.-float(i)*.1)*.35;r+=ca(o,dir,k*(1.+float(i)))*w*tint*edge(o);}
      vec2 hv=normalize(vec2(gv.x*aspect,gv.y))*vec2(1./aspect,1.)*.47;vec2 ho=uv+hv;float hw=length((vec2(.5)-ho)*vec2(aspect,1.))/.6;hw=pow(max(0.,1.-abs(hw-.78)*4.),3.);
      r+=ca(ho,dir,k*2.)*hw*vec3(.85,.9,1.)*.12*edge(ho);
      gl_FragColor=vec4(r,1.);}`});
   const lens=lensTextures();
   const comp=new T.ShaderMaterial({uniforms:{a:{value:null},b:{value:null},g:{value:null},dirt:{value:lens.dirt},star:{value:lens.star},starRot:{value:0},aspect:{value:1},strength:{value:1},flare:{value:1},bend:{value:0}},vertexShader:vert,transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,
    fragmentShader:`uniform sampler2D a,b,g,dirt,star;uniform float starRot,aspect,strength,flare,bend;varying vec2 vUv;
     void main(){
      // Drawn over the finished picture: look the glow up through the same barrel bend (eden-post finish) so it sits on the
      // muzzle it came from. The dirt and the starburst are on the glass and stay put.
      vec2 q=(vUv-.5)*vec2(aspect,1.),at=.5+(vUv-.5)*(1.-bend*(1.-dot(q,q)/(aspect*aspect*.25+.25)));
      vec3 bloom=texture2D(a,at).rgb*1.1+texture2D(b,at).rgb*1.7;
      float d=texture2D(dirt,vUv).r;
      vec2 s=(vUv-.5)*vec2(aspect,1.);float cs=cos(starRot),sn=sin(starRot);s=vec2(cs*s.x-sn*s.y,sn*s.x+cs*s.y)*.9+.5;
      float st=texture2D(star,s).r;
      vec3 ghosts=texture2D(g,at).rgb*flare;
      vec3 c=bloom+bloom*d*1.1+ghosts*(d*1.6+.3)+min(bloom,vec3(3.))*st*.18;
      c*=strength;c=1.-exp(-c);gl_FragColor=vec4(c,1.);}`});
   const quadScene=new T.Scene(),quad=new T.Mesh(quadGeo,blur);quad.frustumCulled=false;quadScene.add(quad);
   const overlay=new T.Scene(),compQuad=new T.Mesh(quadGeo,comp);compQuad.frustumCulled=false;overlay.add(compQuad);
   post={a:rt(),b:rt(),c:rt(),d:rt(),e:rt(),blur,ghost,comp,quad,quadScene,overlay,cam:new T.OrthographicCamera(-1,1,1,-1,0,1),size:new T.Vector2(),clear:new T.Color()};
  }
  function pass(src,dst,dx,dy){post.quad.material=post.blur;post.blur.uniforms.tex.value=src.texture;post.blur.uniforms.dir.value.set(dx/src.width,dy/src.height);renderer.setRenderTarget(dst);renderer.render(post.quadScene,post.cam);}
  function warmPost(){
   if(mobile)return;
   if(!post)buildPost();const target=renderer.getRenderTarget(),flash=state.flash;const warm=new T.WebGLRenderTarget(8,8);
   try{renderer.setRenderTarget(warm);state.flash=1;renderPost();}finally{state.flash=flash;renderer.setRenderTarget(target);warm.dispose();}
   renderer.compile(post.overlay,post.cam);
  }
  function glowActive(){return (state.flash||0)>.02||(state.blast||0)>.01||tracers.some(t=>t.alive)||particles.some(p=>p.alive&&p.additive)||flips.some(f=>f.alive&&f.glowMesh)||charges.some(c=>!c.done&&c.stuck);}
  function renderPost(){
   // Phones retain the flash sprite, tracer, smoke, recoil and impact effects
   // in the normal passes; avoid re-rendering the world for ten bloom passes.
   if(mobile)return;
   if(!glowActive())return;
   if(!post)buildPost();
   renderer.getDrawingBufferSize(post.size);const w=Math.max(4,Math.ceil(post.size.x/4)),h=Math.max(4,Math.ceil(post.size.y/4));
   if(post.a.width!==w||post.a.height!==h){post.a.setSize(w,h);post.b.setSize(w,h);for(const k of ['c','d','e'])post[k].setSize(Math.ceil(w/2),Math.ceil(h/2));}
   const prevTarget=renderer.getRenderTarget(),auto=renderer.autoClear,clearAlpha=renderer.getClearAlpha();renderer.getClearColor(post.clear);
   const camMask=camera.layers.mask,viewMask=viewCamera.layers.mask;
   // 1. Emitters only, quarter resolution, HDR.
   renderer.autoClear=false;renderer.setRenderTarget(post.a);renderer.setClearColor(0x000000,0);renderer.clear(true,false,false);
   const bg=scene.background;scene.background=null;camera.layers.set(GLOW);renderer.render(scene,camera);camera.layers.mask=camMask;scene.background=bg;
   if(armed){viewCamera.layers.set(GLOW);renderer.render(viewScene,viewCamera);viewCamera.layers.mask=viewMask;}
   // 2. Bloom: tight at 1/4, wide at 1/8.
   pass(post.a,post.b,1,0);pass(post.b,post.a,0,1);
   pass(post.a,post.c,1.5,0);pass(post.c,post.d,0,1.5);pass(post.d,post.c,2.5,0);pass(post.c,post.d,0,2.5);
   // 3. Lens ghosts + halo from the bloom buffer, softened.
   post.quad.material=post.ghost;post.ghost.uniforms.tex.value=post.a.texture;post.ghost.uniforms.texel.value.set(1/post.a.width,1/post.a.height);post.ghost.uniforms.aspect.value=post.size.x/post.size.y;
   renderer.setRenderTarget(post.e);renderer.render(post.quadScene,post.cam);pass(post.e,post.c,1.5,0);pass(post.c,post.e,0,1.5);
   // 4. Composite: bloom + lens dirt + ghosts lit by a diffraction starburst that turns with the view.
   const u=post.comp.uniforms;u.a.value=post.a.texture;u.b.value=post.d.texture;u.g.value=post.e.texture;u.aspect.value=post.size.x/post.size.y;
   u.starRot.value=yaw*.8+pitch*.5;u.strength.value=lerp(.95,.65,clamp(state.blast||0,0,1));u.flare.value=1;u.bend.value=lensPost()?.bend?.()||0;
   renderer.setRenderTarget(prevTarget);renderer.render(post.overlay,post.cam);
   renderer.setClearColor(post.clear,clearAlpha);renderer.autoClear=auto;
  }

  // Remote shots (bots): positional sound, muzzle flash, tracer and world impact.
  const nearMissDir=new T.Vector3(),nearMissDelta=new T.Vector3(),nearMissPoint=new T.Vector3();
  function remoteShot({from,to,weapon='pistol',hit=null,dir=null}){
   if(!built)build();
   const W=WEAPONS.find(x=>x.id===weapon)||WEAPONS[0];
   spawn({map:tx.flash,additive:true,pos:from,life:.05,size:[.35,.5],color:0xffd9a0});
   tracer(from,to,false);
   if(hit)impact(hit,dir||to.clone().sub(from).normalize(),.6,false);
   sfx.remote(W.snd||W.id,from);const v=nearMissDir.copy(to).sub(from),len=v.length();if(len>.01){v.multiplyScalar(1/len);const along=nearMissDelta.copy(camera.position).sub(from).dot(v);if(along>0&&along<len&&nearMissPoint.copy(from).addScaledVector(v,along).distanceToSquared(camera.position)<2.25){sfx.nearMiss(nearMissPoint);suppress=Math.min(1,suppress+.22);}else if(along>0&&along<len&&nearMissPoint.distanceToSquared(camera.position)<9)suppress=Math.min(1,suppress+.1);}requestFrame();
  }
  function hurt(fromPos,amount){
   if(!built)return;const d=fromPos?fromPos.clone().sub(camera.position):new T.Vector3(0,0,-1);
   const local=d.applyQuaternion(camera.quaternion.clone().invert());const ang=Math.atan2(local.x,-local.z);
   // Shot while aiming down the sights: the sights get knocked off target (flank people who are scoped in).
   const flinch=1+adsBlend*(zoomOf(current)>3?2.2:1.2);
   hud.hurt(.35+amount/40,ang);look.kickPitch.kick((amount*.055+.15)*flinch);if(adsBlend>.2)look.kickYaw.kick(rand(-1,1)*amount*.05*adsBlend);look.kickYaw.kick(rand(-1,1)*amount*.035+Math.sin(ang)*amount*.02);look.shake=Math.max(look.shake,Math.min(.75,.18+amount/45));sfx.hurt(amount);if(amount>=18)o.hitStop?.(Math.min(140,40+amount*2));
   // Body camera: a hard hit from someone close (a blow, a tackle, a point-blank shot) knocks the picture out of sync for a
   // few frames. Not the zone's burn (no one struck you), not with reduced motion.
   if(fromPos&&real()&&!o.reduced){const near=1-clamp((fromPos.distanceTo(camera.position)-2.5)/4,0,1),k=clamp((amount-10)/30,0,1)*(.45+.55*near);if(amount>=14&&(near>0||amount>=30))lensPost()?.jolt?.(Math.max(.35,k));}
  }
  const arsenalApi={
   set(a){build();if(!a){arsenal=null;resetState();hud.el.classList.remove('empty');if(!armed)hud.el.classList.remove('on');hud.update();return;}
    arsenal={owned:new Set(a.owned||[]),reserve:{...(a.reserve||{})},order:['pistol','smg','rifle','sniper','pump','axe','c4','fists'],
     slots(){return this.order.filter(id=>this.owned.has(id));}};arsenal.owned.add('fists');
    for(const id in VARIANTS)applyVariant(id,a.variants?.[id]||null);
    for(const w of WEAPONS){state[w.id]={...state[w.id],ammo:a.loaded?.[w.id]??0,chamber:true,action:null,lockedBack:false};}
    if(current&&!arsenal.owned.has(current.id)){const first=arsenal.slots()[0];if(first)equip(first);else holster();}hud.update();},
   give(id,loaded,variant){build();if(!arsenal)return false;const W=WEAPONS.find(x=>x.id===id);if(!W)return false;const had=arsenal.owned.has(id);arsenal.owned.add(id);if(!had&&VARIANTS[id])applyVariant(id,variant||null);if(!had)state[id]={...state[id],ammo:loaded??W.mag,chamber:true,action:null,lockedBack:false};hud.update();return !had;},
   drop(id){if(!arsenal)return 0;const ammo=state[id]?.ammo||0;arsenal.owned.delete(id);if(current?.id===id){const n=arsenal.slots()[0];if(n)equip(n);else holster();}hud.update();return ammo;},
   addAmmo(type,n){if(!arsenal)return;arsenal.reserve[type]=(arsenal.reserve[type]||0)+n;hud.update();},
   variantOf:id=>variants[id]||null,
   setVariant(id,vid){build();if(VARIANTS[id])applyVariant(id,vid||null);},
   inspect(){return arsenal?{owned:[...arsenal.owned].filter(id=>id!=='fists'),reserve:{...arsenal.reserve},variants:{...variants},loaded:Object.fromEntries([...arsenal.owned].filter(id=>id!=='fists').map(id=>[id,state[id]?.ammo||0]))}:null;}
  };

  return {
   equip,holster,enterRange,leaveRange(){setRange(false);},inRange:()=>rangeOn,update,render,preRender,syncAim,freeAimOn:()=>free.on,
   // Free aim as it stands: on, the muzzle's angle off the look (radians), where it sits on screen (-1..1) and the dead zone.
   freeAim:()=>({on:free.on,x:+free.x.toFixed(4),y:+free.y.toFixed(4),screen:{x:+free.screen.x.toFixed(3),y:+free.screen.y.toFixed(3)},zone:{x:FREE_ZONE.x*freeZone(),y:FREE_ZONE.y*freeZone()},look:{yaw:+yaw.toFixed(4),pitch:+pitch.toFixed(4)}}),aimDirection:v=>aimForward(v),remoteShot,hurt,arsenal:arsenalApi,weapons:WEAPONS,variants:VARIANTS,
   // Loot label for a class and variant (vid null: the class's own gun), independent of what the player carries.
   gunLabel:(id,vid)=>{const v=variantOfSpec(id,vid),b=BASE_STATS[id]||{};return v?v.name+' · '+v.kind:b.name+' · '+b.kind;},
   worldHits:(o2,d,f)=>{build();return worldHits(o2,d,f);},groundAt:(x,z,y)=>{build();return groundAt(x,z,y);},
   // Touch screens (touch-controls.js): no pointer lock; look, fire, melee and zoom come from on-screen controls.
   setTouch(on){touchMode=!!on;hud?.update();},
   touchLook(dx,dy){if(!armed||!o.canAct())return;
    // A swipe away from the assisted target hands control back to the thumb (see the pull above).
    awayFrom(dx);
    // Friction slows fine aiming over a target; a quick swipe turns at full speed.
    const friction=lerp(assist.friction,1,Math.min(1,Math.hypot(dx,dy)/8)),z=zoomOf(current)||1,sens=.0052*lerp(1,Math.min(.7,1.35/z),adsBlend)*lookScale()*friction;freeLook(dx*sens,-dy*sens*ySign());anim.swayX.kick(-dx*.02);anim.swayY.kick(dy*.02);requestFrame();},
   touchFire(on){if(!armed){if(on)raiseFists();return;}buttons.left=!!on;if(on)pendingFire=true;requestFrame();},
   touchMelee(){if(!armed)return;if(current?.id==='c4')detonate();else bash();},
   // Phones: the HIT button follows the keyboard (tap to bash, hold to slam); BLOCK raises the guard while held.
   touchMeleeDown(){if(!armed)return;if(heldInput('b'))return;if(current?.id==='c4')detonate();else bashHold.down();},
   touchMeleeUp(){bashHold.up();},
   touchGuard(down){guardInput(down);},raiseFists,cycle,canRaise:()=>!!arsenal&&!armed&&!!o.canAct(),
   guard:()=>guard,
   toggleZoom(){if(!zoomable())return false;zoomTarget=zoomTarget>.5?0:1;requestFrame();return true;},
   scoped:()=>scoped,ads:()=>armed?adsBlend:0,weight:()=>armed&&current?WEIGHT[current.id]||0:0,zoom:(v)=>{if(v!=null){zoomTarget=clamp(v,0,1);requestFrame();}return zoomTarget;},
   // Knocked flat (tackled, dived): the sights drop.
   dropAim(){zoomTarget=0;},
   syncLook(dPitch=0){const l=o.getLook();yaw=l.yaw;pitch=clamp(l.pitch+dPitch,-1.35,1.35);},
   // prewarm.js: compile every first-person weapon (hidden ones too) before the first draw, not on first equip.
   renderOverlay,
   primeView(){build();ensureViewFlash();const hidden=[];viewScene.traverse(o=>{if(!o.visible){hidden.push(o);o.visible=true;}});const auto=renderer.autoClear,wasArmed=armed;try{renderer.autoClear=false;renderer.render(viewScene,viewCamera);armed=true;warmPost();}finally{armed=wasArmed;renderer.autoClear=auto;for(const o of hidden)o.visible=false;}},
   prewarmShaders(){build();sfx.init();ensureViewFlash();warmPost();const hidden=[];viewScene.traverse(x=>{if(!x.visible&&!x.isLight){hidden.push(x);x.visible=true;}});try{const job=renderer.compileAsync?renderer.compileAsync(viewScene,viewCamera):renderer.compile(viewScene,viewCamera);job?.catch?.(()=>{});}catch(e){console.warn('Weapon prewarm failed',e);}finally{for(const x of hidden)x.visible=false;}return hidden.length;},
   ready(){build();return armsRig?armsRig.ready.then(()=>true,()=>false):Promise.resolve(false);},
   // A copy of a gun for the world (loot, bots' hands). vid: a variant, whose model arrives later; onReady(model) runs
   // when it is in place (callers restyle its materials then).
   weaponModel(id,vid=null,onReady=null){build();const v=variantOfSpec(id,vid);
    if(v){const g=new T.Group(),done=src=>{const c=src.clone(true);c.traverse(x=>{x.visible=true;if(x.isMesh)x.frustumCulled=true;});g.add(c);onReady?.(c);requestFrame();};
     if(id==='c4')throwableModel(v).then(done).catch(()=>{});else armsRig?.loadVariant(id,v).then(gun=>done(gun.model)).catch(()=>{});return g;}
    if(id==='c4'){const g=buildC4Block();return g;}const w=armsRig?.weapons[id];if(!w)return null;const c=w.model.clone(true),own=weaponSkins;/* its own materials: the ones in your hands are dimmed with the place you stand in */c.traverse(x=>{x.visible=true;if(x.isMesh&&!Array.isArray(x.material)&&x.material){let m=own.get(x.material);if(!m){m=x.material.clone();m.onBeforeCompile=x.material.onBeforeCompile;m.customProgramCacheKey=x.material.customProgramCacheKey;m.envMapIntensity=studio.get(x.material)??x.material.envMapIntensity;own.set(x.material,m);}x.material=m;}});return c;},
   setHudMode(mode){build();hud.el.dataset.mode=mode||'';},
   armed:()=>armed,
   weapon:()=>current&&current.id!=='fists'?current.id:null,
   setHandsBusy(on){handsBusy=!!on;},handsBusy:()=>handsBusy,weaponShown:()=>armed&&!(handsBusy&&equipBlend<.04),
   capturing:()=>armed,
   busy:()=>armed||(built&&(glowActive()||embers.length||heat.length||flips.some(f=>f.alive)||particles.some(p=>p.alive)||chipList.some(c=>c.alive)||shells.some(s=>s.mesh.visible&&(s.real?!s.rest:s.bounces<4))||charges.some(c=>!c.done)||targets.some(t=>Math.abs(t.swing.v)>.001||Math.abs(t.swing.x)>.001||t.down)||debris.length||tracers.some(t=>t.alive)||(state.blast||0)>0)),
   blocks(p){for(const t of targets){const q=t.root.position;if(t.kind==='plate'?Math.abs(p.x-q.x)<.62&&Math.abs(p.z-q.z)<.25:Math.hypot(p.x-q.x,p.z-q.z)<t.radius)return true;}return false;},
   inspect:()=>({audio:recorded?.inspect(),pools:{ready:poolsReady,particles:particles.length,tracers:tracers.length,shells:shells.length,decals:decals.length,flips:flips.length},aimAssist:window.edenSettings?.get('aimAssist')||'high',wallPull,action:current?state[current.id]?.action?.name||null:null,built,armed,locked,weapon:current?.id||null,ammo:current?state[current.id].ammo:null,focus:current?state[current.id].focus:0,charges:charges.filter(c=>!c.done).length,stats:{...stats},targets:targets.length,particles:particles.filter(p=>p.alive).length}),
   _debug:{flight:(o2,d,range,id)=>flight(o2,d,range,WEAPONS.find(x=>x.id===id)),shells:()=>shells,flips:()=>flips,barrel:()=>({...hot}),chips:()=>chipList,look:(dx,dy)=>{freeLook(dx,dy);requestFrame();},startAudioCapture:()=>recorded?.startCapture(),stopAudioCapture:()=>recorded?.stopCapture(),explodeAt:(x,z)=>{const g=new T.Group();g.position.set(x,groundAt(x,z)+.05,z);world.add(g);state.blastSeen=1;explode({group:g});},viewScene:()=>viewScene,fire:()=>{if(current)fire();},state,models,setButtons:b=>Object.assign(buttons,b),setLocked:v=>{locked=v;},detonate:()=>detonate(),reload:()=>{const l=locked;locked=true;reload();locked=l;}}
  };
 }
 root.createCombat=createCombat;
})(window);
