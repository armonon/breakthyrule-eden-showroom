'use strict';
window.createGardenLibrary=function(T,scene,onChange){
 const library=new T.Group();library.name='Open library beside the apple tree';scene.add(library);
 const pickables=[],jobs=[],colliders=[];
 const wood=new T.MeshStandardMaterial({color:0xb19b73,roughness:.83});
 const green=new T.MeshStandardMaterial({color:0x244e43,roughness:.65,metalness:.15});
 const pages=new T.MeshStandardMaterial({color:0xf4edda,roughness:1});
 const stone=new T.MeshStandardMaterial({color:0xc3c7b6,roughness:.94});
 function box(w,h,d,x,y,z,material,parent=library){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 const deck=new T.Mesh(new T.CylinderGeometry(4.5,4.6,.10,64),stone);deck.position.set(3.1,-.02,-5.7);deck.receiveShadow=true;library.add(deck);
 // Shelves face the path, with every real cover displayed face-out.
 const shelves=new T.Group();shelves.name='Founding library shelf';shelves.position.set(3.6,0,-7.4);library.add(shelves);
 box(3.9,3.12,.07,0,1.6,-.24,green,shelves);
 for(const x of [-1.98,-.66,.66,1.98])box(.07,3.3,.58,x,1.65,0,green,shelves);
 for(const y of [.20,1.19,2.18,3.20])box(4.04,.065,.62,0,y,0,wood,shelves);
 box(4.18,.09,.78,0,3.32,-.04,green,shelves);
 colliders.push({minX:1.35,maxX:5.85,minZ:-8.05,maxZ:-6.85});
 const textureLoader=new T.TextureLoader();
 function bookTexture(book){let tex;jobs.push(new Promise(resolve=>{tex=textureLoader.load(book.cover,()=>{onChange();resolve();},undefined,()=>{const image=new Image();image.onload=()=>{tex.image=image;tex.needsUpdate=true;onChange();resolve();};image.src=window.communityLibrary.cover(book.title);});}));tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;}
 function volume(book,index,parent,x,y,z,width=.55,height=.80){
  const group=new T.Group();group.position.set(x,y,z);parent.add(group);
  const map=bookTexture(book);
  const cover=new T.MeshStandardMaterial({map,transparent:true,roughness:.78,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.32});
  const binding=new T.MeshStandardMaterial({color:[0x29312b,0x672f2c,0x7f7045,0x354c63][index%4],roughness:.85});
  box(width,height,.105,0,0,0,binding,group);
  box(width-.026,height-.026,.087,.006,0,.007,pages,group);
  const paperFace=new T.Mesh(new T.PlaneGeometry(width,height),pages);paperFace.position.z=.063;group.add(paperFace);
  const face=new T.Mesh(new T.PlaneGeometry(width,height),cover);face.position.z=.065;face.userData.bookIndex=index;face.name=book.title;group.add(face);pickables.push(face);
  const hit=box(width,height,.02,0,0,-.058,binding,group);hit.userData.bookIndex=index;pickables.push(hit);
  return group;
 }
 let page=0,contents=new T.Group();shelves.add(contents);
 function disposeContents(group){
  const oldNodes=new Set(),materials=new Set(),textures=new Set();
  group.traverse(node=>{oldNodes.add(node);if(node.geometry)node.geometry.dispose();if(node.material&&!([wood,green,pages,stone].includes(node.material))){materials.add(node.material);if(node.material.map)textures.add(node.material.map);}});
  for(let i=pickables.length-1;i>=0;i--)if(oldNodes.has(pickables[i]))pickables.splice(i,1);
  materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());group.clear();
 }
 function plaque(text,parent,x,y,z,width=1.15,height=.145,action={}){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=160;
  const c=canvas.getContext('2d');c.fillStyle='#eceee3';c.fillRect(0,0,1024,160);c.fillStyle='#23372d';c.textAlign='center';c.textBaseline='middle';c.font='38px Arial';c.fillText(text,512,80,960);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const mesh=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map}));mesh.position.set(x,y,z);mesh.userData=action;parent.add(mesh);if(Object.keys(action).length)pickables.push(mesh);return mesh;
 }
 function setPage(next){
  const uploads=window.showroomBooks.filter(book=>book.uploaded);page=Math.max(0,Math.min(Math.max(1,uploads.length)-1,next));
  disposeContents(contents);
  const displayed=[...window.communityLibrary.founding.slice(0,8),uploads[page]];
  displayed.forEach((book,slot)=>{
  const column=slot%3,row=2-Math.floor(slot/3),x=(column-1)*1.32,y=.20+row*.99;
  if(!book){plaque('+',contents,x,y+.43,.20,.6,.6,{uploadPDF:true});plaque('COMMUNITY PDFs',contents,x,y-.035,.325);return;}
  const index=window.showroomBooks.findIndex(item=>item.url===book.url);
  volume(book,index,contents,x,y+.44,.15);
  for(let i=0;i<3;i++)box(.065,.48+i*.07,.20,x-.49+i*.075,y+.27+i*.035,-.07,[green,wood,pages][i],contents);
  const label=document.createElement('canvas');label.width=768;label.height=96;
  const ctx=label.getContext('2d');ctx.fillStyle='#eceee3';ctx.fillRect(0,0,768,96);ctx.fillStyle='#23372d';ctx.font='24px Arial';
  const words=(book.uploaded?'COMMUNITY / '+book.title:book.title).split(' ');let line='',lines=[];for(const word of words){if(ctx.measureText(line+' '+word).width>710){lines.push(line);line=word;}else line+=(line?' ':'')+word;}lines.push(line);
  lines.slice(0,2).forEach((text,i)=>ctx.fillText(text,22,lines.length>1?34+i*31:55));
  const texture=new T.CanvasTexture(label);texture.colorSpace=T.SRGBColorSpace;
  const labelMesh=new T.Mesh(new T.PlaneGeometry(1.15,.145),new T.MeshBasicMaterial({map:texture}));labelMesh.position.set(x,y-.035,.325);labelMesh.userData.bookIndex=index;contents.add(labelMesh);pickables.push(labelMesh);
  });onChange();
 }
 setPage(0);
 const sign=document.createElement('canvas');sign.width=1024;sign.height=160;
 const ctx=sign.getContext('2d');ctx.fillStyle='#e9ecdf';ctx.fillRect(0,0,1024,160);ctx.fillStyle='#24483a';ctx.textAlign='center';ctx.font='42px Georgia';ctx.fillText('THE OPEN LIBRARY',512,67);ctx.font='20px Arial';ctx.fillText('BREAKTHYRULE / THE FOUNDING SHELF',512,113);
 const signTexture=new T.CanvasTexture(sign);signTexture.colorSpace=T.SRGBColorSpace;
 const signMesh=new T.Mesh(new T.PlaneGeometry(3.15,.49),new T.MeshStandardMaterial({map:signTexture,roughness:1}));signMesh.position.set(0,3.67,.02);shelves.add(signMesh);
 for(const x of [-1.3,1.3])box(.035,.6,.035,x,3.55,-.03,green,shelves);

 const gardenSign=new T.Group();gardenSign.name='where is god ?';gardenSign.position.set(8.4,0,-15.6);library.add(gardenSign);
 const signWidth=2.2,signHeight=.72;
 const timber=document.createElement('canvas');timber.width=1024;timber.height=336;
 const grain=timber.getContext('2d');grain.fillStyle='#b59366';grain.fillRect(0,0,1024,336);
 let grainSeed=73;const woodRandom=()=>{grainSeed=(grainSeed*1664525+1013904223)>>>0;return grainSeed/4294967296;};
 for(let y=0;y<336;y++){
  grain.strokeStyle=woodRandom()>.5?'rgba(62,37,19,.12)':'rgba(239,211,162,.16)';grain.lineWidth=woodRandom()*1.4+.3;grain.beginPath();
  for(let x=0;x<=1024;x+=24){const dy=y+Math.sin(x*.008+y*.06)*2.4+Math.sin(x*.019+y*.03)*1.3;if(x===0)grain.moveTo(x,dy);else grain.lineTo(x,dy);}grain.stroke();
 }
 for(let i=1;i<15;i++){grain.strokeStyle='rgba(74,43,20,.16)';grain.lineWidth=.8;grain.beginPath();grain.ellipse(838,94,i*4.5,i*1.25,-.04,0,Math.PI*2);grain.stroke();}
 const timberTexture=new T.CanvasTexture(timber);timberTexture.colorSpace=T.SRGBColorSpace;timberTexture.anisotropy=8;
 const timberBump=timberTexture.clone();timberBump.colorSpace=T.NoColorSpace;
 const signWood=new T.MeshStandardMaterial({map:timberTexture,bumpMap:timberBump,bumpScale:.012,roughness:.94});
 const postTexture=timberTexture.clone();postTexture.center.set(.5,.5);postTexture.rotation=Math.PI/2;
 const postBump=postTexture.clone();postBump.colorSpace=T.NoColorSpace;
 const postWood=new T.MeshStandardMaterial({map:postTexture,bumpMap:postBump,bumpScale:.012,roughness:.94});
 for(const x of [-.78,.78])box(.105,1.95,.105,x,.975,0,postWood,gardenSign);
 box(signWidth,signHeight,.13,0,1.6,0,signWood,gardenSign);
 const question=document.createElement('canvas');question.width=2048;question.height=672;
 const ink=question.getContext('2d');ink.drawImage(timber,0,0,2048,672);
 ink.font='190px Georgia';ink.textAlign='center';ink.textBaseline='middle';ink.fillStyle='#ddc49b';ink.fillText('where is god ?',1025,339);
 ink.fillStyle='#302316';ink.fillText('where is god ?',1024,336);
 const questionTexture=new T.CanvasTexture(question);questionTexture.colorSpace=T.SRGBColorSpace;questionTexture.anisotropy=8;
 const questionMaterial=new T.MeshStandardMaterial({map:questionTexture,bumpMap:timberBump,bumpScale:.012,roughness:.94});
 // Separate front and back faces keep the lettering readable from either direction.
 for(const side of [1,-1]){const face=new T.Mesh(new T.PlaneGeometry(signWidth-.04,signHeight-.04),questionMaterial);face.position.set(0,1.6,side*.066);face.rotation.y=side===1?0:Math.PI;face.name='Garden question lettering';gardenSign.add(face);}
 const nailMaterial=new T.MeshStandardMaterial({color:0x443a30,roughness:.8,metalness:.55});
 for(const side of [-1,1])for(const x of [-.94,.94])for(const y of [1.35,1.85]){const nail=new T.Mesh(new T.CylinderGeometry(.015,.015,.012,8),nailMaterial);nail.rotation.x=Math.PI/2;nail.position.set(x,y,side*.075);gardenSign.add(nail);}
 colliders.push({minX:gardenSign.position.x-signWidth/2-.3,maxX:gardenSign.position.x+signWidth/2+.3,minZ:gardenSign.position.z-.3,maxZ:gardenSign.position.z+.3});

 // Slatted table and two benches leave an aisle to reach the founding shelf.
 for(let i=0;i<7;i++)box(2.15,.065,.145,3.45,.82,-4.0+(i-3)*.16,wood);
 for(const x of [2.65,4.25])for(const z of [-4.38,-3.62])box(.075,.78,.075,x,.39,z,green);
 colliders.push({minX:2.05,maxX:4.85,minZ:-4.9,maxZ:-3.1});
 function bench(x,z,rotation){const group=new T.Group();group.position.set(x,0,z);group.rotation.y=rotation;library.add(group);for(let i=0;i<4;i++)box(2.05,.055,.11,0,.49,(i-1.5)*.12,wood,group);for(let i=0;i<3;i++)box(2.05,.12,.055,0,.79+i*.145,-.28,wood,group);for(const end of [-.8,.8]){box(.055,.5,.46,end,.25,0,green,group);box(.05,.71,.05,end,.71,-.3,green,group);}return group;}
 bench(.1,-4.5,Math.PI/2);bench(6.3,-5.3,-Math.PI/2);
 colliders.push({minX:-.55,maxX:.75,minZ:-5.9,maxZ:-3.1},{minX:5.65,maxX:6.95,minZ:-6.7,maxZ:-3.9});
 const stand=new T.Group();stand.name='Shared reading stand';stand.position.set(3.45,1.28,-4);stand.rotation.x=-.35;library.add(stand);
 box(.96,.08,.20,3.45,.86,-3.8,wood);
 box(.92,.83,.055,0,0,0,wood,stand);box(.96,.055,.16,0,-.42,.055,green,stand);
 const readingContents=new T.Group();stand.add(readingContents);
 plaque('ON THE STAND',library,3.45,.72,-3.47,1.4,.18);

 let sharedState={likes:[],reading:null};
 function setShared(data){
  sharedState=data;disposeContents(readingContents);
  const reading=data.reading?.book;
  if(reading){const index=window.showroomBooks.findIndex(book=>book.url===reading.url);if(index>=0){volume(window.showroomBooks[index],index,readingContents,0,0,.10,.58,.78);stand.userData.bookTitle=reading.title;}}
  else{plaque('No book selected',readingContents,0,0,.035,.8,.20);stand.userData.bookTitle='';}
  onChange();
 }
 setShared(window.communityLibrary.getState());
 return {pickables,ready:Promise.allSettled(jobs),setPage,setShared,getPage:()=>page,getPageCount:()=>Math.max(1,window.showroomBooks.filter(book=>book.uploaded).length),marker:new T.Vector3(5.5,.85,-7.05),inspect:()=>({uploadPage:page,reading:stand.userData.bookTitle,likes:sharedState.likes.length}),blocks(position){return colliders.some(c=>position.x>c.minX&&position.x<c.maxX&&position.z>c.minZ&&position.z<c.maxZ);}};
};
