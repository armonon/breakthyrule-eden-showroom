import { createGarmentGraphicsEditor } from '/site/garment-graphics-editor.mjs?v=2';
import { graphicBaseURL, prepareGraphicBase } from '/site/graphic-base.mjs?v=1';
import { offeringFor, SIZES, FITS, COLORS, formatCents } from '/labkit/catalog.mjs';
import { PRODUCT_DESIGNS, STUDIO_PRODUCTS, GRAPHIC_COLORS, HEADWEAR_WEIGHTS, DAILY_APPLE_SIZES, productDesignDefaultColor } from '/labkit/product-options.mjs';
import { normalizeItem, priceItem } from '/labkit/pricing.mjs';
import { cart, POOL, labStatus } from '/site/cart-store.mjs?v=site-audit-1';
import { tintProductDesign } from '/site/product-preview.mjs?v=1';
import { mountProductGallery } from '/site/product-gallery.mjs?v=scrollable-6';
const $=id=>document.getElementById(id);
const h=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);for(const k of kids.flat())if(k!=null)e.append(k);return e;};
const ready=document.readyState==='loading'?new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true})):Promise.resolve();
await ready;
const params=new URLSearchParams(location.search),requestedId=params.get('item'),id=requestedId==='accessory-apple-gloves-black'?'accessory-gloves-white':requestedId,design=Object.hasOwn(PRODUCT_DESIGNS,id)?PRODUCT_DESIGNS[id]:null,product=Object.hasOwn(STUDIO_PRODUCTS,id)?STUDIO_PRODUCTS[id]:null;
document.body.classList.add('silkroad-product');
const info=document.querySelector('.product-info');
const trail=h('nav',{className:'studio-trail',ariaLabel:'Breadcrumb'},h('a',{href:'/?nocover=1',textContent:'Marketplace'}),h('span',{textContent:'/'}),h('span',{textContent:design?'Garments':product?.family==='necklace'?'Necklaces':product?.family==='belt'?'Belts':'Accessories'}));
document.querySelector('.product-page').before(trail);
const seal=h('p',{className:'studio-origin',textContent:'BREAK THY RULE / LOS ANGELES'});info.prepend(seal);
mountProductGallery($('product-gallery'));
if($('product-process')){$('product-process').hidden=!design;$('product-process').closest('.studio-postcard-stack').hidden=!design;}
if(design||product)mountOptions();
function mountOptions(){
 let edit=params.get('edit'),saved=edit&&cart.get(edit)?.config;
 const garment=design?.garment,construction=garment==='longsleeve'?'cut-sew':'canvas',defaultColor=productDesignDefaultColor(design,params.get('color'));
 let state=design?{product:'garment',construction,labMode:construction==='cut-sew'?'cut-sew':'blank',garment,size:null,fit:construction==='cut-sew'?'regular':'blank',color:defaultColor,customColor:'#87665c',artwork:'product-design',productDesign:{id,graphic:'Red'},sourceDesign:id,graphicLayout:null,uploads:[],quantity:1,picks:{front:[],back:[]},backSize:'full'}:{product:'studio-product',productId:id,quantity:1,notes:'',options:defaultOptions(product)};
 if(saved){const n=normalizeItem(saved,{artworkPool:POOL});if(n.ok&&((design&&n.item.garment===design.garment&&(n.item.productDesign?.id===id||n.item.sourceDesign===id))||(product&&n.item.productId===id)))state={...state,...n.item};else edit=null;}
 if(design){state.picks ||= {front:[],back:[]};state.productDesign ||= {id,graphic:'Red'};state.customColor ||= '#87665c';}
 let status=null,previewToken=0,printer=null,currentURL=design?.model,graphicsEditor=null,previewFrame=0,modelLoading=null,printingBusy=false,previewFailed=false;
 const schedulePreview=()=>{if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;updatePreview();});};
 const form=h('form',{className:'studio-config',id:'product-config',noValidate:true,ariaLabel:'Customize this product'}),fields=h('div',{className:'studio-config-fields'}),feedback=h('p',{className:'studio-form-status',role:'status',ariaLive:'polite'}),previewNote=h('p',{className:'studio-preview-note',role:'status'});
 const retryPreview=h('button',{type:'button',className:'studio-preview-retry',textContent:'Retry preview',hidden:true});retryPreview.onclick=()=>updatePreview();
 const subtotal=h('strong',{className:'studio-total'}),breakdown=h('p',{className:'studio-breakdown'}),save=h('button',{type:'submit',className:'studio-save',textContent:edit?'Update saved design':'Save design'});
 const editorHost=h('section',{className:'studio-graphics-pane'}),artMode=h('div',{className:'studio-art-mode'}),settingsSummary=h('summary',{textContent:'Garment options'}),settings=h('details',{className:'studio-garment-settings',open:true},settingsSummary,fields);
 const total=h('div',{className:'studio-checkout'},h('div',{},h('span',{className:'studio-eyebrow',textContent:product?.packSize?'Your 3-pack / USD':'Your piece / USD'}),subtotal),save);
 form.append(h('div',{className:'studio-config-title'},h('h2',{textContent:'Make it yours'}),h('span',{textContent:design?'Garment Lab':'Studio options'})), ...(design?[artMode,settings,editorHost]:[fields]),previewNote,retryPreview,breakdown,total,feedback);
 $('tagline').after(form);
 const existingHat=document.querySelector('.hat-customizer');
 if(existingHat){form.insertBefore(existingHat,previewNote);existingHat.addEventListener('btr:hat-design',e=>{state.options={...state.options,...e.detail};updatePrice();});new MutationObserver(()=>{save.disabled=!!existingHat.querySelector('.hat-shape-options[aria-busy=true]');}).observe(existingHat,{attributes:true,subtree:true,attributeFilter:['aria-busy']});}
 if(design)graphicsEditor=createGarmentGraphicsEditor({host:editorHost,viewerHost:$('viewer'),getState:()=>state,getViewer:()=>window.BTRProductMedia?.viewer,getPrinter:()=>printer,
  onActivate(){state.artwork='pick';render();schedulePreview();},
  onChange(next){state.picks=next.picks;state.graphicLayout=next.graphicLayout;state.artwork='pick';updatePrice();schedulePreview();},
  onUpload(asset){if(!state.uploads.some(a=>a.id===asset.id))state.uploads.push(asset);},
  onStatus(busy){save.disabled=busy||printingBusy||previewFailed;}
 });
 const media=window.BTRProductMedia;
 Promise.resolve(media?.ready).then(()=>updatePreview());
 labStatus().then(value=>{status=value;graphicsEditor?.setUploadAvailable(!!value);updatePrice();});
 function field(label,...children){const e=h('fieldset',{},h('legend',{textContent:label}),...children);e.dataset.field=label;return e;}
 function radio(name,value,label,checked,{price='',small='',disabled=false}={}){return h('label',{className:'studio-choice'+(disabled?' is-unavailable':'')},h('input',{type:'radio',name,value,checked,disabled,ariaLabel:label}),h('span',{className:'studio-choice-face'},h('strong',{textContent:label}),...(price?[h('span',{className:'studio-choice-price',textContent:price})]:[]),...(small?[h('small',{textContent:small})]:[])));}
 function render(){
  const previous=document.activeElement?.closest('#product-config')?{name:document.activeElement.name,value:document.activeElement.value}:null;
  fields.replaceChildren();
  if(design){
   fields.append(field('01 / Construction',h('div',{className:'studio-mode-grid'},...['random','blank','cut-sew'].map(mode=>{const c=mode==='cut-sew'?'cut-sew':'canvas',o=offeringFor({construction:c,garment:state.garment,labMode:mode});return radio('labMode',mode,mode==='random'?'Random':mode==='blank'?'Blank':'Cut & Sew',state.labMode===mode,{price:o?formatCents(o.priceCents):'—',small:mode==='random'?'Studio base + color':mode==='blank'?'Your chosen color':'Made from scratch',disabled:!o});}))));
   if(design.archiveShape)fields.append(h('p',{className:'studio-small',textContent:'Archive silhouette shown. This design is reworked onto a '+(state.garment==='hoodie'?'hoodie':'tee')+' base in the Lab.'}));
   if(state.labMode!=='random'){
    fields.append(field('02 / Garment color',h('div',{className:'studio-color-grid'},...['black','white','custom'].map(c=>radio('color',c,c==='custom'?'Custom +$40':COLORS[c].name,state.color===c))),...(state.color==='custom'?[h('label',{className:'studio-custom-color'},'Choose your color',h('input',{type:'color',name:'customColor',value:/^#[0-9a-f]{6}$/i.test(state.customColor)?state.customColor:'#87665c',ariaLabel:'Custom garment color'}))]:[])));
   }else fields.append(h('p',{className:'studio-small',textContent:'The studio chooses your base and color. The model is a design reference.'}));
   fields.append(field('03 / Size',h('div',{className:'studio-size-grid'},...SIZES.map(size=>radio('size',size,size,state.size===size)))));
   if(state.construction==='cut-sew')fields.append(field('Fit',h('div',{className:'studio-color-grid'},...FITS['cut-sew'].map(f=>radio('fit',f.id,f.name,state.fit===f.id)))));
   fields.append(field('04 / Artwork',h('div',{className:'studio-art-grid'},radio('artwork','product-design','This design',state.artwork==='product-design'),radio('artwork','artists-choice','Studio surprise',state.artwork==='artists-choice'),radio('artwork','pick','Choose graphics',state.artwork==='pick'))));
   if(state.artwork==='product-design'&&design.core)fields.append(h('label',{className:'studio-select'},'Graphic color',h('select',{name:'graphic',ariaLabel:'Graphic color'},...GRAPHIC_COLORS.map(c=>h('option',{value:c,textContent:c,selected:state.productDesign?.graphic===c})))));

  }else{
   if(product.packSize)fields.append(h('p',{className:'studio-small',textContent:product.family==='daily-apple'?'One bag contains three white Hanes tees with a red bitmap apple on the chest. The price is for all three tees.':'One pack includes '+product.packSize+' '+product.packNoun+' in your selected color. The price is for the complete pack.'}));
   if(['headband','skully'].includes(product.family))fields.append(field('Color',h('div',{className:'studio-color-grid'},...['black','white'].map(c=>radio('productColor',c,c==='white'?'White':'Black',state.options.color===c)))));
   if(product.family==='gloves')fields.append(field('Color',h('p',{className:'studio-small',textContent:'White'})));
   if(['headband','skully'].includes(product.family))fields.append(field('Fabric weight',h('div',{className:'studio-color-grid'},...Object.entries(HEADWEAR_WEIGHTS).map(([key,weight])=>radio('weight',key,weight.name,(state.options.weight||'thin')===key,{price:weight.addCents?'+'+formatCents(weight.addCents):'Included'})))));
   if(product.family==='daily-apple')fields.append(field('Size for all three tees',h('div',{className:'studio-size-grid'},...DAILY_APPLE_SIZES.map(size=>radio('productSize',size,size,state.options.size===size)))));
   if(product.family==='belt')fields.append(field('Strap color',h('label',{className:'studio-custom-color'},h('span',{textContent:'Color · included in the complete belt'}),h('input',{type:'color',name:'strapColor',value:state.options.strapColor,ariaLabel:'Belt strap color'}))),h('p',{className:'studio-small',textContent:'Complete belt · sculptural buckle and strap included. No-hole clamp design.'}));
   if(product.family==='necklace')fields.append(field('Chain',h('p',{className:'studio-chain',textContent:'22-inch sterling silver French cable · 3.4 mm'})),h('p',{className:'studio-small',textContent:'Complete necklace · pendant and chain included.'}));
   fields.append(h('label',{className:'studio-select'},'Notes for the studio',h('textarea',{name:'studioNotes',maxLength:280,rows:2,value:state.notes||'',placeholder:'Fit, finish or other requests…'})),h('p',{className:'studio-small',textContent:'Special requests are confirmed by the studio before making.'}));
  }
  fields.append(h('label',{className:'studio-select studio-quantity',style:product?.packSize?'max-width:100%':''},product?.packSize?'Number of 3-packs':'Quantity',h('select',{name:'quantity',ariaLabel:product?.packSize?'Number of 3-packs':'Quantity'},...[1,2,3,4,5].map(q=>h('option',{value:String(q),textContent:product?.packSize?`${q} ${q===1?'pack':'packs'} · ${q*product.packSize} ${product.packNoun}`:String(q),selected:state.quantity===q,disabled:design&&state.construction==='cut-sew'&&q>1})))));
  if(design){const artField=[...fields.querySelectorAll('fieldset')].find(f=>f.querySelector('[name=artwork]'));if(artField)artMode.replaceChildren(artField);
   const editing=state.artwork==='pick';if(settings.dataset.artwork!==state.artwork){settings.open=!editing;settings.dataset.artwork=state.artwork;}
   settingsSummary.textContent=(state.labMode==='cut-sew'?'Cut & Sew':state.labMode==='random'?'Random':'Blank')+' · '+(state.labMode==='random'?'studio color':state.color)+' · '+(state.size||'choose size');
   document.body.classList.toggle('graphics-editing',editing);graphicsEditor?.sync();
  }
  updatePrice();
  if(previous?.name){const el=[...form.elements].find(e=>e.name===previous.name&&e.value===previous.value);el?.focus({preventScroll:true});}
 }
 function normalized(forDisplay=false){const cfg=design?{...state,size:state.size||(forDisplay?'M':null),color:state.labMode==='random'?'random':state.color,productDesign:state.artwork==='product-design'?state.productDesign:undefined}:forDisplay&&product?.family==='daily-apple'?{...state,options:{...state.options,size:state.options.size||'M'}}:state;return normalizeItem(cfg,{artworkPool:POOL});}
 function updatePrice(){
  const n=normalized(true);
  // Artwork can still be empty while the customer browses; the quote remains visible.
  const price=design?priceItem({...state,product:'garment',color:state.labMode==='random'?'random':state.color,quantity:state.quantity}):n.ok?priceItem(n.item):null;
  const value=price?formatCents(price.totalCents):'Choose options';subtotal.textContent=value;$('price').textContent=value+(price?' USD':'')+(price&&product?.packSize?` / ${state.quantity===1?'3-pack':state.quantity+' packs'}`:'');
  breakdown.textContent=price?price.lines.filter(l=>l.cents).map(l=>formatCents(l.cents)+' '+l.label).join(' + ')+(state.quantity>1?` · ${state.quantity} × ${formatCents(price.unitCents)} ${product?.packSize?'per 3-pack':'each'}`:'')+(design?' · artwork included.':product.family==='gloves'?' · white.':' · selected colors included.'):'Choose the options for a live total.';
  const slot=design?`${state.construction}:${state.garment}`:`studio:${id}`,open=!!status?.checkout?.available&&status?.slots?.[slot]?.available>0;
  save.textContent=edit?'Update saved design':open?'Add to bag':'Save design';
 }
 async function updatePreview(){
  const token=++previewToken,media=window.BTRProductMedia;if(!media)return;
  if(design){printingBusy=true;previewFailed=false;retryPreview.hidden=true;save.disabled=true;}await media.ready;if(token!==previewToken)return;
  if(!design){
   if(product.family==='belt'){try{media.setStrapColor(state.options.strapColor);previewNote.textContent='Strap color is included.';}catch{previewNote.textContent='Your strap color is saved; the 3D preview is loading.';}}
   if(['headband','skully','gloves'].includes(product.family)){
    const variant=(window.BTR_ACCESSORIES||[]).find(p=>p.family===product.family&&(product.family==='gloves'?p.slug==='gloves-white':p.slug.endsWith('-'+state.options.color)));
    if(media.setVariant&&variant){await media.setVariant(variant);}
    else if(media.viewer&&product.family==='gloves'){await media.viewer.load('/accessory-collection/models/gloves-white.glb?v=quality-3');media.viewer.redraw();}
   }
   if(['headband','skully'].includes(product.family))media.setWeight?.(state.options.weight||'thin');
   return;
  }
  const viewer=media.viewer;if(!viewer)return;media.setPhotoMode?.(false);
  const chosen=JSON.parse(JSON.stringify(state)),keep=chosen.artwork==='product-design';const caption=$('viewer').querySelector('.core-caption');if(caption)caption.textContent=keep?'Complete logo embroidery · left chest':chosen.artwork==='pick'?'Custom graphics · drag to place':'Studio chooses the print';
  const {BLANKS,createPrinter}=await import('/site/garment-print.mjs?v=graphics-editor-1');
  const url=keep?design.model:graphicBaseURL(design.model);
  previewNote.textContent=chosen.labMode==='random'?'Design reference · the studio chooses the actual base and color.':keep?'':chosen.artwork==='artists-choice'?'The studio chooses your print; the preview shows the base.':'';
  if(!url){previewNote.textContent='Graphics are saved. Placement is confirmed by the studio for this silhouette.';return;}
  printingBusy=true;save.disabled=true;
  try{
   if(currentURL!==url||(modelLoading&&modelLoading.url!==url)){if(modelLoading?.url!==url)modelLoading={url,promise:viewer.load(url)};await modelLoading.promise;currentURL=url;printer=null;}
   if(!keep)prepareGraphicBase(viewer.model());
   if(token!==previewToken){updatePreview();return;}
   if(keep)tintProductDesign(viewer.model(),chosen.labMode==='random'?'random':chosen.color,design,chosen.productDesign?.graphic,chosen.customColor);
   else{printer ||= createPrinter(viewer);const color=chosen.labMode==='random'?'#a6a28f':chosen.color==='white'?'#eeeae0':chosen.color==='custom'?chosen.customColor:'#151619';await printer.apply({kind:chosen.garment,plan:{front:chosen.artwork==='pick'&&chosen.picks.front.length?{kind:'refs',ids:chosen.picks.front,layers:chosen.graphicLayout?.front}:null,back:chosen.artwork==='pick'&&chosen.picks.back.length?{kind:'big',ids:chosen.picks.back,layers:chosen.graphicLayout?.back}:null},color:new window.THREE.Color(color),backSize:chosen.backSize,print:{x:0,y:0,scale:1},uploads:chosen.uploads||[]});}
   if(token!==previewToken)return;previewFailed=false;retryPreview.hidden=true;viewer.redraw();graphicsEditor?.previewReady();
  }catch{if(token===previewToken){previewFailed=true;retryPreview.hidden=false;previewNote.textContent='The preview could not update. Retry before saving your design.';}}finally{if(token===previewToken){printingBusy=false;save.disabled=previewFailed||!!graphicsEditor?.isUploading();}}
 }
 form.addEventListener('change',e=>{
  const {name,value}=e.target;
  if(name==='labMode'){state.labMode=value;state.construction=value==='cut-sew'?'cut-sew':'canvas';state.fit=state.construction==='cut-sew'?'regular':'blank';state.quantity=state.construction==='cut-sew'?1:state.quantity;state.color=value==='random'?'random':state.color==='random'?defaultColor:state.color;}
  else if(['color','size','fit','artwork'].includes(name))state[name]=value;
  else if(name==='graphic')state.productDesign={id,graphic:value};
  else if(name==='quantity')state.quantity=Number(value);
  else if(name==='productColor')state.options.color=value;
  else if(name==='weight')state.options.weight=value;
  else if(name==='productSize')state.options.size=value;
  else if(name==='strapColor')state.options.strapColor=value;
  else if(name==='customColor')state.customColor=value;
  else if(name==='studioNotes')state.notes=value;
  feedback.textContent='';render();updatePreview();
 });
 form.addEventListener('input',e=>{if(e.target.name==='studioNotes')state.notes=e.target.value;if(e.target.name==='customColor'){state.customColor=e.target.value;updatePrice();updatePreview();}if(e.target.name==='strapColor'){state.options.strapColor=e.target.value;updatePreview();}});
 form.addEventListener('submit',e=>{
  e.preventDefault();
  if(previewFailed){feedback.textContent='Retry the graphic preview before saving.';return;}
  if(printingBusy||graphicsEditor?.isUploading()){feedback.textContent='Wait for the graphic preview to finish updating.';return;}
  if(existingHat?.querySelector('.hat-shape-options[aria-busy=true]')){feedback.textContent='Wait for your selected hat shape to finish loading.';return;}
  if(product?.family==='trucker'&&existingHat?.btrDesign)state.options=existingHat.btrDesign();
  const n=normalized();if(!n.ok){feedback.textContent=n.errors.join(' ');if(design&&!state.size){settings.open=true;fields.querySelector('[name=size]')?.focus();}if(product?.family==='daily-apple'&&!state.options.size)fields.querySelector('[name=productSize]')?.focus();return;}
  const result=edit?cart.replace(edit,n.item):cart.add(n.item);
  if(!result.ok){feedback.textContent=result.errors?.join(' ')||'Your design could not be saved.';return;}
  feedback.textContent='Your configuration is saved in your bag.';document.dispatchEvent(new CustomEvent('lab:open-cart',{detail:{added:result.id}}));
 });
 render();
}
function defaultOptions(p){
 if(p.family==='gloves')return {color:'white'};
 if(p.family==='daily-apple')return {color:'white',size:null};
 if(['headband','skully'].includes(p.family))return {color:/white/.test(id)?'white':'black',weight:'thin'};
 if(p.family==='belt')return {strapColor:'#151619'};
 if(p.family==='necklace')return {chain:'22-inch sterling silver French cable · 3.4 mm'};
 if(p.family==='trucker'){const original=(window.BTR_ACCESSORIES||[]).find(x=>x.id===id);return {style:'trucker',colors:{front:original?.frontColor||'#f0eadf',brim:original?.brimColor||'#282828',mesh:original?.meshColor||'#f0eadf'},picks:[]};}
 return {color:/white/.test(id)||id==='apple-gloves'?'white':'black'};
}
