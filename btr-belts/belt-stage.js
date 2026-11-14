'use strict';
// Uses the same Three.js renderer and interaction API as Break Thy Rule's Garment Lab.
(()=>{
 const bySlug=slug=>{const p=window.BTR_BELTS.find(p=>p.designSlug===slug||p.id===slug);if(!p)throw Error('Unknown belt design: '+slug);return p;};
 const hex=value=>{if(!/^#[0-9a-f]{6}$/i.test(value))throw TypeError('Use a six-digit hex color.');return value.toLowerCase();};
 window.mountBeltMedia=function(element,slug,{baseURL=new URL('./',document.currentScript?.src||location.href),loadModel,autoplay=true,customization=false}={}){
  element.classList.remove('viewer','card-media');element.classList.add('btr-belt-media');element.replaceChildren();
  element.innerHTML=`<div class="stage-frame"><div class="stage-3d" tabindex="0" aria-label="3D belt. Drag or use the arrow keys to turn it."></div><img class="belt-poster" alt="" hidden><p class="stage-loading" role="status">Loading 3D belt…</p></div><div class="stage-tools"><div class="seg" role="group" aria-label="Preview side"><button type="button" data-view="front" aria-pressed="true">Front</button><button type="button" data-view="back" aria-pressed="false">Back</button></div><button class="spin" type="button" aria-pressed="false">Spin</button><label class="zoom">Zoom <input type="range" min="100" max="220" step="10" value="100" aria-label="Zoom the preview"></label></div><p class="stage-label">Drag to turn · scroll or use the slider to zoom</p>`;
  const stage=element.querySelector('.stage-3d'),status=element.querySelector('.stage-loading'),poster=element.querySelector('.belt-poster'),spin=element.querySelector('.spin'),zoom=element.querySelector('input');
  const viewer=window.createBeltGarmentViewer(stage,{wheelZoom:true,presentation:'belt',spin:Math.PI/5,loadModel,cacheLimit:2});
  let current=null,generation=0,destroyed=false;
  function sync(){spin.setAttribute('aria-pressed',String(!!viewer?.isAuto()));spin.textContent=viewer?.isAuto()?'Pause spin':'Spin';}
  function resetSides(side){element.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===side)));}
  element.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{viewer?.view(b.dataset.view);resetSides(b.dataset.view);sync();}));
  spin.addEventListener('click',()=>{viewer?.setAuto(!viewer.isAuto());resetSides(null);sync();});
  zoom.addEventListener('input',()=>viewer?.setZoom(Number(zoom.value)/100));
  // Native drag/keyboard handling is provided by createGarmentViewer, exactly as in the Lab.
  stage.addEventListener('pointerdown',()=>{resetSides(null);sync();});stage.addEventListener('keydown',()=>{resetSides(null);sync();});
  async function load(nextSlug){
   const id=++generation;current=bySlug(nextSlug);status.hidden=false;status.textContent='Loading 3D belt…';poster.hidden=true;
   poster.src=new URL(current.poster,baseURL).href;poster.alt=current.name;
   if(!viewer){status.textContent='3D is unavailable in this browser.';poster.hidden=false;return false;}
   try{
    const loaded=await viewer.load(new URL(current.model,baseURL).href);if(id!==generation||destroyed||!loaded)return false;
    viewer.view('front');viewer.setZoom(1);zoom.value=100;
    viewer.setAuto(autoplay&&!matchMedia('(prefers-reduced-motion: reduce)').matches);resetSides('front');sync();status.hidden=true;
    element.dispatchEvent(new CustomEvent('btr:model-ready',{detail:{productId:current.id,slug:current.designSlug},bubbles:true}));return true;
   }catch(error){if(id===generation){status.textContent='Could not load 3D. Please reload or try a WebGL-enabled browser.';poster.hidden=false;}return false;}
  }
  function getStrapTarget(){const root=viewer?.model();let target=null;root?.traverse(o=>{if(o.name==='BTR_Strap')target=o;});if(!target)throw Error('Load a belt before editing its strap.');return target;}
  function setStrapColor(value){if(!customization)throw Error('Strap customization is disabled for this release.');const color=hex(value),target=getStrapTarget();for(const material of (Array.isArray(target.material)?target.material:[target.material])){material.color.set(color);material.needsUpdate=true;}viewer.redraw();element.dispatchEvent(new CustomEvent('btr:strap-color',{detail:{productId:current.id,color},bubbles:true}));return color;}
  const ready=load(slug);
  return {ready,load,viewer,getStrapTarget,setStrapColor,destroy(){destroyed=true;++generation;viewer?.destroy();element.replaceChildren();}};
 };
})();
