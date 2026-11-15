import { createGarmentGraphicsEditor } from '/site/garment-graphics-editor.mjs?v=2';
import { graphicBaseURL, prepareGraphicBase } from '/site/graphic-base.mjs?v=1';
import { OFFERINGS, RANDOM_OFFERINGS, offeringFor, SIZES, FITS, COLORS, formatCents } from '/labkit/catalog.mjs';
import { PRODUCT_DESIGNS, STUDIO_PRODUCTS, GRAPHIC_COLORS } from '/labkit/product-options.mjs';
import { normalizeItem, priceItem } from '/labkit/pricing.mjs';
import { cart, POOL, labStatus } from '/site/cart-store.mjs?v=site-audit-1';
import { tintProductDesign } from '/site/product-preview.mjs?v=1';
import { mountProductGallery } from '/site/product-gallery.mjs?v=2';
const $=id=>document.getElementById(id);
const h=(tag,props={},...kids)=>{const e=Object.assign(document.createElement(tag),props);for(const k of kids.flat())if(k!=null)e.append(k);return e;};
const ready=document.readyState==='loading'?new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true})):Promise.resolve();
await ready;
const params=new URLSearchParams(location.search),id=params.get('item'),design=Object.hasOwn(PRODUCT_DESIGNS,id)?PRODUCT_DESIGNS[id]:null,product=Object.hasOwn(STUDIO_PRODUCTS,id)?STUDIO_PRODUCTS[id]:null;
document.body.classList.add('silkroad-product');
const info=document.querySelector('.product-info');
const trail=h('nav',{className:'studio-trail',ariaLabel:'Breadcrumb'},h('a',{href:'/?nocover=1',textContent:'Marketplace'}),h('span',{textContent:'/'}),h('span',{textContent:design?'Garments':product?.family==='necklace'?'Necklaces':product?.family==='belt'?'Belts':'Accessories'}));
document.querySelector('.product-page').before(trail);
const seal=h('p',{className:'studio-origin',textContent:'BREAK THY RULE / LOS ANGELES'});info.prepend(seal);
mountStory();mountProductGallery($('product-gallery'));
if(design||product)mountOptions();
function mountStory(){
 const section=$('product-story');
 section.append(h('div',{className:'studio-story-intro'},h('p',{className:'studio-eyebrow',textContent:'The house rules'}),h('h2',{id:'studio-story-title',textContent:'Made here. Sent from here.'}),h('p',{textContent:'Every Break Thy Rule piece is made, finished and shipped from Los Angeles. Choose how your piece begins; we take care of the print, the finishing and the journey out of the studio.'})),
 h('div',{className:'studio-rules'},
 rule('01 / Random','A base chosen by the studio.','You choose the garment type and size. We choose the actual base and color; it may be vintage or new. Artwork is included. Allow up to one week to make, plus shipping.'),
 rule('02 / Blank','Your color. Our hand.','Choose an existing blank, vintage or new, and we print and finish it in Los Angeles. Black, white and random colors are included; a custom garment color adds $40. Production timing is confirmed per order; shipping follows.'),
 rule('03 / Cut & Sew','Built from the beginning.','An original 100% cotton garment, cut, sewn, printed and finished in Los Angeles. Allow 2–3 weeks to make, plus shipping. Each piece is made individually.'),
 rule('04 / The details','A clear price before you commit.','The live total follows your selected base, color and quantity. Artwork is included. Garment construction prices apply to clothing; hats, headbands, gloves, skullies, belts and necklaces use their listed product prices. Shipping and any tax are shown separately before payment. Delivery time depends on your destination.')),
 pricingTable());
}
function rule(label,title,copy){return h('article',{},h('p',{className:'studio-eyebrow',textContent:label}),h('h3',{textContent:title}),h('p',{textContent:copy}));}
function pricingTable(){
 const details=h('details',{className:'studio-price-table'},h('summary',{textContent:'See the garment price list'}));
 const table=h('table',{},h('caption',{textContent:'USD per garment · artwork included · custom garment color +$40'}),h('thead',{},h('tr',{},...['Garment','Random','Blank','Cut & Sew'].map(t=>h('th',{scope:'col',textContent:t})))));
 const body=h('tbody');
 for(const g of ['tee','hoodie','crewneck','sweatpants','longsleeve','shorts'])body.append(h('tr',{},h('th',{scope:'row',textContent:OFFERINGS['cut-sew'][g]?.name||g}),...[(RANDOM_OFFERINGS[g]),OFFERINGS.canvas[g],OFFERINGS['cut-sew'][g]].map(o=>h('td',{textContent:o?formatCents(o.priceCents):'—'}))));
 table.append(body);details.append(h('div',{className:'studio-table-scroll'},table));return details;
}
function mountOptions(){
 let edit=params.get('edit'),saved=edit&&cart.get(edit)?.config;
 const garment=design?.garment,construction=garment==='longsleeve'?'cut-sew':'canvas';
 let state=design?{product:'garment',construction,labMode:construction==='cut-sew'?'cut-sew':'blank',garment,size:null,fit:construction==='cut-sew'?'regular':'blank',color:params.get('color')==='white'?'white':'black',customColor:'#87665c',artwork:'product-design',productDesign:{id,graphic:'Red'},sourceDesign:id,graphicLayout:null,uploads:[],quantity:1,picks:{front:[],back:[]},backSize:'full'}:{product:'studio-product',productId:id,quantity:1,notes:'',options:defaultOptions(product)};
 if(saved){const n=normalizeItem(saved,{artworkPool:POOL});if(n.ok&&((design&&n.item.garment===design.garment&&(n.item.productDesign?.id===id||n.item.sourceDesign===id))||(product&&n.item.productId===id)))state={...state,...n.item};else edit=null;}
 if(design){state.picks ||= {front:[],back:[]};state.productDesign ||= {id,graphic:'Red'};state.customColor ||= '#87665c';}
 let status=null,previewToken=0,printer=null,currentURL=design?.model,graphicsEditor=null,previewFrame=0,modelLoading=null,printingBusy=false,previewFailed=false;
 const schedulePreview=()=>{if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;updatePreview();});};
 const form=h('form',{className:'studio-config',id:'product-config',noValidate:true,ariaLabel:'Customize this product'}),fields=h('div',{className:'studio-config-fields'}),feedback=h('p',{className:'studio-form-status',role:'status',ariaLive:'polite'}),previewNote=h('p',{className:'studio-preview-note',role:'status'});
 const retryPreview=h('button',{type:'button',className:'studio-preview-retry',textContent:'Retry preview',hidden:true});retryPreview.onclick=()=>updatePreview();
 const subtotal=h('strong',{className:'studio-total'}),breakdown=h('p',{className:'studio-breakdown'}),save=h('button',{type:'submit',className:'studio-save',textContent:edit?'Update saved design':'Save design'});
 const editorHost=h('section',{className:'studio-graphics-pane'}),artMode=h('div',{className:'studio-art-mode'}),settingsSummary=h('summary',{textContent:'Garment options'}),settings=h('details',{className:'studio-garment-settings',open:true},settingsSummary,fields);
 const total=h('div',{className:'studio-checkout'},h('div',{},h('span',{className:'studio-eyebrow',textContent:'Your piece / USD'}),subtotal),save);
 const notes=h('p',{className:'studio-small',textContent:'Made & shipped from Los Angeles · shipping and tax additional.'});
 form.append(h('div',{className:'studio-config-title'},h('h2',{textContent:'Make it yours'}),h('span',{textContent:design?'Garment Lab':'Studio options'})), ...(design?[artMode,settings,editorHost]:[fields]),previewNote,retryPreview,breakdown,total,feedback,notes);
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
   if(['headband','skully','gloves'].includes(product.family))fields.append(field('Color',h('div',{className:'studio-color-grid'},...['black','white'].map(c=>radio('productColor',c,c==='white'?'White':'Black',state.options.color===c)))));
   if(product.family==='belt')fields.append(field('Strap color',h('label',{className:'studio-custom-color'},h('span',{textContent:'Color · included in the complete belt'}),h('input',{type:'color',name:'strapColor',value:state.options.strapColor,ariaLabel:'Belt strap color'}))),h('p',{className:'studio-small',textContent:'Complete belt · sculptural buckle and strap included. No-hole clamp design.'}));
   if(product.family==='necklace')fields.append(field('Chain',h('p',{className:'studio-chain',textContent:'22-inch sterling silver French cable · 3.4 mm'})),h('p',{className:'studio-small',textContent:'Complete necklace · pendant and chain included.'}));
   fields.append(h('label',{className:'studio-select'},'Notes for the studio',h('textarea',{name:'studioNotes',maxLength:280,rows:2,value:state.notes||'',placeholder:'Fit, finish or other requests…'})),h('p',{className:'studio-small',textContent:'Special requests are confirmed by the studio before making.'}));
  }
  fields.append(h('label',{className:'studio-select studio-quantity'},'Quantity',h('select',{name:'quantity',ariaLabel:'Quantity'},...[1,2,3,4,5].map(q=>h('option',{value:String(q),textContent:String(q),selected:state.quantity===q,disabled:design&&state.construction==='cut-sew'&&q>1})))));
  if(design){const artField=[...fields.querySelectorAll('fieldset')].find(f=>f.querySelector('[name=artwork]'));if(artField)artMode.replaceChildren(artField);
   const editing=state.artwork==='pick';if(settings.dataset.artwork!==state.artwork){settings.open=!editing;settings.dataset.artwork=state.artwork;}
   settingsSummary.textContent=(state.labMode==='cut-sew'?'Cut & Sew':state.labMode==='random'?'Random':'Blank')+' · '+(state.labMode==='random'?'studio color':state.color)+' · '+(state.size||'choose size');
   document.body.classList.toggle('graphics-editing',editing);graphicsEditor?.sync();
  }
  updatePrice();
  if(previous?.name){const el=[...form.elements].find(e=>e.name===previous.name&&e.value===previous.value);el?.focus({preventScroll:true});}
 }
 function normalized(forDisplay=false){const cfg=design?{...state,size:state.size||(forDisplay?'M':null),color:state.labMode==='random'?'random':state.color,productDesign:state.artwork==='product-design'?state.productDesign:undefined}:state;return normalizeItem(cfg,{artworkPool:POOL});}
 function updatePrice(){
  const n=normalized(true);
  // Artwork can still be empty while the customer browses; the quote remains visible.
  const price=design?priceItem({...state,product:'garment',color:state.labMode==='random'?'random':state.color,quantity:state.quantity}):n.ok?priceItem(n.item):null;
  const value=price?formatCents(price.totalCents):'Choose options';subtotal.textContent=value;$('price').textContent=value+(price?' USD':'');
  breakdown.textContent=price?price.lines.filter(l=>l.cents).map(l=>formatCents(l.cents)+' '+l.label).join(' + ')+(state.quantity>1?` · ${state.quantity} × ${formatCents(price.unitCents)} each`:'')+(design?' · artwork included.':' · selected colors included.'):'Choose the options for a live total.';
  const slot=design?`${state.construction}:${state.garment}`:`studio:${id}`,open=!!status?.checkout?.available&&status?.slots?.[slot]?.available>0;
  save.textContent=edit?'Update saved design':open?'Add to bag':'Save design';
  notes.textContent=(open?'Made & shipped from Los Angeles.':'Save your configuration; ordering opens when studio capacity is available.')+' Shipping and tax additional.';
 }
 async function updatePreview(){
  const token=++previewToken,media=window.BTRProductMedia;if(!media)return;
  if(design){printingBusy=true;previewFailed=false;retryPreview.hidden=true;save.disabled=true;}await media.ready;if(token!==previewToken)return;
  if(!design){
   if(product.family==='belt'){try{media.setStrapColor(state.options.strapColor);previewNote.textContent='Strap color is included.';}catch{previewNote.textContent='Your strap color is saved; the 3D preview is loading.';}}
   if(['headband','skully','gloves'].includes(product.family)){
    const variant=(window.BTR_ACCESSORIES||[]).find(p=>p.family===product.family&&(p.slug.endsWith('-'+state.options.color)||(p.family==='gloves'&&state.options.color==='white')));
    if(media.setVariant&&variant){await media.setVariant({...variant,model:product.family==='gloves'&&state.options.color==='black'?'/accessory-collection/models/apple-gloves-black.glb?v=quality-3':variant.model});}
    else if(media.viewer&&product.family==='gloves'){await media.viewer.load('/accessory-collection/models/'+(state.options.color==='black'?'apple-gloves-black':'gloves-white')+'.glb?v=quality-3');media.viewer.redraw();}
   }return;
  }
  const viewer=media.viewer;if(!viewer)return;media.setPhotoMode?.(false);
  const chosen=JSON.parse(JSON.stringify(state)),keep=chosen.artwork==='product-design';const caption=$('viewer').querySelector('.core-caption');if(caption)caption.textContent=keep?'Complete logo embroidery · left chest':chosen.artwork==='pick'?'Custom graphics · drag to place':'Studio chooses the print';
  const {BLANKS,createPrinter}=await import('/site/garment-print.mjs?v=graphics-editor-1');
  const url=keep?design.model:graphicBaseURL(design.model);
  previewNote.textContent=chosen.labMode==='random'?'Design reference · the studio chooses the actual base and color.':keep?'3D design reference · each piece is made and placed by hand.':chosen.artwork==='artists-choice'?'The studio chooses your print; the preview shows the base.':'';
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
  if(name==='labMode'){state.labMode=value;state.construction=value==='cut-sew'?'cut-sew':'canvas';state.fit=state.construction==='cut-sew'?'regular':'blank';state.quantity=state.construction==='cut-sew'?1:state.quantity;state.color=value==='random'?'random':state.color==='random'?'black':state.color;}
  else if(['color','size','fit','artwork'].includes(name))state[name]=value;
  else if(name==='graphic')state.productDesign={id,graphic:value};
  else if(name==='quantity')state.quantity=Number(value);
  else if(name==='productColor')state.options.color=value;
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
  const n=normalized();if(!n.ok){feedback.textContent=n.errors.join(' ');if(design&&!state.size){settings.open=true;fields.querySelector('[name=size]')?.focus();}return;}
  const result=edit?cart.replace(edit,n.item):cart.add(n.item);
  if(!result.ok){feedback.textContent=result.errors?.join(' ')||'Your design could not be saved.';return;}
  feedback.textContent='Your configuration is saved in your bag.';document.dispatchEvent(new CustomEvent('lab:open-cart',{detail:{added:result.id}}));
 });
 render();
}
function defaultOptions(p){
 if(p.family==='belt')return {strapColor:'#151619'};
 if(p.family==='necklace')return {chain:'22-inch sterling silver French cable · 3.4 mm'};
 if(p.family==='trucker'){const original=(window.BTR_ACCESSORIES||[]).find(x=>x.id===id);return {style:'trucker',colors:{front:original?.frontColor||'#f0eadf',brim:original?.brimColor||'#282828',mesh:original?.meshColor||'#f0eadf'},picks:[]};}
 return {color:/white/.test(id)||id==='apple-gloves'?'white':'black'};
}
