'use strict';
window.createCharacterEditor=function({T,save,stopMoving,draftOwner=()=> 'guest',preview=false}){
 const dialog=document.createElement('dialog');dialog.id='character-dialog';dialog.setAttribute('aria-labelledby','character-title');
 dialog.innerHTML=`<header class="character-header"><div><small>BREAKTHYRULE / IDENTITY</small><h2 id="character-title">Create your character</h2></div><button type="button" class="icon-button" id="character-close" aria-label="Close character creator" title="Close character creator"><i data-lucide="x"></i></button></header>
 <div class="character-layout"><div class="character-stage" id="character-stage"><span id="character-measure" class="character-measure"></span><span class="character-studio-name">EDEN / 01</span><p class="character-loading" id="character-loading" role="status">Loading character...</p><div class="character-tools"><button type="button" id="character-left" aria-label="Rotate left" title="Rotate left"><i data-lucide="rotate-ccw"></i></button><button type="button" id="character-front" aria-label="Front view" title="Front view"><i data-lucide="user-round"></i></button><button type="button" id="character-face" aria-label="Face close-up" title="Face close-up" aria-pressed="false"><i data-lucide="scan-face"></i></button><button type="button" id="character-right" aria-label="Rotate right" title="Rotate right"><i data-lucide="rotate-cw"></i></button><button type="button" id="character-random" aria-label="Randomize character" title="Randomize character"><i data-lucide="shuffle"></i></button><button type="button" id="character-reset" aria-label="Reset changes" title="Reset changes"><i data-lucide="undo-2"></i></button></div></div>
 <div class="character-sidebar"><nav class="character-tabs" role="tablist" aria-label="Character settings"></nav><div id="character-panels" style="display:contents"></div></div></div>
 <footer class="character-footer"><p id="character-error" role="status"></p><button id="character-save" type="button" disabled>Save & enter garden</button></footer>`;
 document.body.append(dialog);
 const $=id=>document.getElementById(id),stage=$('character-stage');
 const bases={
  Boulevard:{height:182,weight:82,build:.7,shoulders:1.14,waist:.96,hips:.97,faceWidth:1.09,faceHeight:.97,jawWidth:1.2,cheekWidth:1.04,chinLength:1.09,eyeSize:.92,noseWidth:1.06,noseLength:1.13,mouthWidth:1.02,faceDefinition:.9,age:.36,skinTone:'#ba8564',hairStyle:'slick',hairColor:'#302821',outfit:'resort',shirtColor:'#68bdb0',pantsColor:'#586778'},
  Riviera:{height:170,weight:61,build:.23,shoulders:.87,waist:.85,hips:1.12,faceWidth:.94,faceHeight:1.02,jawWidth:.8,cheekWidth:1.06,chinLength:.9,noseWidth:.84,noseLength:.92,lipFullness:1.19,faceDefinition:.3,browWeight:.72,skinTone:'#dfb393',hairStyle:'bob',hairColor:'#302821',outfit:'sleeveless',shirtColor:'#e9e8e2',pantsColor:'#3b4048'},
  Harbor:{height:188,weight:94,build:.84,shoulders:1.18,waist:1.04,hips:1.02,faceWidth:1.12,faceHeight:1.05,jawWidth:1.2,cheekWidth:1.06,noseWidth:1.2,lipFullness:1.18,faceDefinition:.8,age:.3,skinTone:'#754630',hairStyle:'locs',hairColor:'#19191b',outfit:'tee',shirtColor:'#e9e8e2',pantsColor:'#586778'},
  Sunset:{height:174,weight:63,build:.3,shoulders:.94,waist:.9,hips:1.05,faceWidth:.98,faceHeight:1.03,jawWidth:.91,cheekWidth:1.1,noseWidth:.97,lipFullness:1.13,faceDefinition:.44,skinTone:'#9a6349',hairStyle:'curls',hairColor:'#70482c',outfit:'resort',shirtColor:'#d885a8',pantsColor:'#dedbd2'},
  Midnight:{height:180,weight:70,build:.5,shoulders:1.04,waist:.88,hips:.95,faceWidth:.95,faceHeight:1.08,jawWidth:1.07,chinLength:1.12,eyeSize:.87,noseLength:1.15,faceDefinition:.88,age:.47,skinTone:'#dfb393',hairStyle:'quiff',hairColor:'#19191b',facialHair:'mustache',eyewear:'aviators',outfit:'longsleeve',shirtColor:'#2d3035',pantsColor:'#3b4048'},
  Marina:{height:168,weight:59,build:.2,shoulders:.86,waist:.84,hips:1.12,faceWidth:.93,faceHeight:.99,jawWidth:.84,cheekWidth:1.12,noseWidth:.86,lipFullness:1.17,faceDefinition:.38,browWeight:.8,skinTone:'#482d24',hairStyle:'ponytail',hairColor:'#19191b',outfit:'sleeveless',shirtColor:'#b18a42',pantsColor:'#dedbd2'}
 };
 let schema,draft,original,renderer,scene,camera,model,angle=0,closeup=false,busy=false,opened=0,drag=null,rebuildFrame=0;
 let moving=false,motionFrame=0;
 let draftKey='',draftStored=false;
 function storeDraft(){if(!draft||!draftKey)return;try{localStorage.setItem(draftKey,JSON.stringify({at:Date.now(),appearance:draft}));draftStored=true;}catch{draftStored=false;}}
 function restoreDraft(){try{const entry=JSON.parse(localStorage.getItem(draftKey)||'null');if(!entry||!Number.isFinite(entry.at)||entry.at>Date.now()+60000||Date.now()-entry.at>30*86400000||entry.appearance?.version!==1)return null;const value=entry.appearance;
  for(const [key,s] of Object.entries(schema.numbers))if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<s.min||value[key]>s.max)return null;
  for(const [key,s] of Object.entries(schema.choices))if(!Object.hasOwn(s.options,value[key]))return null;
  for(const key of Object.keys(schema.colors))if(!/^#[0-9a-f]{6}$/i.test(value[key]))return null;
  return Object.fromEntries(['version',...Object.keys(schema.numbers),...Object.keys(schema.choices),...Object.keys(schema.colors)].map(k=>[k,value[k]]));
 }catch{return null;}}
 const motion=document.createElement('button');motion.id='character-motion';motion.type='button';motion.title='Preview walk';motion.setAttribute('aria-label','Preview walk');motion.setAttribute('aria-pressed','false');motion.innerHTML='<i data-lucide="footprints"></i>';$('character-front').after(motion);
 function animatePreview(){if(!moving||!dialog.open)return;draw();motionFrame=requestAnimationFrame(animatePreview);}
 motion.onclick=()=>{moving=!moving;motion.setAttribute('aria-pressed',String(moving));cancelAnimationFrame(motionFrame);if(moving)animatePreview();else draw();};
 let schemaPromise;
 function loadSchema(){return schemaPromise||=fetch('/character-schema.json?v=2',{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error('Character settings could not load. Close and reopen to retry.');return r.json();}).catch(error=>{schemaPromise=null;throw error;});}
 const defaults=()=>Object.fromEntries([['version',1],...Object.values(schema).filter(v=>v&&typeof v==='object').flatMap(group=>Object.entries(group).map(([key,s])=>[key,s.default]))]);
 function initScene(){
  if(renderer)return;
  renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setClearColor(0x101819,0);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','3D character preview');stage.prepend(renderer.domElement);
  scene=new T.Scene();camera=new T.PerspectiveCamera(32,1,.01,30);
  scene.add(new T.HemisphereLight('#fffaf2','#777d87',1.3));
  const key=new T.DirectionalLight('#fff0da',2.4);key.position.set(3,5,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=3;key.shadow.camera.bottom=-2;key.shadow.normalBias=.02;scene.add(key);
  const fill=new T.DirectionalLight('#b2e0e8',.65);fill.position.set(-3,2,1);scene.add(fill);
  const rim=new T.DirectionalLight('#ff9dce',1.1);rim.position.set(0,3,-3);scene.add(rim);
  const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.ShadowMaterial({opacity:.28}));ground.rotation.x=-Math.PI/2;ground.position.y=-.01;ground.receiveShadow=true;scene.add(ground);
  renderer.domElement.onpointerdown=e=>{drag={x:e.clientX,angle};renderer.domElement.setPointerCapture(e.pointerId);};
  renderer.domElement.onpointermove=e=>{if(drag){angle=drag.angle+(e.clientX-drag.x)*.012;draw();}};
  renderer.domElement.onpointerup=renderer.domElement.onpointercancel=renderer.domElement.onlostpointercapture=()=>drag=null;
  renderer.domElement.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();angle+=(e.key==='ArrowLeft'?-1:1)*.2;draw();}};
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('character-error').textContent='3D preview interrupted. Reload the page to continue.';$('character-save').disabled=true;});
  new ResizeObserver(draw).observe(stage);
 }
 function draw(){
  if(!renderer||!dialog.open||!model)return;
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  const viewHeight=Math.max(1,h-52);renderer.setSize(w,h,false);renderer.setViewport(0,52,w,viewHeight);camera.aspect=w/viewHeight;camera.updateProjectionMatrix();
  const height=model.height,target=closeup?height*.885:height*.52;
  const distance=closeup?Math.max(1.12*height/1.8,.85/camera.aspect):Math.max(3.1,height/(2*Math.tan(Math.PI*32/360))*(1.25/Math.min(1,camera.aspect)));
  camera.position.set(0,closeup?target:height*.55,distance);camera.lookAt(0,target,0);model.root.rotation.y=angle;const time=moving?performance.now()/1000:0;model.animate(time,moving?Math.sin(time*7)*.42:0);renderer.render(scene,camera);
 }
 function rebuild(){
  storeDraft();
  cancelAnimationFrame(rebuildFrame);rebuildFrame=requestAnimationFrame(()=>{if(!draft||!dialog.open)return;if(model)GardenCharacter.dispose(model);model=GardenCharacter.create(T,draft);scene.add(model.root);$('character-measure').textContent=draft.height+' cm / '+draft.weight+' kg';draw();});
 }
 function syncFields(){
  for(const [key,spec] of Object.entries(schema.numbers)){const input=$('character-'+key);input.value=draft[key];$('value-'+key).value=spec.unit?draft[key]+' '+spec.unit:Math.round(draft[key]*100)+'%';}
  for(const key of Object.keys(schema.choices))$('character-'+key).value=draft[key];
  for(const key of ['hairLength','hairVolume'])$('character-'+key).disabled=draft.hairStyle==='none';
  for(const key of Object.keys(schema.colors)){$('character-'+key).value=draft[key];for(const b of dialog.querySelectorAll('[data-color-key="'+key+'"]'))b.setAttribute('aria-pressed',String(b.dataset.color===draft[key]));}
 }
 function change(key,value){draft[key]=value;$('character-base').value='Custom';syncFields();rebuild();$('character-error').textContent='';}
 function buildFields(){
  const tabs=dialog.querySelector('.character-tabs'),panels=$('character-panels');tabs.replaceChildren();panels.replaceChildren();
  for(const [tab,title] of [['body','Body'],['face','Face'],['hair','Hair'],['style','Style']]){
   const button=document.createElement('button');button.type='button';const icon=document.createElement('i');icon.dataset.lucide={body:'person-standing',face:'scan-face',hair:'scissors',style:'shirt'}[tab];icon.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=title;button.append(icon,label);button.id='character-tab-'+tab;button.setAttribute('role','tab');button.setAttribute('aria-controls','character-fields-'+tab);button.onclick=()=>selectTab(tab);tabs.append(button);
   button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const buttons=[...tabs.children],index=buttons.indexOf(button),next=e.key==='Home'?0:e.key==='End'?3:(index+(e.key==='ArrowLeft'?3:1))%4;buttons[next].click();buttons[next].focus();}};
   const panel=document.createElement('div');panel.className='character-fields';panel.id='character-fields-'+tab;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panels.append(panel);
   if(tab==='body'){
    const baseLabel=document.createElement('label');baseLabel.className='character-field';baseLabel.textContent='Character base';const base=document.createElement('select');base.id='character-base';base.setAttribute('aria-label','Character base');for(const name of ['Custom',...Object.keys(bases)]){const option=document.createElement('option');option.textContent=name;base.append(option);}baseLabel.append(base);panel.append(baseLabel);
    base.onchange=()=>{if(!bases[base.value])return;draft={...defaults(),...bases[base.value]};syncFields();$('character-preset').value='Custom';rebuild();};
    const label=document.createElement('label');label.className='character-field';label.textContent='Starting shape';const select=document.createElement('select');select.id='character-preset';select.setAttribute('aria-label','Starting shape');for(const name of ['Custom','Balanced','Lean','Athletic','Soft']){const o=document.createElement('option');o.textContent=name;select.append(o);}label.append(select);panel.append(label);
    select.onchange=()=>{const presets={Balanced:{weight:72,build:.35,shoulders:1,waist:1,hips:1},Lean:{weight:55,build:.2,shoulders:.94,waist:.85,hips:.94},Athletic:{weight:85,build:.9,shoulders:1.18,waist:.9,hips:1},Soft:{weight:108,build:.12,shoulders:1,waist:1.12,hips:1.2}};Object.assign(draft,presets[select.value]||{});$('character-base').value='Custom';syncFields();rebuild();};
   }
   for(const [key,spec] of Object.entries(schema.numbers).filter(([,s])=>s.tab===tab)){
    const label=document.createElement('label');label.className='character-field';label.htmlFor='character-'+key;const row=document.createElement('span');row.append(document.createTextNode(spec.label));const out=document.createElement('output');out.id='value-'+key;out.htmlFor='character-'+key;row.append(out);
    const input=document.createElement('input');input.type='range';input.id='character-'+key;input.min=spec.min;input.max=spec.max;input.step=spec.step;input.oninput=()=>{change(key,Number(input.value));$('character-preset').value='Custom';};label.append(row,input);panel.append(label);
   }
   for(const [key,spec] of Object.entries(schema.choices).filter(([,s])=>s.tab===tab)){
    const label=document.createElement('label');label.className='character-field';label.htmlFor='character-'+key;const row=document.createElement('span');row.textContent=spec.label;const select=document.createElement('select');select.id='character-'+key;
    for(const [value,name] of Object.entries(spec.options)){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}select.onchange=()=>change(key,select.value);label.append(row,select);panel.append(label);
   }
   for(const [key,spec] of Object.entries(schema.colors).filter(([,s])=>s.tab===tab)){
    const field=document.createElement('div');field.className='character-field';const label=document.createElement('span');label.textContent=spec.label;field.append(label);const swatches=document.createElement('div');swatches.className='character-swatches';swatches.setAttribute('role','group');swatches.setAttribute('aria-label',spec.label);
    for(const color of spec.swatches){const b=document.createElement('button');b.type='button';b.dataset.colorKey=key;b.dataset.color=color;b.style.background=color;b.title=spec.label+' '+color;b.setAttribute('aria-label',b.title);b.onclick=()=>change(key,color);swatches.append(b);}
    const picker=document.createElement('input');picker.type='color';picker.id='character-'+key;picker.setAttribute('aria-label','Custom '+spec.label.toLowerCase());picker.title=picker.getAttribute('aria-label');picker.oninput=()=>change(key,picker.value);swatches.append(picker);field.append(swatches);panel.append(field);
   }
   if(tab==='hair'){
    const field=$('character-hairStyle').closest('label');panel.prepend(field);const select=$('character-hairStyle'),row=document.createElement('div');row.className='character-choice-cycle';select.before(row);
    for(const [direction,icon,title] of [[-1,'chevron-left','Previous hairstyle'],[1,'chevron-right','Next hairstyle']]){const b=document.createElement('button');b.type='button';b.title=title;b.setAttribute('aria-label',title);b.innerHTML='<i data-lucide="'+icon+'"></i>';b.onclick=()=>{const keys=Object.keys(schema.choices.hairStyle.options);change('hairStyle',keys[(keys.indexOf(draft.hairStyle)+direction+keys.length)%keys.length]);};row.append(b);if(direction===-1)row.append(select);}
   }
  }
  selectTab('body');
 }
 function selectTab(tab){for(const name of ['body','face','hair','style']){const b=$('character-tab-'+name);b.setAttribute('aria-selected',String(name===tab));b.tabIndex=name===tab?0:-1;$('character-fields-'+name).hidden=name!==tab;}closeup=tab==='face'||tab==='hair';$('character-face').setAttribute('aria-pressed',String(closeup));draw();}
 function close(){if(busy)return;storeDraft();if(!draftStored&&draft&&JSON.stringify(draft)!==JSON.stringify(original)&&!confirm('Discard unsaved character changes?'))return;dialog.close();}
 $('character-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>{opened++;cancelAnimationFrame(rebuildFrame);cancelAnimationFrame(motionFrame);moving=false;motion.setAttribute('aria-pressed','false');if(model){GardenCharacter.dispose(model);model=null;}stopMoving();});
 $('character-left').onclick=()=>{angle-=Math.PI/4;draw();};$('character-right').onclick=()=>{angle+=Math.PI/4;draw();};$('character-front').onclick=()=>{angle=0;draw();};$('character-face').onclick=()=>{closeup=!closeup;$('character-face').setAttribute('aria-pressed',String(closeup));draw();};
 $('character-reset').onclick=()=>{draft=structuredClone(original);$('character-base').value='Custom';$('character-preset').value='Custom';syncFields();rebuild();};
 $('character-random').onclick=()=>{draft=defaults();for(const [key,s] of Object.entries(schema.numbers)){const value=s.min+Math.random()*(s.max-s.min);draft[key]=Number((Math.round(value/s.step)*s.step).toFixed(2));}for(const [key,s] of Object.entries(schema.colors))draft[key]=s.swatches[Math.floor(Math.random()*s.swatches.length)];for(const [key,s] of Object.entries(schema.choices)){const options=Object.keys(s.options);draft[key]=options[Math.floor(Math.random()*options.length)];}$('character-base').value='Custom';$('character-preset').value='Custom';syncFields();rebuild();};
 $('character-save').onclick=async()=>{if(busy||!draft)return;if(preview){storeDraft();$('character-error').textContent=draftStored?'Character saved on this device. Online entry is not available yet.':'This browser cannot save your draft. Keep this window open.';return;}busy=true;const submitted=structuredClone(draft);$('character-save').disabled=true;$('character-save').textContent='Saving...';$('character-error').textContent='';try{await save(submitted);original=submitted;try{localStorage.removeItem(draftKey);}catch{}dialog.close();}catch(e){storeDraft();$('character-error').textContent=e.message;}finally{busy=false;$('character-save').disabled=false;$('character-save').textContent='Save & enter garden';}};
 return {async open(character){
  if(dialog.open)return;const epoch=++opened;dialog.showModal();stopMoving();draft=null;$('character-loading').hidden=false;$('character-error').textContent='';$('character-save').disabled=true;$('character-title').textContent=character?'Edit your character':'Create your character';
  try{schema=await loadSchema();if(epoch!==opened)return;draftKey='eden-character-draft-v1-'+draftOwner();original={...defaults(),...(character||bases.Boulevard)};const restored=restoreDraft();draft=restored||structuredClone(original);buildFields();if(!character&&!restored)$('character-base').value='Boulevard';syncFields();initScene();angle=0;closeup=false;rebuild();$('character-save').disabled=false;$('character-save').textContent=preview?'Save on this device':'Save & enter garden';$('character-title').textContent=preview?'Preview your character':character?'Edit your character':'Create your character';$('character-error').textContent=preview?'Online entry is not available yet.':restored?'Restored your saved draft.':'';$('character-loading').hidden=true;window.lucide?.createIcons();}catch(e){$('character-loading').hidden=true;$('character-error').textContent=e.message;}
 }};
};
