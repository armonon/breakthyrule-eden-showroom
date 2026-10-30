'use strict';
(async () => {
const $=id=>document.getElementById(id), dialog=$('product-dialog');
const posterDialog=$('poster-dialog');
const bookDialog=$('book-dialog');
const librarianDialog=$('librarian-dialog');
const uploadDialog=$('upload-dialog');
const residentDialog=$('resident-dialog');
function modalOpen(){return !!document.querySelector('dialog[open]');}
let posterTurns=0,currentPoster=null;
const posterView=posterDialog.querySelector('.poster-view');
function fitPoster(){
 const image=$('poster-image');if(!posterDialog.open||image.hidden||!image.naturalWidth)return;
 const styles=getComputedStyle(posterView),width=posterView.clientWidth-parseFloat(styles.paddingLeft)-parseFloat(styles.paddingRight),height=posterView.clientHeight-parseFloat(styles.paddingTop)-parseFloat(styles.paddingBottom);
 const turned=Math.abs(posterTurns)%2===1,w=image.naturalWidth,h=image.naturalHeight;
 const scale=Math.max(0,Math.min(width/(turned?h:w),height/(turned?w:h)));
 image.style.width=w*scale+'px';image.style.height=h*scale+'px';image.style.transform='rotate('+posterTurns*90+'deg)';
}
$('poster-image').addEventListener('load',fitPoster);
new ResizeObserver(fitPoster).observe(posterView);
function posterSeries(poster){return poster?.instagram?window.showroomInstagramPosts:poster?.lookbook?window.showroomArtwork.filter(item=>item.lookbook):[];}
function showPoster(poster){
 keys.clear();currentPoster=poster;posterTurns=poster.quarterTurns||0;
 const series=posterSeries(poster);
 $('poster-title').textContent=series.length?poster.name+' OF '+series.length:poster.name;
 $('poster-navigation').hidden=!series.length;
 $('poster-previous').disabled=poster.page===1;
 $('poster-next').disabled=poster.page===series.length;
 const mediaVideo=$('poster-video'),isVideo=poster.type==='video';
 mediaVideo.pause();mediaVideo.removeAttribute('src');mediaVideo.load();mediaVideo.hidden=!isVideo;
 $('poster-image').hidden=isVideo;
 $('poster-image').src=poster.file;$('poster-image').alt=poster.alt||(poster.lookbook?'Lookbook photograph '+poster.page:poster.name+' poster');
 if(isVideo){mediaVideo.poster=poster.file;mediaVideo.src=poster.videoFile;mediaVideo.setAttribute('aria-label',poster.alt||poster.name);mediaVideo.load();mediaVideo.play().catch(()=>{});}
 if(!posterDialog.open)posterDialog.showModal();fitPoster();
}
function stepPoster(direction){
 if(!currentPoster?.lookbook&&!currentPoster?.instagram)return;
 const series=posterSeries(currentPoster),next=series[series.indexOf(currentPoster)+direction];
 if(next)showPoster(next);
}
$('poster-previous').onclick=()=>stepPoster(-1);
$('poster-next').onclick=()=>stepPoster(1);
posterDialog.addEventListener('keydown',event=>{
 if(event.target!==$('poster-video')&&(currentPoster?.lookbook||currentPoster?.instagram)&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){
  event.preventDefault();stepPoster(event.key==='ArrowLeft'?-1:1);
 }
});
posterDialog.addEventListener('close',()=>{const video=$('poster-video');video.pause();video.removeAttribute('src');video.load();});
$('close-poster').onclick=()=>posterDialog.close();
posterDialog.addEventListener('click',event=>{if(event.target===posterDialog)posterDialog.close();});
const state={view:'spawn',side:'front',mode:'photo',ready:false,selected:0},keys=new Set();
let multiplayer=null,pendingMultiplayerSpawn=false,expedition=null;
let residents=null,followResident=null,lastResidentShadow=0;
function renderResidents(){
 const entries=residents?.inspect()||window.gardenResidentDefinitions.map(d=>({...d,status:'loading'}));
 $('resident-list').replaceChildren(...entries.map(entry=>{
  const row=document.createElement('li'),image=document.createElement('img'),description=document.createElement('div'),name=document.createElement('strong'),region=document.createElement('small'),status=document.createElement('small'),button=document.createElement('button');
  image.src='/residents/'+entry.id+'.jpg?v='+(entry.assetVersion||3);image.alt='';description.className='resident-description';name.textContent=entry.name;region.textContent=entry.region;
  status.className='resident-status';status.setAttribute('role','status');status.textContent=entry.status==='error'?'Model unavailable':entry.status==='loading'?'Loading...':'';
  description.append(name,region,status);button.className='icon-button';button.disabled=entry.status==='loading';button.dataset.resident=entry.id;
  const retry=entry.status==='error';button.title=retry?'Retry '+entry.name:'Find '+entry.name;button.setAttribute('aria-label',button.title);
  button.innerHTML=retry?'<i data-lucide="refresh-cw"></i>':'<i data-lucide="locate-fixed"></i>';
  button.onclick=()=>retry?residents.retry(entry.id):focusResident(entry.id);
  row.append(image,description,button);return row;
 }));window.lucide?.createIcons();
}
$('open-residents').onclick=()=>{keys.clear();renderResidents();residentDialog.showModal();};
$('close-residents').onclick=()=>residentDialog.close();
residentDialog.addEventListener('close',()=>{keys.clear();requestDraw();});
residentDialog.addEventListener('click',event=>{if(event.target===residentDialog){const r=residentDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)residentDialog.close();}});
$('resident-concepts').onclick=()=>{residentDialog.close();showPoster({name:'Garden residents / full-body concepts',file:'/residents/full-body-concepts.png',alt:'Front and back concept designs for Violet Trickster, Azure Oracle and Gilded Sentinel.'});};
let selectedBook=0,gardenLibrary=null,librarianNPC=null;
const conversation=createLibrarianConversation({onOpen(){keys.clear();if(bookDialog.open)bookDialog.close();go('librarian');librarianNPC?.setTalking(true);$('npc-prompt').hidden=true;requestDraw();},onClose(){librarianNPC?.setTalking(false);go('library');requestDraw();}});
$('npc-prompt').onclick=$('talk-librarian').onclick=$('ask-from-books').onclick=()=>conversation.open();
function showBook(index=selectedBook){
 selectedBook=Math.max(0,Math.min(window.showroomBooks.length-1,index));keys.clear();
 const book=window.showroomBooks[selectedBook];
 bookDialog.querySelector('.archive-source').hidden=!!book.uploaded||book.tag==='Atlas pick';
 $('book-cover').src=book.cover;$('book-cover').alt=book.title+' cover';
 $('book-cover').onerror=()=>{$('book-cover').onerror=null;$('book-cover').src=window.communityLibrary.cover(book.title);};
 $('book-title').textContent=book.title;$('book-author').textContent=book.author;
 $('book-category').textContent=book.tag.toUpperCase();$('book-format').textContent=book.sizeMB!=null?'PDF / '+(book.sizeMB<1?'<1':Math.round(book.sizeMB))+' MB':'Librarian Atlas';
 $('read-book').href=book.url;$('read-book').setAttribute('aria-label','Read '+book.title+' (opens in a new tab)');$('read-book').firstChild.textContent=book.sizeMB!=null?'READ PDF ':'OPEN BOOK ';
 $('book-number').textContent=String(selectedBook+1).padStart(2,'0')+' / '+String(window.showroomBooks.length).padStart(2,'0');
 $('previous-book').disabled=selectedBook===0;$('next-book').disabled=selectedBook===window.showroomBooks.length-1;
 [...$('book-list').children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===selectedBook)));
 if(!bookDialog.open)bookDialog.showModal();
}
function renderBookList(){$('book-list').replaceChildren(...window.showroomBooks.map((book,index)=>{
 const button=document.createElement('button'),cover=document.createElement('img'),text=document.createElement('span'),title=document.createElement('strong'),author=document.createElement('small');
 cover.src=book.cover;cover.alt='';title.textContent=book.title;author.textContent=book.author;text.append(title,author);button.append(cover,text);button.onclick=()=>showBook(index);button.setAttribute('aria-pressed','false');return button;
}));$('library-title').textContent='THE OPEN LIBRARY / '+window.showroomBooks.length+' TEXTS';}
renderBookList();
function setShelfPage(page){
 if(!gardenLibrary)return;
 gardenLibrary.setPage(page);
 syncLibraryPickables();
 const count=gardenLibrary.getPageCount(),current=gardenLibrary.getPage();
 $('shelf-page').textContent=(current+1)+' / '+count;
 for(const id of ['shelf-page','previous-shelf','next-shelf'])$(id).hidden=count<=1;
 $('previous-shelf').disabled=current===0;$('next-shelf').disabled=current===count-1;
 if(state.ready){renderer.shadowMap.needsUpdate=true;requestDraw();}
}
function syncLibraryPickables(){
 for(let i=pickables.length-1;i>=0;i--)if(pickables[i].userData.libraryItem||Number.isInteger(pickables[i].userData.bookIndex))pickables.splice(i,1);
 for(const item of gardenLibrary.pickables){item.userData.libraryItem=true;pickables.push(item);}
}
window.communityLibrary=createCommunityLibrary({onChange(data){
 const previousURL=$('read-book').getAttribute('href');
 selectedBook=Math.max(0,window.showroomBooks.findIndex(book=>book.url===previousURL));renderBookList();
 if(gardenLibrary){gardenLibrary.setShared(data);setShelfPage(gardenLibrary.getPage());}
 if(bookDialog.open)showBook();
}});
window.addEventListener('community-library-change',()=>{$('library-shared-status').textContent=window.communityLibrary.isConnected()?'Shared library connected':'Shared library offline. Please try again.';});
$('read-book').addEventListener('click',()=>{const book=window.showroomBooks[selectedBook];window.communityLibrary.read(book).then(()=>{$('library-shared-status').textContent='On the shared stand: '+book.title;}).catch(error=>{$('library-shared-status').textContent=error.message;});});
$('previous-shelf').onclick=()=>setShelfPage(gardenLibrary.getPage()-1);
$('next-shelf').onclick=()=>setShelfPage(gardenLibrary.getPage()+1);
const uploads=createLibraryUploads({
 onOpen(){keys.clear();if(bookDialog.open)bookDialog.close();if(librarianDialog.open)librarianDialog.close();$('shelf-actions').hidden=true;$('npc-prompt').hidden=true;},
 onClose(){if(state.ready)requestDraw();},
 onBooksChanged(index){renderBookList();if(Number.isInteger(index)&&index>=0)selectedBook=index;const book=window.showroomBooks[selectedBook],uploads=window.showroomBooks.filter(item=>item.uploaded);setShelfPage(book?.uploaded?uploads.findIndex(item=>item.url===book.url):gardenLibrary?.getPage()||0);if(bookDialog.open)showBook();if(state.view==='library')document.querySelector('.world-caption .edition').textContent='THE OPEN LIBRARY / '+window.showroomBooks.length+' TEXTS';}
});
$('open-library').onclick=$('browse-library').onclick=()=>showBook();
$('close-library').onclick=()=>bookDialog.close();
$('previous-book').onclick=()=>showBook(selectedBook-1);$('next-book').onclick=()=>showBook(selectedBook+1);
bookDialog.addEventListener('click',event=>{if(event.target===bookDialog){const r=bookDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)bookDialog.close();}});
bookDialog.addEventListener('close',()=>{keys.clear();requestDraw();});
const collection=window.showroomCollection,models=new Map(),modelJobs=new Map(),rackModels=new Map(),rackFailures=new Set();
let productGeneration=0,wants3D=false,rackLoading=false;
const shop=createGarmentShop({collection,onOpen(){keys.clear();if(dialog.open)dialog.close();},onSelect:index=>inspect('front',index),onClose(){keys.clear();if(state.ready)requestDraw();}});
let collectionRack=null,collectionPavilion=null;
let spinViewer=null,wallFilm=null,instagramSlideshow=null;
let filmHint='Loading the video…',filmStatus='loading';
function updateFilmStatus(status){
 filmStatus=status;
 filmHint=status==='loading'?'Loading the video…':status==='unavailable'?"The video couldn’t load. Try again or watch on YouTube.":status==='blocked'?'Press Play on the video to begin.':'Use the video controls for volume, pause or fullscreen.';
 $('retry-film').hidden=state.view!=='film'||status!=='unavailable';
 if(state.view==='film')$('world-hint').textContent=filmHint;
}
function showSide(side){wants3D=false;state.mode='photo';spinViewer?.hide();$('garment-viewer').hidden=true;imageScroll.hidden=false;$('auto-spin').hidden=true;$('model-status').hidden=true;$('retry-model').hidden=true;$('show-3d').classList.remove('active');$('show-3d').setAttribute('aria-pressed','false');const item=collection[state.selected],images=item.images||[item.image].filter(Boolean),sideIndex=side==='back'?Math.min(1,images.length-1):0;state.side=sideIndex===1?'back':'front';$('detail-image').src=images[sideIndex];$('detail-image').alt=item.imageAlt||item.name+' product photograph';$('image-caption').textContent=String(sideIndex+1).padStart(2,'0')+' / '+item.name.toUpperCase();for(const name of ['front','back']){$('show-'+name).classList.toggle('active',state.side===name);$('show-'+name).setAttribute('aria-pressed',String(state.side===name));}$('show-back').disabled=images.length<2;setZoom(100);}
const imageScroll=$('image-scroll');let zoom=100,imageDrag=null,imageClickUntil=0;
function setZoom(value){
 value=Math.max(100,Math.min(250,Number(value)));const factor=value/zoom;
 const left=(imageScroll.scrollLeft+imageScroll.clientWidth/2)*factor-imageScroll.clientWidth/2;
 const top=(imageScroll.scrollTop+imageScroll.clientHeight/2)*factor-imageScroll.clientHeight/2;
 zoom=value;if(state.mode==='3d')spinViewer?.setZoom(value);$('zoom').value=value;$('zoom-output').textContent=value+'%';$('zoom-surface').style.width=value+'%';$('zoom-surface').style.height=value+'%';
 imageScroll.classList.toggle('zoomed',value>100);$('image-help').textContent=state.mode==='3d'?'DRAG TO ROTATE':value>100?'DRAG TO EXPLORE':'ZOOM TO EXPLORE';$('zoom-out').disabled=value===100;$('zoom-in').disabled=value===250;
 imageScroll.scrollTo({left:value===100?0:left,top:value===100?0:top});
}
function show3D(){if(!spinViewer||!models.has(state.selected))return;state.mode='3d';imageScroll.hidden=true;$('garment-viewer').hidden=false;$('auto-spin').hidden=false;$('model-status').hidden=false;for(const name of ['front','back']){$('show-'+name).classList.remove('active');$('show-'+name).setAttribute('aria-pressed','false');}$('show-3d').classList.add('active');$('show-3d').setAttribute('aria-pressed','true');spinViewer.show();setZoom(100);updateSpinButton();}
function request3D(){
 if(!spinViewer||!collection[state.selected].model)return;
 const generation=productGeneration,index=state.selected;wants3D=true;$('model-status').hidden=false;$('model-status').textContent='Loading Ghost Studio model...';$('retry-model').hidden=true;$('show-3d').disabled=true;
 loadCollectionModel(index).then(model=>{if(model&&generation===productGeneration&&wants3D&&dialog.open)show3D();}).catch(()=>{}).finally(()=>{if(generation===productGeneration)$('show-3d').disabled=!spinViewer;});
}
function updateSpinButton(){const active=spinViewer?.isAuto()||false;$('auto-spin').setAttribute('aria-pressed',String(active));$('auto-spin').textContent=active?'PAUSE SPIN Ⅱ':'START SPIN ↻';}
function updateProduct(side='front'){
 ++productGeneration;wants3D=false;
 spinViewer?.reset();
 const item=collection[state.selected];
 $('collection-select').replaceChildren(...collection.flatMap((entry,index)=>{if(shop.isOpen()&&!(entry.images||[]).some(src=>src.startsWith('/products/')))return [];const option=document.createElement('option');option.value=index;option.textContent=entry.id+' / '+entry.name;return [option];}));
 $('collection-select').value=String(state.selected);
 $('product-title').textContent=item.name;$('piece-number').textContent='PIECE '+item.id+' / '+collection.length+' GARMENTS';
 document.querySelector('.product-description').textContent=item.description||item.tagline||'Product photography sourced from the public Break Thy Rule site.';
 $('model-status').textContent=item.modelNote||'';
 $('retry-model').hidden=true;$('show-3d').disabled=!spinViewer||!item.model;
 showSide(side);
 $('return-product-label').textContent=shop.isOpen()?'BACK TO SHOP':'RETURN TO SHOWROOM';
 $('show-front').textContent=item.photoViews?.[0]||'FRONT';$('show-back').textContent=item.photoViews?.[1]||'BACK';
}
function inspect(side='front',index=state.selected){
 keys.clear();state.selected=index;if(!dialog.open)dialog.showModal();updateProduct(side);
}
$('collection-select').replaceChildren(...collection.map((item,index)=>{const option=document.createElement('option');option.value=index;option.textContent=item.id+' / '+item.name;return option;}));
$('collection-select').onchange=event=>inspect('front',Number(event.target.value));
$('retry-model').onclick=request3D;
function loadCollectionModel(index){
 const item=collection[index];if(!item.model||!window.ShowroomGLTFLoader)return Promise.resolve(null);
 function display(model){if(state.selected===index){spinViewer?.setModel(model);$('show-3d').disabled=!spinViewer;$('model-status').textContent=item.modelNote;$('retry-model').hidden=true;}return model;}
 if(models.has(index))return Promise.resolve(display(models.get(index)));
 if(modelJobs.has(index))return modelJobs.get(index).then(display);
 const job=showroomAssets.model(item.model).then(gltf=>{
  const model=prepareCollectionModel(THREE,gltf.scene);models.set(index,model);
  return display(model);
 }).catch(error=>{if(state.selected===index&&wants3D&&dialog.open){$('model-status').textContent='The 3D model could not load. Product photos are still available.';$('retry-model').hidden=false;}throw error;}).finally(()=>modelJobs.delete(index));
 modelJobs.set(index,job);return job;
}
function rackStatus(){
 $('collection-status').textContent=rackModels.size+'/'+collection.length+' 3D MODELS'+(rackFailures.size?' / '+rackFailures.size+' UNAVAILABLE':' / GHOST STUDIO');
 $('retry-rack').hidden=!rackFailures.size||rackLoading;
}
async function loadRackModels(){
 if(rackLoading||!collectionRack)return;rackLoading=true;rackStatus();
 const queue=collection.map((_,i)=>i).filter(i=>!rackModels.has(i));
 async function worker(){while(queue.length){const index=queue.shift(),item=collection[index];try{
  const gltf=await showroomAssets.model(item.rackModel||item.model),model=prepareCollectionModel(THREE,gltf.scene);
  rackModels.set(index,model);rackFailures.delete(index);const placed=collectionRack.place(index,model);placed?.traverse(n=>{if(n.isMesh)pickables.push(n);});
  renderer.shadowMap.needsUpdate=true;requestDraw();
 }catch{rackFailures.add(index);}rackStatus();await new Promise(resolve=>setTimeout(resolve,35));}}
 await Promise.all([worker(),worker()]);rackLoading=false;rackStatus();
}
$('retry-rack').onclick=loadRackModels;
window.addEventListener('online',()=>{if(rackFailures.size)loadRackModels();});
$('show-front').addEventListener('click',()=>{wants3D=false;});$('show-back').addEventListener('click',()=>{wants3D=false;});
$('show-3d').onclick=request3D;$('auto-spin').onclick=()=>{spinViewer?.setAuto(!spinViewer.isAuto());updateSpinButton();};$('garment-viewer').addEventListener('garmentzoom',event=>setZoom(event.detail));
$('garment-viewer').addEventListener('viewerfailed',()=>{showSide(state.side);spinViewer=null;$('show-3d').disabled=true;});
dialog.addEventListener('close',()=>{wants3D=false;spinViewer?.hide();updateSpinButton();});
function close(){dialog.close();}
$('view-product').onclick=$('inspect-jacket').onclick=$('fallback-inspect').onclick=shop.open;$('show-front').onclick=()=>showSide('front');$('show-back').onclick=()=>showSide('back');$('close-product').onclick=close;$('return-room').onclick=close;$('zoom').oninput=event=>setZoom(event.target.value);
if(new URLSearchParams(location.search).get('shop')==='1')shop.open();
$('zoom-out').onclick=()=>setZoom(zoom-25);$('zoom-in').onclick=()=>setZoom(zoom+25);$('zoom-reset').onclick=()=>setZoom(100);
imageScroll.addEventListener('pointerdown',event=>{if(zoom===100||event.pointerType==='touch'||event.button!==0)return;imageDrag={id:event.pointerId,x:event.clientX,y:event.clientY,left:imageScroll.scrollLeft,top:imageScroll.scrollTop,moved:false};imageScroll.setPointerCapture(event.pointerId);});
imageScroll.addEventListener('pointermove',event=>{if(!imageDrag)return;const dx=event.clientX-imageDrag.x,dy=event.clientY-imageDrag.y;if(Math.abs(dx)+Math.abs(dy)>4)imageDrag.moved=true;if(imageDrag.moved){imageScroll.classList.add('panning');imageScroll.scrollLeft=imageDrag.left-dx;imageScroll.scrollTop=imageDrag.top-dy;}});
function endImageDrag(event){if(imageDrag?.moved)imageClickUntil=performance.now()+300;if(imageScroll.hasPointerCapture(event.pointerId))imageScroll.releasePointerCapture(event.pointerId);imageDrag=null;imageScroll.classList.remove('panning');}
imageScroll.addEventListener('pointerup',endImageDrag);imageScroll.addEventListener('pointercancel',endImageDrag);
imageScroll.addEventListener('click',()=>{if(performance.now()>imageClickUntil)setZoom(zoom===100?200:100);});
imageScroll.addEventListener('keydown',event=>{if(event.key==='Enter'){setZoom(zoom===100?200:100);event.preventDefault();}});
$('spawn').disabled=true;$('approach').disabled=true;$('wall-view').disabled=true;$('film-view').disabled=true;$('film-view').hidden=true;
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
dialog.addEventListener('keydown',event=>{if(!['INPUT','SELECT','BUTTON'].includes(event.target.tagName)&&event.target!==imageScroll&&event.target!==$('garment-viewer')&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){showSide(state.side==='front'?'back':'front');event.preventDefault();}});
function fallback(){instagramSlideshow?.destroy();instagramSlideshow=null;wallFilm?.destroy();wallFilm=null;$('film-link').hidden=false;state.ready=false;$('loading').hidden=true;$('fallback').hidden=false;$('scene').hidden=true;$('spawn').disabled=true;$('approach').disabled=true;$('wall-view').disabled=true;$('film-view').disabled=true;$('movement-hint').textContent='EXPLORE THE PRODUCT PHOTOS';$('world-hint').textContent='Select the vault to inspect product photography.';}
if(!window.THREE){fallback();return;}
const T=THREE,stage=$('scene');let renderer;
try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch{fallback();return;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(stage.clientWidth,stage.clientHeight);renderer.setClearColor(0xc7d9b8,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;stage.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','Garden of Eden with a sunlit fruit tree, wildflowers, a reflective pond, stone paths and the Break Thy Rule collection in an open garden pavilion.');renderer.domElement.setAttribute('role','img');
const scene=new T.Scene();scene.background=null;
const camera=new T.PerspectiveCamera(44,stage.clientWidth/stage.clientHeight,.05,220),aim=new T.Vector3(0,1.2,-1.4),targetAim=aim.clone(),targetPosition=new T.Vector3();
renderer.domElement.tabIndex=-1;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
scene.add(new T.HemisphereLight(0xdceffc,0x5a6538,1.35));
const light=new T.DirectionalLight(0xffe4ad,3.2);light.position.set(-23,19,-48);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:110});light.shadow.normalBias=.035;light.shadow.bias=-.00015;light.shadow.radius=3;scene.add(light);
const fill=new T.DirectionalLight(0xe4edff,.35);fill.position.set(10,9,18);scene.add(fill);
try{const response=await fetch('/night-layout.json?v=1');if(!response.ok)throw new Error('Night district unavailable');window.nightLayout=await response.json();}catch(error){fallback();return;}
const garden=createEdenGarden(T,scene,{reduced,mobile:stage.clientWidth<700,onChange:requestDraw});
const nightLaunch=document.createElement('button');nightLaunch.id='night-launch';nightLaunch.textContent='BEYOND EDEN';nightLaunch.title='Night expeditions';$('amphitheater-view').after(nightLaunch);
const amphitheater=createAmphitheater(T,scene,{reduced});
const music=createGardenMusic({requestDraw,onOpen(){keys.clear();}});
residents=createGardenResidents(T,scene,{reduced,renderer,sky:garden.sky,onChange(){if(residentDialog.open)renderResidents();if(state.ready){renderer.shadowMap.needsUpdate=true;requestDraw();}}});
const chrome=new T.MeshStandardMaterial({color:0xaeb0b2,metalness:.45,roughness:.3});
const rails=[],garments=[],pickables=[...amphitheater.pickables];let posterMeshes=[];
librarianNPC=createLibrarianNPC(T,scene,{reduced,onLoad(){pickables.push(...librarianNPC.pickables);renderer.shadowMap.needsUpdate=true;requestDraw();}});
function rod(parent,from,to,r=.014,material=chrome){const a=new T.Vector3(...from),b=new T.Vector3(...to),d=b.clone().sub(a);const mesh=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),16),material);mesh.position.copy(a.add(b).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());mesh.castShadow=true;parent.add(mesh);return mesh;}
const loader=new T.TextureLoader();
const texturePaths=[collection[0].images[0],collection[0].images[1]||collection[0].images[0],...window.showroomArtwork.map(poster=>poster.textureFile||poster.file),'/logo.png'];
Promise.resolve(texturePaths.map(path=>{const texture=showroomAssets.texture(T,path,requestDraw);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return texture;})).then(async allTextures=>{
garden.ready.then(requestDraw);
gardenLibrary=createGardenLibrary(T,scene,requestDraw);
gardenLibrary.ready.then(requestDraw);
setShelfPage(0);
const textures=allTextures.slice(0,2);
const roomData=createWhiteRoom(T,scene,allTextures.slice(2,2+window.showroomArtwork.length),allTextures[allTextures.length-1]);
posterMeshes=roomData.posterMeshes;
collectionPavilion=roomData;
pickables.push(...posterMeshes);
const galleryLinks=[window.showroomArtwork.find(poster=>poster.lookbook),window.showroomInstagramPosts[0],...window.showroomArtwork.filter(poster=>!poster.lookbook)].filter(Boolean);
const wallSwitch=document.createElement('button');wallSwitch.id='gallery-shop-photos';wallSwitch.textContent='SHOP PHOTOS';wallSwitch.onclick=shop.open;
$('poster-links').replaceChildren(wallSwitch,...galleryLinks.map(poster=>{const button=document.createElement('button');button.textContent=poster.lookbook?'PHOTOS · '+collection.length:poster.label;button.setAttribute('aria-label',poster.lookbook?'View all '+collection.length+' product photographs':'View '+poster.name);button.onclick=()=>showPoster(poster);return button;}));
collectionRack=createCollectionRack(T,scene,chrome,rod);rails.push(collectionRack.rack);collectionRack.rack.traverse(node=>{if(Number.isInteger(node.userData.collectionIndex))pickables.push(node);});
$('collection-status').textContent=collection.length+' GARMENTS / GHOST STUDIO';
try{spinViewer=createSpinViewer({element:$('garment-viewer'),textures,onAngle:degrees=>{$('image-caption').textContent='360° / '+String(degrees).padStart(3,'0')+'°';},onInteraction:updateSpinButton});$('show-3d').disabled=!collection[state.selected].model;}catch(error){console.warn('360 viewer unavailable; photographs remain available.');}
state.ready=true;$('spawn').disabled=false;$('approach').disabled=false;$('wall-view').disabled=false;$('loading').hidden=true;go('spawn',true);requestDraw();
$('library-view').disabled=false;
$('open-residents').disabled=false;
$('amphitheater-view').disabled=false;
if(pendingMultiplayerSpawn)enterMultiplayer();
}).catch(fallback);
let frame=0,previous=0,drag=null,suppressClickUntil=0;
const motion=createPlayerMotion();
const moveKeys=new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']);
const finePointer=matchMedia('(pointer: fine)').matches;
$('movement-hint').textContent=finePointer?'W A S D TO MOVE / DRAG TO LOOK':'DRAG TO LOOK / TAP TO EXPLORE';
function requestDraw(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
function draw(time){frame=0;if(!state.ready)return;const dt=Math.min((time-(previous||time))/1000,.05);previous=time;if(keys.size&&!modalOpen())move(dt||.016);updateJump(dt||.016);$('social-move').querySelector('[data-key="shift"]').setAttribute('aria-pressed',String(keys.has('shift')));residents.update();if(followResident)frameResident();if(!reduced&&camera.position.z> -25&&time-lastResidentShadow>160){renderer.shadowMap.needsUpdate=true;lastResidentShadow=time;}const factor=reduced?1:1-Math.exp(-7*(dt||.016));camera.position.lerp(targetPosition,factor);aim.lerp(targetAim,factor);camera.lookAt(aim);garden.update(time/1000,camera,!modalOpen());expedition?.update(time/1000,dt||.016);updateRoadCaption();amphitheater.update(time/1000,music.playing);music.update(camera);librarianNPC.update(time/1000,camera);const movingVisitors=multiplayer?.update(time/1000,dt||.016);renderer.render(scene,camera);wallFilm?.update(camera);updateNPCPrompt();updateShelfActions();updateMusicPrompt();if(motion.inspect().airborne||expedition?.active()||movingVisitors||(!reduced&&(!modalOpen()||librarianDialog.open))||keys.size||camera.position.distanceTo(targetPosition)>.001||aim.distanceTo(targetAim)>.001)requestDraw();else previous=0;}
let roadCaption='';
function updateRoadCaption(){if(state.view!=='free'){roadCaption='';return;}const place=garden.pyramid.gathering.inspect().inside?'gathering':camera.position.z<garden.road.start-4?'road':'garden';if(place===roadCaption)return;roadCaption=place;document.querySelector('.world-caption h1').textContent=place==='gathering'?'THE GATHERING':place==='road'?'THE FOREVER ROAD':'GARDEN OF EDEN';document.querySelector('.world-caption .edition').textContent=place==='gathering'?'BREAKTHYRULE / WITHIN THE PYRAMID':place==='road'?'BREAKTHYRULE / BEYOND THE SIGN':'BREAKTHYRULE / IN THE BEGINNING';}
function updateMusicPrompt(){const point=amphitheater.marker.clone().project(camera),button=$('music-prompt');button.hidden=modalOpen()||!['amphitheater','free'].includes(state.view)||point.z< -1||point.z>1||Math.abs(point.x)>.9||Math.abs(point.y)>.8||camera.position.distanceTo(amphitheater.marker)>26;if(!button.hidden){button.style.left=T.MathUtils.clamp((point.x+1)*stage.clientWidth/2,90,stage.clientWidth-90)+'px';button.style.top=T.MathUtils.clamp((1-point.y)*stage.clientHeight/2,245,stage.clientHeight-170)+'px';}}
function updateShelfActions(){
 const controls=$('shelf-actions');if(!gardenLibrary){controls.hidden=true;return;}
 const point=gardenLibrary.marker.clone().project(camera);
 controls.hidden=modalOpen()||!['library','spawn','free'].includes(state.view)||point.z< -1||point.z>1||Math.abs(point.x)>.96||Math.abs(point.y)>.9||camera.position.distanceTo(gardenLibrary.marker)>24;
 if(!controls.hidden){const margin=controls.offsetWidth/2+12;controls.style.left=T.MathUtils.clamp((point.x+1)*stage.clientWidth/2,margin,stage.clientWidth-margin)+'px';controls.style.top=T.MathUtils.clamp((1-point.y)*stage.clientHeight/2,145,stage.clientHeight-170)+'px';}
}
function updateNPCPrompt(){loadNearbyAssets();const point=librarianNPC.marker.clone().project(camera),button=$('npc-prompt');button.hidden=modalOpen()||state.view==='film'||point.z< -1||point.z>1||Math.abs(point.x)>.85||Math.abs(point.y)>.78||camera.position.distanceTo(librarianNPC.marker)>22;if(!button.hidden){button.style.left=T.MathUtils.clamp((point.x+1)*stage.clientWidth/2,105,stage.clientWidth-105)+'px';button.style.top=Math.max(125,(1-point.y)*stage.clientHeight/2-20)+'px';}}
function loadNearbyAssets(){
 if(camera.position.distanceTo(librarianNPC.marker)<16)librarianNPC.load();
 if(collectionRack&&camera.position.distanceTo(collectionRack.rack.position)<12&&!rackLoading&&!rackModels.size&&!rackFailures.size)loadRackModels();
}
function markView(){const libraryView=state.view==='library'||state.view==='librarian',musicView=state.view==='amphitheater';stage.classList.toggle('watching-film',state.view==='film');wallFilm?.setInteractive(state.view==='film');$('browse-library').hidden=!libraryView;$('talk-librarian').hidden=!libraryView;$('inspect-jacket').hidden=libraryView||musicView;$('open-music').hidden=!musicView;for(const [id,view]of[['spawn','spawn'],['library-view','library'],['approach','approach'],['wall-view','wall'],['film-view','film'],['amphitheater-view','amphitheater']]){const selected=state.view===view||(view==='wall'&&state.view==='lookbook')||(view==='library'&&state.view==='librarian');$(id).classList.toggle('selected',selected);$(id).setAttribute('aria-pressed',String(selected));}}
function go(view,instant=false){
 if(view==='film'||view==='lookbook')view='wall';
 if(expedition?.active())expedition.leave();
 followResident=null;stage.classList.remove('resident-view');
 if(view==='free')view='spawn';state.view=view;keys.clear();markView();if(!state.ready)return;motion.reset();
 if(view==='approach')loadRackModels();
 if(view==='library'||view==='librarian')librarianNPC.load();
 $('poster-links').hidden=view!=='wall'&&view!=='lookbook';if($('gallery-wall-switch'))$('gallery-wall-switch').textContent=view==='lookbook'?'ART WALL':'PHOTO WALL';$('film-link').hidden=view!=='film';$('retry-film').hidden=view!=='film'||filmStatus!=='unavailable';document.querySelector('.world-caption h1').textContent=view==='spawn'?'GARDEN OF EDEN':view==='film'?'THE SCREEN':view==='lookbook'?'THE PHOTO WALL':view==='wall'?'THE ARTWORK':'THE VAULT';document.querySelector('.world-caption .edition').textContent=view==='spawn'?'BREAKTHYRULE / IN THE BEGINNING':view==='film'?'MOVING SIGNAL / BREAKTHYRULE':view==='lookbook'?'BREAKTHYRULE / '+collection.length+' PHOTOGRAPHS':view==='wall'?'BREAKTHYRULE / ARTWORK':'BREAKTHYRULE / '+collection.length+' 3D GARMENTS';
 if(view==='library'){document.querySelector('.world-caption h1').textContent='THE OPEN LIBRARY';document.querySelector('.world-caption .edition').textContent='THE OPEN LIBRARY / '+window.showroomBooks.length+' TEXTS';}
 if(view==='librarian'){document.querySelector('.world-caption h1').textContent='THE LIBRARIAN';document.querySelector('.world-caption .edition').textContent='THE GARDEN KEEPER';}
 if(view==='amphitheater'){document.querySelector('.world-caption h1').textContent='THE AMPHITHEATER';document.querySelector('.world-caption .edition').textContent='EDEN / SOUND GARDEN';}
 const preset=window.showroomCameraView(stage.clientWidth/stage.clientHeight,view);
 camera.fov=preset.fov;camera.updateProjectionMatrix();
 targetPosition.set(...preset.position);targetAim.set(...preset.aim);
 $('world-hint').textContent=view==='film'?filmHint:'';
 if(instant||reduced){camera.position.copy(targetPosition);aim.copy(targetAim);}requestDraw();
}
function freeView(){followResident=null;stage.classList.remove('resident-view');if(state.view!=='free'){state.view='free';markView();$('film-link').hidden=true;$('retry-film').hidden=true;$('poster-links').hidden=true;document.querySelector('.world-caption h1').textContent='GARDEN OF EDEN';document.querySelector('.world-caption .edition').textContent='BREAKTHYRULE / IN THE BEGINNING';$('world-hint').textContent='';}}
function frameResident(){
 const entry=residents.get(followResident);if(!entry?.root)return;
 const mobile=stage.clientWidth<700,position=entry.root.position;
 // This path borders the pavilion and a tree; keep its follow camera in the clear southeast area.
 const jester=entry.def.id==='violet-trickster',angle=jester ? .40 : entry.root.rotation.y+.22,distance=mobile?(jester?7.1:6.2):4.25;
 targetPosition.set(position.x+Math.sin(angle)*distance,1.55,position.z+Math.cos(angle)*distance);
 targetAim.set(position.x,mobile?.72:1.10,position.z);
}
function focusResident(id){
 const entry=residents.get(id);if(!state.ready||!entry?.root)return;
 residentDialog.close();freeView();keys.clear();motion.reset();followResident=id;state.view='resident';markView();stage.classList.add('resident-view');
 camera.fov=44;camera.updateProjectionMatrix();frameResident();camera.position.copy(targetPosition);aim.copy(targetAim);
 document.querySelector('.world-caption h1').textContent=entry.def.name.toUpperCase();document.querySelector('.world-caption .edition').textContent=entry.def.region.toUpperCase();requestDraw();
}
function move(dt){
 if(expedition&&!expedition.canMove())return;
 const z=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
 if(!x&&!z)return;
 prepareWalking();const forward=targetAim.clone().sub(targetPosition);forward.y=0;forward.normalize();const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0));
 const step=forward.multiplyScalar(z).add(right.multiplyScalar(x));if(step.lengthSq()===0)return;step.normalize().multiplyScalar(dt*motion.speed(keys.has('shift')));const next=garden.constrain(targetPosition.clone().add(step),targetPosition);
 expedition?.constrain(next,targetPosition);
 const pond=((next.x-5.7)/4.1)**2+((next.z-3.5)/5.9)**2<1;const walls=collectionPavilion?.blocks(next);const rack=next.x<-12.6&&next.x>-13.7&&Math.abs(next.z-.5)<3.5;const trunk=Math.hypot(next.x-.5,next.z+7)<.75;
 if(pond||walls||rack||trunk||amphitheater.blocks(next)||gardenLibrary?.blocks(next))return;
 next.y=1.75+amphitheater.groundHeight(next)+motion.inspect().height;
 const actual=next.clone().sub(targetPosition);targetPosition.copy(next);targetAim.add(actual);
}
function shiftHeight(delta){targetPosition.y+=delta;targetAim.y+=delta;}
function prepareWalking(){
 if(state.view==='amphitheater'){const origin=amphitheater.root.position;targetPosition.set(origin.x,1.75,origin.z+9.4);targetAim.set(origin.x,1.55,origin.z);camera.position.copy(targetPosition);aim.copy(targetAim);}
 freeView();shiftHeight(1.75+amphitheater.groundHeight(targetPosition)+motion.inspect().height-targetPosition.y);
}
function jump(){if(!state.ready||modalOpen()||expedition&&!expedition.canMove()||motion.inspect().airborne)return;prepareWalking();motion.jump();requestDraw();}
function updateJump(dt){if(!motion.inspect().airborne)return;const before=motion.inspect().height;if(expedition&&!expedition.canMove())motion.reset();else motion.step(dt);shiftHeight(motion.inspect().height-before);}
function setMovement(key,pressed){
 if(pressed&&(!state.ready||modalOpen()||expedition&&!expedition.canMove()))return;
 if(key==='space'){if(pressed)jump();return;}
 if(!moveKeys.has(key)&&key!=='shift')return;
 if(pressed&&moveKeys.has(key))renderer.domElement.focus({preventScroll:true});
 if(pressed)keys.add(key);else keys.delete(key);
 if(state.ready)requestDraw();
}
document.addEventListener('keydown',event=>{if(modalOpen()||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;const key=event.code==='Space'?'space':event.key.toLowerCase();if((moveKeys.has(key)||key==='shift'||key==='space')&&state.ready){if(key==='space'&&['BUTTON','A'].includes(event.target.tagName))return;event.preventDefault();if(!event.repeat)setMovement(key,true);}});
document.addEventListener('keyup',event=>setMovement(event.key.toLowerCase(),false));
for(const button of $('social-move').querySelectorAll('button')){button.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);setMovement(button.dataset.key,true);};button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>setMovement(button.dataset.key,false);}
document.addEventListener('focusin',event=>{if(modalOpen()||event.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)){keys.clear();if(state.ready)requestDraw();}});
window.addEventListener('blur',()=>{keys.clear();drag=null;if(state.ready)requestDraw();});
dialog.addEventListener('close',()=>{keys.clear();requestDraw();});
posterDialog.addEventListener('close',requestDraw);
$('spawn').onclick=()=>go('spawn');$('approach').onclick=()=>go('approach');$('wall-view').onclick=()=>go('wall');$('film-view').onclick=selectFilm;
$('amphitheater-view').onclick=()=>go('amphitheater');
$('library-view').onclick=()=>go('library');
function selectFilm(){go('film');wallFilm?.playWithSound();}
const raycaster=new T.Raycaster(),pointer=new T.Vector2();
function hit(event){const r=stage.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(pickables,false)[0];}
renderer.domElement.addEventListener('click',event=>{if(performance.now()<suppressClickUntil)return;const found=hit(event),residentId=residents.pick(raycaster,found?.distance);if(residentId){focusResident(residentId);return;}if(multiplayer?.pick(raycaster,found?.distance))return;if(found){if(found.object.userData.uploadPDF)uploads.open();else if(found.object.userData.stemdeck)music.openDeck();else if(found.object.userData.amphitheater)music.open();else if(found.object.userData.librarian)conversation.open();else if(Number.isInteger(found.object.userData.bookIndex))showBook(found.object.userData.bookIndex);else if(found.object.userData.film)selectFilm();else if(found.object.userData.poster)showPoster(found.object.userData.poster);else if(Number.isInteger(found.object.userData.collectionIndex))inspect('front',found.object.userData.collectionIndex);}});
renderer.domElement.addEventListener('pointerdown',event=>{if(event.button!==0||!state.ready)return;const direction=targetAim.clone().sub(targetPosition).normalize();drag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:Math.atan2(direction.x,-direction.z),pitch:Math.asin(direction.y),moved:false};renderer.domElement.setPointerCapture(event.pointerId);});
renderer.domElement.addEventListener('pointermove',event=>{if(drag){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true;if(drag.moved){freeView();const yaw=drag.yaw+dx*.0035,pitch=T.MathUtils.clamp(drag.pitch-dy*.0035,-.38,.4);targetAim.copy(targetPosition).add(new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(5));renderer.domElement.style.cursor='grabbing';requestDraw();}}else renderer.domElement.style.cursor=hit(event)?'pointer':'grab';});
renderer.domElement.addEventListener('pointerup',event=>{if(drag){suppressClickUntil=drag.moved?performance.now()+300:0;drag=null;renderer.domElement.releasePointerCapture(event.pointerId);}});
renderer.domElement.addEventListener('pointercancel',()=>{drag=null;suppressClickUntil=0;});
new ResizeObserver(()=>{renderer.setSize(stage.clientWidth,stage.clientHeight);camera.aspect=stage.clientWidth/stage.clientHeight;camera.updateProjectionMatrix();if(followResident)focusResident(followResident);else if(state.view==='free'){camera.position.copy(targetPosition);camera.lookAt(targetAim);requestDraw();}else go(state.view,true);}).observe(stage);
document.addEventListener('visibilitychange',()=>{keys.clear();drag=null;if(!document.hidden)requestDraw();});
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback();});
function enterMultiplayer(){if(expedition?.active())return;if(!state.ready){pendingMultiplayerSpawn=true;return;}pendingMultiplayerSpawn=false;motion.reset();freeView();targetPosition.set(-2+Math.random()*4,1.7,11+Math.random()*3);targetAim.copy(targetPosition).add(new T.Vector3(0,-.15,-5));camera.position.copy(targetPosition);aim.copy(targetAim);requestDraw();}
function focusVisitor(p){
 freeView();keys.clear();motion.reset();
 const offset=new T.Vector3(camera.position.x-p.x,0,camera.position.z-p.z);
 if(offset.length()<3.5){if(offset.length()<.01)offset.set(0,0,1);offset.setLength(3.5);targetPosition.set(T.MathUtils.clamp(p.x+offset.x,-20,20),1.7,T.MathUtils.clamp(p.z+offset.z,-20,26));}
 targetAim.set(p.x,p.ghost?.9:(p.character?.height||175)/100*.58,p.z);requestDraw();
}
multiplayer=window.createGardenMultiplayer?.({T,scene,camera,requestDraw,enter:enterMultiplayer,inExpedition:()=>expedition?.active(),getPose:()=>state.ready&&!expedition?.active()?{x:camera.position.x,z:camera.position.z,yaw:Math.atan2(aim.x-camera.position.x,aim.z-camera.position.z)}:null,lookAt:focusVisitor,stopMoving:()=>{keys.clear();drag=null;}});
expedition=window.createExpedition({T,scene,camera,garden,layout:window.nightLayout,getPose:()=>state.ready?{x:targetPosition.x,z:targetPosition.z,yaw:Math.atan2(targetAim.x-targetPosition.x,targetAim.z-targetPosition.z)}:null,place(x,z,lx=x,lz=z-5){motion.reset();freeView();targetPosition.set(x,1.75,z);targetAim.set(lx,1.75,lz);camera.position.copy(targetPosition);aim.copy(targetAim);camera.fov=60;camera.updateProjectionMatrix();camera.lookAt(aim);requestDraw();},stopMoving(){keys.clear();drag=null;},requestDraw,returnHome:()=>go('spawn',true)});
$('night-dialog').addEventListener('close',()=>{if(expedition.active()&&expedition.canMove()&&!modalOpen())renderer.domElement.focus({preventScroll:true});});
window.breakThyRuleShowroom={go,inspect,showSide,focusResident,getState:()=>({...state,position:camera.position.toArray(),movement:{...motion.inspect(),sprinting:keys.has('shift'),speed:motion.speed(keys.has('shift'))},expedition:expedition?.inspect(),district:garden.district.inspect(),library:gardenLibrary?.inspect(),residents:residents.inspect(),amphitheater:amphitheater.inspect(),music:music.inspect(),racks:rails.length,garments:rackModels.size,rackTotal:collection.length,rackFailures:[...rackFailures],rackLoading,posters:posterMeshes.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,multiplayer:multiplayer?.inspect()})};
})();
