import {createMuseumReader} from './museum-reader.js';

// Every picture is an existing house asset or a page from the supplied newspaper.
// The compositions are scene graphs: the source images remain unchanged.
export async function createMuseumExhibition(T,{place,camera,stage,onChange=()=>{}}){
 const response=await fetch('/assets/lost-eden/daily-apple/catalog.json');
 if(!response.ok)throw Error('Daily Apple catalog '+response.status);
 const daily=await response.json(),absolute=p=>'/'+String(p).replace(/^\/+/,''),pages=(daily.pages||[]).map(p=>({...p,file:absolute(p.file||p.url)}));
 if(!pages.length)throw Error('No newspaper pages');
 const pdf=absolute(daily.pdf||'/assets/lost-eden/daily-apple/source/the-daily-apple.pdf');
 const root=new T.Group();root.name='The Lost Eden Archive';place.far.add(root);
 const plane=new T.PlaneGeometry(1,1),cube=new T.BoxGeometry(1,1,1),ownedMaterials=[],ownedTextures=[];
 const material=(color,extra={})=>{const m=new T.MeshBasicMaterial({color,fog:false,toneMapped:false,...extra});ownedMaterials.push(m);return m;};
 const ink=material('#282a22'),gold=material('#99815a'),ivory=material('#e8dfc9'),dark=material('#152b27');
 const effects=[],frames=[],layers=[],pool=new Map(),pickables=[],world=new T.Vector3(),localCamera=new T.Vector3();
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');let motion=true,disposed=false,active=0,insideNow=false,lastTick=0,portalCooldown=0,initialVisit=false;
 const sealIds=['seed','witness','horizon'];let collected=[];
 try{collected=JSON.parse(localStorage.getItem('btr-lost-eden-seals-v1')||'[]').filter(id=>sealIds.includes(id));motion=localStorage.getItem('btr-museum-motion')!=='off';}catch{}
 const art=(slug,title)=>({title,image:'/assets/museum-gallery/graphics-'+slug+'.webp',url:'/assets/museum-gallery/graphics-'+slug+'.webp',credit:'Break Thy Rule artwork archive',kind:'Artwork'});
 const photo=(index)=>{const item=window.showroomCollection[index]||window.showroomCollection[0];return {title:item.name,image:item.images[0],url:item.images[0],credit:'Break Thy Rule garment photograph',kind:'Garment'};};
 const news=(n)=>{const p=pages[Math.max(0,Math.min(pages.length-1,n-1))];return {title:p.title||'The Daily Apple',image:p.file||p.url,url:pdf+'#page='+p.page,credit:'The Daily Apple · American Worlds Fairs · Architecture and Landscapes',page:p.page,kind:'Newspaper'};};
 const book=(index)=>{const b=window.showroomBooks?.[index]||window.showroomBooks?.[0];return {title:b.title,image:b.cover,url:b.url,credit:b.author+' · from the existing library',kind:'Book'};};
 const collage={title:'Colour Collage / IMG_0524',image:'/assets/colour-collage-0524.jpg',url:'/assets/colour-collage-0524.jpg',credit:'Owner-supplied artwork · house archive',kind:'Artwork'};
 const A={flower:art('flowers-of-avalon-1','Flowers of Avalon'),jester:art('jester-of-avalon','Jester of Avalon'),angel:art('angel-copy','Angel'),silver:art('silver-angel','Silver Angel'),walker:art('the-walker','The Walker'),dove:art('white-dove','White Dove'),seed:art('the-seed','The Seed'),horse:art('to-avalon','To Avalon'),chariot:art('gods-chariot','Gods Chariot'),eye:art('eye-see-you','Eye See You'),cross:art('cross-of-avalon','Cross of Avalon')};
 const highlights=daily.highlights||[];
 const hi=(i,fallback)=>{const h=highlights[i],s=news(typeof h==='number'?h:h?.page||fallback);return h?.file?{...s,title:h.title||s.title,image:absolute(h.file),credit:(h.source_credit||s.credit)+' · source page '+h.page}:s;};
 const architecture=[hi(0,2),hi(1,4),hi(2,6),hi(3,8)];
 const reader=createMuseumReader({onClose:onChange,onSeal:collect,getSeals:()=>[...collected],onEnter:enterPainting,getPages:()=>pages.map(p=>({...p,file:p.file||p.url})),pdfUrl:pdf});
 function collect(id){if(!sealIds.includes(id)||collected.includes(id))return;collected.push(id);try{localStorage.setItem('btr-lost-eden-seals-v1',JSON.stringify(collected));}catch{}updateUI();onChange();}
 function box(parent,x,y,z,w,h,d,mat){const m=new T.Mesh(cube,mat);m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);return m;}
 function textPlane(parent,text,sub,w,h,x,y,z,color='#e8dfc9',bg='#252b26'){
  const c=document.createElement('canvas');c.width=1024;c.height=Math.max(96,Math.round(1024*h/w));const g=c.getContext('2d');
  g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);g.fillStyle=color;g.textAlign='center';g.font='38px Georgia,serif';g.fillText(text,512,c.height*.43,940);g.font='16px sans-serif';g.fillText(sub,512,c.height*.78,940);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;ownedTextures.push(tex);const m=new T.Mesh(plane,material('#ffffff',{map:tex}));m.scale.set(w,h,1);m.position.set(x,y,z);parent.add(m);return m;
 }
 function makeFrame(spec){
  const mount=new T.Group();mount.name=spec.title;mount.position.set(spec.x,spec.y,spec.z);mount.rotation.y=spec.turn||0;root.add(mount);
  const frame={...spec,mount,layers:[],sources:[],world:new T.Vector3(),wanted:false,distance:Infinity};frames.push(frame);
  const rail=spec.finish==='gold'?gold:spec.finish==='ivory'?ivory:ink;
  box(mount,0,0,-.065,spec.w+.12,spec.h+.12,.09,rail);
  box(mount,0,0,-.012,spec.w,spec.h,.025,material(spec.bg||'#e9dfc9'));
  if(spec.finish==='gold'){for(const s of [-1,1]){box(mount,s*(spec.w/2-.04),0,.008,.018,spec.h-.08,.01,ivory);box(mount,0,s*(spec.h/2-.04),.008,spec.w-.08,.018,.01,ivory);}}
  textPlane(mount,spec.title,spec.kicker||'THE LOST EDEN ARCHIVE',Math.min(spec.w,3.7),.30,0,-spec.h/2-.24,.04,'#3d392c','#eee8d8');
  const pick=new T.Mesh(plane,material('#ffffff',{transparent:true,opacity:0,depthWrite:false}));pick.scale.set(spec.w,spec.h,1);pick.position.z=.22;pick.userData.exhibit=frame;mount.add(pick);pickables.push(pick);
  return frame;
 }
 function layer(frame,source,x,y,w,h,depth=.06,behavior='still',opacity=1){
  const mat=material('#ffffff',{transparent:true,opacity,depthWrite:false,alphaTest:.004});
  const mesh=new T.Mesh(plane,mat);mesh.position.set(x,y,depth);mesh.scale.set(w,h,1);mesh.visible=false;frame.mount.add(mesh);
  const obj={frame,source,url:source.image,mesh,mat,w,h,x,y,depth,behavior,opacity};layers.push(obj);frame.layers.push(obj);
  if(!frame.sources.some(s=>s.image===source.image))frame.sources.push(source);
  let entry=pool.get(obj.url);if(!entry){entry={url:obj.url,refs:[],texture:null,bitmap:null,controller:null,loading:false,wanted:false,retryAt:0,state:'idle'};pool.set(obj.url,entry);}entry.refs.push(obj);obj.entry=entry;
  if(behavior==='face'){
   obj.fade={value:0};mat.onBeforeCompile=shader=>{shader.uniforms.archiveFaceFade=obj.fade;shader.fragmentShader='uniform float archiveFaceFade;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\nfloat veil=smoothstep(0.12,0.28,distance(vMapUv,vec2(.52,.48)));diffuseColor.a*=mix(1.,veil,archiveFaceFade);\n#endif');};mat.customProgramCacheKey=()=> 'lost-eden-face-v1';
  }
  if(behavior==='eye'){
   obj.blink={value:0};mat.onBeforeCompile=shader=>{shader.uniforms.archiveBlink=obj.blink;shader.fragmentShader='uniform float archiveBlink;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n#ifdef USE_MAP\nfloat eyelid=smoothstep(.045,.14,abs(vMapUv.y-.68));diffuseColor.a*=mix(1.,eyelid,archiveBlink);\n#endif');};mat.customProgramCacheKey=()=> 'lost-eden-eye-v1';
  }
  return obj;
 }
 function atmosphere(frame,{petals=false,candles=false}={}){
  // Decorative light, clouds and petals are procedural scene elements, not imported pictures.
  const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');
  if(candles){
   const glow=g.createRadialGradient(128,82,3,128,70,60);glow.addColorStop(0,'#fff6c6');glow.addColorStop(.22,'#f2bb55cc');glow.addColorStop(1,'#e6a33100');g.fillStyle=glow;g.fillRect(0,0,256,128);
  }else for(let i=0;i<7;i++){const x=i*43-9,y=60+Math.sin(i)*18,r=38;const cloud=g.createRadialGradient(x,y,0,x,y,r);cloud.addColorStop(0,'#eee4d899');cloud.addColorStop(1,'#eee4d800');g.fillStyle=cloud;g.fillRect(x-r,y-r,r*2,r*2);}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.RepeatWrapping;ownedTextures.push(texture);
  const mat=material('#ffffff',{map:texture,transparent:true,depthWrite:false,opacity:candles?.9:.2});
  const lights=[];
  if(candles)for(const x of [-frame.w*.39,frame.w*.39]){box(frame.mount,x,-frame.h*.43,.10,.075,.28,.07,ivory);const flame=new T.Mesh(plane,mat);flame.scale.set(.35,.42,1);flame.position.set(x,-frame.h*.43+.26,.16);frame.mount.add(flame);lights.push(flame);}
  else{const cloud=new T.Mesh(plane,mat);cloud.scale.set(frame.w-.15,frame.h*.65,1);cloud.position.set(0,frame.h*.13,.018);frame.mount.add(cloud);}
  let particles=null;
  if(petals){particles=new T.InstancedMesh(plane,material('#ddd3bd',{transparent:true,opacity:.65,depthWrite:false}),18);particles.instanceMatrix.setUsage(T.DynamicDrawUsage);particles.frustumCulled=false;frame.mount.add(particles);}
  effects.push({frame,texture,mat,lights,particles,candles});
 }
 function createOrchard(f){layer(f,architecture[0],0,0,3.25,2.2,.025,'depth',.72);layer(f,A.flower,-2.55,-.10,1.65,2.2,.08,'sway');layer(f,A.flower,2.55,-.10,1.65,2.2,.08,'sway');layer(f,A.angel,-1.1,.1,1.9,2.35,.12,'depth');layer(f,A.dove,1.3,.35,1.55,1.8,.16,'float');layer(f,A.seed,0,-.25,.62,1.4,.20);}
 const orchard=makeFrame({id:'orchard',title:'The Last Orchard',kicker:'I / ROOTS, WINGS & THE SEED',x:8.245,y:1.65,z:0,turn:-Math.PI/2,w:6.8,h:2.65,bg:'#203e33',finish:'gold',description:'An arrangement of Flowers of Avalon, Angel, White Dove and The Seed around a landscape from The Daily Apple. Every image comes from the house collection.',seal:{id:'seed',label:'Seed',clue:'The seed waits between the wings. Keep it, then seek the disappearing witness.'},view:[3.1,0]});createOrchard(orchard);
 const saints=[];
 for(let i=0;i<3;i++){
  const f=makeFrame({id:'saints-'+i,title:i?'Saints of Los Angeles / '+String(i+1).padStart(2,'0'):'Saints of Los Angeles',kicker:'II / THE WORN ARCHIVE',x:i%2?6.56:3.64,y:2,z:12+i*9,turn:i%2?-Math.PI/2:Math.PI/2,w:5.1,h:2.65,bg:'#eee5d4',finish:'gold',description:'Original garment photography, architectural pages from The Daily Apple, and the house angel imagery arranged as a contemporary devotional panel.',view:[5.1,12+i*9]});
  layer(f,architecture[i%4],-1.45,0,1.85,2.25,.03,'depth',.8);layer(f,photo(i),.15,0,2.0,2.3,.10,'depth');layer(f,i===1?A.silver:A.angel,1.7,0,1.45,2.2,.16,'float');saints.push(f);
 }
 const books=makeFrame({id:'books',title:'A Library of Symbols',kicker:'BOOKS / SOURCES, NOT CONCLUSIONS',x:6.56,y:2,z:39,turn:-Math.PI/2,w:4.8,h:2.6,description:'Selected covers from the existing library. Open a source to read its author and original publication. The exhibition does not present the books’ claims as established history.',view:[5.1,39]});
 [0,2,7].forEach((n,i)=>layer(books,book(n),(i-1)*1.5,0,1.25,2.15));
 const procession=makeFrame({id:'procession',title:'The Procession',kicker:'III / THE HOUSE IN MOTION',x:5,y:5,z:62.79,turn:Math.PI,w:15.2,h:3.5,bg:'#431f29',finish:'gold',description:'A procession made from the original Avalon horse, silver angel, jester, chariot, Watcher and dove. Architectural fragments from the newspaper form its lower register.',view:[5,46.2]});
 const figures=[A.horse,A.silver,A.jester,A.chariot,A.walker,A.dove];figures.forEach((s,i)=>layer(procession,s,(i-2.5)*2.35,.2,2.18,2.9,.06+i%3*.035,i%2?'float':'depth'));
 const nobody=makeFrame({id:'nobody',title:'Portrait of Nobody',kicker:'IV / THE DISAPPEARING WITNESS',x:-.7,y:3.45,z:44.91,w:3.25,h:4.4,bg:'#182b2b',finish:'gold',description:'Jester of Avalon, drawn from the house archive. As you approach, the face dissolves; the untouched source remains available here. Motion can be switched off at any time.',seal:{id:'witness',label:'Witness',clue:'A face can vanish while its witness remains. The last seal belongs to the horizon.'},view:[-.7,53.2]});
 layer(nobody,A.jester,0,.3,2.7,3.4,.08,'face');layer(nobody,A.eye,0,-1.45,1.3,.62,.15,'eye');
 const atlas=makeFrame({id:'atlas',title:'The Forbidden Atlas',kicker:'V / ARCHITECTURE & LANDSCAPES',x:13.94,y:3.7,z:48.2,turn:-Math.PI/2,w:4.8,h:4.25,finish:'ivory',description:'An architectural study assembled from The Daily Apple and the existing book collection. Source pages remain intact and readable. Collect the horizon, then find the painting marked After the Garden in the newspaper corridor.',seal:{id:'horizon',label:'Horizon',clue:'Beyond the last line of a page, another room is waiting. Three seals open After the Garden.'},view:[6.8,48.2]});
 layer(atlas,architecture[1],-.95,.6,2.45,2.6,.04,'depth');layer(atlas,architecture[2],1.2,.65,1.65,2.5,.09,'depth');layer(atlas,book(2),-1.5,-1.35,.74,1.08);layer(atlas,A.cross,0,-1.3,1.05,1.2,.14,'depth');layer(atlas,book(7),1.5,-1.35,.74,1.08);
 const after=makeFrame({id:'after',title:'After the Garden',kicker:'VI / THE WORLD BEYOND THE FRAME',x:10.6,y:3.45,z:44.91,w:3.5,h:4.4,bg:'#17232c',finish:'gold',description:'The Walker and the house’s floral imagery occupy a landscape from The Daily Apple. Its companion painting in the newspaper gallery leads into a hidden reading garden once all three seals are collected.',view:[10.6,53.2]});
 layer(after,architecture[3],0,.15,2.9,3.3,.035,'depth',.6);layer(after,A.walker,0,.2,2.5,3.3,.14,'depth');layer(after,A.flower,-1,-1.15,1.3,1.6,.19,'sway');layer(after,A.flower,1,-1.15,1.3,1.6,.20,'sway');
 const first=makeFrame({id:'first-dream',title:'The First Dream',kicker:'THE ORIGINAL COLOUR COLLAGE',x:13.94,y:3.7,z:59.5,turn:-Math.PI/2,w:4.7,h:4.1,bg:'#ede4d2',finish:'gold',description:'The owner-supplied collage that helped establish the characters and visual world of Eden.',view:[6.9,59.5]});layer(first,collage,0,0,4.45,3.85,.06,'depth');
 const newspaper=makeFrame({id:'daily-apple',title:'The Daily Apple',kicker:'AMERICAN WORLDS FAIRS / ARCHITECTURE & LANDSCAPES',x:-3.94,y:3.65,z:48.2,turn:Math.PI/2,w:4.7,h:4.2,bg:'#eee7d5',finish:'ivory',description:'The supplied newspaper, presented page for page. Open the reading view to turn pages, enlarge an image or open the complete PDF.',newspaper:1,view:[3,48.2]});
 layer(newspaper,news(1),-.95,0,2.35,3.8);layer(newspaper,architecture[0],1.45,.25,1.65,2.8,.09,'depth');
 const building=makeFrame({id:'architecture',title:'Architecture of an Imagined World',kicker:'THE DAILY APPLE / SELECTED PAGES',x:-3.94,y:3.7,z:59.5,turn:Math.PI/2,w:4.7,h:4.1,finish:'ivory',description:'Architectural and landscape pages from the supplied issue. Their captions and source pages are preserved in the reader.',view:[3,59.5]});
 layer(building,architecture[1],-1.1,0,2.1,3.7);layer(building,architecture[2],1.1,0,2.1,3.7);
 // A deliberate sequence replaces more than four hundred repeating picture slots.
 for(let i=0;i<18;i++){
  const n=Math.min(pages.length,1+i),s=news(n),f=makeFrame({id:'paper-'+n+'-'+i,title:'The Daily Apple / '+String(n).padStart(2,'0'),kicker:s.title,x:21+i*13,y:2,z:52.39,w:5.5,h:2.65,finish:'ivory',newspaper:n,description:'Read the original newspaper page and its surrounding pages.',view:[21+i*13,54.0]});
  layer(f,s,-1.32,0,2.45,2.43);layer(f,news(Math.min(pages.length,n+1)),1.32,0,2.45,2.43);
  if(i===1)continue;
  const source=i%3===0?photo(i%window.showroomCollection.length):i%3===1?Object.values(A)[i%Object.values(A).length]:book([0,2,7][Math.floor(i/3)%3]);
  const v=makeFrame({id:'archive-'+i,title:source.title,kicker:'FROM THE HOUSE COLLECTION / '+source.kind.toUpperCase(),x:21+i*13,y:2,z:55.31,turn:Math.PI,w:3.6,h:2.65,bg:i%2?'#243a33':'#e9dfc9',finish:i%2?'gold':'ivory',description:source.credit+'. Presented alongside the newspaper’s architectural sequence.',view:[21+i*13,53.6]});layer(v,source,0,0,3.3,2.4,.06,'depth');
 }
 const portal=makeFrame({id:'portal',title:'After the Garden',kicker:'A PAINTING YOU CAN ENTER / THREE SEALS',x:34,y:1.8,z:55.31,turn:Math.PI,w:2.25,h:3.25,bg:'#142b25',finish:'gold',description:'Find the Seed in The Last Orchard, the Witness in Portrait of Nobody, and the Horizon in The Forbidden Atlas. Collect the three seals to enter the hidden reading garden. Walk into the frame or use Enter painting.',portal:true,view:[34,53.4]});
 layer(portal,architecture[3],0,0,1.95,2.95,.035,'depth',.65);layer(portal,A.flower,-.55,-.45,.95,2,.10,'sway');layer(portal,A.flower,.55,-.45,.95,2,.11,'sway');layer(portal,A.seed,0,.15,.5,1.6,.16,'float');
 // The hidden room is physical, walkable space in this museum's coordinate system.
 const secret=new T.Group();secret.name='The Reading Garden';root.add(secret);
 const roomMat=material('#17372f'),ceilingMat=material('#10221f'),floorMat=material('#4b4030');
 box(secret,40,-.12,72,12,.24,10,floorMat);box(secret,40,5.1,72,12,.2,10,ceilingMat);
 box(secret,34,2.5,72,.2,5,10,roomMat);box(secret,46,2.5,72,.2,5,10,roomMat);box(secret,40,2.5,67,12,5,.2,roomMat);box(secret,40,2.5,77,12,5,.2,roomMat);
 for(const x of [35.1,44.9])for(const z of [68.1,75.9]){box(secret,x,2.5,z,.22,5,.22,gold);box(secret,x,4.75,z,.7,.22,.7,ivory);}
 textPlane(secret,'THE READING GARDEN','THE ARCHIVE CONTINUES ON THE OTHER SIDE',6.6,.9,40,4.0,76.87,'#e9dfc9','#17372f').rotation.y=Math.PI;
 const garden=makeFrame({id:'reading-garden',title:'Pages in the Garden',kicker:'THE DAILY APPLE / LIVING ARCHIVE',x:40,y:2.15,z:76.86,turn:Math.PI,w:7.8,h:2.6,bg:'#152c26',finish:'gold',newspaper:architecture[0].page,description:'A quiet room inside the painting. Read The Daily Apple or return through the opposite frame.',view:[40,71]});
 layer(garden,architecture[0],0,0,3.2,2.35,.04,'depth');layer(garden,A.flower,-2.7,0,1.65,2.35,.12,'sway');layer(garden,A.flower,2.7,0,1.65,2.35,.12,'sway');
 const returnFrame=makeFrame({id:'return',title:'Return to the Museum',kicker:'STEP BACK THROUGH THE FRAME',x:40,y:1.8,z:67.13,w:2.25,h:3.25,bg:'#e5dac2',finish:'gold',exit:true,description:'Return to the newspaper gallery.',view:[40,70]});layer(returnFrame,A.dove,0,.2,1.75,2.5,.08,'float');
 // Swaying, depth-separated source cutouts give the room a small paper garden.
 for(const [x,z] of [[34.2,70],[45.8,70],[34.2,74],[45.8,74]]){
  const f=makeFrame({id:'garden-flower-'+x+'-'+z,title:'Flowers of Avalon',kicker:'HOUSE ARCHIVE',x,y:2,z,turn:x<40?Math.PI/2:-Math.PI/2,w:2.8,h:3.5,bg:'#17372f',finish:'gold',description:A.flower.credit});layer(f,A.flower,0,0,2.5,3.2,.14,'sway');
 }
 atmosphere(orchard,{petals:true});atmosphere(after);atmosphere(nobody,{candles:true});
 const particlePose=new T.Object3D();
 root.updateMatrixWorld(true);frames.forEach(f=>f.mount.getWorldPosition(f.world));
 function fitLayer(l,texture){const image=texture.image,a=image.width/image.height,w=Math.min(l.w,l.h*a);l.mesh.scale.set(w,w/a,1);l.baseScale=l.mesh.scale.clone();l.mat.map=texture;l.mat.needsUpdate=true;l.mesh.visible=l.frame.wanted;}
 function release(entry){entry.controller?.abort();if(entry.texture){entry.refs.forEach(l=>{l.mat.map=null;l.mat.needsUpdate=true;l.mesh.visible=false;});entry.texture.dispose();entry.bitmap?.close?.();entry.texture=null;entry.bitmap=null;}if(!entry.loading)entry.state='idle';}
 async function load(entry){
  active++;entry.loading=true;entry.state='loading';const control=new AbortController();entry.controller=control;const timeout=setTimeout(()=>control.abort(),18000);let bitmap;
  try{const r=await fetch(entry.url,{signal:control.signal});if(!r.ok)throw Error('HTTP '+r.status);const blob=await r.blob();if(!entry.wanted||disposed||control.signal.aborted)return;
   bitmap=await createImageBitmap(blob,{imageOrientation:'flipY',premultiplyAlpha:'none'});if(!entry.wanted||disposed||control.signal.aborted){bitmap.close();return;}
   const texture=new T.Texture(bitmap);texture.flipY=false;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=2;texture.needsUpdate=true;entry.bitmap=bitmap;entry.texture=texture;entry.state='ready';entry.refs.forEach(l=>fitLayer(l,texture));
  }catch(e){if(bitmap&&!entry.texture)bitmap.close();if(entry.wanted&&!disposed){entry.state='failed';entry.retryAt=performance.now()+12000;console.warn('Exhibition image unavailable:',entry.url,e.message);}}
  finally{clearTimeout(timeout);active--;entry.loading=false;entry.controller=null;if(!entry.wanted)entry.state='idle';onChange();}
 }
 function openFrame(f){
  if(f.exit){leavePainting();return;}
  if(f.newspaper){reader.openNewspaper(f.newspaper);return;}
  const nearby=f.distance<12;
  reader.open({...f,seal:nearby?f.seal:null,description:f.description+(f.seal&&!nearby?' Visit this artwork in the museum to collect its seal.':'')});
 }
 function teleport(x,z,yaw){const p=place.far.localToWorld(new T.Vector3(x,1.75,z));if(window.breakThyRuleShowroom)window.breakThyRuleShowroom.teleport(p.x,p.z,yaw+place.far.rotation.y);else if(camera){camera.position.copy(p);camera.lookAt(p.clone().add(new T.Vector3(Math.sin(yaw+place.far.rotation.y),0,Math.cos(yaw+place.far.rotation.y))));}onChange();}
 function enterPainting(){if(collected.length<3)return;portalCooldown=performance.now()+2500;guide.close();reader.close();teleport(40,70,0);}
 function leavePainting(){portalCooldown=performance.now()+2500;guide.close();reader.close();teleport(34,53.6,Math.PI);}
 function visit(f){guide.close();reader.close();const v=f.view||[f.x+Math.sin(f.turn||0)*4,f.z+Math.cos(f.turn||0)*4];teleport(v[0],v[1],Math.atan2(f.x-v[0],f.z-v[1]));}
 const style=document.createElement('style');style.textContent=`
 .lost-eden-inside #poster-links{display:none!important}
 #lost-eden-tools{position:fixed;z-index:35;left:50%;bottom:90px;transform:translateX(-50%);display:flex;gap:5px;align-items:center;max-width:94vw;padding:7px;background:#f1eadbdc;border:1px solid #b5a27e;box-shadow:0 4px 24px #17251b18;color:#25291f;font:12px Georgia,serif;backdrop-filter:blur(6px)}
 #lost-eden-tools[hidden],#lost-eden-prompt[hidden]{display:none!important}#lost-eden-tools button,#lost-eden-guide button{font:inherit;min-height:44px;cursor:pointer;border:1px solid #b2a17e;background:#f7f1e6;color:#25291f;padding:8px 13px}#lost-eden-tools button:focus-visible,#lost-eden-guide button:focus-visible{outline:3px solid #8f323d;outline-offset:2px}
 #lost-eden-tools small{padding:0 10px;white-space:nowrap}#lost-eden-prompt{position:fixed;bottom:157px;left:50%;transform:translateX(-50%);z-index:34;background:#172c27ee;color:#f7f0df;padding:10px 18px;border:1px solid #ad9369;font:13px Georgia,serif;pointer-events:none;text-align:center;max-width:85vw}
 #lost-eden-guide{color:#282c24;background:#eee6d5;border:1px solid #a58d61;padding:30px;width:min(700px,92vw);max-height:86dvh;overflow:auto;box-sizing:border-box}#lost-eden-guide::backdrop{background:#152720c9}#lost-eden-guide h2{font:36px Georgia,serif;margin:8px 0 12px}#lost-eden-guide p{font:15px/1.5 Georgia,serif}#lost-eden-guide ul{list-style:none;padding:0}#lost-eden-guide li{border-top:1px solid #c9bda3;padding:14px 0;display:flex;gap:8px;align-items:center}#lost-eden-guide li span{flex:1;font:20px Georgia,serif}#lost-eden-guide>button{float:right}
 @media(max-width:600px){#lost-eden-tools{bottom:80px;flex-wrap:wrap;justify-content:center;min-width:290px}#lost-eden-tools small{width:100%;text-align:center;font-size:11px}#lost-eden-tools button{font-size:11px;padding:5px 9px}#lost-eden-prompt{bottom:185px;font-size:12px}#lost-eden-guide{padding:20px}#lost-eden-guide h2{font-size:28px}#lost-eden-guide li{flex-wrap:wrap}#lost-eden-guide li span{width:100%;flex:auto}}
 `;document.head.append(style);
 const ui=document.createElement('nav');ui.id='lost-eden-tools';ui.setAttribute('aria-label','Museum exhibition');ui.hidden=true;
 const button=(parent,label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=handler;parent.append(b);return b;};
 const guide=document.createElement('dialog');guide.id='lost-eden-guide';guide.setAttribute('aria-labelledby','lost-eden-guide-title');
 button(guide,'Close ×',()=>guide.close());const h=document.createElement('h2');h.id='lost-eden-guide-title';h.textContent='The Lost Eden Archive';guide.append(h);
 const intro=document.createElement('p');intro.textContent='Artworks, garments, books and The Daily Apple. Explore the six installations; three seals open the painting in the newspaper gallery.';guide.append(intro);const list=document.createElement('ul');guide.append(list);
 const heroes=[orchard,saints[0],procession,nobody,atlas,after];
 for(const f of [...heroes,newspaper,portal]){const row=document.createElement('li'),title=document.createElement('span');title.textContent=f.title;row.append(title);button(row,'Visit',()=>visit(f));button(row,f.newspaper?'Read':'Sources',()=>{guide.close();openFrame(f);});list.append(row);}
 button(ui,'Exhibition guide',()=>{document.exitPointerLock?.();guide.showModal();});button(ui,'The Daily Apple',()=>reader.openNewspaper(1));const motionButton=button(ui,'Motion on',()=>{motion=!motion;try{localStorage.setItem('btr-museum-motion',motion?'on':'off');}catch{}updateUI();onChange();});
 const progress=document.createElement('small');ui.append(progress);const prompt=document.createElement('div');prompt.id='lost-eden-prompt';prompt.hidden=true;prompt.setAttribute('aria-live','polite');document.body.append(ui,prompt,guide);
 function updateUI(){progress.textContent=collected.length===3?'3 / 3 seals · painting open':collected.length+' / 3 seals';motionButton.textContent=motion&&!reduce.matches?'Motion on':'Motion off';motionButton.setAttribute('aria-pressed',String(motion&&!reduce.matches));motionButton.disabled=reduce.matches;}
 updateUI();reduce.addEventListener('change',updateUI);
 guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close();}});guide.addEventListener('keydown',e=>e.stopPropagation());guide.addEventListener('close',onChange);
 const ray=new T.Raycaster(),pointer=new T.Vector2();let pointerStart=null,lastLookCheck=0,lastLooked=null;
 const occluders=[place.far.getObjectByName('Museum white world'),place.far.getObjectByName('Pavilion rear art wall'),...secret.children.filter(o=>o.isMesh)].filter(Boolean);
 const host=stage||document.querySelector('canvas')?.parentElement||document.body;
 function hit(event){if(!camera||!insideNow)return null;if(document.querySelector('dialog[open]'))return null;const canvas=host.querySelector('canvas')||document.querySelector('canvas'),r=canvas?.getBoundingClientRect();if(!r)return null;
  if(document.pointerLockElement||!event)pointer.set(0,0);else pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const found=ray.intersectObjects(pickables,false).find(x=>x.distance<16&&x.object.userData.exhibit.wanted);if(!found)return null;const wall=ray.intersectObjects(occluders,false)[0];return wall&&wall.distance+.12<found.distance?null:found.object.userData.exhibit;}
 function down(e){pointerStart={x:e.clientX,y:e.clientY};}
 function click(e){if(e.button!==0||e.target.closest('button,a,dialog'))return;if(e.pointerType==='touch'&&pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>8)return;const f=hit(e);if(!f)return;e.preventDefault();e.stopImmediatePropagation();document.exitPointerLock?.();openFrame(f);}
 function key(e){if(e.code!=='KeyE'||e.repeat||e.ctrlKey||e.metaKey||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;const f=hit();if(f){e.preventDefault();e.stopImmediatePropagation();openFrame(f);}}
 host.addEventListener('pointerdown',down,true);host.addEventListener('click',click,true);document.addEventListener('keydown',key,true);
 let maxConcurrent=0;
 const api={
  update(position,inside){
   if(disposed)return;if(inside!==insideNow)document.body.classList.toggle('lost-eden-inside',inside);insideNow=inside;const now=performance.now(),dialog=!!document.querySelector('dialog[open]');ui.hidden=!inside||dialog||document.hidden;
   if(!initialVisit&&window.breakThyRuleShowroom?.getState().ready){initialVisit=true;const target=new URLSearchParams(location.search).get('exhibit');const f=frames.find(x=>x.id===target);if(f)visit(f);}
   for(const f of frames){f.distance=inside?position.distanceTo(f.world):Infinity;f.wanted=inside&&f.distance<(f.wanted?32:23);f.mount.visible=inside&&f.distance<65;for(const l of f.layers)l.mesh.visible=f.wanted&&!!l.entry.texture;}
   for(const e of pool.values()){e.wanted=e.refs.some(l=>l.frame.wanted);e.distance=Math.min(...e.refs.map(l=>l.frame.distance));if(!e.wanted)release(e);}
   for(const e of [...pool.values()].sort((a,b)=>a.distance-b.distance)){if(active>=3)break;if(e.wanted&&!e.loading&&!e.texture&&now>=e.retryAt)void load(e);}maxConcurrent=Math.max(maxConcurrent,active);
   if(now-lastLookCheck>100){lastLookCheck=now;lastLooked=inside&&!dialog?hit():null;}const looked=inside&&!dialog?lastLooked:null;prompt.hidden=!looked||document.hidden;if(looked){const text=looked.exit?'E / click · Return to the museum':looked.portal?collected.length===3?'Walk into the painting · E to enter':'After the Garden · '+collected.length+' / 3 seals':looked.newspaper?'E / click · Read The Daily Apple':'E / click · '+looked.title;if(prompt.textContent!==text)prompt.textContent=text;}
   if(inside&&!dialog&&now>portalCooldown){localCamera.copy(position);place.far.worldToLocal(localCamera);if(collected.length===3&&Math.hypot(localCamera.x-34,localCamera.z-55.31)<.95)enterPainting();else if(Math.hypot(localCamera.x-40,localCamera.z-67.13)<.95)leavePainting();}
   if(now-lastTick<33)return;lastTick=now;const moving=motion&&!reduce.matches&&!dialog&&!document.hidden&&inside;
   const animated=frames.filter(f=>f.wanted&&f.distance<12).sort((a,b)=>a.distance-b.distance).slice(0,3);
   for(const f of frames){const animate=moving&&animated.includes(f);f.mount.worldToLocal(world.copy(position));for(const l of f.layers){l.mesh.position.set(l.x,l.y,l.depth);l.mesh.rotation.z=0;if(l.baseScale)l.mesh.scale.copy(l.baseScale);if(l.fade)l.fade.value=animate?T.MathUtils.smoothstep(8-f.distance,1,4)*.94:0;if(l.blink)l.blink.value=animate?Math.max(0,1-Math.abs(now/1000%7.5-3.5)/.12):0;if(!animate)continue;const t=now/1000;
     if(l.behavior==='depth')l.mesh.position.x+=T.MathUtils.clamp(world.x,-4,4)*l.depth*.12;
     if(l.behavior==='float')l.mesh.position.y+=Math.sin(t*.65+l.x)*.025;
     if(l.behavior==='sway')l.mesh.rotation.z=Math.sin(t*.55+l.x)*.015;
     if(l.behavior==='eye')l.mesh.position.x+=T.MathUtils.clamp(world.x,-3,3)*.025;
   }}
   for(const effect of effects){const run=moving&&animated.includes(effect.frame),t=run?now/1000:0;
    if(!effect.candles)effect.texture.offset.x=t*.008;
    else{effect.mat.opacity=run?.78+Math.sin(t*9)*.07+Math.sin(t*13)*.04:.85;effect.lights.forEach((light,i)=>light.scale.y=.42+(run?Math.sin(t*7+i)*.035:0));}
    if(effect.particles){const f=effect.frame;for(let i=0;i<18;i++){const phase=(i*.371+t*.045)%1;particlePose.position.set(((i*.618)%1-.5)*(f.w-.3)+Math.sin(t*.6+i)*.08,(.5-phase)*(f.h-.25),.19);particlePose.rotation.set(0,0,i+t*.28);particlePose.scale.set(.018+i%3*.007,.035+i%4*.004,1);particlePose.updateMatrix();effect.particles.setMatrixAt(i,particlePose.matrix);}effect.particles.instanceMatrix.needsUpdate=true;}
   }
   if(moving&&animated.length)onChange();
  },
  open:id=>{const f=frames.find(f=>f.id===id);if(f)openFrame(f);},visit:id=>{const f=frames.find(f=>f.id===id);if(f)visit(f);},reader,
  inspect:()=>({frames:frames.length,active,maxConcurrent,loaded:[...pool.values()].filter(e=>e.texture).length,failed:[...pool.values()].filter(e=>e.state==='failed').map(e=>e.url),seals:[...collected],motion:motion&&!reduce.matches,framesVisible:frames.filter(f=>f.mount.visible).map(f=>f.id),sources:[...pool.keys()],entries:frames.map(f=>({id:f.id,wanted:f.wanted,distance:f.distance,world:f.world.toArray()}))}),
  dispose(){if(disposed)return;disposed=true;pool.forEach(e=>{e.wanted=false;release(e);});reader.dispose();guide.remove();ui.remove();prompt.remove();style.remove();host.removeEventListener('pointerdown',down,true);host.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);reduce.removeEventListener('change',updateUI);root.removeFromParent();document.body.classList.remove('lost-eden-inside');plane.dispose();cube.dispose();ownedMaterials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());}
 };
 window.museumExhibition=api;
 return api;
}
