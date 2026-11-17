import {prepareFeaturedGarment, loadFeaturedTexture} from './featured-garment-materials.mjs?v=1';

// A single clock, graphic and renderer for the three collection previews.
const GRAPHICS = ['illuminti','house-of-horus','diamond-body','nu-cross','divide','war','god-loves-u'];
const NAMES = {'illuminti':'Illuminati','house-of-horus':'House of Horus','diamond-body':'Diamond Body','nu-cross':'Nu Cross','divide':'Divide','war':'WAR','god-loves-u':'God Loves You'};
const KINDS = ['tee','hoodie','crewneck'];
const LABELS = {tee:'FW27 Crew Tee',hoodie:'FW27 Crew Hoodie',crewneck:'FW27 Crewneck'};
const PRICES = {tee:'$30–$80',hoodie:'$50–$180',crewneck:'$40–$150'};
const COLORS = ['#f2efe7','#17191d','#903c48','#4b62a1','#819477','#baa2c9','#bda45c'];
const TURN_SECONDS = 4.8, TRANSITION_SECONDS = 1.2, TAU = Math.PI * 2;
const sample = list => list[Math.floor(Math.random()*list.length)];

function mount() {
  const hosts = [...document.querySelectorAll('[data-featured-garment]')].slice(0,3);
  if (hosts.length !== 3 || !window.THREE) return;
  const T=window.THREE, reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const cards=hosts.map((host,i)=>{
    const canvas=document.createElement('canvas'); canvas.width=480; canvas.height=600;
    canvas.setAttribute('aria-hidden','true'); host.append(canvas);
    return {host,canvas,ctx:canvas.getContext('2d'),article:host.closest('article'),kind:KINDS[i],from:new T.Color(COLORS[i]),to:new T.Color(COLORS[i])};
  });
  const visible=new Set(), models=new Map();
  let renderer,scene,camera,frame=0,last=0,started=false,ready=false,failed=false,angle=0,pass=0,blend=1;
  let graphic=GRAPHICS[0], nextLook=null, pendingNext=false, alive=true, held=false, pageSleeping=false;
  const hovered=new Set(),focused=new Set();
  const active=()=>alive && !pageSleeping && (window.showroomPageActive?.() ?? !document.hidden) && visible.size>0;
  let bag=GRAPHICS.slice(1);
  function nextGraphic(){
    if(!bag.length) bag=GRAPHICS.filter(id=>id!==graphic);
    const index=Math.floor(Math.random()*bag.length);
    return bag.splice(index,1)[0];
  }
  function publish(){
    for(const card of cards){
      const label=LABELS[card.kind],url='/product?item=core-'+card.kind;
      card.host.href=url;
      card.host.setAttribute('aria-label',`${label}, ${NAMES[graphic]} artwork. Explore this garment.`);
      Object.assign(card.host.dataset,{featuredKind:card.kind,featuredGraphic:graphic,featuredTurn:String(pass),featuredColor:card.to.getHexString()});
      const title=card.article.querySelector('h3 a'),price=card.article.querySelector('.core-card-price');
      if(title){title.textContent=label; title.href=url;}
      if(price){price.textContent=PRICES[card.kind];price.setAttribute('aria-label',`${PRICES[card.kind]}, Random to Cut and Sew`);}
      const fallback=card.host.querySelector('img');
      if(fallback) fallback.alt=label+' garment preview';
    }
  }
  async function prepareNext(){
    if(pendingNext||nextLook||!alive||reduced.matches)return;
    pendingNext=true;
    try{
      const next=nextGraphic(), texture=await loadFeaturedTexture(next);
      if(!alive)return;
      // Both permutations change every card's silhouette, without duplicates.
      const shift=Math.random()<.5?1:2;
      nextLook={graphic:next,texture,kinds:cards.map((_,i)=>cards[(i+shift)%3].kind),colors:cards.map(card=>new T.Color(sample(COLORS.filter(color=>color.slice(1)!==card.to.getHexString()))))};
    }catch{
      // Keep the current complete design if an image is temporarily unavailable.
      nextLook={graphic,texture:null,kinds:cards.map((_,i)=>cards[(i+1)%3].kind),colors:cards.map(card=>card.to.clone())};
    }finally{pendingNext=false;request();}
  }
  function commitLook(){
    if(!nextLook)return false;
    graphic=nextLook.graphic; pass++; blend=0;
    for(let i=0;i<cards.length;i++){
      const card=cards[i];card.from.copy(card.to);card.to.copy(nextLook.colors[i]);card.kind=nextLook.kinds[i];
      if(nextLook.texture)models.get(card.kind).material.setGraphic(nextLook.texture);
    }
    nextLook=null;publish();prepareNext();return true;
  }
  async function start(){
    if(started||!active())return; started=true;
    try{
      renderer=new T.WebGLRenderer({canvas:document.createElement('canvas'),antialias:true,alpha:true});
      window.showroomEnableKTX2?.(renderer);
      renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
      renderer.setPixelRatio(1);renderer.setSize(480,600,false);
      scene=new T.Scene();window.showroomProductLights?.(scene);
      if(!scene.children.length){scene.add(new T.HemisphereLight(0xffffff,0x8d8583,2.5));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-3,5,6);scene.add(light);}
      camera=new T.PerspectiveCamera(30,.8,.05,40);camera.position.set(0,.05,4.4);camera.lookAt(0,0,0);
      const texture=await loadFeaturedTexture(graphic);
      for(const kind of KINDS){
        const gltf=await window.showroomAssets.model(`/core-collection/models/core-${kind}-black.glb`,{priority:'low'});
        if(!alive)return;
        const material=await prepareFeaturedGarment(gltf,kind);
        material.setGraphic(texture);
        const bounds=new T.Box3().setFromObject(material.model),size=bounds.getSize(new T.Vector3());
        const centered=new T.Group();centered.add(material.model);material.model.position.sub(bounds.getCenter(new T.Vector3()));
        const model=new T.Group();model.add(centered);model.scale.setScalar(Math.min(1.9/size.y,1.55/Math.max(size.x,size.z)));
        models.set(kind,{model,material});
      }
      ready=true;publish();draw(0);
      cards.forEach(card=>card.host.classList.add('core-model-ready'));
      prepareNext();request();
    }catch(error){failed=true;hosts.forEach(host=>host.dataset.previewState='fallback');console.warn('Featured garment previews unavailable; showing garment images.',error);}
  }
  function request(){if(active()&&ready&&!frame&&!failed)frame=requestAnimationFrame(draw);}
  function draw(time){
    frame=0;if(!active()||!ready){last=0;return;}
    if(last&&time-last<32){request();return;}
    const dt=Math.min((time-(last||time))/1000,.08);last=time;
    if(!reduced.matches&&!held){
      angle+=dt*TAU/TURN_SECONDS;blend=Math.min(1,blend+dt/TRANSITION_SECONDS);
      if(angle>=TAU){if(commitLook())angle-=TAU;else angle=TAU;}
    }
    for(const card of cards){
      // All three state changes happen before any visible card is painted.
      const entry=models.get(card.kind);
      entry.material.setColors(card.from,card.to,reduced.matches?1:blend);
      if(!visible.has(card))continue;
      entry.model.rotation.y=angle;
      scene.add(entry.model);renderer.render(scene,camera);scene.remove(entry.model);
      card.ctx.clearRect(0,0,480,600);card.ctx.drawImage(renderer.domElement,0,0);
      card.host.dataset.previewState='ready';
    }
    if(!reduced.matches&&!held&&(angle<TAU||nextLook))request();
  }
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries){const card=cards.find(card=>card.host===entry.target);if(entry.isIntersecting)visible.add(card);else visible.delete(card);}
    last=0;if(active()){start();request();}else{cancelAnimationFrame(frame);frame=0;}
  },{rootMargin:'80px'});
  cards.forEach(card=>observer.observe(card.host));
  const visibility=()=>{last=0;if(active()){start();request();}else{cancelAnimationFrame(frame);frame=0;}};
  document.addEventListener('visibilitychange',visibility);document.addEventListener('btr:page-visibility',visibility);
  reduced.addEventListener('change',()=>{last=0;if(!reduced.matches)prepareNext();request();});
  // Hold the entire card, including its title link. Pointer and keyboard holds
  // are independent, so leaving with the pointer cannot release keyboard focus.
  function syncHold(){
    const next=!!(hovered.size||focused.size);if(next===held)return;
    held=next;last=0;if(!held)request();
  }
  for(const {article} of cards){
    article.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'){hovered.add(article);syncHold();}});
    article.addEventListener('pointerleave',()=>{hovered.delete(article);syncHold();});
    article.addEventListener('focusin',()=>{focused.add(article);syncHold();});
    article.addEventListener('focusout',event=>{if(!article.contains(event.relatedTarget)){focused.delete(article);syncHold();}});
  }
  window.addEventListener('pagehide',()=>{pageSleeping=true;last=0;cancelAnimationFrame(frame);frame=0;});
  window.addEventListener('pageshow',()=>{
    pageSleeping=false;hovered.clear();focused.clear();
    for(const {article} of cards)if(article.contains(document.activeElement))focused.add(article);
    syncHold();visibility();
  });
  // Navigation uses the currently displayed silhouette; full product pages remain editable.
  publish();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
