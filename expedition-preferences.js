'use strict';
(function(root){
 const STORAGE='eden-expedition-preferences-v1',KEYS=['b','n'];
 root.createExpeditionPreferences=function({onChange=()=>{}}={}){
  const EFFECTS=['bob','roll','sway','shake','speedFov'],RANGES={firstSensitivity:[.25,2,1,.05],thirdSensitivity:[.25,2,1,.05],firstFov:[50,90,60,1],thirdFov:[50,90,60,1]};
  const defaults=()=>{const effects=!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;return {bailKey:'b',cameraEffects:effects,aimAssist:false,...Object.fromEntries(EFFECTS.map(k=>[k,effects])),...Object.fromEntries(Object.entries(RANGES).map(([k,v])=>[k,v[2]])),crouchMode:'hold',sprintMode:'hold'};};
  function validate(raw){const base=defaults();if(!raw||typeof raw!=='object'||Array.isArray(raw))return base;
   const result={...base,bailKey:KEYS.includes(raw.bailKey)?raw.bailKey:base.bailKey};
   for(const key of ['cameraEffects','aimAssist',...EFFECTS])if(typeof raw[key]==='boolean')result[key]=raw[key];
   for(const [key,[min,max]] of Object.entries(RANGES))if(typeof raw[key]==='number'&&Number.isFinite(raw[key]))result[key]=Math.max(min,Math.min(max,raw[key]));
   for(const key of ['crouchMode','sprintMode'])if(['hold','toggle'].includes(raw[key]))result[key]=raw[key];
   return result;
  }
  let value=defaults(),disposed=false;try{value=validate(JSON.parse(root.localStorage.getItem(STORAGE)));}catch{}
  const doc=root.document,dialog=doc.getElementById('night-dialog'),panel=doc.createElement('details'),listeners=[];
  panel.className='expedition-preferences';panel.style.marginTop='16px';
  const summary=doc.createElement('summary');summary.textContent='Controls and comfort';panel.append(summary);
  const fieldset=doc.createElement('fieldset');fieldset.style.marginTop='10px';const legend=doc.createElement('legend');legend.textContent='Expedition preferences';fieldset.append(legend);panel.append(fieldset);
  const controls={};
  function listen(node,event,handler){node.addEventListener(event,handler);listeners.push(()=>node.removeEventListener(event,handler));}
  function row(text,input){const label=doc.createElement('label');label.style.display='flex';label.style.alignItems='center';label.style.gap='10px';label.style.margin='12px 0';const caption=doc.createElement('span');caption.textContent=text;label.append(caption,input);fieldset.append(label);return label;}
  controls.bailKey=doc.createElement('select');controls.bailKey.setAttribute('aria-label','Bail / get up key');for(const key of KEYS){const option=doc.createElement('option');option.value=key;option.textContent=key.toUpperCase();controls.bailKey.append(option);}row('Bail / get up key',controls.bailKey);
  for(const [key,text] of [['cameraEffects','Enable camera effects'],['bob','Head bob'],['roll','Camera roll'],['sway','Camera sway'],['shake','Camera shake'],['speedFov','Speed FOV change'],['aimAssist','Flare aim assist (optional)']]){const input=doc.createElement('input');input.type='checkbox';controls[key]=input;row(text,input);}
  const outputs={};
  for(const [key,text] of [['firstSensitivity','First-person look sensitivity'],['thirdSensitivity','Third-person look sensitivity'],['firstFov','First-person field of view'],['thirdFov','Third-person field of view']]){
   const input=doc.createElement('input'),[min,max,,step]=RANGES[key];input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.setAttribute('aria-label',text);controls[key]=input;const label=row(text,input);
   const output=doc.createElement('output');output.setAttribute('aria-label',text+' value');outputs[key]=output;label.append(output);
   listen(input,'input',()=>{output.textContent=input.value;});
  }
  for(const [key,text] of [['crouchMode','Crouch behavior'],['sprintMode','Sprint behavior']]){const select=doc.createElement('select');select.setAttribute('aria-label',text);for(const mode of ['hold','toggle']){const option=doc.createElement('option');option.value=mode;option.textContent=mode==='hold'?'Hold key':'Toggle on press';select.append(option);}controls[key]=select;row(text,select);}
  const hint=doc.createElement('p');hint.textContent='Bail is manual. Press the chosen key again to get up once settled with space overhead. Camera effects default off when reduced motion is requested.';hint.style.fontSize='12px';fieldset.append(hint);
  const reset=doc.createElement('button');reset.type='button';reset.textContent='Reset preferences';fieldset.append(reset);
  const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.fontSize='12px';fieldset.append(status);
  function render(){for(const [key,input] of Object.entries(controls)){if(typeof value[key]==='boolean')input.checked=value[key];else input.value=String(value[key]);if(outputs[key])outputs[key].textContent=String(value[key]);}}
  function save(next){if(disposed)return;value=validate(next);render();try{root.localStorage.setItem(STORAGE,JSON.stringify(value));status.textContent='Preferences saved.';}catch{status.textContent='Preferences apply for this visit. This browser could not save them.';}onChange({...value});}
  for(const key of Object.keys(controls))listen(controls[key],'change',()=>save({...value,[key]:RANGES[key]?Number(controls[key].value):typeof value[key]==='boolean'?controls[key].checked:controls[key].value}));
  listen(reset,'click',()=>save(defaults()));render();dialog?.append(panel);
  return {
   get:()=>({...value}),
   reset:()=>save(defaults()),
   isBailKey(event){
    if(disposed||event.defaultPrevented||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return false;
    const editable=node=>node&&(node.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(node.tagName)||node.closest?.('[contenteditable="true"], [role="textbox"], [role="combobox"]'));
    if(editable(event.target)||editable(doc.activeElement)||doc.querySelector('dialog[open], [aria-modal="true"]'))return false;
    return typeof event.key==='string'&&event.key.toLowerCase()===value.bailKey;
   },
   destroy(){if(disposed)return;disposed=true;for(const remove of listeners)remove();panel.remove();}
  };
 };
})(typeof window==='object'?window:globalThis);
