'use strict';
// The real product page, opened inside the Eden shop (`product.html?item=…&embed=eden`).
// Nothing happens on the public site: this only runs when the page is framed by Eden.
(()=>{
 const params=new URLSearchParams(location.search);
 if(params.get('embed')!=='eden'||window.parent===window)return;
 const root=document.documentElement,origin=location.origin,parent=window.parent;
 root.classList.add('eden-embed');
 const css=document.createElement('link');css.rel='stylesheet';css.href='/site/eden-embed.css?v=1';
 document.head.append(css);
 const send=(type,detail={})=>parent.postMessage({source:'eden-embed',type,...detail},origin);
 const isProduct=url=>url.origin===origin&&/^\/product(\.html)?$/.test(url.pathname);

 // Product-to-product links stay in the frame; everything else leaves it.
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target instanceof Element?event.target.closest('a[href]'):null;
  if(!link||link.target==='_blank')return;
  let url;try{url=new URL(link.href,location.href);}catch{return;}
  if(url.origin===origin&&/^\/showroom(\.html)?$/.test(url.pathname)){event.preventDefault();send('inspect',{slug:params.get('item')});return;}
  if(link.matches('[data-product-back]')){event.preventDefault();send('back');return;}
  if(isProduct(url)){url.searchParams.set('embed','eden');link.href=url.href;return;}
  if(url.origin===origin&&url.pathname===location.pathname&&url.hash)return;
  event.preventDefault();window.open(url.href,'_blank','noopener');
 },true);

 // Escape inside the frame goes back to the grid unless a dialog in the page is open.
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||document.querySelector('dialog[open]'))return;
  event.preventDefault();send('escape');
 });

 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==origin||event.data?.source!=='eden-shop')return;
  if(event.data.type==='open-cart')document.dispatchEvent(new CustomEvent('lab:open-cart'));
 });

 function cartCount(){const n=parseInt(document.querySelector('.cart-count')?.textContent||'0',10);return Number.isFinite(n)?n:0;}
 // The shop leads with the real product photograph; Spin / Front / Back still turn the 3D garment.
 function leadWithPhoto(){
  const media=window.BTRProductMedia;if(!media?.setPhotoMode)return;
  const first=document.querySelector('#thumbs img')?.src,until=performance.now()+20000;
  // The studio swaps in its 3D print preview when that finishes loading; hold the photograph until the
  // visitor touches the page (then their choices drive the viewer as on the site).
  let touched=false;const touch=()=>{touched=true;};
  addEventListener('pointerdown',touch,{capture:true,once:true});addEventListener('keydown',touch,{capture:true,once:true});
  (function hold(){
   if(touched||performance.now()>until)return;
   if(document.getElementById('photos')?.getAttribute('aria-pressed')!=='true')media.setPhotoMode(true,first);
   const status=document.getElementById('viewer-status');if(status&&status.textContent!=='Photograph · Spin for 3D')status.textContent='Photograph · Spin for 3D';
   setTimeout(hold,200);
  })();
 }
 function ready(){
  leadWithPhoto();
  send('ready',{slug:params.get('item'),title:document.getElementById('name')?.textContent||document.title.replace(/^BREAKTHYRULE — /,''),cart:cartCount()});
  let last=cartCount();
  new MutationObserver(()=>{const n=cartCount();if(n!==last){last=n;send('cart',{cart:n});}}).observe(document.body,{subtree:true,childList:true,characterData:true});
 }
 if(document.readyState==='complete')ready();else addEventListener('load',ready,{once:true});
})();
