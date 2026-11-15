/* Fresh Products visits open at the hero; Back/Forward keeps the browsing position. */
(() => {
 'use strict';
 const home=()=>['/','/index','/index.html'].includes(location.pathname)&&document.body?.dataset.page==='home';
 const entryURL='/?nocover=1';
 const historyNavigation=performance.getEntriesByType('navigation')[0]?.type==='back_forward';
 let pending=false,interacted=historyNavigation,frame=0;
 function preservePosition(){
  interacted=true;pending=false;cancelAnimationFrame(frame);frame=0;
 }
 function resetTop(){
  if(!pending||!home())return;
  cancelAnimationFrame(frame);
  window.scrollTo({left:0,top:0,behavior:'instant'});
  frame=requestAnimationFrame(()=>{
   if(pending)window.scrollTo({left:0,top:0,behavior:'instant'});
  });
 }
 function cleanEntryURL(){
  const url=new URL(location.href);
  url.hash='';url.searchParams.delete('cover');url.searchParams.set('nocover','1');
  history.replaceState(history.state,'',url);
 }
 function arrive(){
  if(interacted||!home()||(location.hash&&location.hash!=='#products'))return;
  if(location.hash==='#products'){
   const url=new URL(location.href);url.hash='';history.replaceState(history.state,'',url);
  }
  pending=true;resetTop();
 }
 function enterProducts(){
  if(!home()){location.assign(entryURL);return;}
  cleanEntryURL();interacted=false;pending=true;
  window.breakthyruleGallery?.closeCover?.();
  // Closing the cover restores its saved scroll in a MutationObserver. Our
  // next frame and cover-state listener run after that restoration.
  resetTop();
 }
 function prepareLinks(){
  for(const link of document.querySelectorAll('a[href]')){
   const raw=link.getAttribute('href');if(!raw||raw.startsWith('#'))continue;
   const url=new URL(link.href,location.href);
   if(url.origin!==location.origin||url.pathname!=='/')continue;
   const productsTab=link.matches('.site-top .tabs a')&&link.textContent.trim().toLowerCase()==='products';
   if(productsTab||url.hash==='#products'){
    url.hash='';url.searchParams.delete('cover');url.searchParams.set('nocover','1');
    link.href=url.pathname+url.search;
   }
  }
 }
 function start(){prepareLinks();if(!interacted)arrive();}
 // Remove a legacy entry fragment before native fragment scrolling runs.
 arrive();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.addEventListener('load',resetTop,{once:true});
 window.addEventListener('pageshow',event=>{
  if(event.persisted||historyNavigation){preservePosition();return;}
  if(!interacted)arrive();
 });
 // Native history restores both full-page returns and in-page collection jumps.
 window.addEventListener('popstate',preservePosition);
 window.addEventListener('pagehide',preservePosition);
 window.addEventListener('btr:cover-performance-state',event=>{if(!event.detail?.open)resetTop();});
 // Never pull the page back up after the visitor intentionally starts browsing.
 for(const type of ['wheel','touchstart','pointerdown','keydown'])document.addEventListener(type,preservePosition,{capture:true,passive:true});
 document.addEventListener('click',event=>{
  if(event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
  const target=event.target instanceof Element?event.target:null;
  const shop=target?.closest('#btr-cover .btr-cover-nav > .btr-btn');
  const tab=target?.closest('.site-top .tabs a');
  const coverShop=shop&&shop.textContent.trim().toUpperCase()==='SHOP'&&document.querySelector('.site-top');
  const productsTab=tab&&tab.textContent.trim().toLowerCase()==='products';
  if(!coverShop&&!productsTab)return;
  if(productsTab&&!home()){tab.href=entryURL;return;}
  event.preventDefault();event.stopImmediatePropagation();enterProducts();
 },true);
})();
