'use strict';
(function(root){
 function createSoloExpedition({layout,pathfinding=root.NightPathfinding,clock=()=>performance.now()/1000,random=Math.random}){
  if(!pathfinding)throw Error('The night navigation assets did not load. Reload and try again.');
  const [minX,maxX,minZ,maxZ]=layout.bounds,walls=[];
  for(const s of layout.landmarks){
   if(s.id==='gardens')continue;
   for(const side of [-1,1]){
    walls.push([s.x+side*s.w/2,s.z,.5,s.d]);
    for(const end of [-1,1])walls.push([s.x+side*(s.w/4+.9),s.z+end*s.d/2,s.w/2-1.8,.5]);
   }
  }
  const blocked=(x,z,margin=.3)=>walls.some(([a,b,w,d])=>Math.abs(x-a)<w/2+margin&&Math.abs(z-b)<d/2+margin);
  function clear(a,b,margin=.3){
   // Exact segment/AABB clipping avoids skipping a thin wall corner on a long sightline.
   for(const [x,z,w,d] of walls){
    const lo=[x-w/2-margin,z-d/2-margin],hi=[x+w/2+margin,z+d/2+margin];
    let enter=0,exit=1,hit=true;
    for(let axis=0;axis<2;axis++){
     const delta=b[axis]-a[axis];
     if(Math.abs(delta)<1e-9){if(a[axis]<=lo[axis]||a[axis]>=hi[axis]){hit=false;break;}}
     else{const first=(lo[axis]-a[axis])/delta,last=(hi[axis]-a[axis])/delta;enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));if(exit<=enter){hit=false;break;}}
    }
    if(hit&&exit>enter)return false;
   }
   return true;
  }
  const grid=new pathfinding.Grid(maxX-minX+1,maxZ-minZ+1),walkable=[];
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
   const open=!blocked(x,z,.48);grid.setWalkableAt(x-minX,z-minZ,open);if(open)walkable.push([x,z]);
  }
  const finder=new pathfinding.AStarFinder();
  function nearest(point){
   const x=Math.round(point[0]),z=Math.round(point[1]);
   if(x>=minX&&x<=maxX&&z>=minZ&&z<=maxZ&&grid.isWalkableAt(x-minX,z-minZ))return [x,z];
   let best=walkable[0],distance=Infinity;
   for(const p of walkable){const d=(p[0]-point[0])**2+(p[1]-point[1])**2;if(d<distance){distance=d;best=p;}}
   return best;
  }
  function pathBetween(a,b){
   const start=nearest(a),end=nearest(b);
   return finder.findPath(start[0]-minX,start[1]-minZ,end[0]-minX,end[1]-minZ,grid.clone()).map(([x,z])=>[x+minX,z+minZ]);
  }
  let room=null,started=0,lastTick=0,path=[],repath=0,contact=0,budget=.5,budgetAt=0;
  function snapshot(){
   if(!room)return null;
   return structuredClone({...room,serverTime:clock(),elapsed:Math.max(0,Math.floor(clock()-started))});
  }
  function tick(){
   if(!room)return null;
   const now=clock(),dt=Math.min(.2,Math.max(0,now-lastTick));lastTick=now;
   if(room.phase!=='playing')return snapshot();
   const p=room.players[0],w=room.watcher,count=room.collected.length;
   if(now-started<14){w.state='waiting';return snapshot();}
   const dx=w.x-p.x,dz=w.z-p.z,distance=Math.hypot(dx,dz);
   const sees=distance<30&&distance>.01&&(Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz)/distance>.87&&clear([p.x,p.z],[w.x,w.z]);
   p.dread=sees?Math.min(1,p.dread+dt*.2):Math.max(0,p.dread-dt*.14);
   const watched=sees&&p.dread<.8;
   w.state=watched?'observed':count>=5?'hunting':'stalking';
   if(clear([w.x,w.z],[p.x,p.z],.48))path=[[p.x,p.z]];
   else if(now>=repath){
    repath=now+.7;path=pathBetween([w.x,w.z],[p.x,p.z]);
    // Keep the grid anchor at doorway corners; skip it only with a clear next segment.
    if(path.length>1&&clear([w.x,w.z],path[1],.48))path.shift();
   }
   let remaining=(.7+count*.25)*(watched?.22:1)*dt;
   while(path.length&&remaining>0){
    const next=path[0],d=Math.hypot(next[0]-w.x,next[1]-w.z);
    if(d<.01){path.shift();continue;}
    const travel=Math.min(d,remaining),x=w.x+(next[0]-w.x)/d*travel,z=w.z+(next[1]-w.z)/d*travel;
    if(!clear([w.x,w.z],[x,z],.48)){path=[];repath=now;break;}
    w.yaw=Math.atan2(next[0]-w.x,next[1]-w.z);w.x=x;w.z=z;remaining-=travel;
    if(travel===d)path.shift();
   }
   contact=Math.hypot(w.x-p.x,w.z-p.z)<1.25&&clear([w.x,w.z],[p.x,p.z])?contact+dt:0;
   if(contact>=.65){p.status='caught';room.phase='lost';room.message='You were taken by the Attendant.';}
   return snapshot();
  }
  function command(data){
   if(data.action==='solo'){
    const now=clock(),pages=layout.pages.map(p=>{const s=p.sockets[Math.floor(random()*p.sockets.length)];return {id:p.id,title:p.title,site:p.site,x:s[0],z:s[1]};});
    started=lastTick=budgetAt=now;path=[];repath=0;contact=0;budget=.5;
    room={code:'SOLO',solo:true,phase:'playing',selfId:'wanderer',host:'wanderer',pages,collected:[],chat:[],message:'Find eight pages. Reach the pyramid.',players:[{id:'wanderer',name:'Wanderer',character:null,x:layout.spawn[0],z:layout.spawn[1],yaw:Math.PI,status:'alive',dread:0,seq:-1}],watcher:{x:11.7,z:-82,yaw:0,state:'waiting'}};
    return {token:'browser-solo',...snapshot()};
   }
   if(!room)throw Error('Enter the night district first.');
   if(data.action==='leave'){room=null;return {ok:true};}
   tick();
   const p=room.players[0],now=clock();
   if(data.action==='pose'){
    if(p.status==='alive'&&room.phase==='playing'){
     const pose=data.pose;
     if(!pose||!['x','z','yaw'].every(k=>typeof pose[k]==='number'&&Number.isFinite(pose[k]))||!Number.isInteger(data.seq))throw Error('Invalid position.');
     if(data.seq>p.seq){
      p.seq=data.seq;budget=Math.min(1.8,budget+Math.max(0,now-budgetAt)*6.3);budgetAt=now;
      const d=Math.hypot(pose.x-p.x,pose.z-p.z);
      if(d<=budget&&pose.x>=minX&&pose.x<=maxX&&pose.z>=minZ&&pose.z<=maxZ&&clear([p.x,p.z],[pose.x,pose.z])){p.x=pose.x;p.z=pose.z;budget-=d;}
      p.yaw=((pose.yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
      if(room.collected.length===8&&Math.abs(p.x-layout.exit[0])<1.35&&p.z<layout.exit[1]+1.1){p.status='escaped';room.phase='won';room.message='The ceremony has begun.';}
     }
    }
   }else if(data.action==='collect'){
    const page=room.pages.find(q=>q.id===data.page);
    if(room.phase!=='playing'||p.status!=='alive'||!page||Math.hypot(p.x-page.x,p.z-page.z)>2.5||!clear([p.x,p.z],[page.x,page.z]))throw Error('Move closer to the page.');
    if(!room.collected.includes(page.id)){room.collected.push(page.id);room.message=room.collected.length===8?'Eight pages. The pyramid is open.':'You found '+page.title+'.';}
   }else throw Error('Shared parties need the multiplayer server.');
   return snapshot();
  }
  return {command,tick,snapshot,pathBetween};
 }
 root.createSoloExpedition=createSoloExpedition;
 if(typeof module==='object'&&module.exports)module.exports=createSoloExpedition;
})(typeof window==='object'?window:globalThis);
