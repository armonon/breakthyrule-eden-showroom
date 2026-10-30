'use strict';
window.createAmphitheater=function(T,scene,{reduced=false}={}){
 const origin=window.showroomAmphitheaterPosition;
 const root=new T.Group();root.name='Eden amphitheater';root.position.set(origin.x,0,origin.z);scene.add(root);
 const picks=[],lamps=[];
 const stone=new T.MeshStandardMaterial({color:0xc6ceca,roughness:.91});
 const wood=new T.MeshStandardMaterial({color:0x8a6041,roughness:.72});
 const dark=new T.MeshStandardMaterial({color:0x172522,roughness:.56,metalness:.22});
 const cone=new T.MeshStandardMaterial({color:0x333c3d,roughness:.87});
 const brass=new T.MeshStandardMaterial({color:0xcab477,roughness:.38,metalness:.58});
 const stoneMap=new T.TextureLoader().load('/assets/eden-stone-color.jpg');stoneMap.colorSpace=T.SRGBColorSpace;stoneMap.wrapS=stoneMap.wrapT=T.RepeatWrapping;stoneMap.repeat.set(3,3);stone.map=stoneMap;
 function mesh(geometry,material,x=0,y=0,z=0,parent=root){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function box(w,h,d,x,y,z,mat=stone,parent=root){return mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent);}
 function disc(radius,height,x,y,z,mat){return mesh(new T.CylinderGeometry(radius,radius,height,64),mat,x,y,z);}
 const paving=disc(8.2,.12,0,-.08,0,stone);paving.name='Amphitheater forecourt';
 disc(3,.26,0,.05,0,dark);
 for(let z=-2.83;z<2.9;z+=.26){const width=2*Math.sqrt(9-z*z);box(width,.06,.245,0,.21,z,wood);}
 // Three stepped seating arcs with a central aisle and two open side entrances.
 for(let row=0;row<4;row++){
  const inner=3.75+row*1.02,outer=inner+.92,height=.14+row*.22;
  for(const [start,end] of [[-1.30,-.12],[.12,1.30]]){
   const shape=new T.Shape();
   for(let i=0;i<=48;i++){const a=start+(end-start)*i/48,x=Math.sin(a)*outer,z=Math.cos(a)*outer;if(!i)shape.moveTo(x,z);else shape.lineTo(x,z);}
   for(let i=48;i>=0;i--){const a=start+(end-start)*i/48;shape.lineTo(Math.sin(a)*inner,Math.cos(a)*inner);}shape.closePath();
   const terrace=mesh(new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),stone,0,height,0);terrace.rotation.x=Math.PI/2;
   const count=7+row*2;
   for(let i=0;i<count;i++){
    const a=start+(end-start)*(i+.5)/count,r=inner+.48;
    const seat=new T.Group();seat.position.set(Math.sin(a)*r,height,Math.cos(a)*r);seat.rotation.y=a;root.add(seat);
    box(.62,.29,.41,0,.145,0,stone,seat);box(.71,.075,.49,0,.32,0,wood,seat);
   }
  }
  box(1,.10,.86,0,height-.055,inner+.46,stone);
 }
 for(const z of [-1.6,-.7,.2]){
  const points=[];for(let i=0;i<=40;i++){const a=Math.PI*i/40;points.push(new T.Vector3(Math.cos(a)*3.3,.7+Math.sin(a)*3.6,z));}
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),48,.105,8,false),wood);
  for(const x of [-3.3,3.3])box(.21,.7,.21,x,.35,z,wood);
 }
 for(let i=1;i<16;i++){const a=Math.PI*i/16;box(.075,.08,2.2,Math.cos(a)*3.3,.7+Math.sin(a)*3.6,-.7,wood);}
 const sign=document.createElement('canvas');sign.width=1024;sign.height=256;
 const ctx=sign.getContext('2d');ctx.fillStyle='#17332d';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#eff5ee';ctx.textAlign='center';ctx.font='600 78px sans-serif';ctx.fillText('EDEN',512,112);ctx.font='28px sans-serif';ctx.fillText('S O U N D   G A R D E N',512,180);
 const signMap=new T.CanvasTexture(sign);signMap.colorSpace=T.SRGBColorSpace;
 mesh(new T.PlaneGeometry(2.55,.64),new T.MeshStandardMaterial({map:signMap,roughness:.9}),0,2.48,-1.64);
 const lampMat=new T.MeshStandardMaterial({color:0xffe4a4,emissive:0xffc477,emissiveIntensity:.7});
 for(let i=0;i<9;i++){const x=-2.8+i*.7;mesh(new T.SphereGeometry(.045,8,6),lampMat,x,3.0-.30*(1-(x/2.8)**2),-.35);}
 for(const x of [-3.05,3.05]){
  const speaker=new T.Group();speaker.position.set(x,.08,.75);root.add(speaker);
  box(.82,1.62,.72,0,.81,0,dark,speaker);box(.94,.36,.84,0,.18,0,dark,speaker);
  for(const y of [.62,1.22]){
   const driver=mesh(new T.CylinderGeometry(.245,.20,.035,32),cone,0,y,.38,speaker);driver.rotation.x=Math.PI/2;
   mesh(new T.TorusGeometry(.247,.012,8,32),brass,0,y,.405,speaker);
   mesh(new T.SphereGeometry(.085,16,10),dark,0,y,.405,speaker).scale.z=.38;
  }
  const led=box(.07,.04,.018,.28,1.52,.37,lampMat.clone(),speaker);lamps.push(led.material);
  speaker.traverse(n=>{if(n.isMesh){n.userData.amphitheater=true;picks.push(n);}});
 }
 const desk=new T.Group();desk.position.set(0,.22,-.55);root.add(desk);
 box(1.95,.10,.8,0,.90,0,dark,desk);box(1.76,.72,.12,0,.47,-.24,wood,desk);
 for(const x of [-.81,.81])box(.09,.85,.68,x,.42,0,dark,desk);
 for(const x of [-.54,.54]){
  const platter=mesh(new T.CylinderGeometry(.23,.23,.025,36),dark,x,.97,0,desk);
  mesh(new T.CylinderGeometry(.07,.07,.03,24),brass,x,.985,0,desk);
  platter.userData.amphitheater=true;
 }
 for(let i=0;i<4;i++)box(.055,.02,.24,-.13+i*.085,.97,0,brass,desk);
 desk.traverse(n=>{if(n.isMesh){n.userData.amphitheater=true;n.userData.stemdeck=true;picks.push(n);}});
 for(let i=0;i<10;i++)box(.72,.045,.46,4.0+i*.46,-.015,-1.2-i*.28,stone);
 const marker=root.position.clone().add(new T.Vector3(0,1.35,-.55));
 return {root,pickables:picks,marker,
  blocks(p){const x=p.x-root.position.x,z=p.z-root.position.z,r=Math.hypot(x,z),a=Math.abs(Math.atan2(x,z));return z>0&&a>.15&&a<1.30&&[4.23,5.25,6.27,7.29].some(v=>Math.abs(r-v)<.35);},
  contains(p){return Math.hypot(p.x-root.position.x,p.z-root.position.z)<8.3;},
  groundHeight(p){const x=p.x-root.position.x,z=p.z-root.position.z,r=Math.hypot(x,z);if(r<3)return .24;if(z>0&&Math.abs(Math.atan2(x,z))<1.30&&r>=3.75&&r<7.74)return .14+Math.min(3,Math.floor((r-3.75)/1.02))*.22;return 0;},
  update(time,playing){for(const material of lamps)material.emissiveIntensity=playing?(reduced?1:.85+.2*Math.sin(time*2)):.15;},
  inspect(){return {position:root.position.toArray(),seats:80,speakers:2};}
 };
};
