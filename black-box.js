'use strict';
// A bowl in the ground south of the amphitheatre's back rows; the black box sits on its floor, out of sight of the
// library and the spawn path. garden.js sinks the terrain by height(), app.js walks on it, eden-flora rings it.
window.edenValley=(()=>{
 const x=-12,z=42,floor=6.8,rim=15,depth=5,ease=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
 // The path in: from the garden's south edge round to the east rim, so the gap in the trees faces away from the library.
 const path=[[-2.4,25.2],[-1.6,30],[3,34.5],[3.6,40.6]];
 const near=(px,pz,[ax,az],[bx,bz])=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/(dx*dx+dz*dz)));return Math.hypot(px-ax-dx*t,pz-az-dz*t)<1.6;};
 return {x,z,floor,rim,depth,path,
  // Beyond the garden's south edge only the path and the valley can be walked.
  reaches:(px,pz)=>Math.hypot(px-x,pz-z)<rim+.5||path.some((p,i)=>i&&near(px,pz,path[i-1],p)),
  height:(px,pz)=>-depth*(1-ease((Math.hypot(px-x,pz-z)-floor)/(rim-floor)))};
})();

// The black box: a plain black cube, white inside, with a doorway in its north wall onto a white world much larger
// than the cube: a 57 m corridor, Hall One with hanging white cubes, Hall Two with a smaller floating black box, and
// a corridor that fades into white without end. Laid out in the doorway's frame (+x through the doorway).
window.createBlackBox=function createBlackBox(T,pockets){
 const valley=window.edenValley,width=2.2,height=3.4;
 const outer={x0:-7.65,x1:.75,z0:-4.2,z1:4.2,h:8.4},shell=.25;
 const inner={x0:outer.x0+shell,x1:outer.x1-shell,z0:outer.z0+shell,z1:outer.z1-shell,h:outer.h-shell};
 const door={x0:-2.15,x1:-.35,h:3},frame=inner.x1-1; // entrance in the +z face; the doorway frame stands into the room
 const hallOne={x0:18.5,x1:42.5,z0:-25.3,z1:-1.3,h:12},hallTwo={x0:56.7,x1:86.7,z0:-15,z1:15,h:16},corridorB={x0:44.5,x1:46.7,z0:1.3,z1:119.5};
 const m=.3,{rect}=pockets,within=(q,r)=>q.x>r[0]&&q.x<r[1]&&q.z>r[2]&&q.z<r[3];
 const footprint=rect(outer.x0-m,outer.x1+m,outer.z0-m,outer.z1+m),room=rect(inner.x0+m,inner.x1-m,inner.z0+m,inner.z1-m);
 const entrance=rect(door.x0+m,door.x1-m,inner.z1-1,outer.z1+m+.01),tunnel=rect(frame-1,inner.x1-.25,-width/2+m,width/2-m),jambs=rect(frame-m,outer.x1,-width/2-.4-m,width/2+.4+m);
 const monolith=new T.Vector3((hallTwo.x0+hallTwo.x1)/2,3.2,(hallTwo.z0+hallTwo.z1)/2);
 const place=pockets.place({name:'Black box',caption:['THE WHITE WORLD','BREAKTHYRULE / INSIDE THE BLACK BOX'],
  // The cube's centre is 3.45 m behind the doorway; turned so the entrance faces east, up the valley path.
  position:new T.Vector3(valley.x,-valley.depth,valley.z-3.45),rotation:Math.PI/2,offset:new T.Vector3(1000,valley.depth,0),
  width,height,beyond:outer.x1,behind:1.5,
  walk:[rect(frame+.25,56.5-m,-width/2+m,width/2-m),
   rect(28.5+m,31.5-m,hallOne.z1-.5,-width/2+.5),rect(hallOne.x0+m,hallOne.x1-m,hallOne.z0+m,hallOne.z1-m),
   rect(55.5,hallTwo.x0+.5,-width/2+m,width/2-m),rect(hallTwo.x0+m,hallTwo.x1-m,hallTwo.z0+m,hallTwo.z1-m),
   rect(corridorB.x0+m,corridorB.x1-m,width/2-.5,corridorB.z1-m)],
  solid:[rect(monolith.x-2.1-m,monolith.x+2.1+m,monolith.z-2.1-m,monolith.z+2.1+m)],
  blocksOutside:q=>within(q,footprint)&&!within(q,tunnel)&&!within(q,entrance)&&(!within(q,room)||within(q,jambs)),
  enclosedOutside:q=>q.x>inner.x0&&q.x<inner.x1&&q.z>inner.z0&&q.z<inner.z1,
  seen:q=>q.x>outer.x0&&q.z>outer.z0&&q.z<outer.z1+14});

 // Stepping stones along the valley path and down its side to the entrance.
 const stone=new T.MeshStandardMaterial({color:0xcfccbb,roughness:.95}),slabShape=new T.CylinderGeometry(1,1.07,.065,9);
 const points=[...valley.path,[valley.x+5.4,valley.z-2.3]].map(([x,z])=>new T.Vector3(x,0,z));let i=0;
 for(let k=1;k<points.length;k++)for(let j=0,n=Math.ceil(points[k-1].distanceTo(points[k])/.9);j<n;j++,i++){
  const p=points[k-1].clone().lerp(points[k],j/n),slab=new T.Mesh(slabShape,stone);
  slab.position.set(p.x+Math.sin(i*1.7)*.12,valley.height(p.x,p.z)-.015,p.z);slab.scale.set(.5,1,.44);slab.rotation.y=i*.8;slab.receiveShadow=true;place.real.parent.add(slab);
 }

 // Outside: a matte black cube, solid but for the entrance.
 const black=new T.MeshStandardMaterial({color:0x060606,roughness:.72});
 function slab(x0,x1,y0,y1,z0,z1){
  const mesh=new T.Mesh(new T.BoxGeometry(x1-x0,y1-y0,z1-z0),black);mesh.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
  mesh.castShadow=mesh.receiveShadow=true;place.real.add(mesh);
 }
 const lining=.02; // the white lining sits just in front of the shell's inner faces
 slab(outer.x0,outer.x1,0,outer.h,outer.z0,inner.z0-lining);
 slab(outer.x0,door.x0-.01,0,outer.h,inner.z1+lining,outer.z1);
 slab(door.x1+.01,outer.x1,0,outer.h,inner.z1+lining,outer.z1);
 slab(door.x0-.01,door.x1+.01,door.h+.01,outer.h,inner.z1+lining,outer.z1);
 slab(outer.x0,inner.x0-lining,0,outer.h,inner.z0-lining,inner.z1+lining);
 slab(inner.x1+lining,outer.x1,0,outer.h,inner.z0-lining,inner.z1+lining);
 slab(inner.x0-lining,inner.x1+lining,inner.h+lining,outer.h,inner.z0-lining,inner.z1+lining);

 // Inside the cube: empty white, with a deep frame around the doorway.
 const here=pockets.white('Black box interior',place.real);
 here.room(inner.x0,inner.x1,inner.z0,inner.z1,inner.h,[{side:'s',from:door.x0,to:door.x1,height:door.h}]);
 for(const [z0,z1,y0,y1] of [[-width/2-.4,-width/2,0,height+.4],[width/2,width/2+.4,0,height+.4],[-width/2,width/2,height,height+.4]])
  here.edges(here.solid(frame,inner.x1,y0,y1,z0,z1));
 here.finish();

 // The white world.
 const there=place.white,rng=(seed=>()=>(seed=(seed*16807)%2147483647)/2147483647)(7);
 there.room(frame,56.5,-width/2,width/2,height,[{side:'n',from:28.5,to:31.5},{side:'s',from:corridorB.x0,to:corridorB.x1},{side:'e',from:-width/2,to:width/2}]);
 there.room(hallOne.x0,hallOne.x1,hallOne.z0,hallOne.z1,hallOne.h,[{side:'s',from:28.5,to:31.5,height}]);
 there.room(hallTwo.x0,hallTwo.x1,hallTwo.z0,hallTwo.z1,hallTwo.h,[{side:'w',from:-width/2,to:width/2,height}]);
 there.room(corridorB.x0,corridorB.x1,corridorB.z0,corridorB.z1,height,[{side:'n',from:corridorB.x0,to:corridorB.x1}]);
 // Hall One: white cubes hanging in the air, each turned a little.
 for(let i=0;i<14;i++){
  const size=.5+rng()*2.4,g=new T.BoxGeometry(size,size,size).toNonIndexed();
  g.rotateX((rng()-.5)*.9);g.rotateY(rng()*Math.PI);
  g.translate(hallOne.x0+3+rng()*(hallOne.x1-hallOne.x0-6),3.6+rng()*6.4,hallOne.z0+3+rng()*(hallOne.z1-hallOne.z0-6));
  there.edges(there.add(g));
 }
 there.finish();
 // Hall Two: the black box again, smaller, hovering over a soft shadow.
 const cube=new T.Mesh(new T.BoxGeometry(4.2,4.2,4.2),new T.MeshBasicMaterial({color:0x000000,fog:false}));
 cube.position.copy(monolith);cube.name='Black box within';place.far.add(cube);
 const shade=document.createElement('canvas');shade.width=shade.height=128;
 const ctx=shade.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
 gradient.addColorStop(0,'rgba(0,0,0,.28)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 const pool=new T.Mesh(new T.PlaneGeometry(9,9),new T.MeshBasicMaterial({map:new T.CanvasTexture(shade),transparent:true,depthWrite:false,fog:false}));
 pool.rotation.x=-Math.PI/2;pool.position.set(monolith.x,.01,monolith.z);place.far.add(pool);
 return place;
};
