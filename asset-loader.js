'use strict';
window.showroomAssets={
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
  let attempts=0;
  async function load(){
   try{
    const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Texture unavailable');
    const blob=await response.blob(),objectURL=URL.createObjectURL(blob),img=new Image();
    try{img.src=objectURL;await img.decode();texture.image=img;texture.needsUpdate=true;onChange();}
    finally{URL.revokeObjectURL(objectURL);}
   }catch{if(++attempts<2)setTimeout(load,4000);}
  }
  load();return texture;
 }
};
