'use strict';
window.createPyramidGathering=function(T,parent,{stone,onChange=()=>{},reduced=false}){
 const hall=new T.Group();hall.name='The masked gathering';parent.add(hall);
 const cube=new T.BoxGeometry(1,1,1),plane=new T.PlaneGeometry(1,1),guests=[],pillars=[],flames=[],lights=[];
 const wall=stone.clone();wall.color.set(0x34383b);wall.roughness=.72;wall.emissive.set(0x24252b);wall.emissiveIntensity=.18;
 const ivory=stone.clone();ivory.color.set(0xa5a79f);ivory.roughness=.63;
 const dark=stone.clone();dark.color.set(0x181c20);dark.roughness=.52;
 const brass=new T.MeshStandardMaterial({color:0x917c51,metalness:.65,roughness:.38});
 const velvet=new T.MeshStandardMaterial({color:0x531e29,roughness:1,emissive:0x39101a,emissiveIntensity:.16});
 const wax=new T.MeshStandardMaterial({color:0xe1cfa8,roughness:.9});
 const fire=new T.MeshBasicMaterial({color:0xffd599,toneMapped:false});
 function box(w,h,d,x,y,z,material=wall){const mesh=new T.Mesh(cube,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.receiveShadow=true;hall.add(mesh);return mesh;}
 box(36,.12,36,0,-.05,0,dark);
 const tiles=new T.InstancedMesh(cube,ivory,162),dummy=new T.Object3D();let tile=0;
 for(let x=0;x<18;x++)for(let z=0;z<18;z++)if((x+z)%2===0){dummy.position.set(-17+x*2,.015,-17+z*2);dummy.scale.set(1.98,.018,1.98);dummy.updateMatrix();tiles.setMatrixAt(tile++,dummy.matrix);}
 tiles.receiveShadow=true;hall.add(tiles);
 box(36,7.6,.4,0,3.8,-18);box(.4,7.6,36,-18,3.8,0);box(.4,7.6,36,18,3.8,0);
 for(const s of [-1,1]){
  box(16.1,7.6,.4,s*9.95,3.8,18);
  box(.3,4.45,7.6,s*1.85,2.225,21.7);
  box(.10,.22,36,s*17.7,.25,0,brass);
 }
 box(3.8,3.15,.4,0,6.025,18);box(3.7,.25,7.6,0,4.5,21.7);
 box(36,.3,36,0,7.65,0,dark);
 box(3.3,.06,26,0,.045,12.5,velvet);
 const circle=new T.Mesh(new T.CircleGeometry(5.1,96),velvet);circle.rotation.x=-Math.PI/2;circle.position.y=.085;hall.add(circle);
 for(const radius of [4.5,4.95]){const ring=new T.Mesh(new T.RingGeometry(radius,radius+.04,96),brass);ring.rotation.x=-Math.PI/2;ring.position.y=.09;hall.add(ring);}
 for(const s of [-1,1])for(const z of [-12,-4,4,12]){
  const x=s*15.8;box(1.2,.2,1.2,x,.1,z,ivory);box(.65,7.3,.65,x,3.7,z,ivory);box(1.15,.23,1.15,x,7.25,z,brass);pillars.push({x,z});
  const drape=box(.16,5.8,3.6,s*17.65,4.1,z,velvet);drape.name='Burgundy wall hanging';
 }
 const candleGeo=new T.CylinderGeometry(.045,.048,.35,8),flameGeo=new T.SphereGeometry(1,8,6);
 function candle(x,y,z){const holder=new T.Mesh(candleGeo,wax);holder.position.set(x,y+.175,z);hall.add(holder);const flame=new T.Mesh(flameGeo,fire);flame.position.set(x,y+.40,z);flame.scale.set(.035,.085,.035);hall.add(flame);flames.push(flame);}
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2,x=Math.cos(a)*5.65,z=Math.sin(a)*5.65;if(z>0&&Math.abs(x)<2.6)continue;candle(x,.045,z);}
 for(const s of [-1,1])for(const z of [-13,-3,7,15]){box(.16,1.25,.16,s*12.7,.625,z,brass);box(1.15,.08,.24,s*12.7,1.28,z,brass);for(const dx of [-.45,0,.45])candle(s*12.7+dx,1.32,z);}
 const chandelier=new T.Mesh(new T.TorusGeometry(3.8,.065,8,64),brass);chandelier.rotation.x=Math.PI/2;chandelier.position.y=5.65;hall.add(chandelier);
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2;candle(Math.cos(a)*3.8,5.68,Math.sin(a)*3.8);}
 for(const x of [-2.65,2.65])for(const z of [-2.65,2.65])box(.035,1.85,.035,x,6.65,z,brass);
 for(const [x,z] of [[-7,5],[7,5],[-7,-9],[7,-9]]){const light=new T.PointLight(0xffd2a2,0,26,1.5);light.position.set(x,4.5,z);hall.add(light);lights.push(light);}
 const fill=new T.HemisphereLight(0xddd0bc,0x39333e,.7);hall.add(fill);
 let loaded=false,failed=false,inside=false;
 let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
 const materials=[];
 new T.TextureLoader().load('/assets/pyramid-masked-guests.png',atlas=>{
  atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=4;
  for(let i=0;i<6;i++){const map=atlas.clone();map.repeat.set(1/6,1);map.offset.set(i/6,0);map.needsUpdate=true;materials.push(new T.MeshBasicMaterial({map,alphaTest:.12,side:T.DoubleSide,color:0xc3b6a4,toneMapped:false}));}
  function guest(x,z,variant,h){const card=new T.Mesh(plane,materials[variant]);card.name='Masked guest image card';card.scale.set(h*(2120/6/742),h,1);card.position.set(x,h/2+.04,z);card.userData.variant=variant;hall.add(card);guests.push(card);}
  for(let ring=0;ring<2;ring++){
   const count=ring?30:20,radius=ring?13.3:8.5;
   for(let i=0;i<count;i++){const a=i/count*Math.PI*2,x=Math.sin(a)*radius,z=Math.cos(a)*radius;if(z>0&&Math.abs(x)<2.6)continue;guest(x,z,(i+ring*2)%6,1.85+(i%4)*.055);}
  }
  guest(0,-3.5,2,2.08);loaded=true;resolveReady();onChange();
 },undefined,()=>{failed=true;resolveReady();onChange();});
 return {
  ready,
  blocks(x,z){
   const room=Math.abs(x)<17.45&&Math.abs(z)<17.45,passage=Math.abs(x)<1.42&&z>=17&&z<25.1;
   if(!room&&!passage)return true;
   if(pillars.some(p=>Math.hypot(x-p.x,z-p.z)<.8))return true;
   return guests.some(card=>Math.hypot(x-card.position.x,z-card.position.z)<.38);
  },
  update(time,viewer){
   const x=viewer.position.x-parent.position.x,z=viewer.position.z-parent.position.z;
   inside=(Math.abs(x)<17.8&&Math.abs(z)<17.8)||(Math.abs(x)<1.7&&z>=17&&z<24.6);
   hall.visible=Math.hypot(x,z)<90;fill.intensity=inside?.7:0;lights.forEach(l=>{l.intensity=hall.visible?24:0;});
   if(hall.visible){for(const card of guests)card.rotation.y=Math.atan2(x-card.position.x,z-card.position.z);if(!reduced)flames.forEach((f,i)=>{f.scale.y=.085*(1+.10*Math.sin(time*2.5+i*2.3));});}
   if(inside)parent.parent.fog.density=.004;
  },
  inspect:()=>({inside,loaded,failed,guests:guests.length,variants:materials.length,representation:'alpha-cutout image cards',lights:lights.length})
 };
};
