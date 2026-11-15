// Adapted from Ghost Studio Shaka's source-preserving graphicTexture treatment.
// Uses this site's renderer; no Ghost Three.js runtime or garment engine is loaded.
const treatments=new WeakMap();
export function treatedGraphic(image,{hue=0,saturation=100}={}){
 if(!hue&&saturation===100)return image;
 const key=hue+':'+saturation;let cached=treatments.get(image);if(cached?.has(key))return cached.get(key);
 const c=document.createElement('canvas'),ratio=Math.min(1,1024/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));c.width=Math.max(1,Math.round((image.naturalWidth||image.width)*ratio));c.height=Math.max(1,Math.round((image.naturalHeight||image.height)*ratio));
 const ctx=c.getContext('2d',{willReadFrequently:!('filter' in CanvasRenderingContext2D.prototype)});
 if('filter' in ctx){ctx.filter=`hue-rotate(${hue}deg) saturate(${saturation}%)`;ctx.drawImage(image,0,0,c.width,c.height);ctx.filter='none';}
 else{
  ctx.drawImage(image,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height),a=pixels.data;
  for(let p=0;p<a.length;p+=4){if(!a[p+3])continue;let r=a[p]/255,g=a[p+1]/255,b=a[p+2]/255,hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,h=0;if(d)h=(hi===r?(g-b)/d:hi===g?(b-r)/d+2:(r-g)/d+4)/6;h=((h+hue/360)%1+1)%1;let s=hi?Math.min(1,d/hi*saturation/100):0;const f=n=>hi*(1-s*Math.max(0,Math.min((n+h*6)%6,4-(n+h*6)%6,1)));a[p]=Math.round(f(5)*255);a[p+1]=Math.round(f(3)*255);a[p+2]=Math.round(f(1)*255);}
  ctx.putImageData(pixels,0,0);
 }
 cached ||= new Map();cached.set(key,c);while(cached.size>2)cached.delete(cached.keys().next().value);treatments.set(image,cached);return c;
}
export function drawGraphicLayer(ctx,image,layer,W,H){
 const graphic=treatedGraphic(image,layer),w=graphic.width||graphic.naturalWidth,h=graphic.height||graphic.naturalHeight;
 const scale=Math.min(W/w,H/h)*(layer.scale??1);
 ctx.save();ctx.translate(layer.x*W,layer.y*H);ctx.rotate((layer.rotation||0)*Math.PI/180);ctx.drawImage(graphic,-w*scale/2,-h*scale/2,w*scale,h*scale);ctx.restore();
}
