'use strict';
window.finishArchivePrints=function(gltf){
 const seen=new Set();gltf.scene.traverse(object=>{
  if(!object.isMesh)return;
  for(const material of(Array.isArray(object.material)?object.material:[object.material])){
   if(!material||seen.has(material)||!material.userData?.BTR_photoReference)continue;seen.add(material);
   const keyColors={'076-img_3178.png':'#dce73f','077-img_3180.png':'#dce73f','114-photoroom_20251017_091003.png':'#ec970f','093-img_6620.png':'#e4d4a0','005-fm.png':'#b5cbed'};const keyColor=new window.THREE.Color(keyColors[(material.userData.BTR_sourceName||'').toLowerCase()]||'#eeeae0');
   const mono=!!material.userData.BTR_monochromeInk,bounds=material.userData.BTR_crop||[0,0,1,1];material.transparent=true;material.depthWrite=false;
   material.onBeforeCompile=shader=>{
    shader.uniforms.archiveUVBounds={value:new window.THREE.Vector4(...bounds)};shader.uniforms.archiveFabricKey={value:keyColor};
    shader.fragmentShader='uniform vec4 archiveUVBounds; uniform vec3 archiveFabricKey;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
     float archiveHi=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
     float archiveLo=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
     float archiveChroma=archiveHi-archiveLo;
     float archiveKeyHigh=max(archiveFabricKey.r,max(archiveFabricKey.g,archiveFabricKey.b));
     float archiveDistance=length(diffuseColor.rgb/max(archiveHi,0.0001)-archiveFabricKey/max(archiveKeyHigh,0.0001));
     float archiveInk=max(1.0-smoothstep(0.055,0.24,archiveHi/max(archiveKeyHigh,0.1)),smoothstep(0.08,0.34,archiveDistance));
     vec2 archiveDist=min(vMapUv-archiveUVBounds.xy,archiveUVBounds.zw-vMapUv);
     float archiveEdge=smoothstep(0.0,0.012,min(archiveDist.x,archiveDist.y));
     diffuseColor.a*=archiveInk*archiveEdge;
     ${mono?'diffuseColor.rgb=vec3(0.018);':''}
    `);
   };
   material.customProgramCacheKey=()=> 'archive-print-key-1-'+Number(mono);material.needsUpdate=true;
  }
 });return gltf;
};

'use strict';
// Compressed web copies keep their source URLs usable and all editable originals intact.
(()=>{
 const variants={"/accessory-collection/models/apple-gloves-black.glb":"/fast-models/a108923f12eafa0c4fe70e25bcf4e2998fa35a27.glb","/accessory-collection/models/baseball-cap-v1.glb":"/fast-models/94b822fcaa7615eb2610bfb2a5ebd7fe14cb2f5e.glb","/accessory-collection/models/gloves-white.glb":"/fast-models/26fa7e1b0c0e789ae43f3c93bc2b38e9647b0899.glb","/accessory-collection/models/headband-black.glb":"/fast-models/6cdd4b8409c868fe293b18969cba7c92d181d084.glb","/accessory-collection/models/headband-white.glb":"/fast-models/59c74cc2f6f5b4421947f1bce290c64825576b6f.glb","/accessory-collection/models/mesh-trucker-v2.glb":"/fast-models/a3c9fe9fac9472a76e859cb0c6a785a8c23a2d1e.glb","/accessory-collection/models/skully-black.glb":"/fast-models/c8eff52e5ef56b019667a34f547850da5a363607.glb","/accessory-collection/models/skully-white.glb":"/fast-models/8b06173e9548d291d2c07db3cf724c61230ffb70.glb","/btr-belts/models/absolute-darkness.glb":"/fast-models/62660f75d63b18c37f3654a690193c3fad482710.glb","/btr-belts/models/blackout.glb":"/fast-models/401f379dbb93e874a81d3d544dc4301223e1789c.glb","/btr-belts/models/circle-of-anarchy.glb":"/fast-models/1548dba13de214cdcefed13af264689d0997643e.glb","/btr-belts/models/crimson-screamer.glb":"/fast-models/a167ec97df43328412df60b76aec02c5cb523947.glb","/btr-belts/models/crimson-sentinel.glb":"/fast-models/713286f962f1f77d8660162cf9a0377114d56424.glb","/btr-belts/models/equine-reverie.glb":"/fast-models/c5923458839e3b16665e271a3dca64242b16b5ac.glb","/btr-belts/models/ethereal-insight.glb":"/fast-models/e98d705a815aa0085ad65a34bb6d4a785fafde7f.glb","/btr-belts/models/gunho.glb":"/fast-models/67698a04f817ba470a55e8a564896b2672992f21.glb","/btr-belts/models/heatwave-rifle.glb":"/fast-models/46d605eaa60a6259942c1f298dae919506c91c27.glb","/btr-belts/models/lion-rampant.glb":"/fast-models/5203468364a211132041a1a69bbe061c3e220bb6.glb","/btr-belts/models/love-birds.glb":"/fast-models/66ba8f57231f92bf07af6a3a123d0792656f7fb1.glb","/btr-belts/models/magenta-ornate-cross.glb":"/fast-models/870df204d564e08f6fd28c3b2faeb846bf0cf30f.glb","/btr-belts/models/neon-mosaic-horse-and-pink-star.glb":"/fast-models/6419f4888752f12567b4e2f0dd71ccb32e800d04.glb","/btr-belts/models/neon-shamrock.glb":"/fast-models/9a460b9f344d33efc3a5b0f4b1a4716f4a7c1a57.glb","/btr-belts/models/obsidian-knight.glb":"/fast-models/0aee7e2724126ffddc966b9a963c573e40be509f.glb","/btr-belts/models/orange.glb":"/fast-models/3711c757552a6338e921de05ae4fea55795eae22.glb","/btr-belts/models/peaceful-flight.glb":"/fast-models/f7b7aac329fce839235a1b7b9d10178f42a0e338.glb","/btr-belts/models/prem.glb":"/fast-models/56e31d5418bbdb7a3ecc104a4d44795db303b3f9.glb","/btr-belts/models/sara-la-kali.glb":"/fast-models/627b37cc17f51f14ea78b187f40930d8e42c647d.glb","/btr-belts/models/shoota.glb":"/fast-models/ea79458433ac25682e252c5c6ade148c17a215e0.glb","/btr-belts/models/stickman.glb":"/fast-models/61cb38a4c79174bf2192378c0022ec1d5d98d391.glb","/core-collection/models/core-crewneck-black.glb":"/fast-models/c39396c02d1fce1c52068d04c0fa07734b602c4b.glb","/core-collection/models/core-crewneck-white.glb":"/fast-models/98b645b917758f19c0f0406f18f93c4ddd41b070.glb","/core-collection/models/core-hoodie-black.glb":"/fast-models/66f8149652b5b3d1277c021d994552c33d0c96c1.glb","/core-collection/models/core-hoodie-white.glb":"/fast-models/d8c74cc355442bfeace1e0ae5b29b75ce8d049c2.glb","/core-collection/models/core-tee-black.glb":"/fast-models/e0da60fdcea9f4e5ed652a6cdcab1415f02f2e76.glb","/core-collection/models/core-tee-white.glb":"/fast-models/32c38c8e19c41ae1f72351bb507eaf23c1141e54.glb","/graphic-models/models/007-tee.glb":"/fast-models/f4f8a08334bc7caf0ba21712b1af40c1201f2e39.glb","/graphic-models/models/adonai-tee.glb":"/fast-models/61e38f962b325e53e7399d321a8f663db64e305e.glb","/graphic-models/models/all-seeing-tee.glb":"/fast-models/32095ba6f0d632bbc378e3e91b94c11e4146584d.glb","/graphic-models/models/atlantis-parlour-tank.glb":"/fast-models/a2f7c77b32b8591ff16717548b68e0cfe2ea2a79.glb","/graphic-models/models/blackmarket-baby-tee.glb":"/fast-models/1b46c29c054b3daf29bd31a244334e6302ed458a.glb","/graphic-models/models/bulletproof-tee.glb":"/fast-models/d22e8c6e157f3e974b5dde2642f259422473909c.glb","/graphic-models/models/cave-painting-tee.glb":"/fast-models/adaabb5f179c50f9e83cf01d989c567d85fae523.glb","/graphic-models/models/cross-tee.glb":"/fast-models/7190b7a5aff74fe7c1a6f864eb2f32382b114ef4.glb","/graphic-models/models/dance-to-your-vibration-tee.glb":"/fast-models/1fd3c3e8ceffda9c55e95c040ce7c500c21d6fc3.glb","/graphic-models/models/divide-conquer-crewneck.glb":"/fast-models/0e297a867c93c00d3a95a1ae9da70393014531f2.glb","/graphic-models/models/divine-mother-tee.glb":"/fast-models/4113586c151dd8dc75d4c46d1aa60cd574075a2b.glb","/graphic-models/models/eternal-crewneck.glb":"/fast-models/811df11a60b68b56558232a96c18dde008e3ab30.glb","/graphic-models/models/eternal-thermal.glb":"/fast-models/462ddc0c96b5dae04b4c27edb288bf995a2350a7.glb","/graphic-models/models/every-kiss-tank.glb":"/fast-models/18c85d6a54161f8f4251ada75ccaff6b204d0f31.glb","/graphic-models/models/family-tank.glb":"/fast-models/17ae7dd82bd516db90aba7ec3a89bba512d8e78a.glb","/graphic-models/models/god-loves-you-tee.glb":"/fast-models/5ffc9f2b37ae33036654c1b8af0e9ab0b1db902e.glb","/graphic-models/models/god-loves-you-v2-tee.glb":"/fast-models/ee75fd85f2fb58cd9aca14f65c06a33882ef169c.glb","/graphic-models/models/gods-chariot-crop.glb":"/fast-models/be6bb4e5fd7c74974a321fecc3bec71dc87aa2a5.glb","/graphic-models/models/green-eye-crewneck.glb":"/fast-models/a626b4b62acaa11e04122d50d599edacb73368a4.glb","/graphic-models/models/hermetic-hoodie.glb":"/fast-models/d2c1774717f0a7cd9160134fde1b2f10010e1008.glb","/graphic-models/models/illuminati-crewneck.glb":"/fast-models/9b6d2aad2fd4187c978665ca37887cc4a912cf04.glb","/graphic-models/models/initiates-coach-jacket.glb":"/fast-models/61396c36df8f8c11902917a8408e88fc3da2439d.glb","/graphic-models/models/jesus-companion-tee.glb":"/fast-models/78fe268db4a2c0055d00052d2e6c46dd6a4e2401.glb","/graphic-models/models/jesus-health-insurance-hoodie.glb":"/fast-models/769556c2ea801251e6e7d729e5485343ad65b455.glb","/graphic-models/models/jesus-star-tee.glb":"/fast-models/6e94b871f26b3282b84a5a49f67a384d230d7f3b.glb","/graphic-models/models/kiss-rosary-tee.glb":"/fast-models/2898febf853cbef0da91782e06435921eec7f143.glb","/graphic-models/models/oh-allah-tee.glb":"/fast-models/529b30e767fb8d96787d0ea4cdf7f0892b6698a5.glb","/graphic-models/models/over-the-hill-tee.glb":"/fast-models/2b583d0afa528a8fdd22636d3cc47b465e963b96.glb","/graphic-models/models/pari-tee.glb":"/fast-models/1fb9865108fa22fd0a6d8853455a630bbc24a975.glb","/graphic-models/models/project-star-gate-tee.glb":"/fast-models/5c0036fbd5d6dc5ed4ec5032672b3551bd0fb5e8.glb","/graphic-models/models/rosary-heart-tank.glb":"/fast-models/363b72065e14e6893bd08300263e3d9248ee83af.glb","/graphic-models/models/sacred-masters-tee.glb":"/fast-models/5c32f68e2d7e89a0a523396592eb700aa2effd6e.glb","/graphic-models/models/spiritual-warfare-tank.glb":"/fast-models/cd0ade7a0eb8b77c77a17851d72cd0ab77a88d98.glb","/graphic-models/models/veil-crewneck.glb":"/fast-models/14ed809d0f12304c031eb2836b5126bd80912a81.glb","/graphic-models/models/wanted-jesus-tee.glb":"/fast-models/6d88664d60f33db415d221a844759a732815b1af.glb","/graphic-models/models/war-witnesses-tee.glb":"/fast-models/37a9fac48b31c7476e12b5d072aaa949ecaa1323.glb","/graphic-models/models/warlord-longsleeve.glb":"/fast-models/de684bca9987948a3d5d0e8d64eaf5dea638f823.glb","/models/blanks/crewneck.glb":"/fast-models/e17260864758aeba883963893b336388c1d5551a.glb","/models/blanks/hoodie.glb":"/fast-models/5470bd9a567ff6e289deca19f1a2ad9e9d3c75de.glb","/models/blanks/pants.glb":"/fast-models/7d867b8dfb9d8b83f8d06de4b34b375e1550296d.glb","/models/blanks/tee.glb":"/fast-models/76657fa7a2d8438f1f8cdeb1231fb7da84e303d5.glb","/pendant-collection/models/absolute-darkness-discovery.glb":"/fast-models/f269d92cd27b64bceffa0d75f104692cb5381b44.glb","/pendant-collection/models/blackout-discovery.glb":"/fast-models/936ed2f5ce539fd4a44584c4eb823321b5dbac79.glb","/pendant-collection/models/circle-of-anarchy-discovery.glb":"/fast-models/827d6abcdd9b31665308b54d22dbdd7b80a60734.glb","/pendant-collection/models/crimson-screamer-discovery.glb":"/fast-models/b1075879ec25880cbf2423cbf54727844fcca21e.glb","/pendant-collection/models/crimson-sentinel-discovery.glb":"/fast-models/8af1840cddccf235c2b1460dcfa1e41c41b64aba.glb","/pendant-collection/models/equine-reverie-discovery.glb":"/fast-models/b72dac405aadcaae9f03fa2d086a2b5e78cf0594.glb","/pendant-collection/models/ethereal-insight-discovery.glb":"/fast-models/fc3c17f69a48a3d38359a1b9e6631e84e8945d5d.glb","/pendant-collection/models/gunho-discovery.glb":"/fast-models/e08da03f98db5e67d593cf60394fd366b8b439a0.glb","/pendant-collection/models/heatwave-rifle-discovery.glb":"/fast-models/0d04a3cda87d8dffc62c86690bf714a8c8302e33.glb","/pendant-collection/models/lion-rampant-discovery.glb":"/fast-models/9d4444765ac808a7d6058a436a26e2f5527ba5a3.glb","/pendant-collection/models/love-birds-discovery.glb":"/fast-models/fef9a26b0b0d1e3f9d6fe80891e23ec2c127db6c.glb","/pendant-collection/models/magenta-ornate-cross-discovery.glb":"/fast-models/bbf1b2b7a71bf7f7879ab494f014e984b7461c45.glb","/pendant-collection/models/neon-mosaic-horse-and-pink-star-discovery.glb":"/fast-models/13179cb9b2ba3ff391d98b286fec3fbe9baa60bb.glb","/pendant-collection/models/neon-shamrock-discovery.glb":"/fast-models/70420c7df6c9d3dcd937b33de1b37ba4d9e8450d.glb","/pendant-collection/models/obsidian-knight-discovery.glb":"/fast-models/418c0ecac00d96252227df5f9cd6cffe54213a40.glb","/pendant-collection/models/orange-discovery.glb":"/fast-models/86616826bf427a358a19c9b6bc7aa7ee7eddd07e.glb","/pendant-collection/models/peaceful-flight-discovery.glb":"/fast-models/7867337a18112896c664f8c46f82c53821c8059f.glb","/pendant-collection/models/prem-discovery.glb":"/fast-models/6fb8e55c391ab928e2a37b5104cc7f6baa95fea9.glb","/pendant-collection/models/sara-la-kali-discovery.glb":"/fast-models/660bdfba1d885ec8d1c3f2902c193818753434e2.glb","/pendant-collection/models/shoota-discovery.glb":"/fast-models/8c07e6985da73897bbd54b4d350522f94d1a862f.glb","/pendant-collection/models/stickman-discovery.glb":"/fast-models/611b63d68a8327edd2088c4b7fcfbd2d85402884.glb"};
 const compact=matchMedia('(max-width:700px), (pointer:coarse)').matches;
 const maxBytes=(compact?24:64)*1024*1024, byteCache=new Map(),flights=new Map();let cachedBytes=0,fetching=0,decoding=0;
 const fetchQueue=[],decodeQueue=[];
 function resolve(url){const u=new URL(url,location.href);return u.origin===location.origin&&variants[u.pathname]?new URL(variants[u.pathname],location.href).href:u.href;}
 function pumpFetch(){while(fetching<(compact?2:4)&&fetchQueue.length){fetchQueue.sort((a,b)=>b.rank-a.rank);const task=fetchQueue.shift();fetching++;task.run().then(task.resolve,task.reject).finally(()=>{fetching--;pumpFetch();});}}
 function scheduleFetch(run,priority){return new Promise((resolve,reject)=>{fetchQueue.push({run,resolve,reject,rank:priority==='high'?2:priority==='low'?0:1});pumpFetch();});}
 function pumpDecode(){while(decoding<(compact?1:2)&&decodeQueue.length){const task=decodeQueue.shift();decoding++;task.run().then(task.resolve,task.reject).finally(()=>{decoding--;pumpDecode();});}}
 function scheduleDecode(run){return new Promise((resolve,reject)=>{decodeQueue.push({run,resolve,reject});pumpDecode();});}
 function remember(key,data){if(data.byteLength>maxBytes)return;byteCache.set(key,data);cachedBytes+=data.byteLength;while(cachedBytes>maxBytes){const oldest=byteCache.keys().next().value;cachedBytes-=byteCache.get(oldest).byteLength;byteCache.delete(oldest);}}
 async function bytes(url,priority){
  if(byteCache.has(url)){const data=byteCache.get(url);byteCache.delete(url);byteCache.set(url,data);return data;}
  if(flights.has(url))return flights.get(url);
  const promise=scheduleFetch(async()=>{const response=await fetch(url,{signal:AbortSignal.timeout(45000),priority});if(!response.ok)throw Error('Model unavailable');const data=await response.arrayBuffer();remember(url,data);return data;},priority);
  flights.set(url,promise);try{return await promise;}finally{flights.delete(url);}
 }
 window.showroomLoadProductModel=async function(url,options={}){
  const resolved=resolve(url),priority=options.priority||(document.body?.dataset.page==='product'?'high':'auto');
  const data=await bytes(resolved,priority);
  return scheduleDecode(async()=>{const model=await new window.ShowroomGLTFLoader().parseAsync(data.slice(0),new URL('.',resolved).href);return window.finishArchivePrints(model);});
 };
 window.showroomResolveModel=resolve;
 // Soft frontal fill reveals black fabric; two rear lights separate its edges from the same backdrop.
 window.showroomProductLights=function(scene){
  const T=window.THREE;for(const light of scene.children.filter(child=>child.isLight))scene.remove(light);
  scene.add(new T.HemisphereLight(0xffffff,0x9ca6b0,2.4));
  for(const [color,power,position] of [[0xffffff,4.2,[-3,5,6]],[0xf1f5ff,2.4,[4,2,5]],[0xe6edf6,3.5,[-4,3,-5]],[0xffffff,3.0,[4,2,-4]]]){const light=new T.DirectionalLight(color,power);light.position.set(...position);scene.add(light);}
 };
})();

window.showroomAssets={
 // World textures use <=1024 px WebP copies of product photos and the logo (tools/asset-pipeline/optimize-images.mjs);
 // the full-size WebP files stay for the shop and the full-size poster view.
 web(url){
  const gallery=/^\/assets\/museum-gallery\/([^/?]+\.webp)$/.exec(url||'');if(gallery)return '/assets/museum-gallery/web/'+gallery[1]; // 512 px wall copies
  const match=/^\/(?:products\/)?([^/?]+)\.(?:png|jpe?g|webp)(\?.*)?$/i.exec(url||'');
  return match&&(url.startsWith('/products/')||url.startsWith('/logo.png'))?'/products/web/'+match[1].toLowerCase()+'.webp':url;
 },
 model(url,options){return window.showroomLoadProductModel(url,options);},
 texture(T,url,onChange=()=>{}){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
  const context=canvas.getContext('2d');context.fillStyle='#c9cdca';context.fillRect(0,0,32,32);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  let attempts=0;const light=this.web(url);
  async function load(){
   try{
    // The WebP copy first, the original if it is missing.
    let response=await fetch(attempts?url:light,{signal:AbortSignal.timeout(12000)});
    if(!response.ok&&!attempts&&light!==url)response=await fetch(url,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Texture unavailable');
    const blob=await response.blob(),objectURL=URL.createObjectURL(blob),img=new Image();
    // dispose() frees the 32 px placeholder on the GPU: WebGL2 texture storage cannot change size in place.
    try{img.src=objectURL;await img.decode();texture.image=img;texture.dispose();texture.needsUpdate=true;onChange();}
    finally{URL.revokeObjectURL(objectURL);}
   }catch{if(++attempts<2)setTimeout(load,4000);}
  }
  load();return texture;
 }
};

// Let every product renderer sleep while the full-screen Codex covers the page.
// One observer publishes changes; each viewer keeps its own viewport visibility.
(() => {
 let covered=false,cover=null;
 window.showroomPageActive=()=>!document.hidden&&!covered;
 const update=()=>{const next=!!cover&&!cover.hidden;if(next===covered)return;covered=next;document.dispatchEvent(new Event('btr:page-visibility'));};
 const bind=()=>{const next=document.getElementById('btr-cover');if(next&&next!==cover){cover=next;new MutationObserver(update).observe(cover,{attributes:true,attributeFilter:['hidden']});}update();};
 bind();if(document.readyState!=='complete')document.addEventListener('DOMContentLoaded',bind,{once:true});
})();
