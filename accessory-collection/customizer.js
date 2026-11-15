'use strict';
(()=>{
 const T=window.THREE,W=1024,H=800,DEFAULT_Y=.36,images=new Map();
 const loadImage=src=>{
  let pending=images.get(src);
  if(pending){images.delete(src);images.set(src,pending);return pending;}
  pending=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{if(images.get(src)===pending)images.delete(src);reject(Error('Graphic could not be loaded.'));};image.src=src;});
  images.set(src,pending);
  while(images.size>16)images.delete(images.keys().next().value);
  return pending;
 };
 const allGraphics=()=>window.breakthyruleAssets?.graphics||[];
 const canvas=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
 const node=(tag,props={},...children)=>{const e=Object.assign(document.createElement(tag),props);children.flat().forEach(c=>c!=null&&e.append(c));return e;};
 const button=(label,run,cls='ghost')=>{const b=node('button',{type:'button',className:cls,textContent:label});b.addEventListener('click',run);return b;};
 function drawGraphic(ctx,img,pick){const w=pick.scale*W,h=w*img.height/img.width;ctx.save();ctx.translate(pick.x*W,pick.y*H);ctx.rotate(pick.rotation*Math.PI/180);ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();}
 window.decorateAccessoryModel=async(root,item)=>{
  if(item?.family!=='trucker'||!item.defaultGraphic)return;
  const graphic=allGraphics().find(g=>g.id===item.defaultGraphic);if(!graphic)return;
  try{const img=await loadImage(graphic.full),c=canvas();drawGraphic(c.getContext('2d'),img,{x:.5,y:DEFAULT_Y,scale:.43,rotation:0});window.applyHatInk(root,c);}catch{}
 };
 window.mountHatCustomizer=async(host,item,media)=>{
  host.classList.add('hat-customizer');host.setAttribute('aria-label','Customize your hat');
  const colors={front:item.frontColor,brim:item.brimColor,mesh:item.meshColor},defaultPick=item.defaultGraphic||'centaur';let picks=[{id:defaultPick,x:.5,y:DEFAULT_Y,scale:.43,rotation:0}],selected=0,drag=null,renderToken=0,picker=null,graphics=allGraphics();
  const styles=Array.isArray(window.BTR_HAT_STYLES)?window.BTR_HAT_STYLES:[],initialStyle=styles.find(s=>s.id===(item.hatStyle||'trucker'))||styles[0];let style=initialStyle,styleToken=0;
  const key='btr-hat-design-v3:'+item.slug;
  try{const saved=JSON.parse(localStorage.getItem(key)||localStorage.getItem('btr-hat-design-v2:'+item.slug));if(saved&&(saved.version===2||saved.version===3)){style=styles.find(s=>s.id===saved.style)||style;for(const k of Object.keys(colors))if(/^#[0-9a-f]{6}$/i.test(saved.colors?.[k]))colors[k]=saved.colors[k];if(Array.isArray(saved.picks))picks=saved.picks.filter(p=>graphics.some(g=>g.id===p.id)).slice(0,3).map(p=>({id:p.id,x:Math.max(.1,Math.min(.9,Number(p.x)||.5)),y:Math.max(.1,Math.min(.9,!saved.placementRevision&&Math.abs(Number(p.y)-.48)<1e-6?DEFAULT_Y:Number(p.y)||DEFAULT_Y)),scale:Math.max(.15,Math.min(.75,Number(p.scale)||.43)),rotation:Math.max(-90,Math.min(90,Number(p.rotation)||0))}));}}catch{}
  style=styles.find(s=>s.id===new URLSearchParams(location.search).get('hat'))||style;
  const ink=canvas(),board=canvas();board.className='hat-layout';board.tabIndex=0;board.setAttribute('aria-label','Front graphic placement. Drag a graphic to move it; arrow keys nudge the selected graphic.');
  const status=node('p',{className:'fine hat-status',role:'status',ariaLive:'polite',textContent:'Choose up to three graphics, then drag to arrange them on the front.'});
  const colorway=node('div',{className:'hat-colorways',role:'group',ariaLabel:'Hat colorways'}),colorFields=node('div',{className:'hat-color-fields'}),inputs={};
  const meshLabel=node('span',{textContent:style?.id==='baseball'?'Side / back':'Mesh'});
  const variants=(window.BTR_ACCESSORIES||[]).filter(p=>p.family==='trucker');
  for(const variant of variants){const swatch=button(variant.name,()=>{colors.front=variant.frontColor;colors.brim=variant.brimColor;colors.mesh=variant.meshColor;for(const k of Object.keys(inputs))inputs[k].value=colors[k];media.front();render();refreshColorways();});swatch.className='hat-colorway';swatch.style.setProperty('--front',variant.frontColor);swatch.style.setProperty('--brim',variant.brimColor);swatch.setAttribute('aria-label',variant.name);swatch.title=variant.name;colorway.append(swatch);}
  function refreshColorways(){[...colorway.children].forEach((b,i)=>{const p=variants[i];b.setAttribute('aria-pressed',String(colors.front===p.frontColor&&colors.brim===p.brimColor&&colors.mesh===p.meshColor));});}
  for(const [part,label] of [['front','Front'],['brim','Brim'],['mesh','Mesh']]){const input=node('input',{type:'color',value:colors[part],ariaLabel:(part==='mesh'?meshLabel.textContent:label)+' color'});inputs[part]=input;input.addEventListener('input',()=>{colors[part]=input.value;refreshColorways();render();});colorFields.append(node('label',{},part==='mesh'?meshLabel:node('span',{textContent:label}),input));}
  const shapeOptions=node('div',{className:'hat-shape-options',role:'group',ariaLabel:'Hat shape'});
  const shapeStatus=node('p',{className:'fine hat-shape-status',role:'status',ariaLive:'polite'});
  for(const option of styles){const b=button('',()=>selectStyle(option),'hat-shape-option');b.dataset.hatStyle=option.id;b.append(node('strong',{textContent:option.name}),node('span',{textContent:option.id==='baseball'?'Solid six-panel crown':'Airy mesh back'}));shapeOptions.append(b);}
  function syncStyle(){
   for(const b of shapeOptions.children)b.setAttribute('aria-pressed',String(b.dataset.hatStyle===style?.id));
   meshLabel.textContent=style?.id==='baseball'?'Side / back':'Mesh';inputs.mesh.setAttribute('aria-label',meshLabel.textContent+' color');
   host.dataset.hatStyle=style?.id||'trucker';
  }
  async function selectStyle(next){
   if(!next)return;const token=++styleToken;shapeOptions.setAttribute('aria-busy','true');shapeStatus.textContent='Loading '+next.name+'…';
   const ok=await media.setStyle(next);if(token!==styleToken)return;
   shapeOptions.setAttribute('aria-busy','false');
   if(ok){style=next;syncStyle();media.front();await render();if(token!==styleToken)return;shapeStatus.textContent=next.name+' ready. Your colors and graphics stay with you.';
    const url=new URL(location.href);url.searchParams.set('hat',style.id);history.replaceState(history.state,'',url);
   }else{style=media.getStyle?.()||initialStyle;syncStyle();persist();shapeStatus.textContent='That shape could not load. Please try again.';}
  }
  const browse=button('Browse Sticker Lab graphics',async()=>{try{browse.disabled=true;const [{createGraphicPicker},{POOL_IDS}]=await Promise.all([import('/site/graphic-picker.mjs?v=2'),import('/labkit/artwork-pool.mjs')]);const eligible=new Set(POOL_IDS);graphics=allGraphics().filter(g=>eligible.has(g.id));if(!picker){const before=new Set(document.querySelectorAll('.graphic-picker'));picker=createGraphicPicker({items:graphics,onPick:addGraphic,getSelected:()=>picks.map(p=>p.id)});const dialog=[...document.querySelectorAll('.graphic-picker')].find(d=>!before.has(d));dialog?.classList.add('hat-graphic-picker');}picker.open(browse);}catch{status.textContent='Graphics could not load. Please try again.';}finally{browse.disabled=false;}});
  const shuffle=button('Shuffle graphic',()=>{const g=graphics[Math.floor(Math.random()*graphics.length)];if(g){picks=[];addGraphic(g.id);}});
  const clear=button('Clear graphics',()=>{picks=[];selected=-1;refreshPicks();render();});
  const chips=node('div',{className:'hat-selected',ariaLabel:'Selected graphics'});
  const size=node('input',{type:'range',min:'15',max:'75',value:'43',step:'1',ariaLabel:'Selected graphic size'}),rotation=node('input',{type:'range',min:'-90',max:'90',value:'0',step:'5',ariaLabel:'Selected graphic rotation'});
  size.addEventListener('input',()=>{if(picks[selected]){picks[selected].scale=Number(size.value)/100;render();}});rotation.addEventListener('input',()=>{if(picks[selected]){picks[selected].rotation=Number(rotation.value);render();}});
  const remove=button('Remove selected',()=>{if(selected>=0)picks.splice(selected,1);selected=Math.min(selected,picks.length-1);refreshPicks();render();});
  const reset=button('Reset hat',()=>{Object.assign(colors,{front:item.frontColor,brim:item.brimColor,mesh:item.meshColor});picks=[{id:defaultPick,x:.5,y:DEFAULT_Y,scale:.43,rotation:0}];selected=0;for(const k of Object.keys(inputs))inputs[k].value=colors[k];refreshColorways();refreshPicks();media.front();render();});
  host.append(node('h2',{textContent:'Make it yours.'}),node('p',{className:'fine',textContent:'Pick your shape, then make it your own.'}),shapeOptions,shapeStatus,node('a',{className:'fine hat-model-credits',href:'/accessory-collection/model-credits.html',textContent:'3D model credits'}),node('p',{className:'fine',textContent:'Choose a colorway or mix your own colors.'}),colorway,colorFields,node('div',{className:'hat-actions'},browse,shuffle,clear),chips,node('p',{className:'fine',textContent:'Up to 3 graphics · drag to position.'}),board,node('div',{className:'hat-adjust'},node('label',{},'Size',size),node('label',{},'Rotate',rotation)),node('div',{className:'hat-actions'},remove,reset),status);
  let saveTimer=0;
  function saveDesign(){clearTimeout(saveTimer);saveTimer=0;try{localStorage.setItem(key,JSON.stringify({version:3,placementRevision:1,style:style?.id||'trucker',colors,picks}));}catch{}}
  function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDesign,160);}
  addEventListener('pagehide',saveDesign);
  function refreshPicks(){chips.replaceChildren(...picks.map((p,i)=>{const g=allGraphics().find(g=>g.id===p.id),b=button(g?.name||p.id,()=>{selected=i;refreshPicks();render();});b.setAttribute('aria-pressed',String(i===selected));return b;}));const active=picks[selected];size.disabled=rotation.disabled=remove.disabled=!active;if(active){size.value=Math.round(active.scale*100);rotation.value=active.rotation;}clear.disabled=!picks.length;picker?.refresh();}
  function addGraphic(id){if(!allGraphics().some(g=>g.id===id))return;const i=picks.findIndex(p=>p.id===id);if(i>=0)selected=i;else{if(picks.length===3)picks.shift();picks.push({id,x:.5,y:DEFAULT_Y,scale:.43,rotation:0});selected=picks.length-1;}media.front();refreshPicks();render();status.textContent=(allGraphics().find(g=>g.id===id)?.name||id)+' added. Drag to position it.';}
  let renderFrame=0,renderWaiters=[];
  function render(){
   ++renderToken;
   return new Promise(resolve=>{
    renderWaiters.push(resolve);
    if(!renderFrame)renderFrame=requestAnimationFrame(()=>{
     renderFrame=0;const waiting=renderWaiters;renderWaiters=[];
     drawPreview(renderToken).catch(()=>{status.textContent='Preview could not update. Please try again.';}).finally(()=>waiting.forEach(done=>done()));
    });
   });
  }
  async function drawPreview(token){
   const ctx=ink.getContext('2d'),b=board.getContext('2d');const loaded=await Promise.all(picks.map(async p=>{const g=allGraphics().find(g=>g.id===p.id);try{return await loadImage(g.full);}catch{return null;}}));if(token!==renderToken)return;
   ctx.clearRect(0,0,W,H);picks.forEach((p,i)=>{if(loaded[i])drawGraphic(ctx,loaded[i],p);});
   b.clearRect(0,0,W,H);b.fillStyle=colors.front;b.fillRect(0,0,W,H);b.drawImage(ink,0,0);b.strokeStyle=['#ffffff','#101010'][parseInt(colors.front.slice(1),16)>0x888888?1:0];b.lineWidth=2;b.globalAlpha=.25;b.setLineDash([8,8]);b.strokeRect(W*.16,H*.12,W*.68,H*.78);b.setLineDash([]);b.globalAlpha=1;
   const active=picks[selected];if(active){const img=loaded[selected];if(img){b.save();b.translate(active.x*W,active.y*H);b.rotate(active.rotation*Math.PI/180);b.strokeStyle='#c22637';b.lineWidth=3;const w=active.scale*W,h=w*img.height/img.width;b.strokeRect(-w/2-5,-h/2-5,w+10,h+10);b.restore();}}
   media.setColors(colors);media.setArtwork(ink);persist();host.dataset.graphicCount=String(picks.length);host.dataset.frontColor=colors.front;host.dataset.brimColor=colors.brim;host.dataset.meshColor=colors.mesh;
  }
  const point=e=>{const rect=board.getBoundingClientRect();return{x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height};};
  board.addEventListener('pointerdown',e=>{if(e.button!==0||!picks.length)return;const p=point(e);let hit=-1;for(let i=picks.length-1;i>=0;i--){const pick=picks[i],g=allGraphics().find(g=>g.id===pick.id),w=pick.scale,h=w*W/H/(g?.ratio||1);if(Math.abs(p.x-pick.x)<w/2&&Math.abs(p.y-pick.y)<h/2){hit=i;break;}}if(hit<0)return;selected=hit;drag={x:p.x,y:p.y,px:picks[hit].x,py:picks[hit].y};board.setPointerCapture(e.pointerId);media.front();refreshPicks();render();});
  board.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);picks[selected].x=Math.max(.1,Math.min(.9,drag.px+p.x-drag.x));picks[selected].y=Math.max(.1,Math.min(.9,drag.py+p.y-drag.y));render();});
  for(const type of ['pointerup','pointercancel'])board.addEventListener(type,()=>drag=null);
  board.addEventListener('keydown',e=>{const d={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[e.key];if(!d||!picks[selected])return;e.preventDefault();const p=picks[selected];p.x=Math.max(.1,Math.min(.9,p.x+d[0]));p.y=Math.max(.1,Math.min(.9,p.y+d[1]));media.front();render();});
  syncStyle();refreshColorways();refreshPicks();await render();await media.ready;if(styleToken===0&&style)await selectStyle(style);
 };
 window.mountAppleGloveColors=function({viewer,garment,photoMode}){
  if(garment.slug!=='apple-gloves'||!viewer)return;
  const host=node('div',{className:'apple-glove-colors',role:'group',ariaLabel:'Apple Gloves color'}),buttons=[];let generation=0,busy=false;
  const select=async color=>{if(busy)return;busy=true;buttons.forEach(b=>b.disabled=true);const id=++generation;buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));const status=document.getElementById('viewer-status');status.textContent='Loading '+color+' Apple Gloves…';try{await viewer.load('/accessory-collection/models/'+(color==='black'?'apple-gloves-black':'gloves-white')+'.glb?v=quality-3');if(id!==generation)return;viewer.model()?.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m)for(const key of ['map','normalMap','roughnessMap'])if(m[key]){m[key].anisotropy=8;m[key].needsUpdate=true;}});viewer.view('front');photoMode(false);document.getElementById('spin')?.setAttribute('aria-pressed','false');status.textContent='3D / '+color+' Apple Gloves · drag to turn';document.getElementById('name').textContent=(color==='black'?'Black':'White')+' Apple Gloves';document.getElementById('description').textContent=garment.description.replace('white work gloves',color+' work gloves');document.getElementById('model-note').textContent=(garment.modelNote||'').replace('white cotton',color+' cotton');document.title='BREAKTHYRULE — '+(color==='black'?'Black':'White')+' Apple Gloves';host.dataset.gloveColor=color;const u=new URL(location.href);u.searchParams.set('glove',color);history.replaceState(history.state,'',u);}catch{if(id===generation)status.textContent='Could not load that color. Please try again.';}finally{busy=false;buttons.forEach(b=>b.disabled=false);}};
  for(const color of ['white','black']){const b=button(color==='white'?'White':'Black',()=>select(color));b.dataset.color=color;b.setAttribute('aria-pressed','false');buttons.push(b);host.append(b);}document.getElementById('price').after(host);
  select(new URLSearchParams(location.search).get('glove')==='black'?'black':'white');
 };
})();
