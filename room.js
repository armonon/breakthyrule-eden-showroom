'use strict';
window.showroomAmphitheaterPosition={x:-11,z:11+12*.3048};
window.showroomArtwork=[
  {name:'Colour Collage',label:'COLLAGE',file:'/assets/colour-collage-0524.jpg',alt:'Vivid multicoloured collage of fantasy figures, angels and eye-bearing apples.',mount:'canvas',width:1.64,height:1.64*1152/1179,x:0,y:1.55},
  {name:'BREAKTHYRULE Codex',label:'CODEX',file:'/assets/og-default.jpg',width:1.34,height:.70,x:-3,y:2.12},
  {name:'House Sigil',label:'SIGIL',file:'/logo.png',width:.86,height:.90,x:-1.72,y:2.06,transparent:true},
  {name:'WAR / Witnesses',label:'WAR',file:'/products/war-tee-front.png',width:.72,height:.92,x:1.72,y:2.06},
  {name:'God Loves You',label:'GOD',file:'/products/god-loves-you-tee.png',width:.72,height:.92,x:3,y:2.06},
  {name:'Dance To Your Vibration',label:'VIBRATION',file:'/products/dance-to-your-vibration-tee.png',width:.72,height:.92,x:-3,y:.82},
  {name:'Cross Tee',label:'CROSS',file:'/products/000-6B49F5B5-3F27-4F32-B604-01645A7AE0CD.png',width:.72,height:.92,x:-1.72,y:.82},
  {name:'Blackmarket Baby',label:'BLACKMARKET',file:'/products/003-black-market-baby.png',width:.72,height:.92,x:1.72,y:.82},
  {name:'#Family Maxi Tank',label:'FAMILY',file:'/products/005-fm.png',width:.72,height:.92,x:3,y:.82}
];
window.showroomArtwork.push(...window.showroomCollection.slice(0,12).map((item,index)=>({
  name:'Vault Photo / '+item.id,label:item.id,lookbook:true,page:index+1,
  file:item.images[0],textureFile:item.images[0],
  width:.52,height:.68,x:(3.5-index%6)*.72-.18,y:2.42-Math.floor(index/6)*.78,z:3.992,rotationY:Math.PI
})));

window.showroomCameraView=function(aspect,view){
  const theater=window.showroomAmphitheaterPosition;
  const presets={
    spawn:{horizontalFov:78,position:[0,2.15,13],aim:[1.7,2.7,-7]},
    library:{horizontalFov:72,position:[1,2.5,1.2],aim:[2.7,1.4,-6.2]},
    librarian:{horizontalFov:63,position:[3.65,1.5,-2.8],aim:[7.5,1.15,-5.2]},
    amphitheater:{horizontalFov:74,position:[theater.x+9.5,6.3,theater.z+14],aim:[theater.x,1.35,theater.z+1.8]},
    approach:{horizontalFov:85,position:[-8.1,1.85,2.8],aim:[-13.12,1.3,.5]},
    wall:{horizontalFov:65,position:[-10,1.55,2.8],aim:[-10,1.45,-3]},
    lookbook:{horizontalFov:65,position:[-10,1.55,-1.8],aim:[-10,1.45,4]},
    film:{horizontalFov:50,position:[-9.446,1.94,.10],aim:[-6.296,1.72,.10]}
  };
  const preset={...(presets[view]||presets.spawn)};
  if(view==='spawn'&&aspect<.85){preset.horizontalFov=48;preset.position=[0,2.15,16];preset.aim=[1.6,3.1,-7];}
  if(view==='library'&&aspect<.85){preset.horizontalFov=58;preset.position=[2.9,2.7,-1.8];preset.aim=[3.2,2,-7.4];}
  if(view==='librarian'&&aspect<.85){preset.horizontalFov=46;preset.position=[4.6,1.35,-3.8];preset.aim=[6.3,.05,-5.3];}
  if(view==='amphitheater'&&aspect<.85){preset.horizontalFov=64;preset.position=[theater.x+4,6.5,theater.z+15];preset.aim=[theater.x,1.6,theater.z+1.7];}
  const fov=Math.max(42,Math.min(112,2*Math.atan(Math.tan(preset.horizontalFov*Math.PI/360)/Math.max(.3,aspect))*180/Math.PI));
  return {...preset,fov};
};

window.createWhiteRoom=function createWhiteRoom(T,scene,posterTextures,logoTexture){
  const room=new T.Group();room.name='Break Thy Rule garden pavilion';room.position.x=-10;scene.add(room);
  const plaster=new T.MeshStandardMaterial({color:0xffffff,roughness:1,emissive:0xffffff,emissiveIntensity:.5});
  const trim=new T.MeshStandardMaterial({color:0xe7e8e8,roughness:.85});
  function box(w,h,d,x,y,z,material=plaster){
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);mesh.receiveShadow=true;room.add(mesh);return mesh;
  }
  const artWall=box(7.6,3,.18,0,1.5,-3.1);artWall.name='Pavilion rear art wall';
  for(const x of [-3.8,3.8])for(const z of [-3.1,.5,4.1]){
    if(x===3.8&&z!==-3.1)continue;
    box(.42,3.6,.42,x,1.8,z);
    box(.66,.18,.66,x,3.52,z,trim);
    box(.62,.16,.62,x,.08,z,trim);
  }
  box(.48,.26,7.8,-3.8,3.7,.5,trim);
  box(8.15,.26,.5,0,3.7,-3.1,trim);
  box(7.6,.06,.026,0,.03,-3.025,trim);
  box(.026,.06,7.2,-3.725,.03,.5,trim);
  const floor=new T.Mesh(new T.PlaneGeometry(7.6,7.2),new T.MeshStandardMaterial({color:0xeeeeed,roughness:.9}));
  floor.rotation.x=-Math.PI/2;floor.position.z=.5;floor.receiveShadow=true;room.add(floor);

  if(logoTexture){
    const rug=new T.Group();rug.name='Break Thy Rule floor sigil';rug.position.set(1.03,0,-.9);
    const shadow=new T.Mesh(new T.PlaneGeometry(2.7,2.85),new T.MeshBasicMaterial({map:logoTexture,color:0x000000,transparent:true,opacity:.14,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.004;rug.add(shadow);
    const pile=new T.Mesh(new T.PlaneGeometry(2.65,2.8),new T.MeshStandardMaterial({map:logoTexture,transparent:true,roughness:1,alphaTest:.2,alphaToCoverage:true}));
    pile.rotation.x=-Math.PI/2;pile.position.y=.014;pile.receiveShadow=true;rug.add(pile);room.add(rug);
  }

  const shade=document.createElement('canvas');shade.width=8;shade.height=256;
  const ctx=shade.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'rgba(48,50,52,0)');gradient.addColorStop(1,'rgba(48,50,52,.13)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,8,256);
  const shadow=new T.Mesh(new T.PlaneGeometry(7.6,.35),new T.MeshBasicMaterial({map:new T.CanvasTexture(shade),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.003,-2.9);room.add(shadow);

  const posterMeshes=[];
  window.showroomArtwork.forEach((poster,i)=>{
    if(poster.lookbook)return;
    const mount=new T.Group();mount.position.set(poster.x,poster.y??1.94,poster.z??-2.992);
    mount.rotation.y=poster.rotationY||0;room.add(mount);
    const isCanvas=poster.mount==='canvas';
    if(isCanvas){
      const canvas=new T.Mesh(new T.BoxGeometry(poster.width,poster.height,.055),new T.MeshStandardMaterial({color:0xfafafa,roughness:1}));
      canvas.position.z=.0275;canvas.castShadow=true;canvas.receiveShadow=true;canvas.name=poster.name+' canvas stretcher';mount.add(canvas);
    }else{
    const frame=new T.Mesh(new T.BoxGeometry(poster.width+.035,poster.height+.035,.026),new T.MeshStandardMaterial({color:0x747574,metalness:.35,roughness:.48}));
    frame.position.z=-.026;frame.castShadow=true;mount.add(frame);
    const backing=new T.Mesh(new T.BoxGeometry(poster.width+.012,poster.height+.012,.008),new T.MeshBasicMaterial({color:0xffffff,toneMapped:false}));
    backing.position.z=-.006;mount.add(backing);
    }
    const texture=posterTextures[i];
    const mesh=new T.Mesh(new T.PlaneGeometry(poster.width,poster.height),new T.MeshBasicMaterial({map:texture,transparent:!!poster.transparent,toneMapped:false}));
    if(isCanvas)mesh.position.z=.056;
    mesh.userData.poster=poster;mesh.name=poster.name;mount.add(mesh);posterMeshes.push(mesh);
  });

  return {room,posterMeshes,blocks(point){return point.x>-14&&point.x<-6&&Math.abs(point.z+3.1)<.38;}};
};
