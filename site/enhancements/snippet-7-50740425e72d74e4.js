/* Reuse the native Codex cover; the real link remains a cross-page fallback. */
(() => {
 'use strict';
 const logoSelector='.site-top > a.brand';
 function connectLogo(){
  const logo=document.querySelector(logoSelector);
  if(!logo)return false;
  logo.href='/?cover';
  logo.setAttribute('aria-label','Break Thy Rule — open the Codex');
  logo.title='Open the Codex';
  return true;
 }
 function init(){
  if(connectLogo())return;
  const observer=new MutationObserver(()=>{if(connectLogo())observer.disconnect();});
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),10000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
 document.addEventListener('click',event=>{
  const logo=event.target.closest?.(logoSelector);
  if(!logo||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const open=window.breakthyruleGallery?.openCover;
  if(typeof open!=='function')return;
  event.preventDefault();
  open();
 },true);
})();
