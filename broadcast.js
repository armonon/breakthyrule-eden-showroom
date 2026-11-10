'use strict';
// The Broadcast Room: past the museum's main gallery, through Hall B's west wall, three walls of stacked analog TVs,
// one wall per channel. Every set shows static; the few with the best view become live YouTube players (the official
// embedded player, laid over the screen with a CSS homography and a CRT finish), each looping its channel's whole
// upload list from a different starting video, through YouTube's IFrame API. Click a set to bring it up close with sound. The video index lives in /assets/broadcast/channels.json and is
// browsable at /broadcast.html. Nothing is downloaded or rehosted: the creators keep their views.
window.createBroadcastRoom=function createBroadcastRoom(T,{place,room,door,camera,stage,fade={fadeNear:{value:12},fadeFar:{value:90}},onChange=()=>{}}){
 const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<700,LIVE=mobile?2:6,parent=place.far;
 const sets=[];let channels=[];

 // ---------------------------------------------------------------- materials (one merged mesh each)
 const grain=document.createElement('canvas');grain.width=256;grain.height=64;
 {const g=grain.getContext('2d');g.fillStyle='#6b4428';g.fillRect(0,0,256,64);
  for(let i=0;i<90;i++){g.strokeStyle=`rgba(${40+i%30},${22+i%14},${10},.35)`;g.lineWidth=1+(i%3);g.beginPath();const y=(i*7.3)%64;
   g.moveTo(0,y);for(let x=0;x<=256;x+=16)g.lineTo(x,y+Math.sin(x*.03+i)*2.2);g.stroke();}}
 const grainMap=new T.CanvasTexture(grain);grainMap.colorSpace=T.SRGBColorSpace;grainMap.wrapS=grainMap.wrapT=T.RepeatWrapping;
 const noise=document.createElement('canvas');noise.width=noise.height=128;
 {const g=noise.getContext('2d'),img=g.createImageData(128,128);for(let i=0;i<img.data.length;i+=4){const v=40+Math.random()*190;
   img.data[i]=v*.92;img.data[i+1]=v*.97;img.data[i+2]=v;img.data[i+3]=255;}g.putImageData(img,0,0);
  for(let y=0;y<128;y+=2){g.fillStyle='rgba(0,0,0,.22)';g.fillRect(0,y,128,1);}}
 const noiseMap=new T.CanvasTexture(noise);noiseMap.colorSpace=T.SRGBColorSpace;noiseMap.wrapS=noiseMap.wrapT=T.RepeatWrapping;
 const mats={
  wood:new T.MeshStandardMaterial({map:grainMap,roughness:.55}),
  black:new T.MeshStandardMaterial({color:0x1b1b1d,roughness:.42}),
  beige:new T.MeshStandardMaterial({color:0xcdbf9f,roughness:.6}),
  silver:new T.MeshStandardMaterial({color:0x9a9c9e,roughness:.35,metalness:.6}),
  bezel:new T.MeshStandardMaterial({color:0x0d0d0e,roughness:.7}),
  chrome:new T.MeshStandardMaterial({color:0xc9c9c9,roughness:.2,metalness:.9}),
  crate:new T.MeshStandardMaterial({color:0x2a2622,roughness:.9}),
  screen:new T.MeshBasicMaterial({map:noiseMap,color:0xcfd8e0,toneMapped:false,fog:false}),
 };
 const parts=Object.fromEntries(Object.keys(mats).map(k=>[k,[]]));
 const m4=new T.Matrix4(),q=new T.Quaternion(),one=new T.Vector3(1,1,1),up=new T.Vector3(0,1,0);
 function put(mat,geometry,x,y,z,frame){geometry=geometry.index?geometry.toNonIndexed():geometry;
  geometry.applyMatrix4(m4.compose(new T.Vector3(x,y,z),q.identity(),one));geometry.applyMatrix4(frame);parts[mat].push(geometry);}
 function merge(){
  for(const [key,list] of Object.entries(parts)){if(!list.length)continue;
   const count=list.reduce((n,g)=>n+g.attributes.position.count,0),out=new T.BufferGeometry();
   for(const name of ['position','normal','uv']){const size=list[0].attributes[name].itemSize,arr=new Float32Array(count*size);let at=0;
    for(const g of list){arr.set(g.attributes[name].array,at);at+=g.attributes[name].array.length;}out.setAttribute(name,new T.BufferAttribute(arr,size));}
   list.forEach(g=>g.dispose());const mesh=new T.Mesh(out,mats[key]);mesh.name='Broadcast Room '+key;mesh.receiveShadow=true;parent.add(mesh);}
 }

 // ---------------------------------------------------------------- one analog set, built in its own frame (+z = facing)
 const SIZE={w:1.34,h:1.04,d:.9,sw:.94,sh:.705},pickables=[],pickMaterial=new T.MeshBasicMaterial({visible:false});
 function tv(frame,size,style,rabbit){
  const {w,h,d,sw,sh}=size,side=style==='wood'?.2*w:0,shell=style==='wood'?'wood':style;
  put(shell,new T.BoxGeometry(w,h,d),0,h/2,0,frame);
  put('bezel',new T.BoxGeometry(sw+.06,sh+.06,.03),-side/2,h*.53,d/2+.004,frame);
  const screen=new T.PlaneGeometry(sw,sh),u=Math.random(),v=Math.random();
  const uv=screen.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*.6+u,uv.getY(i)*.45+v);
  put('screen',screen,-side/2,h*.53,d/2+.022,frame);
  if(side){for(const y of [.62,.44]){const knob=new T.CylinderGeometry(.035,.035,.03,14);knob.rotateX(Math.PI/2);put('chrome',knob,w/2-side/2,h*y,d/2+.015,frame);}
   for(let i=0;i<5;i++)put('bezel',new T.BoxGeometry(side*.7,.012,.01),w/2-side/2,h*.14+i*.035,d/2+.005,frame);}
  else put('chrome',new T.BoxGeometry(w*.5,.02,.01),0,h*.08,d/2+.006,frame);
  if(rabbit){put('black',new T.SphereGeometry(.06,10,6,0,Math.PI*2,0,Math.PI/2),0,h,-d*.15,frame);
   for(const s of [-1,1]){const rod=new T.CylinderGeometry(.006,.006,.7,5);rod.rotateZ(s*.42);rod.rotateX(-.15);put('chrome',rod,s*.15,h+.3,-d*.2,frame);}}
  const centre=new T.Vector3(-side/2,h*.53,d/2+.024).applyMatrix4(frame),right=new T.Vector3(1,0,0).transformDirection(frame),
   normal=new T.Vector3(0,0,1).transformDirection(frame);
  const pick=new T.Mesh(new T.PlaneGeometry(sw+.12,sh+.12),pickMaterial);pick.position.set(-side/2,h*.53,d/2+.03);
  pick.applyMatrix4(frame);pick.name='Broadcast Room screen';parent.add(pick);pickables.push(pick);
  return {centre,right,up:right.clone().cross(normal).negate().normalize(),normal,hw:sw/2,hh:sh/2,pick};
 }

 // ---------------------------------------------------------------- six sets, two per wall, one wall per channel: few
 // enough that every one of them can be a live player at once
 const walls=[ // origin, along (unit), facing (unit), length
  {o:new T.Vector3(room.x0,0,room.z1),along:new T.Vector3(0,0,-1),facing:new T.Vector3(1,0,0),length:room.z1-room.z0},
  {o:new T.Vector3(room.x1,0,room.z1),along:new T.Vector3(-1,0,0),facing:new T.Vector3(0,0,-1),length:room.x1-room.x0},
  {o:new T.Vector3(room.x0,0,room.z0),along:new T.Vector3(1,0,0),facing:new T.Vector3(0,0,1),length:room.x1-room.x0},
 ];
 const STYLES=[['wood','black'],['silver','wood'],['beige','wood']],STAND=.62;
 walls.forEach((wall,channel)=>{
  const yaw=Math.atan2(wall.facing.x,wall.facing.z),spots=channel===0?[.3,.7]:[.38,.72]; // side walls keep clear of the door
  spots.forEach((at,slot)=>{
   const base=wall.o.clone().addScaledVector(wall.along,wall.length*at).addScaledVector(wall.facing,.85);
   const f0=new T.Matrix4().makeRotationY(yaw).setPosition(base);put('crate',new T.BoxGeometry(SIZE.w+.12,STAND,SIZE.d+.1),0,STAND/2,0,f0);
   const f=new T.Matrix4().makeRotationY(yaw+(slot?-.05:.05)).setPosition(base.x,STAND,base.z);
   const set=tv(f,SIZE,STYLES[channel][slot],slot===channel%2);set.channel=channel;set.slot=slot*3+channel;
   set.pick.userData.onPick=()=>zoom(set);sets.push(set);
  });
 });
 merge();
 parent.updateMatrixWorld(true);
 for(const set of sets){set.centre.applyMatrix4(parent.matrixWorld);for(const key of ['right','up','normal'])set[key].transformDirection(parent.matrixWorld);}

 // ---------------------------------------------------------------- the room itself: white like the museum from the
 // hall, fading to black once you step in so the screens are the only light. Floor, ceiling and three walls, plus a
 // thin lining over Hall B's wall (the doorway stays white, like the hall it belongs to).
 const darkness={value:0},shell=[],t=.2,lining=.06;
 const box=(x0,x1,y0,y1,z0,z1)=>{const g=new T.BoxGeometry(x1-x0,y1-y0,z1-z0).toNonIndexed();g.translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);shell.push(g);};
 box(room.x0-t,room.x1,-t,0,room.z0-t,room.z1+t);box(room.x0-t,room.x1,room.h,room.h+t,room.z0-t,room.z1+t);
 box(room.x0-t,room.x1,0,room.h,room.z0-t,room.z0);box(room.x0-t,room.x1,0,room.h,room.z1,room.z1+t);box(room.x0-t,room.x0,0,room.h,room.z0,room.z1);
 box(room.x1-lining,room.x1,0,room.h,room.z0,door.z0);box(room.x1-lining,room.x1,0,room.h,door.z1,room.z1);box(room.x1-lining,room.x1,door.h,room.h,door.z0,door.z1);
 {const g=mergeAll(shell);
  const fadeVert='uniform float fadeNear,fadeFar;varying float vDist;varying vec3 vNormal;varying float vHeight;void main(){vec4 world=modelMatrix*vec4(position,1.);vec4 view=viewMatrix*world;vDist=length(view.xyz);gl_Position=projectionMatrix*view;vNormal=normalize(mat3(modelMatrix)*normal);vHeight=position.y;}';
  const mesh=new T.Mesh(g,new T.ShaderMaterial({polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,
   uniforms:{fadeNear:fade.fadeNear,fadeFar:fade.fadeFar,darkness},vertexShader:fadeVert,
   fragmentShader:`uniform float fadeNear,fadeFar,darkness;varying float vDist;varying vec3 vNormal;varying float vHeight;
   void main(){vec3 n=normalize(vNormal);
    float white=n.y>.5?.86:n.y<-.5?.97:abs(n.x)>.5?.99:.95,black=n.y>.5?.006:n.y<-.5?.0006:abs(n.x)>.5?.0022:.0016;
    if(abs(n.y)<.5)white*=1.-.14*exp(-max(vHeight,0.)*1.6);
    float s=mix(white,black,darkness);
    gl_FragColor=vec4(mix(vec3(s),vec3(1.),smoothstep(fadeNear,fadeFar,vDist)*(1.-darkness)),1.);
    #include <colorspace_fragment>
   }`}));
  mesh.name='Broadcast Room shell';parent.add(mesh);}
 function mergeAll(list){
  let count=0;for(const g of list)count+=g.attributes.position.count;
  const position=new Float32Array(count*3),normal=new Float32Array(count*3);let at=0;
  for(const g of list){position.set(g.attributes.position.array,at*3);normal.set(g.attributes.normal.array,at*3);at+=g.attributes.position.count;g.dispose();}
  const out=new T.BufferGeometry();out.setAttribute('position',new T.BufferAttribute(position,3));out.setAttribute('normal',new T.BufferAttribute(normal,3));return out;
 }
 const ink=new T.Color(0x3b3c39),glow=new T.Color(0xd9d6cc),plaques=[];
 let dark=0,darkTarget=0,lastTick=0;

 // channel plaques above each wall (white lettering tinted by the material: grey on white, pale on black)
 function plaque(text,sub,wall,y=3.3){
  const c=document.createElement('canvas');c.width=1024;c.height=160;const g=c.getContext('2d');
  g.fillStyle='#fff';g.font='600 70px Georgia, serif';g.textAlign='center';g.textBaseline='middle';g.letterSpacing='14px';g.fillText(text.toUpperCase(),512,62);
  g.font='28px Georgia, serif';g.letterSpacing='8px';g.globalAlpha=.68;g.fillText(sub.toUpperCase(),512,128);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;
  const material=new T.MeshBasicMaterial({map:t,transparent:true,toneMapped:false,fog:false,color:ink.clone().lerp(glow,dark)});plaques.push(material);
  const mesh=new T.Mesh(new T.PlaneGeometry(5.6,.875),material);
  mesh.position.copy(wall.o).addScaledVector(wall.along,wall.length/2).addScaledVector(wall.facing,.09).setY(y);
  mesh.rotation.y=Math.atan2(wall.facing.x,wall.facing.z);parent.add(mesh);
 }
 plaque('The Broadcast Room','three channels · endless loop',{o:new T.Vector3(room.x1,0,door.z0),along:new T.Vector3(0,0,1),facing:new T.Vector3(-1,0,0),length:door.z1-door.z0},door.h+.5);

 // ---------------------------------------------------------------- live players over the best-placed screens
 const overlay=document.createElement('div');overlay.className='broadcast-overlay';
 overlay.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;display:none';
 if(getComputedStyle(stage).position==='static')stage.style.position='relative';
 stage.appendChild(overlay);
 const style=document.createElement('style');style.textContent=`
  .broadcast-tv{position:absolute;left:0;top:0;width:640px;height:480px;transform-origin:0 0;background:#000;overflow:hidden;border-radius:26px/22px}
  .broadcast-tv iframe{width:100%;height:100%;border:0;filter:contrast(1.12) saturate(1.15) blur(.35px)}
  .broadcast-tv::after{content:'';position:absolute;inset:0;pointer-events:none;
   background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 2px,transparent 2px 4px),radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}
  .broadcast-tv{z-index:0}.broadcast-tv.zoomed{z-index:2;border-radius:18px/14px;box-shadow:0 0 120px rgba(170,200,230,.18)}
  .broadcast-tv.zoomed::after{background:repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0 1px,transparent 1px 3px),radial-gradient(ellipse at center,transparent 62%,rgba(0,0,0,.45) 100%)}
  .broadcast-backdrop{position:absolute;inset:0;z-index:1;background:rgba(0,0,0,.78);opacity:0;pointer-events:none;transition:opacity .4s}
  .broadcast-backdrop.on{opacity:1;pointer-events:auto;cursor:zoom-out}
  .broadcast-hud [data-zoom]{display:none}.broadcast-hud.zoomed [data-zoom]{display:inline-block}.broadcast-hud.zoomed [data-room]{display:none}
  .broadcast-hud{position:fixed;right:24px;bottom:120px;z-index:30;display:none;gap:8px}
  .broadcast-hud button,.broadcast-hud a{font:600 12px/1 system-ui,sans-serif;letter-spacing:.12em;padding:10px 14px;border:1px solid #2b2c29;
   background:#f4f3ef;color:#2b2c29;text-decoration:none;cursor:pointer}`;
 document.head.appendChild(style);
 const hud=document.createElement('div');hud.className='broadcast-hud';
 hud.innerHTML='<button type="button" data-zoom="back">← BACK</button><button type="button" data-zoom="next">NEXT VIDEO ▸</button><button type="button" data-room aria-pressed="false">SOUND OFF</button><a href="/broadcast.html" target="_blank" rel="noopener">VIDEO INDEX ↗</a>';
 document.body.appendChild(hud);
 const soundButton=hud.querySelector('[data-room]');let soundOn=false,loud=null;
 soundButton.addEventListener('click',()=>{soundOn=!soundOn;soundButton.textContent=soundOn?'SOUND ON':'SOUND OFF';soundButton.setAttribute('aria-pressed',soundOn);loud=null;onChange();});

 // ---------------------------------------------------------------- click a set to bring it up close, with its sound
 const backdrop=document.createElement('div');backdrop.className='broadcast-backdrop';overlay.appendChild(backdrop);
 let zoomed=null,inRoom=false; // zoomed: {set, t0, closing}
 const ZOOM_MS=450,ease=k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
 function zoom(set){
  if(!inRoom||!channels[set.channel]||(zoomed&&zoomed.set===set&&!zoomed.closing))return;
  if(zoomed)live.get(zoomed.set)?.el.classList.remove('zoomed');
  zoomed={set,t0:performance.now(),closing:false};document.exitPointerLock?.();
  backdrop.classList.add('on');hud.classList.add('zoomed');onChange();
 }
 function unzoom(){if(!zoomed||zoomed.closing)return;zoomed.closing=true;zoomed.t0=performance.now();backdrop.classList.remove('on');hud.classList.remove('zoomed');onChange();}
 backdrop.addEventListener('click',unzoom);
 hud.querySelector('[data-zoom=back]').addEventListener('click',unzoom);
 hud.querySelector('[data-zoom=next]').addEventListener('click',()=>{const e=zoomed&&live.get(zoomed.set);if(e)command(e,'nextVideo');});
 addEventListener('keydown',e=>{if(zoomed&&!zoomed.closing&&(e.key==='Escape'||/^[wasd]$/i.test(e.key)||e.key.startsWith('Arrow')))unzoom();},true);

 fetch('/assets/broadcast/channels.json').then(r=>r.ok?r.json():null).then(d=>{if(!d)return;channels=d.channels;
  channels.forEach((ch,i)=>walls[i]&&plaque(ch.title,ch.videos.length+' videos · youtube.com/@'+ch.handle,walls[i]));parent.updateMatrixWorld(true);onChange();}).catch(()=>{});
 const live=new Map(); // set -> {el, iframe, hideAt}
 // Players come from YouTube's IFrame API (loaded on first visit): each set loops its channel's uploads from its own
 // starting video, and a video YouTube will not play in an embed (error 2/100/101/150) is skipped, not shown.
 let api=null;
 function youtube(){
  if(!api)api=new Promise(resolve=>{if(window.YT?.Player)return resolve(window.YT);const previous=window.onYouTubeIframeAPIReady;
   window.onYouTubeIframeAPIReady=()=>{previous?.();resolve(window.YT);};const tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);});
  return api;
 }
 function start(set,host){
  const ch=channels[set.channel],span=Math.min(ch.videos.length,200),index=(set.slot*37+set.channel*11+new Date().getDate()*5)%Math.max(1,span);
  const entry={set,player:null};
  youtube().then(YT=>{if(!host.isConnected)return;
   entry.player=new YT.Player(host,{width:640,height:480,host:'https://www.youtube-nocookie.com',
    playerVars:{listType:'playlist',list:ch.uploads,index,autoplay:1,mute:1,loop:1,controls:0,playsinline:1,rel:0,iv_load_policy:3,disablekb:1},
    events:{onReady:e=>{e.target.mute();e.target.playVideo();if(entry===loud)e.target.unMute();},onError:e=>e.target.nextVideo()}});});
  return entry;
 }
 function command(entry,func,args=[]){try{entry.player?.[func]?.(...args);}catch{}}
 function homography(w,h,p){ // CSS matrix3d taking the w x h box onto quad p (TL, TR, BR, BL), Heckbert's square-to-quad
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]]=p,dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3,den=dx1*dy2-dx2*dy1||1e-9;
  const g=(dx3*dy2-dx2*dy3)/den,hh=(dx1*dy3-dx3*dy1)/den;
  const a=x1-x0+g*x1,b=x3-x0+hh*x3,c=x0,d=y1-y0+g*y1,e=y3-y0+hh*y3,f=y0;
  return `matrix3d(${a/w},${d/w},0,${g/w},${b/h},${e/h},0,${hh/h},0,0,1,0,${c},${f},0,1)`;
 }
 const v=new T.Vector3(),toCam=new T.Vector3();
 function project(set,rect){
  const pts=[];
  for(const [sx,sy] of [[-1,1],[1,1],[1,-1],[-1,-1]]){
   v.copy(set.centre).addScaledVector(set.right,sx*set.hw).addScaledVector(set.up,sy*set.hh).applyMatrix4(camera.matrixWorldInverse);
   if(v.z>-.1)return null;v.applyMatrix4(camera.projectionMatrix);
   pts.push([(v.x*.5+.5)*rect.width,(-v.y*.5+.5)*rect.height]);
  }
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  if(Math.max(...xs)<0||Math.min(...xs)>rect.width||Math.max(...ys)<0||Math.min(...ys)>rect.height)return null;
  const area=Math.abs((pts[0][0]-pts[2][0])*(pts[1][1]-pts[3][1])-(pts[1][0]-pts[3][0])*(pts[0][1]-pts[2][1]))/2;
  return {pts,area};
 }
 function update(camPos,inside){
  const l=inside?place.toFar(camPos):null;
  const here=!!l&&l.x>room.x0&&l.x<room.x1+.4&&l.z>room.z0&&l.z<room.z1&&channels.length; // only in the room: no wall can hide a player
  overlay.style.display=here?'block':'none';hud.style.display=here?'flex':'none';
  const now=performance.now();
  // the lights go down over a second and a half once you are through the doorway, and come back up when you leave
  darkTarget=l&&l.x>room.x0&&l.x<room.x1-.25&&l.z>room.z0&&l.z<room.z1?1:0;
  if(dark!==darkTarget){const dt=Math.min(.1,lastTick?(now-lastTick)/1000:0);dark=darkTarget>dark?Math.min(1,dark+dt/1.5):Math.max(0,dark-dt/1.2);
   darkness.value=dark*dark*(3-2*dark);for(const m of plaques)m.color.copy(ink).lerp(glow,darkness.value);onChange();}
  lastTick=now;
  inRoom=!!here;
  if(!here&&zoomed){zoomed=null;backdrop.classList.remove('on');hud.classList.remove('zoomed');}
  if(!here){for(const [set,e] of live){command(e,'destroy');e.el.remove();live.delete(set);}loud=null;return;}
  camera.updateMatrixWorld();const rect=stage.getBoundingClientRect(),ranked=[];
  for(const set of sets){if(toCam.copy(camPos).sub(set.centre).dot(set.normal)<=0)continue;const p=project(set,rect);if(p)ranked.push({set,p});}
  ranked.sort((a,b)=>b.p.area-a.p.area);
  const keep=new Set(ranked.slice(0,LIVE).map(r=>r.set));
  if(zoomed){keep.add(zoomed.set);if(!ranked.some(r=>r.set===zoomed.set))ranked.push({set:zoomed.set,p:{pts:null,area:0}});}
  for(const r of ranked.slice(LIVE,LIVE+3))if(live.has(r.set)&&keep.size<LIVE+2)keep.add(r.set); // a little hysteresis
  for(const {set,p} of ranked){
   let e=live.get(set);
   if(keep.has(set)){
    if(!e){if(!channels[set.channel])continue;const el=document.createElement('div');el.className='broadcast-tv';
     const host=document.createElement('div');el.appendChild(host);overlay.appendChild(el);e=Object.assign(start(set,host),{el});live.set(set,e);}
    e.hideAt=0;e.el.style.visibility='visible';
    if(zoomed?.set===set){
     const t=Math.min(1,(now-zoomed.t0)/ZOOM_MS),k=ease(zoomed.closing?1-t:t);
     const W=Math.min(rect.width*.8,rect.height*.66*4/3),H=W*.75,x=(rect.width-W)/2,y=(rect.height-H)*.42;
     const to=[[x,y],[x+W,y],[x+W,y+H],[x,y+H]],from=p.pts||to;
     e.el.classList.add('zoomed');e.el.style.transform=homography(640,480,from.map((a,i)=>[a[0]+(to[i][0]-a[0])*k,a[1]+(to[i][1]-a[1])*k]));
     if(t<1)onChange();else if(zoomed.closing){e.el.classList.remove('zoomed');zoomed=null;}
    }else e.el.style.transform=homography(640,480,p.pts);
   }
  }
  for(const [set,e] of live){
   if(keep.has(set)&&ranked.some(r=>r.set===set))continue;
   e.el.style.visibility='hidden';e.hideAt||=now;
   if(now-e.hideAt>4000){command(e,'destroy');e.el.remove();live.delete(set);if(loud===e)loud=null;}
  }
  // sound follows the set nearest the centre of the view
  const centred=soundOn&&ranked.find(r=>live.has(r.set)&&r.p.pts.every(([x])=>x>rect.width*.15&&x<rect.width*.85));
  const target=zoomed&&!zoomed.closing?live.get(zoomed.set)||null:centred?live.get(centred.set):null;
  if(target!==loud){if(loud)command(loud,'mute');if(target){command(target,'unMute');command(target,'setVolume',[100]);}loud=target;}
 }
 return {update,sets,pickables,zoom,unzoom,inspect:()=>({sets:sets.length,live:live.size,zoomed:!!zoomed,channels:channels.map(c=>c.title+' '+c.videos.length)})};
};
