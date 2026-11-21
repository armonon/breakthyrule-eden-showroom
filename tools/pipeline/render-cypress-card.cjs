// Render the CC0 Poly Haven fir sapling (https://polyhaven.com/a/fir_sapling) into top views of its three crowns, as
// RGBA PNGs, for the cypress foliage card. Then: python3 tools/pipeline/compose-cypress-card.py <dir> out.webp
//
//   1. Download the 1k glTF and its textures into a folder and serve it: python3 -m http.server 8799
//   2. Serve this repo: node server/eden-server.mjs   (for three.js and the glTF loader)
//   3. node tools/pipeline/render-cypress-card.cjs     (needs Playwright; writes fir-fir_sapling_{a,b,c}.png here)
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:600,height:400}});p.setDefaultTimeout(600000);
 p.on('pageerror',e=>console.log('[pageerror]',e.message));p.on('console',m=>console.log('[c]',m.text().slice(0,200)));
 await p.goto('http://127.0.0.1:8799/');
 await p.addScriptTag({url:'http://127.0.0.1:8777/assets/three.min.js'});await p.addScriptTag({url:'http://127.0.0.1:8777/assets/gltf-loader.js'});
 const shots=await p.evaluate(async()=>{
  const T=THREE,gltf=await new window.ShowroomGLTFLoader().loadAsync('http://127.0.0.1:8799/fir_sapling_1k.gltf');
  const info=[];gltf.scene.traverse(o=>{if(o.isMesh)info.push([o.name,o.parent?.name,o.geometry.index?o.geometry.index.count/3:0]);});
  const scene=new T.Scene();scene.add(new T.HemisphereLight(0xffffff,0x3a4a30,2.2));const d=new T.DirectionalLight(0xffffff,1.4);d.position.set(.3,1,.4);scene.add(d);
  scene.add(gltf.scene);gltf.scene.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(gltf.scene),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3());
  const r=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});r.setClearColor(0x000000,0);r.outputColorSpace=T.SRGBColorSpace;
  const out=[];
  // One top view per sapling, framed tightly on its own crown.
  for(const name of ['fir_sapling_a','fir_sapling_b','fir_sapling_c']){
   const node=gltf.scene.getObjectByName(name);gltf.scene.traverse(o=>{if(o.isMesh)o.visible=false;});node.traverse(o=>{if(o.isMesh)o.visible=true;});
   const bb=new T.Box3().setFromObject(node),sz=bb.getSize(new T.Vector3()),cc=bb.getCenter(new T.Vector3()),span=Math.max(sz.x,sz.z)*1.02;
   const cam=new T.OrthographicCamera(-span/2,span/2,span/2,-span/2,.01,100);cam.position.set(cc.x,bb.max.y+5,cc.z);cam.up.set(0,0,-1);cam.lookAt(cc.x,cc.y,cc.z);
   r.setSize(1024,1024,false);r.render(scene,cam);out.push([name,r.domElement.toDataURL('image/png')]);
  }
  return {info,size:size.toArray(),out};
 });
 console.log(JSON.stringify(shots.info.slice(0,10)),shots.size);
 for(const [name,url] of shots.out)fs.writeFileSync(`fir-${name}.png`,Buffer.from(url.split(',')[1],'base64'));
 await b.close();
})();
