'use strict';
window.showroomCollection=[
 {id:'01',name:'WAR / Witnesses Tee',chapter:'IV',price:'$78',tagline:'Front: the theatre. Back: the witnesses.',description:'A two-sided airbrush bootleg on heavyweight raw white cotton. Product photos are shown as flat media plates because no Break Thy Rule 3D garment scans were available.',images:['/products/war-tee-front.png','/products/war-tee-back.png'],imageAlt:'White tee with airbrushed soldiers and WAR text; reverse shows winged figures and watching eyes.'},
 {id:'02',name:'God Loves You Tee',chapter:'IV',price:'$64',tagline:'He has a great plan. Wear the proof.',description:'Raw white 6oz cotton with airbrushed dove-and-hearts artwork and inverted blue devotional type.',images:['/products/god-loves-you-tee.png'],imageAlt:'White tee with airbrushed doves, hearts, and GOD Loves YOU in blue serif.'},
 {id:'03',name:'Dance To Your Vibration Tee',chapter:'IV',price:'$64',tagline:'Tune in. The whole world is already listening.',description:'A frequency garment with two headphone figures, music-note trail, and soft-hand airbrush print.',images:['/products/dance-to-your-vibration-tee.png'],imageAlt:'White tee with two airbrushed headphone figures and trailing music notes.'},
 {id:'04',name:'Cross Tee',chapter:'I',price:'$64',tagline:'The mark that splits the world in two.',description:'Raw white cotton tee with a deep red ornate Gothic cross, shown from the product photographs available on the Break Thy Rule site.',images:['/products/000-6B49F5B5-3F27-4F32-B604-01645A7AE0CD.png','/products/001-6B49F5B5-3F27-4F32-B604-01645A7AE0CD.png'],imageAlt:'White tee back panel with a large red ornate Gothic cross.'},
 {id:'05',name:'Jesus Star Tee',chapter:'I',price:'$64',tagline:'The name above all names, certified.',description:'Raw white cotton with red cursive Jesus star graphic across the chest.',images:['/products/002-8EA2387E-42C7-4655-8F1F-EC4335658CEE.png'],imageAlt:'White tee with Jesus star in red cursive across the chest.'},
 {id:'06',name:'Blackmarket Baby Tee',chapter:'IV',price:'$64',tagline:'Everything you need. No questions asked.',description:'Cropped white tee with redacted ID collage, ghost database fragments, and AR-15 schematic artwork.',images:['/products/003-black-market-baby.png'],imageAlt:'White baby tee with blackmarket baby collage.'},
 {id:'07',name:'#Family Maxi Tank',chapter:'II',price:'$68',tagline:'The ones who were there before the agreement.',description:'White ribbed maxi tank with an airbrushed angel-and-flame embrace and #family script.',images:['/products/005-fm.png'],imageAlt:'White ribbed maxi tank with airbrushed angel and flame figures.'},
 {id:'08',name:'Divide & Conquer Study',chapter:'Archive',price:'View',tagline:'Available product photography from the current vault.',description:'A product-photo study plate imported from the public Break Thy Rule site. Name pending final merch copy.',images:['/products/006-IMG_0063.png','/products/007-IMG_0064.png','/products/008-IMG_0065.png'],imageAlt:'Break Thy Rule product photography study plate.'},
 {id:'09',name:'Chapter Artifact 0367',chapter:'Archive',price:'View',tagline:'A photographed artifact from the vault.',description:'Public product imagery adapted into the showroom rack while preserving it as photography rather than a 3D object.',images:['/products/018-IMG_0367.png','/products/019-IMG_0368.png','/products/020-IMG_0369.png'],imageAlt:'Break Thy Rule product photograph.'},
 {id:'10',name:'Chapter Artifact 0620',chapter:'Archive',price:'View',tagline:'A photographed artifact from the vault.',description:'Public product imagery adapted into the showroom rack while preserving it as photography rather than a 3D object.',images:['/products/023-IMG_0620.png','/products/026-IMG_0623.png','/products/027-IMG_0624.png'],imageAlt:'Break Thy Rule product photograph.'},
 {id:'11',name:'Chapter Artifact 1465',chapter:'Archive',price:'View',tagline:'A photographed artifact from the vault.',description:'Public product imagery adapted into the showroom rack while preserving it as photography rather than a 3D object.',images:['/products/042-IMG_1465.png','/products/043-IMG_1466.png','/products/044-IMG_1467.png'],imageAlt:'Break Thy Rule product photograph.'},
 {id:'12',name:'Chapter Artifact 1747',chapter:'Archive',price:'View',tagline:'A photographed artifact from the vault.',description:'Public product imagery adapted into the showroom rack while preserving it as photography rather than a 3D object.',images:['/products/055-IMG_1747.png','/products/056-IMG_1748.png','/products/057-IMG_1749.png'],imageAlt:'Break Thy Rule product photograph.'}
];

window.prepareCollectionModel=function(T,source){
 const box=new T.Box3().setFromObject(source),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
 source.position.sub(center);const root=new T.Group();root.add(source);root.userData.size=size.toArray();return root;
};

window.createCollectionRack=function(T,scene,chrome,rod){
 const rack=new T.Group();rack.name='Break Thy Rule collection rack';
 rack.position.set(-13.12,0,.5);rack.rotation.y=Math.PI/2;scene.add(rack);
 const columns=10,rows=Math.ceil(window.showroomCollection.length/columns),height=2.67,half=3.1,pitch=Math.min(.74,2.4/rows);
 for(let row=0;row<rows;row++)rod(rack,[-half,height-row*pitch,0],[half,height-row*pitch,0],.018);
 for(const x of [-half,-1.04,1.04,half]){
  const plate=new T.Mesh(new T.BoxGeometry(.085,.28,.018),chrome);plate.position.set(x,height-.12,-.61);rack.add(plate);
  rod(rack,[x,height,-.61],[x,height,0],.014);
  rod(rack,[x,height-.26,-.61],[x,height,-.025],.011);
 }
 const slots=window.showroomCollection.map((item,i)=>{
  const slot=new T.Group();slot.position.set(-2.95+(i%columns)*5.9/(columns-1),height-.37-Math.floor(i/columns)*pitch,0);rack.add(slot);
  const hook=new T.Group();slot.add(hook);
  const curve=new T.CatmullRomCurve3([[.035,.35,0],[.02,.39,0],[-.025,.37,0],[-.025,.325,0],[0,.30,0],[0,.265,0]].map(p=>new T.Vector3(...p)));
  hook.add(new T.Mesh(new T.TubeGeometry(curve,24,.0035,8,false),chrome));
  rod(hook,[-.18,.20,0],[.18,.20,0],.004);
  rod(hook,[0,.265,0],[-.18,.20,0],.0035);rod(hook,[0,.265,0],[.18,.20,0],.0035);
  const label=document.createElement('canvas');label.width=512;label.height=128;
  const ctx=label.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,512,128);ctx.fillStyle='#202020';ctx.font='24px Arial';ctx.fillText(item.id+' / '+item.name.toUpperCase(),20,49,472);ctx.font='19px Arial';ctx.fillStyle=item.estimated?'#995434':'#707070';ctx.fillText(item.estimated?'UNVERIFIED / PLAIN ESTIMATE':item.qualityRevision==='tailored-v6'?'TAILORED / GHOST STUDIO':item.qualityRevision?.startsWith('sewn-')?'SEWN COTTON / GHOST STUDIO':item.qualitySample?'SEWN PANEL / QUALITY SAMPLE':item.price+' / GHOST STUDIO',20,90,472);
  const labelTexture=new T.CanvasTexture(label);labelTexture.colorSpace=T.SRGBColorSpace;
  const labelMesh=new T.Mesh(new T.PlaneGeometry(.52,.12),new T.MeshBasicMaterial({map:labelTexture,toneMapped:false}));
  labelMesh.position.set(0,-.30,.065);labelMesh.userData.collectionIndex=i;slot.add(labelMesh);
  return slot;
 });
 return {rack,slots,place(index,model){
  const slot=slots[index];if(!slot||slot.userData.model)return null;
  const copy=model.clone(true),size=model.userData.size,scale=Math.min(.48/size[0],.46/size[1]);
  copy.scale.setScalar(scale);copy.position.set(0,0,.045);copy.rotation.y=.13;copy.traverse(n=>{if(n.isMesh){n.userData.collectionIndex=index;n.castShadow=true;n.receiveShadow=true;}});
  slot.add(copy);slot.userData.model=copy;return copy;
 }};
};
