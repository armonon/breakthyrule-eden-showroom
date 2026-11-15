'use strict';
// The horror chapter after the eight pages (story.js): the office, the ticket or the showdown, the keys, the black
// cube and the garment lab. Everything is added on top of what exists: the pyramid's masked gathering is the office
// (its guest cards are the crowd), the black box's white world is the cube (its monolith is the lab door), and the
// garment lab uses the house Garment Lab's blanks, colours and artwork pool, handing the design to /lab to make it real.
//
//   office    an altar in the candle ring with one ticket: F takes it peacefully.
//   showdown  shoot into the crowd and every masked figure turns on you and rushes; drop them all and keys are left.
//   keys      walk over them. A key (or the ticket) opens the cube's lab.
//   lab       inside the black cube, at the monolith: design one free garment (blank, colour, front and back art) and
//             wear it: it is built from your character's own body, skinned to the skeleton, printed front and back.
//
// Host hooks (app.js): createHorrorChapter({T, scene, camera, garden, pockets, worlds, battle:()=>battle,
//   playerBody, requestDraw, thirdPerson:on=>...})
(function(root){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TAU=Math.PI*2;
 root.createHorrorChapter=function({T,scene,camera,garden,pockets,worlds:worldsIn,battle,playerBody,requestDraw,thirdPerson=()=>{}}){
  // worlds may be a getter: app.js creates the worlds system after this chapter.
  const W=()=>typeof worldsIn==='function'?worldsIn():worldsIn;
  const story=root.edenStory;
  let built=false,hall=null,altar=null,ticket=null,crowd=[],keys=[],showdown=null,clock=0,keyCount=0,labOpen=false,labEntering=false,lastModel=null,prompt=null;
  const keyGeo=new T.TorusGeometry(.06,.018,6,14),keyBit=new T.BoxGeometry(.02,.12,.02),gold=new T.MeshStandardMaterial({color:0xd8b04a,metalness:.9,roughness:.3,emissive:0x5a3a08,emissiveIntensity:.6});

  /* ---------------------------------------------------------------- the office */
  let lookedAt=0;function findHall(){if(hall||!garden.nightBuilt()||clock-lookedAt<1)return hall;lookedAt=clock;scene.traverse(o=>{if(!hall&&o.name==='The masked gathering')hall=o;});return hall;}
  function build(){
   if(built||!findHall())return;built=true;
   // The altar in the candle ring, with one ticket glowing on it.
   altar=new T.Group();altar.name='Office altar';hall.add(altar);
   const stone=new T.MeshStandardMaterial({color:0x2b2a2e,roughness:.85}),cloth=new T.MeshStandardMaterial({color:0x5e1018,roughness:.9});
   const slab=new T.Mesh(new T.BoxGeometry(1.6,.95,.9),stone);slab.position.y=.475;altar.add(slab);
   const runner=new T.Mesh(new T.BoxGeometry(1.66,.02,.42),cloth);runner.position.y=.96;altar.add(runner);
   ticket=new T.Mesh(new T.PlaneGeometry(.22,.1),new T.MeshStandardMaterial({color:0xf3e6c4,emissive:0xffcf7a,emissiveIntensity:.9,side:T.DoubleSide,roughness:.8}));
   ticket.rotation.x=-Math.PI/2;ticket.position.set(0,.985,0);ticket.name='The ticket';altar.add(ticket);ticket.visible=!story?.has('ticket');
   altar.traverse(n=>{n.castShadow=n.receiveShadow=true;n.userData.noHit=false;});
   crowd=[];hall.traverse(o=>{if(o.name==='Masked guest image card')crowd.push({card:o,home:o.position.clone(),alive:true,hp:2,delay:0,fall:0,speed:0});});
  }
  const altarWorld=()=>altar?altar.getWorldPosition(new T.Vector3()):null;
  const inOffice=()=>!!(built&&garden.pyramid?.gathering?.inspect().inside);

  // Shots: anything fired into the crowd starts the showdown; during it, shots drop figures.
  function shotHook(origin,dir,maxDist){
   if(!built||!inOffice())return null;let best=null;
   for(const g of crowd){if(!g.alive)continue;const c=g.card.getWorldPosition(new T.Vector3()),h=g.card.scale.y;
    const t=c.clone().sub(origin).dot(dir);if(t<0||t>maxDist)continue;const p=origin.clone().addScaledVector(dir,t);
    if(Math.hypot(p.x-c.x,p.z-c.z)<.32&&p.y>c.y-h/2&&p.y<c.y+h/2&&(!best||t<best.t))best={g,t,p};}
   if(!best)return null;
   return {c:null,distance:best.t,head:best.p.y>best.g.card.getWorldPosition(new T.Vector3()).y+best.g.card.scale.y*.32,point:best.p,apply:(dmg,meta={})=>{startShowdown();const g=best.g;g.hp-=dmg>=40||meta.head?2:1;if(g.hp<=0)drop(g);return {killed:g.hp<=0};}};
  }
  function startShowdown(){
   if(showdown||!crowd.length)return;showdown={t:0,left:crowd.length};const first=story?.set('showdown');
   W()?.card('THE MASKS TURN','YOU FIRED INTO THE CROWD','THE SHOWDOWN',2200);
   for(const g of crowd){g.delay=.2+Math.random()*2.6;g.speed=2.3+Math.random()*1.6;}
   document.body.classList.add('office-showdown');
  }
  function drop(g){if(!g.alive)return;g.alive=false;g.fall=0.001;showdown&&showdown.left--;}

  /* ---------------------------------------------------------------- keys */
  function scatterKeys(at){
   const n=14;for(let i=0;i<n;i++){const k=new T.Group();const ring=new T.Mesh(keyGeo,gold),bit=new T.Mesh(keyBit,gold);bit.position.y=-.09;k.add(ring,bit);
    const a=i/n*TAU+Math.random()*.4,r=1.4+Math.random()*3.2;k.position.set(at.x+Math.cos(a)*r,at.y+.5,at.z+Math.sin(a)*r);k.userData.noHit=true;scene.add(k);keys.push({mesh:k,y:at.y,phase:Math.random()*TAU});}
   W()?.card('THE CROWD IS STILL','KEYS LIE WHERE THEY FELL · THEY OPEN THE BLACK CUBE','KEYS',3200);
  }

  /* ---------------------------------------------------------------- the black cube's lab */
  const MONOLITH=new T.Vector3(71.7,0,0); // the monolith in the white world's second hall (black-box.js), in its frame
  let cubeWorld=null;function monolithWorld(){cubeWorld??=scene.children.find(c=>c.name==='Black box (inside)')||null;if(!cubeWorld)return null;cubeWorld.updateMatrixWorld();return cubeWorld.localToWorld(MONOLITH.clone());}
  const canEnterLab=()=>story?.has('keys')||story?.has('ticket');

  /* ---------------------------------------------------------------- the worn garment */
  // Built from the character's own skinned body: the torso (and the arms, for long sleeves), pushed out a little along
  // the normals, sharing the skeleton so it moves with the body, with the design printed front and back by a planar
  // projection (like the Garment Lab's printer).
  const SAVE='eden-free-garment-v1';
  const saved=()=>{try{return JSON.parse(localStorage.getItem(SAVE)||'null');}catch{return null;}};
  // Lab preview: front and back silhouettes of the chosen blank, printed with the same texture the worn shell uses.
  const SHAPES={
   tee:[[.3,.12],[.4,.1],[.6,.1],[.7,.12],[.9,.27],[.82,.38],[.72,.31],[.72,.95],[.28,.95],[.28,.31],[.18,.38],[.1,.27]],
   longsleeve:[[.3,.12],[.4,.1],[.6,.1],[.7,.12],[.86,.3],[.97,.82],[.88,.85],[.75,.42],[.73,.95],[.27,.95],[.25,.42],[.12,.85],[.03,.82],[.14,.3]],
   hoodie:[[.29,.14],[.36,.04],[.5,.0],[.64,.04],[.71,.14],[.87,.31],[.98,.83],[.88,.86],[.76,.44],[.75,.96],[.25,.96],[.24,.44],[.12,.86],[.02,.83],[.13,.31]]};
  SHAPES.crewneck=SHAPES.longsleeve;
  function drawMockup(g,img,design){
   const W=g.canvas.width,H=g.canvas.height,dark=design.color==='black',pts=SHAPES[design.garment]||SHAPES.tee;
   g.clearRect(0,0,W,H);
   for(let side=0;side<2;side++){
    const box=Math.min(H-H*.11,W/2-W*.05),x0=side*W/2+(W/2-box)/2,y0=H*.03,path=new Path2D();
    pts.forEach(([u,v],i)=>path[i?'lineTo':'moveTo'](x0+u*box,y0+v*box));path.closePath();
    g.save();g.shadowColor='rgba(0,0,0,.22)';g.shadowBlur=H/14;g.shadowOffsetY=H/40;g.fillStyle=dark?'#1b1a19':'#eeece6';g.fill(path);g.restore();
    g.save();g.clip(path);g.drawImage(img,side*img.width/2,0,img.width/2,img.height,x0,y0,box,box);
    const shade=g.createLinearGradient(x0,0,x0+box,0);shade.addColorStop(0,'rgba(0,0,0,.14)');shade.addColorStop(.5,'rgba(255,255,255,.05)');shade.addColorStop(1,'rgba(0,0,0,.16)');g.fillStyle=shade;g.fillRect(x0,y0,box,box);
    g.strokeStyle=dark?'rgba(255,255,255,.08)':'rgba(0,0,0,.08)';g.lineWidth=2;g.beginPath();g.moveTo(x0+.28*box,y0+.93*box);g.lineTo(x0+.72*box,y0+.93*box);g.stroke();
    if(design.garment==='hoodie'&&!side){g.beginPath();g.moveTo(x0+.38*box,y0+.08*box);g.quadraticCurveTo(x0+.5*box,y0+.24*box,x0+.62*box,y0+.08*box);g.stroke();}
    g.restore();
    g.fillStyle='rgba(20,20,20,.5)';g.font='600 '+Math.round(H/30)+'px "DM Sans",Arial,sans-serif';g.textAlign='center';g.fillText(side?'B A C K':'F R O N T',x0+box/2,H-H*.025);
   }
  }
  function printTexture(design,done){
   const cv=document.createElement('canvas');cv.width=1024;cv.height=512;const g=cv.getContext('2d');
   g.fillStyle=design.color==='black'?'#1b1a19':'#eeece6';g.fillRect(0,0,1024,512);
   const art=root.breakthyruleAssets?.graphics||[],url=id=>art.find(a=>a.id===id)?.full;let pending=0;const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;
   const place=(id,x,y,w)=>{const u=url(id);if(!u)return;pending++;const img=new Image();img.onload=()=>{const h=w*img.height/img.width;g.drawImage(img,x-w/2,y-h/2,w,h);tex.needsUpdate=true;if(--pending===0)done?.();};img.onerror=()=>{if(--pending===0)done?.();};img.src=u;};
   // left half: front; right half: back (seen from behind, so its x is mirrored by the projection)
   if(design.picks?.front?.[0])place(design.picks.front[0],256,190,200);
   if(design.picks?.back?.[0])place(design.picks.back[0],768,200,300);
   if(!pending)setTimeout(()=>done?.(),0);return tex;
  }
  function buildShell(model,design){
   const skinned=[];model.root.traverse(o=>{if(o.isSkinnedMesh&&o.visible!==false)skinned.push(o);});if(!skinned.length)return null;
   const src=skinned.sort((a,b)=>b.geometry.attributes.position.count-a.geometry.attributes.position.count)[0],geo=src.geometry,bones=src.skeleton.bones;
   const name=i=>bones[i]?.name||'',long=design.garment==='longsleeve'||design.garment==='hoodie'||design.garment==='crewneck';
   const keep=new Set(['root','spine03','spine02','spine01','clavicle.L','clavicle.R','upperarm01.L','upperarm01.R',...(long?['lowerarm01.L','lowerarm01.R']:[])]);
   const pos=geo.attributes.position,nor=geo.attributes.normal,si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight,N=pos.count;
   let minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity;const sel=new Uint8Array(N);
   // Where the legs start, in the mesh's bind space: the hem sits a little below it.
   const li=bones.findIndex(b=>b.name==='upperleg01.L'),hipCut=li>=0?new T.Vector3().setFromMatrixPosition(src.skeleton.boneInverses[li].clone().invert()).y-.06:-Infinity;
   for(let i=0;i<N;i++){let w=0;for(let k=0;k<4;k++)if(keep.has(name(si.getComponent(i,k))))w+=sw.getComponent(i,k);
    const y=pos.getY(i);if(w>.62&&y>hipCut){sel[i]=1;minY=Math.min(minY,y);maxY=Math.max(maxY,y);minX=Math.min(minX,pos.getX(i));maxX=Math.max(maxX,pos.getX(i));}}
   const idx=geo.index?geo.index.array:[...Array(N).keys()],tri=[];for(let i=0;i<idx.length;i+=3)if(sel[idx[i]]&&sel[idx[i+1]]&&sel[idx[i+2]])tri.push(idx[i],idx[i+1],idx[i+2]);
   if(tri.length<300)return null;
   const g2=new T.BufferGeometry(),P=new Float32Array(N*3),UV=new Float32Array(N*2),w=maxX-minX||1,h=maxY-minY||1,push=.009;
   for(let i=0;i<N;i++){const nx=nor?nor.getX(i):0,ny=nor?nor.getY(i):0,nz=nor?nor.getZ(i):0;P[i*3]=pos.getX(i)+nx*push;P[i*3+1]=pos.getY(i)+ny*push;P[i*3+2]=pos.getZ(i)+nz*push;
    const u=(pos.getX(i)-minX)/w,v=(pos.getY(i)-minY)/h;UV[i*2]=nz>=0?.5*u:.5+.5*(1-u);UV[i*2+1]=v;}
   g2.setAttribute('position',new T.BufferAttribute(P,3));if(nor)g2.setAttribute('normal',nor);g2.setAttribute('uv',new T.BufferAttribute(UV,2));
   g2.setAttribute('skinIndex',si);g2.setAttribute('skinWeight',sw);g2.setIndex(tri);
   const mat=new T.MeshStandardMaterial({map:printTexture(design,requestDraw),roughness:.92,side:T.FrontSide});
   const shell=new T.SkinnedMesh(g2,mat);shell.name='Free garment (Garment Lab)';shell.bind(src.skeleton,src.bindMatrix);shell.frustumCulled=false;shell.castShadow=true;shell.userData.noHit=true;shell.raycast=()=>{};
   src.parent.add(shell);shell.position.copy(src.position);shell.quaternion.copy(src.quaternion);shell.scale.copy(src.scale);
   return shell;
  }
  function wear(design){const model=playerBody?.model?.();if(!model)return false;model.root.userData.freeGarment?.parent?.remove(model.root.userData.freeGarment);const s=buildShell(model,design);if(!s)return false;model.root.userData.freeGarment=s;lastModel=model;requestDraw();return true;}

  /* ---------------------------------------------------------------- the lab */
  const BLANKS=[['tee','Tee','canvas'],['longsleeve','Thermal','cut-sew'],['hoodie','Hoodie','canvas'],['crewneck','Crewneck','canvas']];
  const b64=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  let dialog=null;
  async function ensureArt(){if(root.breakthyruleAssets?.graphics)return;await new Promise(res=>{const s=document.createElement('script');s.src='/breakthyrule-assets.js?v=2';s.onload=res;s.onerror=res;document.head.append(s);});}
  async function openLab(){
   if(labOpen)return;labOpen=true;await ensureArt();
   const art=(root.breakthyruleAssets?.graphics||[]).slice(0,60),made=saved();
   dialog=document.createElement('dialog');dialog.id='garment-lab-ingame';
   dialog.innerHTML=`<header><div><small>INSIDE THE BLACK CUBE</small><h2>The Garment Lab</h2></div><button type="button" class="icon-button gl-close" aria-label="Close">×</button></header>
    <p class="gl-intro">${made?'Your free piece is made. You are wearing it.':'You survived. Make one garment, free, and wear it out of here.'}</p>
    <div class="gl-body"><div class="gl-preview"><canvas width="1024" height="512" aria-label="Garment preview, front and back"></canvas><small>PICK ART FOR EACH SIDE · IT PRINTS ON WHAT YOU WEAR</small></div>
     <div class="gl-controls"><div class="gl-row gl-blanks"></div><div class="gl-row gl-colors"></div>
      <div class="gl-tabs"><button type="button" data-side="front" aria-pressed="true">FRONT ART</button><button type="button" data-side="back" aria-pressed="false">BACK ART</button></div>
      <div class="gl-art"></div></div></div>
    <footer><a class="gl-real" href="/lab#build" target="_blank" rel="noopener">MAKE IT REAL IN THE GARMENT LAB →</a><button type="button" class="gl-make">${made?'WEAR IT AGAIN':'MAKE IT · FREE · ONE PER PERSON'}</button></footer>`;
   document.body.append(dialog);const q=s=>dialog.querySelector(s);
   const d=made?.design||{product:'garment',construction:'canvas',garment:'tee',fit:'blank',color:'black',artwork:'pick',picks:{front:[],back:[]},backSize:'full',quantity:1};let side='front';
   const preview=()=>{const c=q('canvas'),g=c.getContext('2d'),t=printTexture(d,()=>drawMockup(g,t.image,d));drawMockup(g,t.image,d);
    q('.gl-real').href=(d.picks.front.length||d.picks.back.length)?'/lab?design='+b64(d)+'#build':'/lab#build';};
   const row=(sel,items,on)=>{q(sel).replaceChildren(...items.map(([v,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(on()===v));b.onclick=()=>{set(v);};const set=v2=>{if(sel==='.gl-blanks'){d.garment=v2;d.construction=BLANKS.find(x=>x[0]===v2)[2];d.fit=d.construction==='cut-sew'?'regular':'blank';}else d.color=v2;render();};return b;}));};
   const render=()=>{row('.gl-blanks',BLANKS,()=>d.garment);row('.gl-colors',[['white','WHITE'],['black','BLACK']],()=>d.color);
    q('.gl-art').replaceChildren(...art.map(a=>{const b=document.createElement('button');b.type='button';b.className='gl-thumb';b.title=a.name;b.setAttribute('aria-pressed',String(d.picks[side][0]===a.id));const im=document.createElement('img');im.src=a.thumb;im.alt='';im.loading='lazy';b.append(im);b.onclick=()=>{d.picks[side]=d.picks[side][0]===a.id?[]:[a.id];render();};return b;}));preview();};
   dialog.querySelectorAll('.gl-tabs button').forEach(b=>b.onclick=()=>{side=b.dataset.side;dialog.querySelectorAll('.gl-tabs button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
   q('.gl-make').onclick=()=>{const prev=saved();if(prev&&JSON.stringify(prev.design)!==JSON.stringify(d)){q('.gl-intro').textContent='Your one free piece is already made. Make another in the Garment Lab.';d.garment=prev.design.garment;}
    const design=prev?prev.design:d;try{localStorage.setItem(SAVE,JSON.stringify({design,at:prev?.at||Date.now()}));}catch{}
    if(wear(design)){story?.set('garment');dialog.close();thirdPerson(true);W()?.card('YOU ARE WEARING IT','YOUR FREE PIECE FROM THE GARMENT LAB · MAKE IT REAL AT /LAB','THE GARMENT LAB',3600);}
    else q('.gl-intro').textContent='Your character is still loading. Try again in a moment.';};
   q('.gl-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{labOpen=false;dialog.remove();dialog=null;requestDraw();});
   render();document.exitPointerLock?.();dialog.tabIndex=-1;dialog.showModal();dialog.focus({preventScroll:true});
  }

  /* ---------------------------------------------------------------- prompts and the frame */
  function showPrompt(text){
   if(!prompt){prompt=document.createElement('button');prompt.type='button';prompt.id='horror-prompt';prompt.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();interact();});document.body.append(prompt);}
   prompt.hidden=!text;
   if(text){prompt.innerHTML=text;prompt.disabled=!text.includes('<kbd>');prompt.setAttribute('aria-label',text.replace(/<[^>]*>/g,'').replace(/^F\s*/,''));}
  }
  let labNear=false,sealedAt=-9;const dbg={};
  function update(dt){
   clock+=dt;
   if(!built&&garden.nightBuilt()&&story?.has('pages'))build();
   // The guest cards load after the hall: pick them up once they are there.
   if(built&&!crowd.length&&hall)hall.traverse(o=>{if(o.name==='Masked guest image card')crowd.push({card:o,home:o.position.clone(),alive:true,hp:2,delay:0,fall:0,speed:0});});
   const eye=camera.position;let text=null;
   // The ticket on the altar.
   if(built&&inOffice()&&ticket?.visible&&!showdown){const a=altarWorld();if(a&&Math.hypot(eye.x-a.x,eye.z-a.z)<2.2)text='<kbd>'+(window.edenControls?.hint('chapterInteract')||'F')+'</kbd> TAKE THE TICKET';}
   // The crowd rushes during the showdown.
   if(showdown){showdown.t+=dt;const target=new T.Vector3(eye.x,0,eye.z);
    for(const g of crowd){const c=g.card;
     if(!g.alive){if(g.fall>0&&g.fall<1){g.fall=Math.min(1,g.fall+dt*2.2);c.rotation.x=-g.fall*Math.PI/2*.92;c.position.y=c.scale.y/2*(1-g.fall)+.05;if(g.fall>=1)c.visible=false;}continue;}
     if(showdown.t<g.delay)continue;const wp=c.parent.worldToLocal(target.clone()),to=wp.sub(c.position).setY(0),d=to.length();
     if(d>.7){c.position.addScaledVector(to.normalize(),Math.min(d-.6,g.speed*dt));c.position.y=c.scale.y/2+.04+Math.abs(Math.sin(clock*7+g.home.x))*.06;}
     else if(!g.hitT||clock>g.hitT){g.hitT=clock+.9+Math.random()*.4;battle()?.hurtPlayer?.(9,c.getWorldPosition(new T.Vector3()));}}
    if(showdown.left<=0&&!showdown.done){showdown.done=true;document.body.classList.remove('office-showdown');if(!story?.has('keys'))scatterKeys(altarWorld()||eye.clone());else W()?.card('THE CROWD IS STILL','','THE SHOWDOWN',2000);}}
   // Keys: spin, and walk over them to take them.
   for(let i=keys.length-1;i>=0;i--){const k=keys[i];k.mesh.rotation.y+=dt*2;k.mesh.position.y=k.y+.45+Math.sin(clock*2+k.phase)*.06;
    if(Math.hypot(eye.x-k.mesh.position.x,eye.z-k.mesh.position.z)<1&&Math.abs(eye.y-1.6-k.y)<1.6){scene.remove(k.mesh);keys.splice(i,1);keyCount++;if(story?.set('keys'))W()?.card('A KEY','IT OPENS THE BLACK CUBE · FIND IT IN THE GARDEN VALLEY','KEYS',3000);}}
   if(keyCount&&keys.length)text=text||`KEYS ${keyCount}`;
   // The monolith in the black cube: the lab door.
   const place=pockets?.inside(eye);labNear=false;dbg.place=place?.name||null;dbg.mono=(()=>{const m=monolithWorld();return m?+Math.hypot(eye.x-m.x,eye.z-m.z).toFixed(2):null;})();
   // (The cube's inside is built far from everything else, so being this close to its monolith means you are in it.)
   {const m=monolithWorld();if(m&&Math.hypot(eye.x-m.x,eye.z-m.z)<4.6&&Math.abs(eye.y-1.7-m.y)<4){labNear=true;
     if(canEnterLab())text=text||'<kbd>'+(window.edenControls?.hint('chapterInteract')||'F')+'</kbd> ENTER THE GARMENT LAB';
     else if(clock-sealedAt>6){sealedAt=clock;W()?.chapter('lab').then(c=>W()?.card('THE CUBE IS SEALED',(c.sealed||'IT WANTS KEYS')+' · OR A TICKET','THE BLACK CUBE',2800));}}}
   // Wear the free garment again if the character was rebuilt (or on a new visit).
   const model=playerBody?.model?.();if(model&&model!==lastModel){lastModel=model;const s=saved();if(s&&!model.root.userData.freeGarment)wear(s.design);}
   showPrompt(text);
  }
  function interactionActive(){if(labEntering||labNear&&canEnterLab())return true;if(!built||!inOffice()||!ticket?.visible||showdown)return false;const a=altarWorld(),eye=camera.position;return !!a&&Math.hypot(eye.x-a.x,eye.z-a.z)<2.2;}
  function interact(){
   if(labOpen||document.querySelector('dialog[open]'))return false;
   if(labEntering)return true;
   if(built&&inOffice()&&ticket?.visible&&!showdown){const a=altarWorld(),eye=camera.position;if(a&&Math.hypot(eye.x-a.x,eye.z-a.z)<2.2){ticket.visible=false;story?.set('ticket');W()?.card('THE TICKET','ADMIT ONE · IT OPENS THE BLACK CUBE IN THE GARDEN VALLEY','THE OFFICE',3400);requestDraw();return true;}}
   if(labNear&&canEnterLab()){
    if(W()?.loading?.())return true;
    labEntering=true;story?.set('cube');
    Promise.resolve(W()?.veil({title:'THE GARMENT LAB',sub:'A HIDDEN ROOM INSIDE THE BLACK CUBE',kicker:'THE BLACK CUBE'})).then(openLab).catch(error=>{labOpen=false;console.warn('Garment Lab could not open:',error);requestDraw();}).finally(()=>{labEntering=false;});
    return true;
   }
   return false;
  }
  function onStoryKey(e){if(e.defaultPrevented||e.repeat||(window.edenControls?.blockedModifiers(e)??(e.ctrlKey||e.metaKey||e.altKey||e.isComposing))||document.querySelector('dialog[open]')||e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName))return;
   if(window.edenControls?window.edenControls.key(e)!=='chapter':e.key.toLowerCase()!=='f')return;
   if(interact()){e.preventDefault();e.stopPropagation();}}
  document.addEventListener('keydown',onStoryKey,true);
  return {interactionActive,update,shotHook,openLab,wear,interact,inspect:()=>({built,office:inOffice(),ticket:!!ticket?.visible,crowd:crowd.length,alive:crowd.filter(g=>g.alive).length,showdown:!!showdown,keysOut:keys.length,keyCount,labNear,dbg,garment:saved()?.design||null}),
   _debug:{build,startShowdown,get crowd(){return crowd;},scatterKeys,altarWorld}};
 };
})(window);
