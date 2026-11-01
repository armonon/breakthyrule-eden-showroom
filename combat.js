'use strict';
/*
 * Eden combat system.
 *
 * Weapons: WITNESS 9mm pistol, JUDGMENT 12ga pump, CAIN felling axe, REVELATION C4.
 * Everything (models, textures, animation, audio) is generated procedurally so nothing
 * extra is downloaded until a visitor actually picks up a weapon.
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
 function Spring(k=180,d=18){this.x=0;this.v=0;this.k=k;this.d=d;}
 Spring.prototype.step=function(target,dt){const a=this.k*(target-this.x)-this.d*this.v;this.v+=a*dt;this.x+=this.v*dt;return this.x;};
 Spring.prototype.kick=function(v){this.v+=v;};

 const WEAPONS=[
  {id:'pistol',slot:1,name:'WITNESS',kind:'9MM PISTOL',mag:12,interval:.11,focusTime:.42,window:.32},
  {id:'pump',slot:2,name:'JUDGMENT',kind:'12GA PUMP',mag:6,interval:.2,focusTime:.6,window:.36},
  {id:'axe',slot:3,name:'CAIN',kind:'FELLING AXE',mag:0,interval:.1,focusTime:.55,window:.3},
  {id:'c4',slot:4,name:'REVELATION',kind:'C4 CHARGE',mag:3,interval:.2,focusTime:1,window:1}
 ];

 function createCombat(o){
  const {T,scene,camera,renderer,stage}=o;
  const hudHost=stage.parentElement;
  let built=false,armed=false,locked=false,current=null,previous=null,lastTime=0;
  let yaw=0,pitch=0,buttons={left:false,right:false},pendingFire=false;
  const look={kickPitch:new Spring(120,16),kickYaw:new Spring(120,16),shake:0};
  const stats={hits:0,trueShots:0,shots:0};
  let lastCamPos=null,speedSmoothed=0,bobPhase=0,verticalVel=0,lastY=0;
  let fillBase=null,env,M,viewScene,viewCamera,sunView,world,fxGroup,flashLight,blastLight,raycaster,hud,audio=null;
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
   const hole=tex(canvas(64,64,(ctx)=>{let g=ctx.createRadialGradient(32,32,0,32,32,30);g.addColorStop(0,'rgba(0,0,0,1)');g.addColorStop(.18,'rgba(10,8,6,1)');g.addColorStop(.3,'rgba(40,34,28,.7)');g.addColorStop(1,'rgba(40,34,28,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);}));
   const splat=tex(canvas(64,64,(ctx)=>{let g=ctx.createRadialGradient(32,32,0,32,32,30);g.addColorStop(0,'rgba(180,182,186,1)');g.addColorStop(.25,'rgba(120,122,126,.95)');g.addColorStop(.45,'rgba(60,60,62,.6)');g.addColorStop(1,'rgba(60,60,62,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);}));
   const scorch=tex(canvas(256,256,(ctx)=>{for(let i=0;i<40;i++){const x=128+rand(-50,50),y=128+rand(-50,50),r=rand(30,90);const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(8,6,4,.35)');g.addColorStop(1,'rgba(8,6,4,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);}}));
   const chop=tex(canvas(64,32,(ctx)=>{ctx.fillStyle='rgba(235,205,160,.95)';ctx.beginPath();ctx.ellipse(32,16,30,5,0,0,TAU);ctx.fill();ctx.fillStyle='rgba(60,35,15,.8)';ctx.fillRect(4,15,56,2);}));
   const paint=tex(canvas(256,256,(ctx,w,h)=>{ctx.fillStyle='#e9e6dc';ctx.fillRect(0,0,w,h);noise(ctx,w,h,3000,2,.08,120);}));
   return {wear,stipple,walnut,hickory,axe,c4,label,soft,puff,flash,hole,splat,scorch,chop,paint};
  }

  function buildEnvironment(){
   const pm=new T.PMREMGenerator(renderer);const s=new T.Scene();
   const geo=new T.SphereGeometry(20,48,24),colors=[],p=geo.attributes.position,c=new T.Color();
   for(let i=0;i<p.count;i++){const y=p.getY(i)/20;if(y>0)c.setRGB(lerp(1.05,.62,y),lerp(1.0,.78,y),lerp(.92,1.0,y));else c.setRGB(lerp(.55,.12,-y),lerp(.55,.15,-y),lerp(.42,.08,-y));colors.push(c.r*1.1,c.g*1.1,c.b*1.1);}
   geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
   s.add(new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide})));
   const panel=(x,y,z,w,h,i,col=0xffffff)=>{const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(col).multiplyScalar(i),side:T.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);s.add(m);};
   panel(-8,12,-14,6,6,9,0xffe2b0);panel(12,6,6,10,3,2.2);panel(-14,4,8,6,8,1.4,0xdfe9ff);panel(0,-6,12,14,2,.5,0x9caa70);
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
   g.userData.led=led;return g;
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
   c4:{hip:[.17,-.17,-.38],hipRot:[.35,-.35,.1],ads:0,sprint:[0,-.08,.04],sprintRot:[-.3,.3,.2],scale:1}
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
   if(models.c4){models.c4.parts.remote.position.set(-.3,-.17,-.36);models.c4.parts.remote.rotation.set(.25,.35,-.05);models.c4.parts.remote.visible=false;viewScene.add(models.c4.parts.remote);}
  }

  /* ------------------------------------------------------------ world: range, effects */
  function worldHits(origin,dir,far){
   raycaster.set(origin,dir);raycaster.near=.02;raycaster.far=far;
   const list=raycaster.intersectObjects(scene.children,true);
   for(const h of list){
    const ob=h.object;if(ob.isPoints||ob.isLine||ob.isSprite||ob===o.sky)continue;
    if(ob.userData.noHit||ob.geometry?.boundingSphere?.radius>90)continue;
    let v=ob,ok=true,skip=false;while(v){if(!v.visible){ok=false;break;}if(v===fxGroup||v.userData.noHit){skip=true;break;}v=v.parent;}
    if(!ok||skip)continue;
    if(ob.material&&(ob.material.visible===false||(ob.material.transparent&&ob.material.opacity<.25)))continue;
    return h;
   }
   return null;
  }
  function groundAt(x,z,from=12){const h=worldHits(new T.Vector3(x,from,z),new T.Vector3(0,-1,0),40);return h?h.point.y:0;}
  function targetOf(object){let v=object;while(v){if(v.userData.target)return v.userData.target;v=v.parent;}return null;}

  function buildRange(){
   const roadX=11.7;
   const add=(t)=>{targets.push(t);return t;};
   const plate=(x,z,kind)=>{
    const y=groundAt(x,z),stand=new T.Group();stand.position.set(x,y,z);world.add(stand);
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
    const y=groundAt(x,z),r=new T.Group();r.position.set(x,y,z);world.add(r);
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
  function spawn(opts){
   let p=particles.find(q=>!q.alive&&q.additive===!!opts.additive&&q.map===opts.map);
   if(!p){if(particles.length>420)return null;const s=new T.Sprite(spriteMat(opts.map,opts.additive));s.userData.noHit=true;fxGroup.add(s);p={sprite:s,additive:!!opts.additive,map:opts.map,vel:new T.Vector3()};particles.push(p);}
   p.alive=true;p.t=0;p.life=opts.life;p.s0=opts.size[0];p.s1=opts.size[1];p.a0=opts.alpha??1;p.gravity=opts.gravity??0;p.drag=opts.drag??1.5;p.c0=new T.Color(opts.color??0xffffff);p.c1=new T.Color(opts.color1??opts.color??0xffffff);p.spin=opts.spin??rand(-1,1);p.fadeIn=opts.fadeIn??0;
   p.sprite.position.copy(opts.pos);p.vel.copy(opts.vel||new T.Vector3());p.sprite.material.rotation=Math.random()*TAU;p.sprite.visible=true;p.sprite.renderOrder=opts.additive?3:2;return p;
  }
  function updateParticles(dt){
   for(const p of particles){if(!p.alive)continue;p.t+=dt;const k=p.t/p.life;if(k>=1){p.alive=false;p.sprite.visible=false;continue;}
    p.vel.y-=p.gravity*dt;p.vel.multiplyScalar(Math.exp(-p.drag*dt));p.sprite.position.addScaledVector(p.vel,dt);
    const s=lerp(p.s0,p.s1,easeOut(k));p.sprite.scale.set(s,s,s);p.sprite.material.rotation+=p.spin*dt;
    const fade=p.fadeIn?Math.min(1,k/p.fadeIn):1;p.sprite.material.opacity=p.a0*fade*(1-k)**1.5;p.sprite.material.color.copy(p.c0).lerp(p.c1,k);}
  }

  function decal(hit,map,size,life=40){
   const n=hit.face?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):new T.Vector3(0,1,0);
   let d=decals.length>=90?decals.shift():null;
   if(!d){d=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshStandardMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.9,envMap:env}));d.userData.noHit=true;}
   d.material.map=map;d.material.needsUpdate=true;d.material.opacity=1;
   world.attach(d);d.position.copy(hit.point).addScaledVector(n,.003);d.lookAt(d.position.clone().add(n));d.rotateZ(Math.random()*TAU);d.scale.set(size,size,size);
   d.userData.life=life;d.userData.born=lastTime;
   if(!hit.object.isInstancedMesh&&!hit.object.isSkinnedMesh)hit.object.attach(d);
   decals.push(d);
  }

  function impact(hit,dir,power=1,isTrue=false){
   const t=targetOf(hit.object);
   const n=hit.face?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):dir.clone().negate();
   const mat=Array.isArray(hit.object.material)?hit.object.material[0]:hit.object.material;
   const metal=t?.kind==='plate'||(mat?.metalness>.5);
   const wood=t?.kind==='post'||mat===M.post;
   const col=mat?.color?mat.color.clone():new T.Color(0x8a7a60);
   if(metal){
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
    if(hit.object.isMesh&&!hit.object.isInstancedMesh)decal(hit,tx.hole,.04);
    sfx.dirt(hit.point);
   }
   if(t){
    stats.hits++;if(isTrue)stats.trueShots++;
    const local=t.pivot.worldToLocal(hit.point.clone());
    t.swing.kick(-dir.z*power*(t.kind==='post'?1.2:5)*Math.sign(local.y||1)*-1);t.twist.kick(clamp(local.x,-.3,.3)*power*(t.kind==='post'?2:12));
    hud.hitmarker(isTrue);
   }
   return t;
  }

  function tracer(from,to,gold){
   let tr=tracers.find(x=>!x.alive);
   if(!tr){if(tracers.length>24)return;const m=new T.Mesh(new T.CylinderGeometry(1,1,1,6,1,true),new T.MeshBasicMaterial({color:0xffd9a0,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));m.userData.noHit=true;fxGroup.add(m);tr={mesh:m};tracers.push(tr);}
   const d=to.clone().sub(from),len=d.length();
   tr.alive=true;tr.t=0;tr.life=gold?.16:.07;tr.mesh.visible=true;tr.mesh.material.color.set(gold?0xffc24a:0xffe2b0);
   tr.mesh.position.copy(from).addScaledVector(d,.5);tr.mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());tr.mesh.scale.set(gold?.006:.0035,len,gold?.006:.0035);
  }

  function ejectShell(kind){
   const m=models[current.id],port=m.parts.ejector.getWorldPosition(new T.Vector3());
   const pos=camera.localToWorld(port.clone());
   let s=shells.length>=40?shells.shift():null;
   if(!s){s={mesh:buildShellMesh(kind==='pump')};s.mesh.traverse(x=>x.userData.noHit=true);world.add(s.mesh);}
   else if(s.kind!==kind){world.remove(s.mesh);s.mesh=buildShellMesh(kind==='pump');s.mesh.traverse(x=>x.userData.noHit=true);world.add(s.mesh);}
   s.kind=kind;s.mesh.visible=true;s.mesh.position.copy(pos);
   const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion),back=new T.Vector3(0,0,1).applyQuaternion(camera.quaternion);
   s.vel=right.multiplyScalar(rand(1.8,2.8)).addScaledVector(up,rand(1.6,2.6)).addScaledVector(back,rand(.1,.6));
   s.spin=new T.Vector3(rand(-20,20),rand(-30,30),rand(-20,20));s.ground=groundAt(pos.x,pos.z,pos.y+.3);s.bounces=0;s.age=0;s.mesh.scale.setScalar(1);
   shells.push(s);
  }
  function updateShells(dt){
   for(const s of shells){if(!s.mesh.visible)continue;s.age+=dt;
    if(s.age>14){s.mesh.visible=false;continue;}
    if(s.bounces<4){s.vel.y-=9.8*dt;s.mesh.position.addScaledVector(s.vel,dt);s.mesh.rotation.x+=s.spin.x*dt;s.mesh.rotation.y+=s.spin.y*dt;s.mesh.rotation.z+=s.spin.z*dt;
     if(s.mesh.position.y<s.ground+.006){s.mesh.position.y=s.ground+.006;if(s.bounces===0)sfx.tink(s.kind,s.mesh.position);s.vel.y*=-.32;s.vel.x*=.55;s.vel.z*=.55;s.spin.multiplyScalar(.45);s.bounces++;if(s.bounces>=4){s.mesh.rotation.x=0;s.mesh.rotation.z=Math.PI/2*Math.sign(Math.random()-.5);}}}
   }
  }

  /* ------------------------------------------------------------ C4 */
  function throwCharge(){
   if(charges.filter(c=>!c.done).length>=WEAPONS[3].mag){hud.toast('Detonate before placing more · RIGHT CLICK');return false;}
   const g=buildC4Block();g.traverse(x=>x.userData.noHit=true);world.add(g);
   const start=camera.localToWorld(new T.Vector3(.15,-.12,-.45));
   const dir=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
   g.position.copy(start);
   const c={group:g,vel:dir.multiplyScalar(8.5).add(new T.Vector3(0,2.2,0)),spin:new T.Vector3(rand(-9,9),rand(-6,6),rand(-9,9)),stuck:false,done:false,age:0,led:g.userData.led};
   charges.push(c);sfx.throw();return true;
  }
  function updateCharges(dt){
   for(const c of charges){if(c.done)continue;c.age+=dt;
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
   const live=charges.filter(c=>!c.done);
   if(!live.length){hud.toast('No charges placed');return;}
   const r=models.c4.parts;state.c4press=lastTime;r.remoteLed.material.emissiveIntensity=6;sfx.beep();
   live.forEach((c,i)=>{c.done=true;setTimeout(()=>explode(c),260+i*140);});
  }
  function explode(c){
   const p=c.group.getWorldPosition(new T.Vector3());c.group.parent?.remove(c.group);
   blastLight.position.copy(p).add(new T.Vector3(0,.6,0));state.blast=1;
   for(let i=0;i<14;i++)spawn({map:tx.puff,additive:true,pos:p.clone().add(new T.Vector3(rand(-.3,.3),rand(0,.4),rand(-.3,.3))),vel:new T.Vector3(rand(-3,3),rand(1,5),rand(-3,3)),life:rand(.35,.7),size:[.6,2.8],color:0xfff0b0,color1:0xff3a00,drag:3});
   for(let i=0;i<22;i++)spawn({map:tx.puff,pos:p.clone().add(new T.Vector3(rand(-.5,.5),rand(0,.8),rand(-.5,.5))),vel:new T.Vector3(rand(-2.5,2.5),rand(1.5,5.5),rand(-2.5,2.5)),life:rand(2.5,5),size:[1,5.5],alpha:.75,color:0x3a3530,color1:0x8c857c,gravity:-.4,drag:1.1,fadeIn:.08});
   for(let i=0;i<46;i++)spawn({map:tx.soft,additive:true,pos:p,vel:new T.Vector3(rand(-1,1),rand(.2,1.4),rand(-1,1)).normalize().multiplyScalar(rand(6,16)),life:rand(.4,1.2),size:[.07,.02],color:0xffd27a,color1:0xff4a00,gravity:9.8,drag:.6});
   for(let i=0;i<26;i++)spawn({map:tx.soft,pos:p,vel:new T.Vector3(rand(-1,1),rand(.4,1.6),rand(-1,1)).normalize().multiplyScalar(rand(3,9)),life:rand(1,1.8),size:[.05,.04],color:0x2a2620,gravity:9.8,drag:.3,spin:rand(-10,10)});
   // Shockwave ring
   const ring=new T.Mesh(new T.RingGeometry(.8,1,48),new T.MeshBasicMaterial({color:0xffe8c0,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending}));ring.userData.noHit=true;
   ring.rotation.x=-Math.PI/2;ring.position.copy(p).setY(groundAt(p.x,p.z,p.y+1)+.05);fxGroup.add(ring);debris.push({mesh:ring,t:0,life:.45,ring:true});
   const g=worldHits(p.clone().add(new T.Vector3(0,.5,0)),new T.Vector3(0,-1,0),3);if(g)decal(g,tx.scorch,3.2,120);
   for(const t of targets){const tp=t.root.getWorldPosition(new T.Vector3());const d=tp.distanceTo(p);if(d<6.5){const f=1-d/6.5;t.swing.kick(f*14*(Math.random()<.5?-1:1));t.twist.kick(f*8*(Math.random()-.5));if(d<3.2&&!t.down){t.down=1;t.downT=lastTime;t.fallDir=Math.atan2(tp.x-p.x,tp.z-p.z);}}}
   const dist=camera.position.distanceTo(p);look.shake=Math.max(look.shake,clamp(1.6-dist/20,.15,1.6));
   if(dist<4)hud.flash(.9);
   sfx.boom(p,dist);requestFrame();
  }

  /* ------------------------------------------------------------ audio (procedural) */
  const sfx=(()=>{
   let ctx=null,master,verb,noiseBuf;
   function init(){if(ctx)return ctx;const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ctx=new C();
    master=ctx.createDynamicsCompressor();master.threshold.value=-10;master.ratio.value=6;const out=ctx.createGain();out.gain.value=.8;master.connect(out).connect(ctx.destination);
    verb=ctx.createConvolver();const len=ctx.sampleRate*2.2,ir=ctx.createBuffer(2,len,ctx.sampleRate);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++){const t=i/ctx.sampleRate;d[i]=(Math.random()*2-1)*Math.exp(-t*2.6)*(t<.05?t/.05:1)*(1+.5*Math.sin(t*40));}}verb.buffer=ir;const vg=ctx.createGain();vg.gain.value=.35;verb.connect(vg).connect(master);
    noiseBuf=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const n=noiseBuf.getChannelData(0);for(let i=0;i<n.length;i++)n[i]=Math.random()*2-1;return ctx;}
   function pan(pos){const p=ctx.createStereoPanner();if(pos){const v=pos.clone().project(camera);p.pan.value=clamp(v.x,-1,1)*.7;}return p;}
   function dist(pos){return pos?clamp(1/(1+camera.position.distanceTo(pos)*.08),.12,1):1;}
   function noise(t,{dur,type='lowpass',f0,f1,q=.7,gain=1,attack=.001,send=.3,pos=null,curve=3}){
    const s=ctx.createBufferSource();s.buffer=noiseBuf;s.playbackRate.value=rand(.9,1.1);const f=ctx.createBiquadFilter();f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,t);if(f1)f.frequency.exponentialRampToValueAtTime(f1,t+dur);
    const g=ctx.createGain();const amp=gain*dist(pos);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(amp,t+attack);g.gain.setTargetAtTime(0,t+attack,dur/curve);
    const p=pan(pos);s.connect(f).connect(g).connect(p).connect(master);if(send){const sg=ctx.createGain();sg.gain.value=send;p.connect(sg).connect(verb);}
    s.start(t,Math.random()*2);s.stop(t+dur*2+.1);
   }
   function tone(t,{f0,f1,dur,type='sine',gain=.5,send=.1,pos=null}){const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);if(f1)o.frequency.exponentialRampToValueAtTime(f1,t+dur);const g=ctx.createGain();const amp=gain*dist(pos);g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);const p=pan(pos);o.connect(g).connect(p).connect(master);if(send){const sg=ctx.createGain();sg.gain.value=send;p.connect(sg).connect(verb);}o.start(t);o.stop(t+dur+.05);}
   const go=fn=>(...a)=>{if(!init())return;if(ctx.state==='suspended')ctx.resume();fn(ctx.currentTime,...a);};
   return {
    init:()=>init(),
    pistol:go((t,isTrue)=>{noise(t,{dur:.005,type:'highpass',f0:3000,gain:1.4,send:0});noise(t,{dur:.11,f0:6000,f1:500,gain:1.3,send:.6});tone(t,{f0:160,f1:45,dur:.13,gain:.9});noise(t+.01,{dur:.35,f0:1400,f1:200,gain:.25,send:.9});if(isTrue){tone(t+.02,{f0:2200,dur:.5,gain:.12,send:.6});tone(t+.02,{f0:3300,dur:.35,gain:.06,send:.6});}}),
    pump:go((t,isTrue)=>{noise(t,{dur:.008,type:'highpass',f0:2000,gain:1.4,send:0});noise(t,{dur:.22,f0:4000,f1:250,gain:1.6,send:.8});tone(t,{f0:110,f1:32,dur:.25,gain:1.2});noise(t+.02,{dur:.6,f0:900,f1:120,gain:.35,send:1});if(isTrue){tone(t+.02,{f0:1700,dur:.6,gain:.12,send:.6});tone(t+.02,{f0:2550,dur:.4,gain:.06,send:.6});}}),
    click:go((t,f=3200,g=.25)=>{noise(t,{dur:.012,type:'bandpass',f0:f,q:3,gain:g,send:.05});tone(t,{f0:f*.7,dur:.03,gain:g*.2,type:'triangle',send:0});}),
    rack:go((t,back)=>{noise(t,{dur:.06,type:'bandpass',f0:back?1300:1900,f1:back?700:2600,q:1.5,gain:.5,send:.1});noise(t+.055,{dur:.02,type:'bandpass',f0:3400,q:4,gain:.5,send:.05});}),
    dry:go(t=>{noise(t,{dur:.01,type:'bandpass',f0:4200,q:6,gain:.3,send:0});}),
    whoosh:go((t,heavy)=>{noise(t,{dur:heavy?.34:.24,type:'bandpass',f0:300,f1:heavy?1400:1800,q:1.2,gain:heavy?.7:.45,attack:.08,send:.1,curve:2});}),
    wood:go((t,pos,p=1)=>{tone(t,{f0:210,f1:120,dur:.12,gain:.6*p,type:'triangle',pos});noise(t,{dur:.08,f0:1800,f1:400,gain:.6*p,pos,send:.3});}),
    ding:go((t,pos,p=1)=>{const base=rand(480,560);[[1,.32],[2.71,.16],[4.1,.09],[5.8,.05]].forEach(([m,g])=>tone(t,{f0:base*m,dur:1.4/m+.3,gain:g*Math.min(1.5,p),pos,send:.4}));noise(t,{dur:.01,type:'highpass',f0:4000,gain:.4,pos});}),
    dirt:go((t,pos)=>noise(t,{dur:.06,f0:1500,f1:300,gain:.25,pos,send:.1})),
    tink:go((t,kind,pos)=>{const f=kind==='pump'?900:rand(3600,4400);tone(t,{f0:f,dur:kind==='pump'?.08:.2,gain:.06,pos,send:.05,type:kind==='pump'?'triangle':'sine'});tone(t+.09,{f0:f*1.04,dur:.12,gain:.03,pos,send:0});}),
    throw:go(t=>noise(t,{dur:.2,type:'bandpass',f0:500,f1:1500,q:1,gain:.3,attack:.05})),
    stick:go((t,pos)=>{tone(t,{f0:140,f1:90,dur:.08,gain:.35,pos});noise(t,{dur:.04,f0:900,gain:.2,pos});}),
    beep:go(t=>{tone(t,{f0:2600,dur:.07,type:'square',gain:.08,send:0});tone(t+.11,{f0:2600,dur:.07,type:'square',gain:.08,send:0});}),
    arm:go(t=>{tone(t,{f0:1900,dur:.05,type:'square',gain:.05,send:0});}),
    boom:go((t,pos,d)=>{const far=clamp(d/40,0,1),tt=t+d/343;noise(tt,{dur:.02,type:'highpass',f0:1200,gain:1.6*(1-far*.7),send:.3});noise(tt,{dur:2.4,f0:2400*(1-far*.6),f1:60,gain:1.9,send:1.2,curve:2.2});tone(tt,{f0:62,f1:22,dur:1.6,gain:1.6});noise(tt+.25,{dur:1.8,type:'bandpass',f0:500,f1:120,q:.6,gain:.4,send:1});}),
    ring:go(t=>{tone(t,{f0:1250,dur:.12,gain:.05,send:.2});}),
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
    <div class="ch-ammo"><span class="ch-name"></span><span class="ch-count"><b></b><small></small></span><span class="ch-state"></span></div>
    <div class="ch-slots">${WEAPONS.map(w=>`<button data-slot="${w.slot}"><b>${w.slot}</b>${w.name}</button>`).join('')}</div>
    <div class="ch-score"></div>
    <div class="ch-keys">LMB FIRE · HOLD RMB FOCUS · R RELOAD · 1–4 SWAP · X HOLSTER</div>
    <button class="ch-lock" type="button"><strong>CLICK TO ENGAGE</strong><span>MOUSE TO AIM · ESC TO RELEASE · X TO HOLSTER</span></button>`;
   hudHost.appendChild(el);
   const q=s=>el.querySelector(s);
   el.querySelectorAll('.ch-slots button').forEach(b=>b.onclick=e=>{e.stopPropagation();equip(WEAPONS[b.dataset.slot-1].id);});
   q('.ch-lock').onclick=e=>{e.stopPropagation();requestLock();};
   let toastTimer=0,hitTimer=0,trueTimer=0;const cache=new Map();
   const set=(node,key,val,fn)=>{if(cache.get(key)===val)return;cache.set(key,val);fn(node,val);};
   const text=(sel,val)=>set(q(sel),sel,val,(n,v)=>{n.textContent=v;});
   const cls=(name,on)=>set(el,'c:'+name,on,(n,v)=>n.classList.toggle(name,v));
   return {el,
    toast(text){const t=q('.ch-toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);},
    hitmarker(isTrue){const h=q('.ch-hit');h.classList.remove('show','gold');void h.offsetWidth;h.classList.add('show');if(isTrue)h.classList.add('gold');clearTimeout(hitTimer);hitTimer=setTimeout(()=>h.classList.remove('show'),180);},
    trueShot(){const t=q('.ch-true');t.classList.remove('show');void t.offsetWidth;t.classList.add('show');clearTimeout(trueTimer);trueTimer=setTimeout(()=>t.classList.remove('show'),700);},
    flash(a){const f=q('.ch-flash');f.style.transition='none';f.style.opacity=a;requestAnimationFrame(()=>{f.style.transition='opacity .9s ease-out';f.style.opacity=0;});},
    update(){
     cls('locked',locked);
     if(!current)return;
     const w=current,s=state[w.id];
     text('.ch-name',w.name+' / '+w.kind);
     set(el,'slot',w.slot,()=>el.querySelectorAll('.ch-slots button').forEach(b=>b.classList.toggle('active',+b.dataset.slot===w.slot)));
     if(w.id==='axe'){text('.ch-count b','∞');text('.ch-count small','');}
     else if(w.id==='c4'){const live=charges.filter(c=>!c.done).length;text('.ch-count b',String(w.mag-live));text('.ch-count small',live?` · ${live} ARMED`:` / ${w.mag}`);}
     else{text('.ch-count b',String(s.ammo));text('.ch-count small',' / '+w.mag+(w.id==='pump'&&s.chamber===false&&s.ammo>0?' · PUMP':''));}
     text('.ch-state',s.action?.name==='reload'?'RELOADING':(w.id!=='axe'&&w.id!=='c4'&&s.ammo===0?'EMPTY · R':''));
     text('.ch-score',stats.shots?`RANGE · ${stats.hits} HITS · ${stats.trueShots} TRUE`:'');
     // Crosshair gap from spread, ring from focus
     const spreadPx=Math.max(4,currentSpread()*stage.clientHeight/(2*Math.tan(camera.fov*Math.PI/360))*1);
     set(el,'gap',Math.min(70,spreadPx).toFixed(0),(n,v)=>n.style.setProperty('--gap',v+'px'));
     const f=s.focus||0,ring=q('.ch-ring-live');
     const r=lerp(46,9,f)+(s.breath>0?Math.sin(lastTime*24)*s.breath*3:0);
     set(ring,'ring',Math.max(8.5,r).toFixed(1),(n,v)=>n.setAttribute('r',v));
     cls('focusing',!!buttons.right&&f>0&&w.id!=='c4');cls('window',inWindow());cls('winded',(s.breath||0)>.05);
     cls('ads',adsBlend>.6&&w.id!=='axe');cls('melee',w.id==='axe'||w.id==='c4');
    }
   };
  }

  /* ------------------------------------------------------------ weapon state machine */
  let adsBlend=0,sprintBlend=0,equipBlend=0;
  const anim={posX:new Spring(220,22),posY:new Spring(220,22),posZ:new Spring(260,20),rotX:new Spring(240,20),rotY:new Spring(200,20),rotZ:new Spring(200,20),swayX:new Spring(90,12),swayY:new Spring(90,12),land:new Spring(140,10)};
  function resetState(){for(const w of WEAPONS)state[w.id]={ammo:w.mag,chamber:true,focus:0,windowT:0,breath:0,action:null,lastFire:-9,slide:0};}
  function inWindow(){if(!current)return false;const s=state[current.id];return buttons.right&&s.focus>=1&&s.windowT>0&&s.windowT<current.window;}
  function currentSpread(){
   if(!current)return 0;const s=state[current.id],mv=movementInfo();
   let base=current.id==='pump'?lerp(.085,.045,s.focus):current.id==='pistol'?lerp(.032,.0035,s.focus):.02;
   base+=mv.speed*(current.id==='pump'?.006:.007)+(mv.airborne?.05:0)+s.breath*.02;
   return base;
  }
  function movementInfo(){const m=o.movement?.()||{};return {speed:speedSmoothed,sprinting:!!m.sprinting&&speedSmoothed>1,airborne:!!m.airborne};}
  function startAction(name,duration,data={}){const s=state[current.id];s.action={name,t:0,duration,...data};}
  function canFire(){if(!current||!locked||!o.canAct())return false;const s=state[current.id];if(equipBlend<.85)return false;if(s.action&&!(s.action.name==='reload'&&current.id==='pump'))return false;return lastTime-s.lastFire>=current.interval;}

  function fire(){
   const w=current,s=state[w.id];
   if(w.id==='axe'){if(s.action)return;const heavy=inWindow();startAction('swing',heavy?.7:.56,{heavy,hit:false});sfx.whoosh(heavy);s.focus=0;s.windowT=0;return;}
   if(w.id==='c4'){if(s.action)return;if(throwCharge()){startAction('throw',.55);}return;}
   if(s.action?.name==='reload'&&w.id==='pump'){s.action.cancel=true;return;}
   if(w.id==='pump'&&!s.chamber){if(s.ammo>0&&!s.action){startAction('pump',.42);}else sfx.dry();return;}
   if(s.ammo<=0){sfx.dry();s.lastFire=lastTime;hud.toast('EMPTY · PRESS R');return;}
   const isTrue=inWindow();
   s.ammo--;s.lastFire=lastTime;stats.shots++;
   const origin=camera.getWorldPosition(new T.Vector3()),forward=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
   const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion);
   const spread=isTrue?(w.id==='pump'?.022:0):currentSpread();
   const pellets=w.id==='pump'?9:1;
   const muzzleView=models[w.id].parts.muzzle.getWorldPosition(new T.Vector3());const muzzleWorld=camera.localToWorld(muzzleView.clone());
   let tracerBudget=w.id==='pump'?3:1;
   for(let i=0;i<pellets;i++){
    const a=Math.random()*TAU,r=Math.sqrt(Math.random())*spread;
    const dir=forward.clone().addScaledVector(right,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r).normalize();
    const h=worldHits(origin,dir,160);
    const end=h?h.point:origin.clone().addScaledVector(dir,160);
    if(tracerBudget-->0)tracer(muzzleWorld,end,isTrue);
    if(h)impact(h,dir,(w.id==='pump'?.45:1)*(isTrue?2:1),isTrue);
   }
   if(isTrue){hud.trueShot();}
   // Muzzle flash (view + world light), smoke
   state.flash=1;flashLight.position.copy(muzzleWorld);
   for(let i=0;i<(w.id==='pump'?5:3);i++)spawn({map:tx.puff,pos:muzzleWorld,vel:forward.clone().multiplyScalar(rand(.6,1.8)).add(new T.Vector3(rand(-.1,.1),rand(.1,.3),rand(-.1,.1))),life:rand(.8,1.6),size:[.05,w.id==='pump'?.6:.35],alpha:.35,color:0xd8d4cc,gravity:-.15,drag:2});
   (w.id==='pump'?sfx.pump:sfx.pistol)(isTrue);
   // Recoil
   const rec=w.id==='pump'?{z:2.4,x:7,yaw:.06,pitch:.065}:{z:1.1,x:3.2,yaw:.012,pitch:.022};
   const adsK=lerp(1,.6,adsBlend);
   anim.posZ.kick(rec.z*adsK);anim.rotX.kick(rec.x*adsK);anim.rotY.kick(rand(-1,1)*rec.x*.15);anim.rotZ.kick(rand(-1,1)*rec.x*.2);
   look.kickPitch.kick(rec.pitch*20*adsK);look.kickYaw.kick(rand(-1,1)*rec.yaw*20*adsK);
   s.focus=Math.min(s.focus,.25);s.windowT=0;s.breath=0;
   if(w.id==='pistol'){s.slideT=0;ejectShell('pistol');if(s.ammo===0)s.lockedBack=true;}
   if(w.id==='pump'){s.chamber=false;if(s.ammo>0)setTimeout(()=>{if(current?.id==='pump'&&!state.pump.action)startAction('pump',.42);},170);}
   requestFrame();
  }

  function reload(){
   if(!current||!locked)return;const w=current,s=state[w.id];
   if(w.id==='axe'||w.id==='c4'||s.action||s.ammo>=w.mag&&(w.id!=='pump'||s.chamber))return;
   if(w.id==='pistol'){startAction('reload',s.lockedBack?1.75:1.45,{dropped:false,inserted:false,slap:s.lockedBack});}
   if(w.id==='pump'){startAction('reload',.35+(w.mag-s.ammo)*.48,{loaded:0,need:w.mag-s.ammo,wasEmpty:!s.chamber});}
  }

  function updateAction(dt){
   const w=current,s=state[w.id],m=models[w.id],P=m.parts,a=s.action;
   const out={x:0,y:0,z:0,rx:0,ry:0,rz:0};
   // Pistol slide cycle
   if(w.id==='pistol'){
    s.slideT=(s.slideT??1)+dt;const st=s.slideT;let back=st<.035?st/.035:st<.09?1-(st-.035)/.055:0;if(s.lockedBack)back=Math.max(back,st>.035?.92:back);
    P.slide.position.x=-.026*back;P.trigger.rotation.z=st<.05?-.18:0;
   }
   if(!a)return out;
   a.t+=dt;const t=a.t,k=t/a.duration;
   if(a.name==='pump'){
    const b=seg(t,0,.16),f=seg(t,.2,.36);const pos=easeOut(b)*(1-easeOut(f));
    P.fore.position.x=-.085*pos;out.z+=.012*pos;out.rz+=.08*pos;out.rx+=-.03*pos;
    if(t>=.12&&!a.ejected){a.ejected=true;ejectShell('pump');sfx.rack(true);}
    if(t>=.3&&!a.closed){a.closed=true;sfx.rack(false);if(s.ammo>0)s.chamber=true;}
   }
   if(a.name==='reload'&&w.id==='pistol'){
    const tilt=smooth(seg(t,0,.25))*(1-smooth(seg(t,a.duration-.35,a.duration)));
    out.rz+=.42*tilt;out.rx+=.22*tilt;out.y+=-.02*tilt;out.x+=-.02*tilt;
    const drop=easeIn(seg(t,.22,.5)),rise=1-easeOut(seg(t,.62,1.02));
    const off=t<.56?drop:rise;P.mag.position.y=-.16*off;P.mag.position.x=-.03*off;P.mag.visible=!(t>.5&&t<.6);
    if(t>.22&&!a.dropped){a.dropped=true;sfx.click(1800,.3);spawnDroppedMag();}
    if(t>1.02&&!a.inserted){a.inserted=true;sfx.click(2400,.45);anim.posY.kick(.25);s.ammo=w.mag;}
    if(a.slap){const sl=seg(t,1.3,1.42);if(sl>0&&!a.slapped){a.slapped=true;s.lockedBack=false;s.slideT=.06;sfx.rack(false);anim.posZ.kick(-.4);}}
   }
   if(a.name==='reload'&&w.id==='pump'){
    const tilt=smooth(seg(t,0,.25))*(1-smooth(seg(t,a.duration-.25,a.duration)));
    out.rz+=-.55*tilt;out.rx+=.18*tilt;out.y+=.01*tilt;out.x+=-.03*tilt;
    const per=.48,local=t-.3,i=Math.floor(local/per),lt=local-i*per;
    if(local>0&&i<a.need&&!a.cancel){
     P.shell.visible=lt<.34;const ins=easeOut(seg(lt,.0,.18)),push=easeIn(seg(lt,.2,.32));
     P.shell.position.set(.12+.05*(1-ins)-push*.06,-.06+.045*ins+push*.01,.05*(1-ins));P.shell.rotation.set(0,0,Math.PI/2);
     if(lt>.3&&a.loaded<=i){a.loaded=i+1;s.ammo=Math.min(w.mag,s.ammo+1);sfx.click(1400,.4);anim.posY.kick(.12);}
    }else P.shell.visible=false;
    if(a.cancel&&lt>.34){a.duration=Math.min(a.duration,t+.25);}
    if(t>=a.duration&&!s.chamber&&s.ammo>0){s.action=null;P.shell.visible=false;startAction('pump',.42);return out;}
   }
   if(a.name==='swing'){
    const heavy=a.heavy,wind=heavy?.22:.14,strike=wind+(heavy?.1:.11);
    const w1=easeOut(seg(t,0,wind)),st=seg(t,wind,strike),rec=smooth(seg(t,strike+.05,a.duration));
    const strikeE=st<1?Math.sin(st*Math.PI/2):1;
    const lift=w1*(1-strikeE)*(1-rec),slash=strikeE*(1-rec);
    out.x+=.06*lift-.36*slash;out.y+=.17*lift-.06*slash;out.z+=.06*lift-.12*slash;
    out.rx+=-.95*lift+1.05*slash;out.ry+=.35*lift-.75*slash;out.rz+=.35*lift-.95*slash;
    if(st>.55&&!a.hit){a.hit=true;meleeHit(heavy);}
   }
   if(a.name==='throw'){
    const back=smooth(seg(t,0,.18)),fwd=easeOut(seg(t,.18,.3)),ret=smooth(seg(t,.32,.55));
    out.z+=.06*back*(1-fwd)-.18*fwd*(1-ret);out.y+=.04*back*(1-fwd)+.03*fwd*(1-ret)-.25*fwd*(1-ret);out.rx+=-.4*back*(1-fwd)+.5*fwd*(1-ret);
    P.block.visible=t<.3||t>.42;if(t>.42)out.y+=-.2*(1-smooth(seg(t,.42,.55)));
   }
   if(t>=a.duration){if(a.name==='swing'||a.name==='throw'){}s.action=null;if(w.id==='pump')P.shell.visible=false;if(w.id==='c4')P.block.visible=true;}
   return out;
  }

  function spawnDroppedMag(){
   const P=models.pistol.parts;const g=new T.Group();g.add(P.mag.children[0].clone(),P.mag.children[1].clone());g.traverse(x=>x.userData.noHit=true);
   const pos=camera.localToWorld(P.mag.getWorldPosition(new T.Vector3()));g.position.copy(pos);g.quaternion.copy(camera.quaternion);world.add(g);
   const s={mesh:g,kind:'mag',vel:new T.Vector3(0,-1,0).add(new T.Vector3(rand(-.3,.3),0,rand(-.3,.3))),spin:new T.Vector3(rand(-3,3),rand(-3,3),rand(-3,3)),ground:groundAt(pos.x,pos.z,pos.y),bounces:0,age:0};shells.push(s);
  }

  function meleeHit(heavy){
   const origin=camera.getWorldPosition(new T.Vector3()),f=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion),r=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);
   let hit=null;for(const off of [0,-.18,.18,-.35,.35]){const d=f.clone().addScaledVector(r,off).normalize();const h=worldHits(origin,d,2.1);if(h&&(!hit||targetOf(h.object)&&!targetOf(hit.object)))hit=h;if(hit&&targetOf(hit.object))break;}
   if(!hit){return;}
   const t=impact(hit,f,heavy?3.2:1.6,heavy);
   if(t?.kind==='post'||!t)decal(hit,tx.chop,heavy?.16:.11);
   if(heavy)hud.trueShot();
   state.hitStop=heavy?.09:.06;look.shake=Math.max(look.shake,heavy?.35:.18);anim.posZ.kick(1.2);anim.rotX.kick(-2);
   sfx.wood(hit.point,heavy?1.6:1);
  }

  /* ------------------------------------------------------------ input */
  function requestLock(){if(!armed)return;sfx.init();const el=renderer.domElement;try{const p=el.requestPointerLock?.({unadjustedMovement:true});p?.catch?.(()=>el.requestPointerLock?.());}catch{el.requestPointerLock?.();}}
  function onLockChange(){locked=document.pointerLockElement===renderer.domElement;if(!locked){buttons.left=buttons.right=false;}hud?.update();requestFrame();}
  function onMouseMove(e){if(!locked||!armed||!o.canAct())return;const sens=.0021*lerp(1,.62,adsBlend);yaw+=e.movementX*sens;pitch=clamp(pitch-e.movementY*sens,-1.35,1.35);anim.swayX.kick(-e.movementX*.012);anim.swayY.kick(e.movementY*.012);requestFrame();}
  function onMouseDown(e){if(!armed)return;if(!locked){if(e.target===renderer.domElement&&e.button===0)requestLock();return;}e.preventDefault();if(e.button===0){buttons.left=true;pendingFire=true;}if(e.button===2){buttons.right=true;if(current?.id==='c4'){detonate();}}requestFrame();}
  function onMouseUp(e){if(e.button===0)buttons.left=false;if(e.button===2)buttons.right=false;}
  function onKey(e){
   if(e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.target.isContentEditable||document.querySelector('dialog[open]'))return;
   const k=e.key.toLowerCase();
   if(['1','2','3','4'].includes(k)){if(!o.canAct())return;e.preventDefault();equip(WEAPONS[+k-1].id);return;}
   if(!armed)return;
   if(k==='q'){e.preventDefault();if(previous)equip(previous);}
   if(k==='r'){e.preventDefault();reload();}
   if(k==='x'){e.preventDefault();holster();}
   if(k==='f'&&current?.id==='c4'){e.preventDefault();detonate();}
  }

  /* ------------------------------------------------------------ lifecycle */
  let tx;
  function build(){
   if(built)return;built=true;
   tx=buildTextures();env=buildEnvironment();M=buildMaterials(tx);
   viewScene=new T.Scene();viewScene.environment=env;
   viewCamera=new T.PerspectiveCamera(58,1,.01,10);
   viewScene.add(new T.HemisphereLight(0xe6f2ff,0x4a4a32,.9));
   sunView=new T.DirectionalLight(0xfff0d0,2.6);viewScene.add(sunView);viewScene.add(sunView.target);
   const rim=new T.DirectionalLight(0xbfd6ff,.8);rim.position.set(-1,.5,1);viewScene.add(rim);
   world=new T.Group();world.name='Eden combat range';scene.add(world);
   fxGroup=new T.Group();fxGroup.name='Combat effects';fxGroup.userData.noHit=true;scene.add(fxGroup);
   // No new lights in the garden scene: adding one would force every garden material to recompile.
   // Flashes and blasts borrow the existing fill light instead (color/intensity/direction changes are free).
   if(o.fill){fillBase={color:o.fill.color.clone(),intensity:o.fill.intensity,position:o.fill.position.clone()};}
   flashLight={position:new T.Vector3()};blastLight={position:new T.Vector3()};
   raycaster=new T.Raycaster();raycaster.camera=camera;raycaster.params.Points.threshold=.001;raycaster.params.Line.threshold=.001;
   buildViewmodels();buildRange();resetState();hud=buildHUD();
   document.addEventListener('pointerlockchange',onLockChange);
   document.addEventListener('mousemove',onMouseMove);
   document.addEventListener('mousedown',onMouseDown);
   document.addEventListener('mouseup',onMouseUp);
   renderer.domElement.addEventListener('contextmenu',e=>{if(armed)e.preventDefault();});
  }
  document.addEventListener('keydown',onKey);

  function equip(id){
   if(!o.canAct())return;
   build();
   const w=WEAPONS.find(x=>x.id===id);if(!w)return;
   if(current?.id===id&&armed)return;
   if(current&&current.id!==id)previous=current.id;
   if(!armed){const l=o.getLook();yaw=l.yaw;pitch=l.pitch;armed=true;document.body.classList.add('combat-armed');hud.el.classList.add('on');}
   for(const k in models)models[k].holder.visible=false;
   if(models.c4)models.c4.parts.remote.visible=false;
   if(current&&state[current.id].action){state[current.id].action=null;}
   current=w;equipBlend=0;models[id].holder.visible=true;buttons.right=false;
   const s=state[id];s.focus=0;s.windowT=0;s.breath=0;
   sfx.swap();hud.update();
   if(!locked)requestLock();
   requestFrame();
  }
  function holster(){
   if(!armed)return;armed=false;buttons.left=buttons.right=false;
   for(const k in models)models[k].holder.visible=false;if(models.c4)models.c4.parts.remote.visible=false;
   document.body.classList.remove('combat-armed');hud?.el.classList.remove('on');
   if(document.pointerLockElement===renderer.domElement)document.exitPointerLock();
   current=null;adsBlend=0;if(camera.zoom!==1){camera.zoom=1;camera.updateProjectionMatrix();}o.requestDraw();
  }
  function enterRange(){
   build();o.placePlayer(11.7,-12.4,11.7,-30);
   const l=o.getLook();yaw=l.yaw;pitch=l.pitch;
   equip(current?.id||'pistol');
   hud.toast('THE RANGE · steel at 10, 18, 28 and 43 m · posts for the axe');
  }

  function requestFrame(){o.requestDraw();}

  function update(time,dt){
   lastTime=time;
   if(!built)return;
   // Effects keep running even when holstered
   updateParticles(dt);updateShells(dt);updateCharges(dt);
   for(const tr of tracers){if(!tr.alive)continue;tr.t+=dt;tr.mesh.material.opacity=1-tr.t/tr.life;if(tr.t>=tr.life){tr.alive=false;tr.mesh.visible=false;}}
   for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.t+=dt;const k=d.t/d.life;if(d.ring){d.mesh.scale.setScalar(1+k*9);d.mesh.material.opacity=.5*(1-k);}if(k>=1){d.mesh.parent?.remove(d.mesh);debris.splice(i,1);}}
   for(const d of decals){const age=time-d.userData.born;if(age>d.userData.life-2)d.material.opacity=Math.max(0,(d.userData.life-age)/2);if(age>d.userData.life)d.visible=false;}
   for(const t of targets){
    t.pivot.rotation.x=t.swing.step(0,dt);t.pivot.rotation.y=t.twist.step(0,dt);
    if(t.down){const age=time-t.downT;const fall=age<.5?easeIn(age/.5):age<6?1:1-smooth((age-6)/1.2);t.root.rotation.x=-fall*(Math.PI/2-.12)*Math.cos(t.fallDir||0);t.root.rotation.z=fall*(Math.PI/2-.12)*Math.sin(t.fallDir||0);if(age>7.2){t.down=0;t.root.rotation.set(0,0,0);}}
   }
   state.flash=Math.max(0,(state.flash||0)-dt*28);state.blast=Math.max(0,(state.blast||0)-dt*1.6);
   if(fillBase){const f=o.fill,fl=state.flash*state.flash,bl=state.blast*state.blast;
    if(fl>.001||bl>.001){const src=bl>fl*.1?blastLight.position:flashLight.position;const dir=src.clone().sub(camera.position);if(dir.lengthSq()<1e-4)dir.set(0,1,0);
     f.position.copy(dir.normalize().multiplyScalar(-20).add(new T.Vector3(0,6,0)));if(bl>fl*.1)f.position.copy(src.clone().sub(camera.position).normalize().multiplyScalar(-1).add(new T.Vector3(0,.4,0)).multiplyScalar(20));
     const near=bl>fl*.1?clamp(1.4-camera.position.distanceTo(src)/40,.25,1.4):1;
     f.color.copy(fillBase.color).lerp(new T.Color(0xffa45a),Math.min(1,fl*1.2+bl));f.intensity=fillBase.intensity+fl*1.6+bl*14*near;state.fillDirty=true;}
    else if(state.fillDirty){f.color.copy(fillBase.color);f.intensity=fillBase.intensity;f.position.copy(fillBase.position);state.fillDirty=false;}}
   if(!armed)return;

   // Movement sampling for bob/sway
   const cp=camera.position;
   if(lastCamPos){const v=Math.hypot(cp.x-lastCamPos.x,cp.z-lastCamPos.z)/Math.max(dt,1e-3);speedSmoothed=lerp(speedSmoothed,Math.min(v,8),1-Math.exp(-10*dt));const vy=(cp.y-lastY)/Math.max(dt,1e-3);if(verticalVel<-1.5&&vy>-.2)anim.land.kick(-Math.min(3,-verticalVel*.6));verticalVel=vy;}
   lastCamPos=cp.clone();lastY=cp.y;
   const mv=movementInfo();
   bobPhase+=dt*(speedSmoothed>.2?lerp(6,11,clamp(speedSmoothed/6,0,1)):0);

   const w=current,s=state[w.id];
   if(state.hitStop>0){state.hitStop-=dt;dt*=.08;}
   // Focus / TRUE SHOT state
   const canFocus=buttons.right&&!mv.sprinting&&w.id!=='c4'&&!s.action;
   if(canFocus){const rate=1/w.focusTime*(1-clamp(speedSmoothed/6,0,.6));const before=s.focus;s.focus=Math.min(1,s.focus+dt*rate);if(s.focus>=1){if(before<1)sfx.ring();s.windowT+=dt;if(s.windowT>w.window)s.breath=Math.min(1,s.breath+dt*1.6);}}
   else{s.focus=Math.max(0,s.focus-dt*3.2);s.windowT=0;s.breath=Math.max(0,s.breath-dt*2);}
   adsBlend=lerp(adsBlend,buttons.right&&w.id!=='axe'&&w.id!=='c4'&&!mv.sprinting?1:0,1-Math.exp(-14*dt));
   sprintBlend=lerp(sprintBlend,mv.sprinting&&!s.action?1:0,1-Math.exp(-8*dt));
   equipBlend=Math.min(1,equipBlend+dt*3.2);
   const zoom=lerp(1,w.id==='pump'?1.12:1.22,adsBlend);if(Math.abs(camera.zoom-zoom)>.001){camera.zoom=zoom;camera.updateProjectionMatrix();}

   if(pendingFire){pendingFire=false;if(canFire())fire();else if(w.id==='pump'&&s.action?.name==='reload')s.action.cancel=true;}

   // Look with recoil + shake
   const kp=look.kickPitch.step(0,dt),ky=look.kickYaw.step(0,dt);
   look.shake=Math.max(0,look.shake-dt*1.8);
   const sh=look.shake*look.shake;const shx=(Math.sin(time*61)+Math.sin(time*37))*.012*sh,shy=(Math.sin(time*53)+Math.sin(time*29))*.012*sh;
   const breathSway=s.breath*.012,idle=(buttons.right?.0012:.003);
   const swayYaw=Math.sin(time*1.1)*idle+Math.sin(time*2.3)*breathSway,swayPitch=Math.sin(time*1.7)*idle*.8+Math.cos(time*1.9)*breathSway;
   o.setLook(yaw+ky*.05+shx+swayYaw*(buttons.right?1:0),clamp(pitch+kp*.05+shy+swayPitch*(buttons.right?1:0),-1.4,1.4));

   // Procedural viewmodel pose
   const m=models[w.id],rig=m.rig,act=updateAction(dt);
   const hip=rig.hip,ads=m.adsPos||hip;
   const bobAmt=clamp(speedSmoothed/6,0,1)*(1-adsBlend*.85)*(mv.airborne?.2:1);
   const bobX=Math.sin(bobPhase)*.011*bobAmt,bobY=-Math.abs(Math.cos(bobPhase))*.012*bobAmt;
   const breathe=Math.sin(time*1.4)*.0016*(1-adsBlend*.7);
   const eq=1-easeOut(equipBlend);
   const tx_=lerp(hip[0],ads[0],adsBlend)+rig.sprint[0]*sprintBlend+bobX+act.x;
   const ty_=lerp(hip[1],ads[1],adsBlend)+rig.sprint[1]*sprintBlend+bobY+breathe+act.y-eq*.22+anim.land.step(0,dt)*.02;
   const tz_=lerp(hip[2],ads[2],adsBlend)+rig.sprint[2]*sprintBlend+act.z;
   const swx=anim.swayX.step(0,dt),swy=anim.swayY.step(0,dt);
   m.holder.position.set(tx_+swx*.01+anim.posX.step(0,dt)*.01,ty_+swy*.008+anim.posY.step(0,dt)*-.01,tz_+anim.posZ.step(0,dt)*.012);
   const r0=rig.hipRot;
   m.holder.rotation.set(
    lerp(r0[0],0,adsBlend)+rig.sprintRot[0]*sprintBlend+act.rx+anim.rotX.step(0,dt)*.02+swy*.04+eq*-.9,
    lerp(r0[1],0,adsBlend)+rig.sprintRot[1]*sprintBlend+act.ry+anim.rotY.step(0,dt)*.02+swx*.06+bobX*1.5,
    lerp(r0[2],0,adsBlend)+rig.sprintRot[2]*sprintBlend+act.rz+anim.rotZ.step(0,dt)*.02+swx*.08+bobX*2,'YXZ');
   if(w.id==='c4'){const live=charges.some(c=>!c.done);const r=m.parts.remote;r.visible=live||lastTime-(state.c4press||-9)<.6;const press=lastTime-(state.c4press||-9);r.position.set(-.2+bobX,-.16+bobY+(press<.2?-.01:0),-.34);m.parts.button.position.z=press<.15?.008:.012;m.parts.remoteLed.material.emissiveIntensity=press<.6?6:(Math.floor(time*2)%2?2:.2);}
   hud.update();
  }

  function render(){
   if(!armed||!built)return;
   viewCamera.aspect=camera.aspect;viewCamera.updateProjectionMatrix();
   // Sun direction (world) into view space so the weapon is lit like the garden.
   const sun=new T.Vector3(-23,19,-48).normalize().applyQuaternion(camera.quaternion.clone().invert());
   sunView.position.copy(sun);sunView.target.position.set(0,0,0);
   const night=clamp(-(camera.position.z+11)/30,0,1);sunView.intensity=lerp(2.6,.35,night);
   // Muzzle flash sprite rendered in view space
   if(!viewScene.userData.flash){const f=new T.Sprite(new T.SpriteMaterial({map:tx.flash,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));viewScene.add(f);viewScene.userData.flash=f;const l=new T.PointLight(0xffa850,0,1.2,2);viewScene.add(l);viewScene.userData.flashLight=l;}
   const fl=viewScene.userData.flash,fll=viewScene.userData.flashLight;
   const fa=state.flash||0;fl.visible=fa>.05&&current&&current.id!=='axe'&&current.id!=='c4';
   if(fl.visible){models[current.id].holder.updateMatrixWorld(true);models[current.id].parts.muzzle.getWorldPosition(fl.position);const s=(current.id==='pump'?.32:.2)*(.7+fa*.5);fl.scale.set(s,s,s);fl.material.rotation=Math.random()*TAU;fl.material.opacity=Math.min(1,fa*1.4);fll.position.copy(fl.position);}
   fll.intensity=fa*fa*3;
   const auto=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(viewScene,viewCamera);renderer.autoClear=auto;
  }

  return {
   equip,holster,enterRange,update,render,
   armed:()=>armed,
   capturing:()=>armed,
   busy:()=>armed||(built&&(particles.some(p=>p.alive)||shells.some(s=>s.mesh.visible&&s.bounces<4)||charges.some(c=>!c.done)||targets.some(t=>Math.abs(t.swing.v)>.001||Math.abs(t.swing.x)>.001||t.down)||debris.length||tracers.some(t=>t.alive)||(state.blast||0)>0)),
   blocks(p){for(const t of targets){const q=t.root.position;if(t.kind==='plate'?Math.abs(p.x-q.x)<.62&&Math.abs(p.z-q.z)<.25:Math.hypot(p.x-q.x,p.z-q.z)<t.radius)return true;}return false;},
   inspect:()=>({built,armed,locked,weapon:current?.id||null,ammo:current?state[current.id].ammo:null,focus:current?state[current.id].focus:0,charges:charges.filter(c=>!c.done).length,stats:{...stats},targets:targets.length,particles:particles.filter(p=>p.alive).length}),
   _debug:{viewScene:()=>viewScene,fire:()=>{if(current)fire();},state,models,setButtons:b=>Object.assign(buttons,b),setLocked:v=>{locked=v;},detonate:()=>detonate(),reload:()=>{const l=locked;locked=true;reload();locked=l;}}
  };
 }
 root.createCombat=createCombat;
})(window);
