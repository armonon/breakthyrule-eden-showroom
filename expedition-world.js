'use strict';
(function(root){
// Strict body occupancy, separate from the legacy step/facade navigation query.
// Measured roofs are 20 cm slabs, matching the Jolt collision representation.
// Sweeps use an analytic first contact, so even a thin ceiling cannot be skipped.
function createBodyClearance({boxes=()=>[],fields=()=>[]}){
 const SKIN=.005;
 function visit(a,b,r,fn){
  const minX=Math.min(a.x,b.x)-r,maxX=Math.max(a.x,b.x)+r,minZ=Math.min(a.z,b.z)-r,maxZ=Math.max(a.z,b.z)+r;
  for(const box of boxes())if(box.maxX>=minX&&box.minX<=maxX&&box.maxZ>=minZ&&box.minZ<=maxZ&&fn(box))return true;
  for(const item of fields()){const F=item.field||item;
   const c0=Math.max(0,Math.floor((minX-F.minX)/F.cell)),c1=Math.min(F.cols-1,Math.floor((maxX-F.minX)/F.cell));
   const r0=Math.max(0,Math.floor((minZ-F.minZ)/F.cell)),r1=Math.min(F.rows-1,Math.floor((maxZ-F.minZ)/F.cell));
   for(let row=r0;row<=r1;row++)for(let col=c0;col<=c1;col++){const top=F.h[row*F.cols+col];if(!(top>0))continue;
    const x=F.minX+col*F.cell,z=F.minZ+row*F.cell;
    if(fn({minX:x,maxX:x+F.cell,minZ:z,maxZ:z+F.cell,bottom:top-.2,top}))return true;
   }
  }return false;
 }
 function fits(p,height=1.75,radius=.26){return !visit(p,p,radius,b=>p.x>b.minX-radius+SKIN&&p.x<b.maxX+radius-SKIN&&p.z>b.minZ-radius+SKIN&&p.z<b.maxZ+radius-SKIN&&p.y<b.top-SKIN&&p.y+height>b.bottom+SKIN);}
 function fraction(a,b,height=1.75,radius=.26){let first=1;
  visit(a,b,radius,box=>{let enter=0,exit=1;
   for(const [axis,lo,hi] of [['x',box.minX-radius+SKIN,box.maxX+radius-SKIN],['y',box.bottom-height+SKIN,box.top-SKIN],['z',box.minZ-radius+SKIN,box.maxZ+radius-SKIN]]){
    const d=b[axis]-a[axis];if(Math.abs(d)<1e-10){if(a[axis]<=lo||a[axis]>=hi)return false;}
    else{const t=(lo-a[axis])/d,u=(hi-a[axis])/d;enter=Math.max(enter,Math.min(t,u));exit=Math.min(exit,Math.max(t,u));if(enter>=exit)return false;}
   }
   if(exit>1e-8&&enter<first)first=Math.max(0,enter-1e-6);return false;
  });return first;
 }
 function ray(origin,direction,distance){const end={x:origin.x+direction.x*distance,y:origin.y+direction.y*distance,z:origin.z+direction.z*distance},t=fraction(origin,end,0,0);return t<1?{distance:t*distance,point:{x:origin.x+(end.x-origin.x)*t,y:origin.y+(end.y-origin.y)*t,z:origin.z+(end.z-origin.z)*t}}:null;}
 function canTranslate(points,delta){
  if(!points.length||points.length%2)return false;
  // Each consecutive pair encloses one physics capsule. Sweeping its conservative
  // bounds also covers the shaft, not only the endpoint spheres.
  for(let i=0;i<points.length;i+=2){const a=points[i],b=points[i+1],r=Math.max(a.radius,b.radius),minY=Math.min(a.point.y,b.point.y)-r;
   const from={x:(a.point.x+b.point.x)/2,y:minY,z:(a.point.z+b.point.z)/2},to={x:from.x+delta.x,y:from.y+delta.y,z:from.z+delta.z};
   const radius=r+Math.max(Math.abs(a.point.x-b.point.x),Math.abs(a.point.z-b.point.z))/2,height=Math.max(a.point.y,b.point.y)+r-minY;
   if(fraction(from,to,height,radius)<1)return false;
  }return true;
 }
 return {fits,fraction,ray,canTranslate};
}
function playerBodyProfile(character){const height=Math.max(145,Math.min(210,Number(character?.height)||175))/100,radius=.26*Math.max(.9,Math.min(1.3,Number(character?.shoulders)||1));return {height,radius,crouch:height*.68};}
root.createBodyClearance=createBodyClearance;root.playerBodyProfile=playerBodyProfile;
// These coordinates also place the visible cards. Collision cannot depend on
// whether a texture has decoded on a particular client.
root.pyramidGatheringGuests=()=>{const guests=[];for(let ring=0;ring<2;ring++){const count=ring?30:20,radius=ring?13.3:8.5;for(let i=0;i<count;i++){const a=i/count*Math.PI*2,x=Math.sin(a)*radius,z=Math.cos(a)*radius;if(z>0&&Math.abs(x)<2.6)continue;guests.push({x,z,variant:(i+ring*2)%6,height:1.85+(i%4)*.055});}}guests.push({x:0,z:-3.5,variant:2,height:2.08});return guests;};
root.createPyramidCollision=function({roadX=11.7,roadEnd=-106.8,unlocked=()=>false}={}){
 const guests=root.pyramidGatheringGuests(),centerZ=roadEnd-28;
 function gathering(x,z){const room=Math.abs(x)<17.45&&Math.abs(z)<17.45,passage=Math.abs(x)<1.42&&z>=17&&z<25.1;if(!room&&!passage)return true;for(const side of [-1,1])for(const pz of [-12,-4,4,12])if(Math.hypot(x-side*15.8,z-pz)<.8)return true;return guests.some(p=>Math.hypot(x-p.x,z-p.z)<.38);}
 function blocks(p){const x=p.x-roadX,z=p.z-centerZ;if(!unlocked()&&Math.abs(x)<2&&Math.abs(z-24.25)<.7)return true;if(Math.abs(Math.abs(x)-1.98)<.5&&Math.abs(z-24.4)<.8)return true;if(Math.abs(x)>=24.55||Math.abs(z)>=24.55)return false;return gathering(x,z);}
 return {blocks,gathering};
};
root.createExpeditionConstraints=function({layout,unlocked=()=>false}){const pyramid=root.createPyramidCollision({unlocked});return function(next,previous){const [minX,maxX,minZ,maxZ]=layout.bounds;next.x=Math.max(minX,Math.min(maxX,next.x));next.z=Math.max(minZ,Math.min(maxZ,next.z));if(pyramid.blocks(next))next.copy(previous);return next;};};
const MODELS={
  playhouse:{url:'/assets/night/mayan-theatre.glb',keepInterior:true,glow:[[0,4.4,10.6]]},
  temple:{url:'/assets/night/moon-temple.glb',glow:[[0,4,0]],blocks:[...[[-7.4,-7.4],[7.4,-7.4],[-7.4,7.4],[7.4,7.4]].map(([x,z])=>[x,z,2,2]),...[0,1,2,3,4,5,6,7].map(i=>[Math.cos(Math.PI/8+i*Math.PI/4)*6.3,Math.sin(Math.PI/8+i*Math.PI/4)*6.3,.8,.8])]},
  observatory:{url:'/assets/night/shrine-observatory.glb',glow:[[0,3.2,-1]],blocks:[[-7.8,7.8,2.6,2.6],[7.8,7.8,2.6,2.6],[0,-1,2.4,2.4]]},
  hotel:{url:'/assets/night/citadel-hotel.glb',lanterns:[[-5.85,11.7],[5.85,11.7]],blocks:[...[[-8.2,-10.2],[8.2,-10.2],[-8.2,10.2],[8.2,10.2]].map(([x,z])=>[x,z,2.4,2.4]),[-3,10.9,2.8,1.9],[3,10.9,2.8,1.9],[-3,13.1,2,2.6],[3,13.1,2,2.6],...[-6,-2,2,6].flatMap(z=>[[-5.6,z,.9,.9],[5.6,z,.9,.9]])]},
  gardens:{url:'/assets/night/egyptian-gardens.glb',lanterns:[[-3,11.2],[3,11.2]],blocks:[[-6.1,8.2,7.4,2.6],[6.1,8.2,7.4,2.6],[-2.12,8.2,.65,2.2],[2.12,8.2,.65,2.2],[-10.4,0,.6,12.4],[10.4,0,.6,12.4],[0,-7.4,12,1.4],...[-5,-2.5,0,2.5,5].flatMap(z=>[[-9,z,1.1,1.1],[9,z,1.1,1.1]]),...[4.6,-2.6].flatMap(z=>[[-5.2,z,1.6,3],[5.2,z,1.6,3]])]},
  // the remaining atlas buildings (original designs after each atlas reading; see assets/night/SOURCE.md)
  girard:{url:'/assets/night/girard-gate.glb',blocks:[[-8.4,5,3.6,3.6],[8.4,5,3.6,3.6]]},
  latheatre:{url:'/assets/night/palace-of-mirrors.glb',glow:[[0,4.2,12.6]]},
  stjames:{url:'/assets/night/redwood-chapel.glb',blocks:[[-6.2,8,3.6,3.6]]},
  vibiana:{url:'/assets/night/first-cathedral.glb',blocks:[[9.7,9,4,4]]},
  methodist:{url:'/assets/night/campanile.glb',blocks:[[-9.8,8.8,4.2,4.2]]},
  immanuel:{url:'/assets/night/high-tower.glb',blocks:[[5.8,8.8,4.6,4.6]]},
  baptist:{url:'/assets/night/three-arches.glb',blocks:[[-11.6,7.2,3.6,3.6],[11.6,7.2,3.6,3.6],[-4,12.15,1.6,2.6],[4,12.15,1.6,2.6]]},
  christian:{url:'/assets/night/rose-window.glb',blocks:[[-9.4,8,4,4]]},
  firstcong:{url:'/assets/night/organ-tower.glb',lanterns:[[-4.6,16.6],[4.6,16.6]],blocks:[[-2.5,12.5,1.4,6.4],[2.5,12.5,1.4,6.4]]}
 };
 function createExpeditionWorld({layout,roofs=root.edenRoofs||{}}){
 const walls=[],surfaces=[],climbs=[];
 const fieldH=(F,x,z)=>{const c=Math.floor((x-F.minX)/F.cell),r=Math.floor((z-F.minZ)/F.cell);return c<0||r<0||c>=F.cols||r>=F.rows?null:F.h[r*F.cols+c];};
 for(const s of layout.landmarks){const F=roofs[s.id],eave=F?.eave??s.h??7;
  for(const [x,z,w,d] of MODELS[s.id]?.blocks||[])walls.push([s.x+x,s.z+z,w,d,eave]);
  if(s.id!=='gardens')for(const side of [-1,1]){walls.push([s.x+side*s.w/2,s.z,.5,s.d,eave]);for(const end of [-1,1])walls.push([s.x+side*(s.w/4+.9),s.z+end*s.d/2,s.w/2-1.8,.5,eave]);}
  if(F)surfaces.push({field:F,id:s.id});else if(s.id!=='gardens')surfaces.push({minX:s.x-s.w/2,maxX:s.x+s.w/2,minZ:s.z-s.d/2,maxZ:s.z+s.d/2,top:s.h??7,bottom:(s.h??7)-.4,roof:true,id:s.id});
  const side=s.x<12?-1:1,tops=[];let t=0;do{t+=2.55;tops.push(+t.toFixed(2));}while(eave-t>3.1);
  const facadeX=z=>{const wall=s.x+side*s.w/2;if(!F)return wall;const r=Math.floor((z-F.minZ)/F.cell);if(r<0||r>=F.rows)return wall;for(let k=0;k<F.cols;k++){const c=side<0?k:F.cols-1-k;if(F.h[r*F.cols+c]>3)return F.minX+(c+(side<0?0:1))*F.cell;}return wall;};
  const z0=F?F.minZ+2.2:s.z-s.d/2+1.6,zMax=F?F.minZ+F.rows*F.cell-2.2:s.z+s.d/2-1;
  tops.forEach((top,i)=>{const z=z0+i*2.05;if(z+1>zMax)return;const a=facadeX(z-.9),b=facadeX(z+.9),x=(side<0?Math.min(a,b):Math.max(a,b))+side*1.02;walls.push([x,z,2,2,top]);climbs.push({x,y:top,z,id:s.id});});
 }
 // Deliberate elevated routes in the existing five-landmark district. Roof endpoints
 // are sampled from the measured assets; the Playhouse gets an explicit balcony.
 const routes=[],routeSurfaces=[],routeCues=[];
 const roofPoint=(id,x,z)=>({x,z,y:fieldH(roofs[id],x,z)});
 const deck=(id,x,y,z,w,d)=>{const b={minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top:y,bottom:y-.28,roof:true,id,route:true};surfaces.push(b);routeSurfaces.push(b);return b;};
 function link(id,label,points,width=2.4){const route={id,label,difficulty:'connected',points,width};routes.push(route);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.8));for(let k=0;k<=n;k++){const t=k/n;deck(id,a.x+dx*t,a.y+(b.y-a.y)*t,a.z+dz*t,Math.abs(dx)>.01?Math.abs(dx)/n+.12:width,Math.abs(dz)>.01?Math.abs(dz)/n+.12:width);}}
  routeCues.push({label,x:points[0].x,y:points[0].y,z:points[0].z});return route;
 }
 if(['temple','playhouse','hotel'].every(id=>roofs[id]&&layout.landmarks.some(s=>s.id===id))){
  const temple=roofPoint('temple',-12.5,-51.5),theatre=roofPoint('playhouse',-15.5,-65.5),hotel=roofPoint('hotel',31.5,-74.5);
  if(temple.y>0&&theatre.y>0&&hotel.y>0){theatre.y+=.05;deck('playhouse-balcony',-15.5,theatre.y,-65.5,20,3);
   link('temple-playhouse','TEMPLE TO PLAYHOUSE',[temple,{x:-12.5,y:temple.y,z:-55},{x:-15.5,y:temple.y+.2,z:-55},theatre]);
   link('playhouse-hotel','PLAYHOUSE TO HOTEL',[theatre,{x:-5.5,y:theatre.y,z:-65.5},{x:27,y:11,z:-65.5},{x:27,y:hotel.y,z:-74.5},hotel]);
   routeCues.push({label:'HOTEL TO PLAYHOUSE',...hotel},{label:'TEMPLE ROOF ROUTE',...temple});
  }
 }
 if(roofs.gardens&&layout.landmarks.some(s=>s.id==='gardens')){
  const points=[{x:1,y:.6,z:-105},{x:1,y:1.2,z:-101},{x:1,y:2.55,z:-97},{x:-1,y:4.8,z:-95},roofPoint('gardens',-3.5,-95.5)];
  if(points.at(-1).y>0){routes.push({id:'gardens-tutorial',label:'GARDENS PRACTICE',difficulty:'tutorial',width:2,points});points.slice(0,-1).forEach((p,i)=>{deck('gardens-tutorial',p.x,p.y,p.z,2,i<3?3:2);climbs.push({...p,id:'gardens-tutorial'});routeCues.push({...p,label:['1 STEP / SPACE','2 JUMP THE GAP','3 GRAB / HOLD W','4 MANTLE TO ROOF'][i]});});}
 }
 if(roofs.observatory&&layout.landmarks.some(s=>s.id==='observatory')){
  const points=[{x:23,y:1.2,z:-48},{x:25,y:3.3,z:-46},{x:23,y:5.4,z:-44},{x:25,y:7.5,z:-42},roofPoint('observatory',28.5,-42.5)];
  if(points.at(-1).y>0){routes.push({id:'observatory-challenge',label:'OBSERVATORY LEDGES',difficulty:'advanced',width:1.25,points});points.slice(0,-1).forEach(p=>{deck('observatory-challenge',p.x,p.y,p.z,1.25,1.25);climbs.push({...p,id:'observatory-challenge'});});routeCues.push({...points[0],label:'ADVANCED / LEAP AND GRAB'});}
 }
 const boxes=walls.map(([x,z,w,d,top])=>({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top,bottom:-1})).concat(surfaces.filter(s=>!s.field));
 const fields=surfaces.filter(s=>s.field);
 const clearance=createBodyClearance({boxes:()=>boxes,fields:()=>fields});
 const inside=(b,x,z,m=0)=>x>b.minX-m&&x<b.maxX+m&&z>b.minZ-m&&z<b.maxZ+m;
 function floorAt(x,z,maxTop=Infinity){let floor=0;for(const b of boxes)if(b.top<=maxTop+.001&&inside(b,x,z,.08))floor=Math.max(floor,b.top);for(const {field:F} of fields){const h=fieldH(F,x,z);if(h!=null&&h<=maxTop+.001)floor=Math.max(floor,h);}return floor;}
 function supportAt(x,z,maxTop=Infinity,radius=.26){let h=floorAt(x,z,maxTop);for(const dx of [-radius,0,radius])for(const dz of [-radius,0,radius])h=Math.max(h,floorAt(x+dx,z+dz,maxTop));return h;}
 function solid(x,y,z,margin=.25,height=1.65){for(const b of boxes)if(inside(b,x,z,margin)&&b.top>y+.45&&b.bottom<y+height)return true;if(y>.6)for(const {field:F} of fields)for(const [dx,dz] of [[0,0],[margin,0],[-margin,0],[0,margin],[0,-margin]])if(fieldH(F,x+dx,z+dz)>y+.45)return true;return false;}
 function clear(a,b,margin=.25,height=1.65){const d=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),n=Math.max(1,Math.ceil(d/.15));for(let i=1;i<=n;i++){const t=i/n;if(solid(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t,margin,height))return false;}return true;}
 function sight(a,b){ // Eye-height segment, including slabs between floors.
  const aa={x:a.x,y:(a.y||0)+1.3,z:a.z},bb={x:b.x,y:(b.y||0)+1.3,z:b.z};
  for(const box of boxes){let enter=0,exit=1;for(const [axis,lo,hi] of [['x',box.minX,box.maxX],['y',box.bottom,box.top],['z',box.minZ,box.maxZ]]){const d=bb[axis]-aa[axis];if(Math.abs(d)<1e-9){if(aa[axis]<=lo||aa[axis]>=hi){enter=2;break;}}else{const t=(lo-aa[axis])/d,u=(hi-aa[axis])/d;enter=Math.max(enter,Math.min(t,u));exit=Math.min(exit,Math.max(t,u));}}if(enter<exit)return false;}
  const n=Math.max(1,Math.ceil(Math.hypot(bb.x-aa.x,bb.y-aa.y,bb.z-aa.z)/.15));
  for(const {field:F} of fields){if(Math.max(aa.x,bb.x)<F.minX||Math.min(aa.x,bb.x)>F.minX+F.cols*F.cell||Math.max(aa.z,bb.z)<F.minZ||Math.min(aa.z,bb.z)>F.minZ+F.rows*F.cell)continue;let previous=null;for(let i=0;i<=n;i++){const t=i/n,x=aa.x+(bb.x-aa.x)*t,z=aa.z+(bb.z-aa.z)*t,h=fieldH(F,x,z),y=aa.y+(bb.y-aa.y)*t;if(h==null||h<=.2){previous=null;continue;}const above=y>=h;if(previous!==null&&previous!==above)return false;previous=above;}}
  return true;
 }
 function validPose(a,b,dt,character=null){const [minX,maxX,minZ,maxZ]=layout.bounds;if(!['x','y','z','yaw'].every(k=>Number.isFinite(b[k]))||b.x<minX||b.x>maxX||b.z<minZ||b.z>maxZ||b.y<-.15||b.y>60)return false;
  if(Math.abs(b.y-a.y)>Math.max(.55,dt*18))return false;
  const floor=supportAt(b.x,b.z,b.y+.45);if(b.y<floor-.45)return false;
  const profile=playerBodyProfile(character),height=['ragdoll','bail','prone'].includes(b.movement)?.65:['crouch','slide'].includes(b.movement)?profile.crouch:profile.height;
  if(!clearance.fits(b,height,profile.radius))return false;
  // A legal small walking step rises before crossing the riser.
  if(Math.abs(b.y-a.y)<=.45&&Math.abs(b.y-floor)<.12){const y=Math.max(a.y,b.y),up={...a,y},over={...b,y};return clearance.fraction(a,up,height,profile.radius)===1&&clearance.fraction(up,over,height,profile.radius)===1&&clearance.fraction(over,b,height,profile.radius)===1;}
  if(clearance.fraction(a,b,height,profile.radius)===1)return true;
  // Sampled poses can straddle a clear descent around a roof lip even though
  // the straight chord cuts the corner. Validate both swept legs of that path.
  // This remains bounded pose validation, not input-authoritative movement.
  if(b.y<a.y){const down={...a,y:b.y};return clearance.fraction(a,down,height,profile.radius)===1&&clearance.fraction(down,b,height,profile.radius)===1;}
  return false;
 }
 return {version:3,walls,surfaces,climbs,boxes,routes,routeSurfaces,routeCues,floorAt,supportAt,solid,clear,sight,validPose,clearance};
 }
 root.createExpeditionWorld=createExpeditionWorld;
 if(typeof module==='object'&&module.exports)module.exports=createExpeditionWorld;
})(typeof window==='object'?window:globalThis);
