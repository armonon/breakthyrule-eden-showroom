// Versioned, renderer-independent graphic placements. Coordinates start at the
// top-left of the printable area; original artwork files are never changed.
export const GRAPHIC_LAYOUT_VERSION = 1;
export function defaultGraphicLayer(id,index=0,count=1,side='front') {
 const positions=count<2?[[.5,.5,1]]:count===2?[[.5,.31,.64],[.5,.78,.45]]:[[.5,.36,.7],[.23,.8,.34],[.77,.8,.34]];
 const [x,y,scale]=side==='back'?[.5,.5,1]:(positions[index]||positions[0]);
 return {id,x,y,scale,rotation:0,hue:0,saturation:100};
}
export function normalizeGraphicLayout(raw,picks){
 if(raw!=null&&(typeof raw!=='object'||Array.isArray(raw)))return {ok:false,errors:['The graphic layout is invalid.']};
 if(raw?.version!=null&&raw.version!==GRAPHIC_LAYOUT_VERSION)return {ok:false,errors:['This graphic layout version is not supported.']};
 const layout={version:GRAPHIC_LAYOUT_VERSION,front:[],back:[]};
 for(const side of ['front','back']){
  const ids=picks?.[side]||[],source=raw?.[side]??[];
  if(!Array.isArray(source)||source.length>(side==='front'?3:1))return {ok:false,errors:['Choose up to three front graphics and one back graphic.']};
  const seen=new Set();
  for(const entry of source)if(!entry||typeof entry!=='object'||!ids.includes(entry.id)||seen.has(entry.id))return {ok:false,errors:['A placement does not match the selected graphics.']};else seen.add(entry.id);
  for(const [i,id] of ids.entries()){
   const saved=source.find(e=>e.id===id),defaults=defaultGraphicLayer(id,i,ids.length,side),layer={id};
   for(const [key,min,max] of [['x',0,1],['y',0,1],['scale',.08,1.6],['rotation',-180,180],['hue',0,360],['saturation',0,200]]){
    const value=saved?.[key]??defaults[key];
    if(typeof value!=='number'||!Number.isFinite(value))return {ok:false,errors:['Graphic adjustments must be finite numbers.']};
    layer[key]=Math.round(Math.max(min,Math.min(max,value))*10000)/10000;
   }
   layout[side].push(layer);
  }
 }
 return {ok:true,layout};
}
export const layoutSummary=(side,layer)=>`${side==='front'?'Front':'Back'} ${layer.id}: x ${Math.round(layer.x*100)}%, y ${Math.round(layer.y*100)}%, size ${Math.round(layer.scale*100)}%, rotation ${layer.rotation}°, hue ${layer.hue}°, saturation ${layer.saturation}%`;
