'use strict';
// Props produced by the local asset workshop (~/Projects/breakthyrule-asset-workshop).
// Layout lives in /assets/props/scene.json: one entry per asset, each with one or more placements.
// GLBs are exported Y-up in metres, grounded at y=0 and centred on x/z, so they place without rescaling.
// Assets placed INSTANCE_MIN or more times are drawn as InstancedMeshes (one draw call per sub-mesh).
// Collision is a circle per placement (entry.radius × placement scale), checked by app.js move().
// Local edit mode: open http://127.0.0.1:<port>/?edit (localhost only). Alt+click a prop to select it,
// Alt+click the ground to move the selection there; [ ] rotate, - = scale, Backspace deletes; Save writes
// scene.json through the workshop dev server (PUT), or downloads it when served by a plain static server.
window.createGardenProps=function(T,scene,{camera=null,renderer=null,onChange=()=>{}}={}){
 const canvas=renderer?.domElement;
 const INSTANCE_MIN=4,SCENE_URL='/assets/props/scene.json',CATALOG_URL='/assets/props/catalog.json';
 const root=new T.Group();root.name='Workshop garden props';scene.add(root);
 const editing=/[?&]edit\b/.test(location.search)&&['localhost','127.0.0.1'].includes(location.hostname);
 let layout={version:1,props:[]},catalog=[],selected=null,panel=null;const entries=[];
 const matrix=new T.Matrix4(),quaternion=new T.Quaternion(),up=new T.Vector3(0,1,0);
 function placementMatrix(p){const s=p.scale||1;quaternion.setFromAxisAngle(up,p.rotationY||0);return new T.Matrix4().compose(new T.Vector3(...p.position),quaternion,new T.Vector3(s,s,s));}
 function build(entry){
  // (re)build the scene objects for one entry from its placements
  if(entry.object){root.remove(entry.object);entry.object=null;}
  entry.parts=[];
  if(!entry.gltf||!entry.def.placements.length){onChange();return;}
  const group=new T.Group();group.name=entry.def.name;
  entry.gltf.scene.updateMatrixWorld(true);
  const meshes=[];entry.gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  entry.instanced=entry.def.placements.length>=INSTANCE_MIN;
  if(entry.instanced){
   for(const mesh of meshes){
    const im=new T.InstancedMesh(mesh.geometry,mesh.material,entry.def.placements.length);
    im.castShadow=im.receiveShadow=true;im.userData.prop=entry;im.userData.local=mesh.matrixWorld.clone();
    group.add(im);entry.parts.push(im);
   }
  }else{
   for(const p of entry.def.placements){
    const clone=entry.gltf.scene.clone(true);clone.matrixAutoUpdate=false;
    clone.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.userData.prop=entry;}});
    group.add(clone);entry.parts.push(clone);
   }
  }
  entry.object=group;root.add(group);sync(entry);
 }
 function sync(entry){
  entry.def.placements.forEach((p,i)=>{
   const m=placementMatrix(p);
   if(entry.instanced)for(const im of entry.parts)im.setMatrixAt(i,matrix.multiplyMatrices(m,im.userData.local));
   else{entry.parts[i].matrix.copy(m);entry.parts[i].matrixWorldNeedsUpdate=true;}
  });
  if(entry.instanced)for(const im of entry.parts){im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();}
  onChange();
 }
 async function addEntry(def){
  const entry={def,status:'loading',gltf:null,object:null,parts:[]};entries.push(entry);
  try{entry.gltf=await showroomAssets.model(def.url);
   const b=new T.Box3().setFromObject(entry.gltf.scene);entry.size=b.getSize(new T.Vector3()).toArray().map(v=>+v.toFixed(3));
   entry.status='loaded';build(entry);}
  catch(error){entry.status='failed';entry.error=String(error);}
  return entry;
 }
 const ready=fetch(SCENE_URL,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('scene.json '+r.status);return r.json();})
  .then(data=>{layout=data;return Promise.allSettled(layout.props.map(addEntry));})
  .then(()=>{if(editing)startEditor();})
  .catch(error=>console.warn('Garden props unavailable',error));

 // ---------------------------------------------------------------- local edit mode
 function pick(event){
  // props first (small set), then only large static surfaces for the ground point: raycasting the whole
  // scene would also test thousands of grass/leaf instances on every click
  const rect=canvas.getBoundingClientRect(),ray=new T.Raycaster();
  ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObject(root,true)[0];
  if(hit){const entry=hit.object.userData.prop,index=entry.instanced?hit.instanceId:entry.parts.findIndex(part=>{for(let o=hit.object;o;o=o.parent)if(o===part)return true;return false;});return {entry,index};}
  const ground=ray.intersectObjects(scene.getObjectByName('Garden of Eden')?.children.filter(o=>o.isMesh&&o.geometry?.type==='PlaneGeometry')||[],false)[0];
  if(ground)return {ground:ground.point};
  const t=-ray.ray.origin.y/ray.ray.direction.y;return t>0?{ground:ray.ray.at(t,new T.Vector3())}:null;
 }
 function label(){
  if(!panel)return;const s=selected,p=s&&s.entry.def.placements[s.index];
  panel.querySelector('[data-selection]').textContent=p?`${s.entry.def.name} #${s.index+1} [${p.position.map(v=>v.toFixed(2)).join(', ')}] rot ${Math.round((p.rotationY||0)*180/Math.PI)}° scale ${(p.scale||1).toFixed(2)}`:'Nothing selected';
 }
 function select(entry,index){selected=entry&&index>=0?{entry,index}:null;label();}
 function edit(fn){if(!selected)return;fn(selected.entry.def.placements[selected.index]);sync(selected.entry);label();}
 function removeSelected(){const {entry,index}=selected;entry.def.placements.splice(index,1);selected=null;build(entry);label();}
 async function addFromCatalog(url){
  const forward=new T.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();
  const at=camera.position.clone().addScaledVector(forward,2.5),placement={position:[+at.x.toFixed(3),-.06,+at.z.toFixed(3)],rotationY:0,scale:1};
  let entry=entries.find(e=>e.def.url===url);
  if(entry){entry.def.placements.push(placement);build(entry);}
  else{const item=catalog.find(c=>c.url===url),def={name:item.name,url,radius:item.radius,placements:[placement]};layout.props.push(def);entry=await addEntry(def);}
  select(entry,entry.def.placements.length-1);
 }
 async function save(){
  const body=JSON.stringify(layout,null,1),status=panel.querySelector('[data-status]');
  try{const r=await fetch(SCENE_URL,{method:'PUT',headers:{'Content-Type':'application/json'},body});if(!r.ok)throw Error(r.status);status.textContent='saved '+new Date().toLocaleTimeString();}
  catch{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'application/json'}));a.download='scene.json';a.click();status.textContent='read-only server: downloaded scene.json';}
 }
 function map({x=0,z=4,half=18,size=1024}={}){
  // top-down orthographic render around (x, z) with a 2 m grid and prop markers; returns a PNG data URL
  const ortho=new T.OrthographicCamera(-half,half,half,-half,.1,200);ortho.position.set(x,80,z);ortho.up.set(0,0,-1);ortho.lookAt(x,0,z);
  const fog=scene.fog,old=new T.Vector2();renderer.getSize(old);const ratio=renderer.getPixelRatio();
  scene.fog=null;renderer.setPixelRatio(1);renderer.setSize(size,size,false);renderer.render(scene,ortho);
  const out=document.createElement('canvas');out.width=out.height=size;const c=out.getContext('2d');c.drawImage(canvas,0,0,size,size);
  scene.fog=fog;renderer.setPixelRatio(ratio);renderer.setSize(old.x,old.y,false);onChange();
  const px=v=>(v+half)/(2*half)*size;c.font='12px monospace';
  for(let g=Math.ceil((x-half)/2)*2;g<=x+half;g+=2){const u=px(g-x);c.strokeStyle=g%10?'rgba(255,255,255,.18)':'rgba(255,255,255,.5)';c.beginPath();c.moveTo(u,0);c.lineTo(u,size);c.stroke();c.fillStyle='#fff';if(g%4===0)c.fillText('x'+g,u+2,12);}
  for(let g=Math.ceil((z-half)/2)*2;g<=z+half;g+=2){const v=px(g-z);c.strokeStyle=g%10?'rgba(255,255,255,.18)':'rgba(255,255,255,.5)';c.beginPath();c.moveTo(0,v);c.lineTo(size,v);c.stroke();c.fillStyle='#fff';if(g%4===0)c.fillText('z'+g,2,v-2);}
  for(const e of entries)for(const p of e.def.placements){const u=px(p.position[0]-x),v=px(p.position[2]-z);c.strokeStyle='#ff3';c.beginPath();c.arc(u,v,Math.max(3,(e.def.radius||.3)*(p.scale||1)/(2*half)*size),0,Math.PI*2);c.stroke();}
  return out.toDataURL('image/png');
 }
 async function startEditor(){
  if(!camera||!canvas)return;
  try{catalog=await (await fetch(CATALOG_URL,{cache:'no-store'})).json();}catch{catalog=[];}
  panel=document.createElement('div');panel.className='props-editor';
  panel.style.cssText='position:fixed;left:12px;bottom:76px;z-index:50;background:rgba(20,24,20,.88);color:#eee;font:12px/1.45 ui-monospace,monospace;padding:10px 12px;border-radius:8px;max-width:440px';
  panel.innerHTML='<b>Prop editor</b> <span data-status style="opacity:.7"></span><div data-selection></div><div style="margin-top:6px"><select data-catalog></select> <button data-add>Add</button> <button data-save>Save</button> <button data-map>Map</button></div><div style="opacity:.65;margin-top:4px">Alt+click prop: select · Alt+click ground: move · [ ] rotate · - = scale · Backspace: delete</div>';
  const list=panel.querySelector('[data-catalog]');for(const c of catalog)list.add(new Option(c.name,c.url));
  panel.querySelector('[data-add]').onclick=()=>list.value&&addFromCatalog(list.value);
  panel.querySelector('[data-save]').onclick=save;
  panel.querySelector('[data-map]').onclick=()=>{const w=window.open();w.document.write(`<img src="${map({x:camera.position.x,z:camera.position.z-6})}" style="width:100%">`);};
  window.gardenPropsMap=map;
  document.body.appendChild(panel);label();
  window.addEventListener('pointerdown',event=>{
   if(!event.altKey||event.target!==canvas)return;event.preventDefault();event.stopImmediatePropagation();
   const hit=pick(event);if(!hit)return;
   if(hit.entry)select(hit.entry,hit.index);
   else if(selected)edit(p=>{p.position=[+hit.ground.x.toFixed(3),+(hit.ground.y-.03).toFixed(3),+hit.ground.z.toFixed(3)];});
  },true);
  window.addEventListener('keydown',event=>{
   if(!selected||event.target.closest?.('input,textarea,select'))return;
   const actions={'[':p=>{p.rotationY=(p.rotationY||0)-Math.PI/12;},']':p=>{p.rotationY=(p.rotationY||0)+Math.PI/12;},'-':p=>{p.scale=Math.max(.2,(p.scale||1)-.05);},'=':p=>{p.scale=(p.scale||1)+.05;}};
   if(actions[event.key]){edit(actions[event.key]);event.stopImmediatePropagation();}
   else if(event.key==='Backspace'){removeSelected();event.preventDefault();event.stopImmediatePropagation();}
  },true);
 }
 return {root,ready,editing,
  blocks(position){return entries.some(e=>e.status==='loaded'&&e.def.placements.some(p=>Math.hypot(position.x-p.position[0],position.z-p.position[2])<(e.def.radius||.3)*(p.scale||1)+.25));},
  inspect:()=>entries.map(e=>({name:e.def.name,url:e.def.url,status:e.status,size:e.size,placements:e.def.placements.length,instanced:!!e.instanced,error:e.error}))};
};
