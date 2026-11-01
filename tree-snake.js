'use strict';
window.createTreeSnake=function(T,scene,{bark,reduced=false,model=null,onChange=()=>{}}={}){
 const root=new T.Group();root.name='Apple tree snake';scene.add(root);
 const anchor=new T.Vector3(1.62,2.98,-5.92),start=new T.Vector3(.45,2.55,-6.92),end=new T.Vector3(1.65,2.88,-6.42);
 const axis=end.clone().sub(start).normalize(),normal=new T.Vector3().crossVectors(axis,new T.Vector3(0,1,0)).normalize(),binormal=new T.Vector3().crossVectors(axis,normal).normalize();
 const branch=new T.Mesh(new T.CylinderGeometry(.052,.11,start.distanceTo(end)+.45,14),bark);branch.position.copy(start).lerp(end,.5);branch.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis);branch.castShadow=true;branch.receiveShadow=true;root.add(branch);
 // Scales: U runs along the body, V around it. A dark dorsal diamond chain on olive-gold, a pale belly band, and a
 // matching height map so every scale catches light at its edge.
 const canvas=document.createElement('canvas'),relief=document.createElement('canvas');canvas.width=relief.width=1024;canvas.height=relief.height=256;
 const c=canvas.getContext('2d'),h=relief.getContext('2d'),scale=16;
 const ground=c.createLinearGradient(0,0,0,256);ground.addColorStop(0,'#c8b77a');ground.addColorStop(.18,'#7b7a3c');ground.addColorStop(.5,'#4e5426');ground.addColorStop(.82,'#7b7a3c');ground.addColorStop(1,'#c8b77a');
 c.fillStyle=ground;c.fillRect(0,0,1024,256);h.fillStyle='#000';h.fillRect(0,0,1024,256);
 for(let k=0;k<8;k++){const x=k*128+64;
  for(const [w,color] of [[64,'#d8c58a'],[56,'#1f1a0e'],[40,'#3d3418']]){c.fillStyle=color;c.beginPath();c.moveTo(x-w,128);c.lineTo(x,128-w*.9);c.lineTo(x+w,128);c.lineTo(x,128+w*.9);c.fill();}
  for(const side of [-1,1]){c.fillStyle='#2a2512';c.beginPath();c.ellipse(x+64,128+side*86,14,9,0,0,Math.PI*2);c.fill();}
 }
 for(let row=0;row<256/scale*2;row++)for(let column=-1;column<1024/scale+1;column++){
  const x=column*scale+(row%2)*scale/2,y=row*scale/2,shade=h.createRadialGradient(x+scale*.35,y,1,x+scale*.5,y,scale*.75);
  shade.addColorStop(0,'#fff');shade.addColorStop(1,'#000');h.fillStyle=shade;h.beginPath();h.ellipse(x+scale*.5,y,scale*.55,scale*.42,0,0,Math.PI*2);h.fill();
  c.strokeStyle='rgba(20,18,8,.35)';c.lineWidth=1;c.beginPath();c.ellipse(x+scale*.5,y,scale*.55,scale*.42,0,Math.PI*.35,Math.PI*1.65);c.stroke();
 }
 const scales=new T.CanvasTexture(canvas),scaleRelief=new T.CanvasTexture(relief);scales.colorSpace=T.SRGBColorSpace;
 for(const texture of [scales,scaleRelief]){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(6,1);texture.anisotropy=8;}
 const skin=new T.MeshStandardMaterial({map:scales,bumpMap:scaleRelief,bumpScale:.0035,roughness:.38,metalness:0});
 // Coils hug the tapering branch: coil radius = branch radius at that point + body radius.
 const branchLength=start.distanceTo(end)+.45,branchRadius=t=>.11+(.052-.11)*((t*start.distanceTo(end)+.225)/branchLength);
 const bodyRadius=s=>.048*(.18+.82*T.MathUtils.smoothstep(s,0,.3))*(1-.28*T.MathUtils.smoothstep(s,.86,.97));
 const points=[],coils=100;
 for(let i=0;i<=coils;i++){const t=i/coils,angle=t*Math.PI*2*3,point=start.clone().lerp(end,t),reach=branchRadius(t)+bodyRadius(t*.84)*.92;point.addScaledVector(normal,Math.cos(angle)*reach).addScaledVector(binormal,Math.sin(angle)*reach);points.push(point);}
 points.push(new T.Vector3(1.78,3.04,-6.28),new T.Vector3(1.79,3.10,-6.06),anchor);
 const curve=new T.CatmullRomCurve3(points),segments=320,radial=18,geometry=new T.TubeGeometry(curve,segments,1,radial,false),positions=geometry.attributes.position;
 for(let ring=0;ring<=segments;ring++){const center=curve.getPointAt(ring/segments),radius=bodyRadius(ring/segments);for(let side=0;side<=radial;side++){const index=ring*(radial+1)+side;positions.setXYZ(index,center.x+(positions.getX(index)-center.x)*radius,center.y+(positions.getY(index)-center.y)*radius,center.z+(positions.getZ(index)-center.z)*radius);}}
 geometry.computeVertexNormals();const body=new T.Mesh(geometry,skin);body.name='Coiled scaled body';body.castShadow=true;body.receiveShadow=true;root.add(body);
 const head=new T.Group();head.name='Snake head';head.position.copy(anchor);root.add(head);
 const headMap=scales.clone(),headRelief=scaleRelief.clone();headMap.repeat.set(1.4,1);headRelief.repeat.set(1.4,1);headMap.needsUpdate=headRelief.needsUpdate=true;
 const headSkin=skin.clone();headSkin.map=headMap;headSkin.bumpMap=headRelief;head.scale.setScalar(.82);
 function oval(parent,position,scale,material){const mesh=new T.Mesh(new T.SphereGeometry(1,24,16),material);mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 oval(head,[0,0,.05],[.125,.073,.195],headSkin);
 oval(head,[0,-.04,.07],[.096,.022,.158],new T.MeshStandardMaterial({color:0xc9b98a,roughness:.55}));
 const gold=new T.MeshStandardMaterial({color:0xd0a14a,roughness:.27}),black=new T.MeshStandardMaterial({color:0x141b0c,roughness:.28});
 for(const side of [-1,1]){oval(head,[side*.107,.034,.09],[.019,.022,.023],gold);oval(head,[side*.124,.037,.10],[.005,.016,.011],black);oval(head,[side*.045,.019,.229],[.004,.003,.003],black);}
 const mouth=new T.CatmullRomCurve3([new T.Vector3(-.112,-.027,.03),new T.Vector3(-.09,-.021,.17),new T.Vector3(0,-.018,.239),new T.Vector3(.09,-.021,.17),new T.Vector3(.112,-.027,.03)]);
 head.add(new T.Mesh(new T.TubeGeometry(mouth,32,.0028,6,false),black));
 const tongue=new T.Group();tongue.name='Forked tongue';head.add(tongue);
 const tongueMaterial=new T.MeshStandardMaterial({color:0x8b2842,roughness:.5});
 for(const points of [[[0,-.021,.21],[0,-.023,.34]],[[0,-.023,.34],[-.025,-.024,.40]],[[0,-.023,.34],[.025,-.024,.40]]])tongue.add(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(new T.Vector3(...points[0]),new T.Vector3(...points[1])),1,.003,6,false),tongueMaterial));
 tongue.visible=false;

 // The sculpted serpent (tools/blender/build_hero_tree.py) coils round its own limb of the sculpted tree; it swaps in for
 // the stand-in branch, body and head shapes above, keeping this skin, the tongue and the animation.
 model?.then(gltf=>{
  const source=gltf.scene.getObjectByName('HeroTree'),place=new T.Group();place.position.set(.5,0,-7);root.add(place);
  const sculpted=source.getObjectByName('SnakeBody').clone();sculpted.material=skin;sculpted.castShadow=sculpted.receiveShadow=true;place.add(sculpted);
  const node=source.getObjectByName('SnakeHead'),pivot=new T.Group();pivot.position.copy(node.position);pivot.quaternion.copy(node.quaternion);place.add(pivot);
  for(const old of [branch,body]){root.remove(old);old.geometry.dispose();}
  for(const child of [...head.children])if(child!==tongue){head.remove(child);child.geometry?.dispose();}
  for(const part of node.children){const mesh=part.clone();if(mesh.material.name==='skin')mesh.material=headSkin;mesh.castShadow=mesh.receiveShadow=true;head.add(mesh);}
  // Larger head and bolder diamonds to match the thicker sculpted body (HEAD_SCALE in the build script).
  head.position.set(0,0,0);head.scale.setScalar(1.2);pivot.add(head);for(const texture of [scales,scaleRelief])texture.repeat.set(4.5,1);root.updateMatrixWorld(true);pivot.getWorldPosition(anchor);onChange();
 }).catch(error=>console.warn('Sculpted snake unavailable; keeping the stand-in.',error));

 const button=document.getElementById('garden-effects');let enabled=true;
 try{enabled=localStorage.getItem('eden-effects-muted')!=='1';}catch{}
 let context=null,voice=null,noise=null,armed=true,lastHiss=-Infinity,hissCount=0,lastViewer=null,active=true,disposed=false;
 function label(){button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'Mute garden sound effects':'Enable garden sound effects');button.title=button.getAttribute('aria-label');button.replaceChildren();const icon=document.createElement('i');icon.dataset.lucide=enabled?'volume-2':'volume-x';button.append(icon);window.lucide?.createIcons();}
 label();button.hidden=false;
 function silence(){if(voice){const old=voice;voice=null;try{old.source.stop();}catch{}old.source.disconnect();old.filter.disconnect();old.gain.disconnect();old.pan?.disconnect();}}
 function unlock(event){
  if(disposed||!enabled||!event.isTrusted||event.target.closest?.('dialog,input,textarea,select'))return;
  if(event.type!=='click'&&event.target.closest?.('#garden-effects'))return;
  if(event.type==='keydown'&&!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(event.key.toLowerCase()))return;
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context ||= new Audio();context.resume().then(onChange).catch(()=>{});}catch{}
 }
 document.addEventListener('pointerdown',unlock,true);document.addEventListener('keydown',unlock,true);
 button.onclick=event=>{enabled=!enabled;try{localStorage.setItem('eden-effects-muted',enabled?'0':'1');}catch{}label();if(!enabled)silence();else unlock(event);onChange();};
 function hiss(viewer,distance){
  if(!enabled||context?.state!=='running'||!active||document.hidden||voice)return false;
  if(!noise){noise=context.createBuffer(1,Math.ceil(context.sampleRate*1.15),context.sampleRate);const data=noise.getChannelData(0);let seed=8191;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=seed/2147483648-1;}}
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),pan=context.createStereoPanner?.();source.buffer=noise;filter.type='bandpass';filter.frequency.value=4600;filter.Q.value=.55;
  source.connect(filter);filter.connect(gain);if(pan){gain.connect(pan);pan.connect(context.destination);const forward=viewer.getWorldDirection(new T.Vector3()),right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).normalize(),direction=anchor.clone().sub(viewer.position).normalize();pan.pan.value=T.MathUtils.clamp(direction.dot(right),-.85,.85);}else gain.connect(context.destination);
  const now=context.currentTime,volume=.16*(1-.35*Math.min(distance/3.2,1));gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.1);gain.gain.linearRampToValueAtTime(volume*.55,now+.52);gain.gain.linearRampToValueAtTime(0,now+1.1);
  const current={source,filter,gain,pan};voice=current;source.onended=()=>{if(voice===current)voice=null;source.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();};source.start();source.stop(now+1.15);hissCount++;return true;
 }
 function visibility(){if(document.hidden)silence();}
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',silence);
 const observer=new MutationObserver(()=>{if(document.querySelector('dialog[open]'))silence();});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 function update(time,viewer,isActive=true){
  active=isActive&&!document.hidden;lastViewer=viewer;
  const distance=viewer.position.distanceTo(anchor);
  if(!active||distance>5)silence();
  if(distance>4.7)armed=true;
  if(active&&distance<3.2&&armed&&time-lastHiss>8&&hiss(viewer,distance)){armed=false;lastHiss=time;}
  if(!reduced){head.rotation.y=Math.sin(time*.45)*.07+(distance<4?T.MathUtils.clamp((viewer.position.x-anchor.x)*.18,-.25,.25):0);head.rotation.x=Math.sin(time*.7)*.035;tongue.visible=active&&(time-lastHiss<1.1||time%8<.28)&&Math.sin(time*25)>0;}
 }
 return {root,anchor,update,inspect:()=>({enabled,armed,hissCount,audioState:context?.state||'locked',playing:!!voice,distance:lastViewer?.position.distanceTo(anchor),reduced}),dispose(){disposed=true;silence();context?.close().catch(()=>{});observer.disconnect();document.removeEventListener('pointerdown',unlock,true);document.removeEventListener('keydown',unlock,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',silence);}};
};
