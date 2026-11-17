'use strict';
// Prepare newly decoded display models before revealing them in the world.
// Geometry is untouched; product inspection uses its own full-resolution load.
(function(root){
 root.prepareWorldModel=async function(T,model,{renderer,camera,scene,maxTextureSize=1024}={}){
  const sources=new Map(),textures=new Set();
  model.traverse(o=>{for(const material of [].concat(o.material||[]))for(const value of Object.values(material))if(value?.isTexture&&!value.isCompressedTexture&&!value.isDataTexture&&!value.isRenderTargetTexture){textures.add(value);const image=value.image;if(image&&!sources.has(image))sources.set(image,[]);sources.get(image)?.push(value);}});
  for(const [image,maps]of sources){
   const w=image.width||image.naturalWidth,h=image.height||image.naturalHeight,k=maxTextureSize/Math.max(w,h);
   if(!(k<1)||!root.document?.createElement)continue;
   try{
    // A canvas can be uploaded directly by WebGL. createImageBitmap(canvas)
    // forces an expensive pixel readback on some integrated GPUs.
    const canvas=root.document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*k));canvas.height=Math.max(1,Math.round(h*k));
    const context=canvas.getContext('2d');if(!context)continue;
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const map of maps){map.dispose();map.image=canvas;map.needsUpdate=true;}
   }catch{/* Keep the original texture if a device cannot resize it. */}
  }
  // Serialize uploads and yield between them, rather than attaching several
  // garments and paying every upload during one visible render.
  for(const texture of textures){await new Promise(r=>setTimeout(r,0));renderer.initTexture?.(texture);}
  if(renderer.compileAsync)await renderer.compileAsync(model,camera,scene);
  return model;
 };
})(window);
