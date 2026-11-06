'use strict';
window.showroomAssets={
 // World textures use <=1024 px WebP copies of product photos and the logo (tools/asset-pipeline/optimize-images.mjs);
 // the full-size WebP files stay for the shop and the full-size poster view.
 web(url){
  const match=/^\/(?:products\/)?([^/?]+)\.(?:png|jpe?g|webp)(\?.*)?$/i.exec(url||'');
  return match&&(url.startsWith('/products/')||url.startsWith('/logo.png'))?'/products/web/'+match[1].toLowerCase()+'.webp':url;
 },
 async model(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Model unavailable');
  const data=await response.arrayBuffer();
  return new window.ShowroomGLTFLoader().parseAsync(data,new URL('.',new URL(url,location.href)).href);
 },
 texture(T,url,onChange=()=>{}){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const context=canvas.getContext('2d');context.fillStyle='#c9cdca';context.fillRect(0,0,32,32);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  let attempts=0;const light=this.web(url);
  async function load(){
   try{
    // The WebP copy first, the original if it is missing.
    let response=await fetch(attempts?url:light,{signal:AbortSignal.timeout(12000)});
    if(!response.ok&&!attempts&&light!==url)response=await fetch(url,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Texture unavailable');
    const blob=await response.blob(),objectURL=URL.createObjectURL(blob),img=new Image();
    // dispose() frees the 32 px placeholder on the GPU: WebGL2 texture storage cannot change size in place.
    try{img.src=objectURL;await img.decode();texture.image=img;texture.dispose();texture.needsUpdate=true;onChange();}
    finally{URL.revokeObjectURL(objectURL);}
   }catch{if(++attempts<2)setTimeout(load,4000);}
  }
  load();return texture;
 }
};
