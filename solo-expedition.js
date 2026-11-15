'use strict';
(function(root){
 function createSoloExpedition({layout,pathfinding=root.NightPathfinding,clock=()=>performance.now()/1000,random,seed,roofs=root.edenRoofs||{},world=null,flareBalance={},controlled=false,worldRevision=null,T=root.THREE,createActor=null}){
  if(!pathfinding||!root.createExpeditionWorld)throw Error('The night navigation assets did not load. Reload and try again.');
  if(seed!==undefined&&(!Number.isInteger(seed)||seed<0||seed>0xffffffff))throw Error('Expedition seed must be an unsigned 32-bit integer.');
  if(random!==undefined&&typeof random!=='function')throw Error('Expedition random source must be a function.');
  const protocolVersion=controlled?2:1;
  if(controlled&&(!T||!root.createExpeditionInputs||typeof worldRevision!=='string'||!worldRevision))throw Error('Input-authoritative expedition dependencies are unavailable.');
  const layoutSeed=random?null:(seed??(root.crypto?.getRandomValues?root.crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296)));
  const seededRandom=()=>{let state=layoutSeed>>>0;return ()=>{state=(state+0x6D2B79F5)>>>0;let value=Math.imul(state^(state>>>15),state|1);value^=value+Math.imul(value^(value>>>7),value|61);return ((value^(value>>>14))>>>0)/4294967296;};};
  world=world||root.createExpeditionWorld({layout,roofs});
  const worldVersion=world.version??3;
  const [minX,maxX,minZ,maxZ]=layout.bounds,grid=new pathfinding.Grid(maxX-minX+1,maxZ-minZ+1),walkable=[];
  for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){const open=!world.solid(x,0,z,.48);grid.setWalkableAt(x-minX,z-minZ,open);if(open)walkable.push([x,z]);}
  const finder=new pathfinding.AStarFinder();
  function nearest(point){let best=walkable[0],distance=Infinity;for(const p of walkable){const d=(p[0]-point[0])**2+(p[1]-point[1])**2;if(d<distance){distance=d;best=p;}}return best;}
  function pathBetween(a,b){const start=nearest(a),end=nearest(b);return finder.findPath(start[0]-minX,start[1]-minZ,end[0]-minX,end[1]-minZ,grid.clone()).map(([x,z])=>[x+minX,z+minZ]);}
  const temple=layout.landmarks.find(s=>s.id==='temple'),bell={x:temple?.x??-12,y:0,z:temple?temple.z+temple.d/2+2.5:-32.5};
  // Balance is trusted construction-time configuration, never a shot payload.
  const tuned=(key,fallback,min,max)=>Number.isFinite(flareBalance?.[key])?Math.max(min,Math.min(max,flareBalance[key])):fallback;
  const flareRules={capacity:3,magazine:2,reserve:1,reload:1.5,range:tuned('range',14,4,20),duration:tuned('duration',2,.5,6),cooldown:tuned('cooldown',1,.25,5),aimDegrees:22,assistDegrees:35,verticalDegrees:25};
  let room=null,lastTick=0,simTime=0,accumulator=0,route=[],repath=0;const budgets=new Map(),contacts=new Map(),airborne=new Map(),groundAwait=new Set();
  let simulationTick=0;
  const inputs=controlled?root.createExpeditionInputs({T,world,layout,worldRevision,getRoom:()=>room,createActor,applyPose(id,pose){const p=room.players.find(p=>p.id===id);Object.assign(p,pose);p.checkpoint={x:p.x,y:p.y,z:p.z};p.poseRejected=false;if(['bail','hang','mantle','climb','ragdoll','vault','scramble'].includes(p.movement))p.reloadUntil=0;escape(p);},applyAction:(id,data)=>command(data,id,true)}):null;
  function escape(p){if(p.status==='alive'&&room.collected.length===room.pages.length&&p.y<1.2&&Math.abs(p.x-layout.exit[0])<1.35&&p.z<layout.exit[1]+1.1){p.status='escaped';p.reloadUntil=0;room.message=p.name+' reached the ceremony.';finish();}}
  const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
  // Use the accepted body stance and the same dimensions as collision. A fixed
  // 1.3m endpoint can sit above a low roof while the actual player lies below it.
  function stanceHeight(p){
   if(['ragdoll','bail','prone'].includes(p.movement))return .65;
   const profile=root.playerBodyProfile(p.character);
   return ['crouch','slide'].includes(p.movement)?profile.crouch:profile.height;
  }
  function eyeHeight(p){
   if(['ragdoll','bail','prone'].includes(p.movement))return .65*.94;
   // Match the entry camera's steady 55cm crouch drop. The collision capsule
   // scales differently with body height; it is not the rendered eye anchor.
   const standing=root.playerBodyProfile(p.character).height*.94;
   return ['crouch','slide'].includes(p.movement)?standing-.55:standing;
  }
  function sightAt(a,aHeight,b,bHeight){
   // world.sight takes feet positions and adds its legacy 1.3m eye offset.
   return world.sight({x:a.x,y:(a.y||0)+aHeight-1.3,z:a.z},{x:b.x,y:(b.y||0)+bHeight-1.3,z:b.z});
  }
  const living=()=>room.players.filter(p=>p.status==='alive');
  const alive=()=>living().filter(p=>p.connected);
  const movementModes=new Set(['ground','walk','air','crouch','slide','dash','dive','prone','vault','hang','climb','warp','scramble','wallrun','bail','ragdoll','mantle']);
  function player(id,name,character,revision=null){return {id,characterRevision:revision,name:String(name||'Wanderer').slice(0,24),character:character||null,x:layout.spawn[0],y:0,z:layout.spawn[1],yaw:Math.PI,pitch:0,status:'alive',connected:true,ready:false,dread:0,seq:-1,flares:3,magazine:2,reserve:1,reloadUntil:0,flareReadyAt:0,flareFiredAt:null,movement:'walk',checkpoint:null};}
  // Gameplay deliberately pauses across long scheduling gaps instead of fast-
  // forwarding a capture. Expose that same simulation clock to HUDs and actions.
  function snapshot(id='wanderer'){if(!room)return null;return structuredClone({...room,...(controlled?{players:room.players.map(p=>({...p,physical:inputs.public(p.id)}))}:{}),...(controlled?{worldRevision,simulationTick,selfInput:inputs.self(id)}:{}),selfId:id,serverTime:simTime,elapsed:room.huntStarted?Math.max(0,Math.floor(simTime-room.huntStartedAt)):0});}
  function finish(){if(room.huntStarted&&room.players.every(p=>p.status!=='alive')){room.phase=room.players.some(p=>p.status==='escaped')?'won':'lost';room.message=room.phase==='won'?'The ceremony has begun.':'The expedition has ended.';}}
  function verticalRoute(a,b){
   // Navigation layers are built from the same measured roof and crate tops as collision.
   const key=(x,y,z)=>`${x},${y.toFixed(2)},${z}`,nodes=new Map(),queue=[];
   const add=(x,y,z,parent)=>{const k=key(x,y,z);if(nodes.has(k))return;const n={x,y,z,parent};nodes.set(k,n);queue.push(n);};
   add(Math.round(a.x),a.y,Math.round(a.z),null);let best=queue[0],bestD=distance(best,b);
   for(let i=0;i<queue.length&&i<18000;i++){const n=queue[i],d=distance(n,b);if(d<bestD){best=n;bestD=d;}if(d<1.4)break;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=n.x+dx,z=n.z+dz;if(x<minX||x>maxX||z<minZ||z>maxZ)continue;
     const top=world.floorAt(x,z,n.y+3.15),ys=[top];if(top>0&&!world.solid(x,0,z,.1))ys.push(0);
     for(const y of ys){if(y<n.y-4||world.solid(x,y,z,.1))continue;if(Math.abs(y-n.y)<.5&&!world.clear(n,{x,y,z},.1))continue;add(x,y,z,n);}
    }
   }
   const result=[];for(let n=best;n&&n.parent;n=n.parent)result.unshift({x:n.x,y:n.y,z:n.z});return result;
  }
  function step(dt){const now=simTime;
   if(controlled&&dt>0){simulationTick++;inputs.step(simulationTick);}
   if(room.phase!=='playing')return;
   for(const p of room.players){const air=airborne.get(p.id);if(air&&now-air.at>1.8){p.y=world.floorAt(p.x,p.z,p.y);p.poseRejected=true;airborne.delete(p.id);groundAwait.add(p.id);}if(!p.connected&&p.status==='alive'&&now-(p.disconnectedAt??now)>60){p.status='left';p.reloadUntil=0;if(room.host===p.id)room.host=alive()[0]?.id;}if(p.reloadUntil&&now>=p.reloadUntil){const n=Math.min(2-p.magazine,p.reserve);p.magazine+=n;p.reserve-=n;p.reloadUntil=0;}p.flares=p.magazine+p.reserve;}
   if(room.countdownUntil!=null&&now>=room.countdownUntil){room.huntStarted=true;room.huntStartedAt=room.countdownUntil;room.countdownUntil=null;room.message='The bell has sounded. Find eight pages, then reach the pyramid.';}
   const w=room.watcher,players=living();if(!room.huntStarted){w.state='waiting';return;}finish();if(!players.length)return;
   let p=players.reduce((a,b)=>distance(w,a)<distance(w,b)?a:b);w.targetId=p.id;
   if(now<w.repelledUntil){w.state='repelled';contacts.clear();route=[];const d=distance(w,p);if(d>.01){const q={x:w.x+(w.x-p.x)/d*dt*2,y:w.y,z:w.z+(w.z-p.z)/d*dt*2};if(q.x>=minX&&q.x<=maxX&&q.z>=minZ&&q.z<=maxZ&&world.clear(w,q,.48))Object.assign(w,q);}return;}
   if(now-room.huntStartedAt<14){w.state='waiting';return;}
   let watched=false;
   for(const q of players){
    const eye=eyeHeight(q),dx=w.x-q.x,dy=w.y+1.3-q.y-eye,dz=w.z-q.z,d=Math.hypot(dx,dy,dz),pitch=q.pitch||0;
    const alignment=(Math.cos(pitch)*(Math.sin(q.yaw)*dx+Math.cos(q.yaw)*dz)+Math.sin(pitch)*dy)/Math.max(.01,d);
    const sees=q.connected&&distance(w,q)<30&&d>.01&&alignment>.87&&sightAt(q,eye,w,1.3);
    q.dread=Math.max(0,Math.min(1,q.dread+dt*(sees?.2:-.14)));watched ||=sees&&q.dread<.8;
   }
   w.state=watched?'observed':room.collected.length>=5?'hunting':'stalking';
   if(Math.abs(w.y-p.y)<.4&&world.clear(w,p,.48))route=[{x:p.x,y:p.y,z:p.z}];
   else if(now>=repath){repath=now+.7;route=(w.y>.5||p.y>.5)?verticalRoute(w,p):pathBetween([w.x,w.z],[p.x,p.z]).map(([x,z])=>({x,y:0,z}));if(route.length>1&&world.clear(w,route[1],.48))route.shift();}
   let remaining=(.7+room.collected.length*.25)*(watched?.22:1)*dt;
   while(route.length&&remaining>0){const next=route[0],d=distance(w,next);if(d<.03){route.shift();continue;}const travel=Math.min(d,remaining),q={x:w.x+(next.x-w.x)/d*travel,y:w.y+(next.y-w.y)/d*travel,z:w.z+(next.z-w.z)/d*travel};
    // Climb vertically before entering a raised step, never phase through its side.
    if(next.y>w.y+.2&&!world.clear(w,q,.2)){q.x=w.x;q.z=w.z;q.y=Math.min(next.y,w.y+travel);if(!world.clear(w,q,.2)){route=[];repath=now;break;}w.state='climbing';}
    else if(!world.clear(w,q,.2)){route=[];repath=now;break;}
    w.yaw=Math.atan2(next.x-w.x,next.z-w.z);Object.assign(w,q);remaining-=travel;if(travel===d)route.shift();
   }
   // Capture needs a clear segment to the player's body, including a crouched
   // or ragdolled body. It is independent of whether the player is looking back.
   for(const q of players){const contact=distance(w,q)<1.25&&Math.abs(w.y-q.y)<1&&sightAt(w,1.3,q,stanceHeight(q)*.5)?(contacts.get(q.id)||0)+dt:0;contacts.set(q.id,contact);if(contact>=.65){q.status='caught';q.reloadUntil=0;room.message=q.name+' was taken by the Attendant.';}}
   finish();
  }
  function tick(){if(!room)return null;const now=clock();accumulator+=Math.min(.25,Math.max(0,now-lastTick));lastTick=now;let n=0;while(accumulator>=1/60&&n++<15){simTime+=1/60;step(1/60);accumulator-=1/60;}return snapshot();}
  function command(data,id='wanderer',internal=false){
   if(controlled&&!internal&&['pose','flare','reload','collect','ring-bell','interrupt','bail'].includes(data.action))throw Error('Submit sequenced inputs for this expedition.');
   if(data.action==='solo'||data.action==='create'){const now=clock(),solo=data.action==='solo';id=data.id||id;const p=player(id,data.name,data.character,data.characterRevision);p.ready=solo;lastTick=simTime=now;accumulator=0;simulationTick=0;route=[];contacts.clear();budgets.clear();airborne.clear();groundAwait.clear();
    const draw=random||seededRandom();
    room={code:solo?'SOLO':data.code||'PARTY',solo,layoutSeed,worldVersion,protocolVersion,phase:solo?'playing':'lobby',host:id,pages:layout.pages.map(p=>{const value=draw();if(!Number.isFinite(value)||value<0||value>=1)throw Error('Invalid expedition random sample.');const s=p.sockets[Math.floor(value*p.sockets.length)];return {id:p.id,title:p.title,site:p.site,x:s[0],y:s[2]||0,z:s[1]};}),collected:[],chat:[],huntStarted:false,huntStartedAt:null,countdownUntil:null,bell,flareRules,message:'Explore safely. Ready up and ring the Moon Temple bell to begin.',players:[p],watcher:{x:11.7,y:0,z:-82,yaw:0,state:'waiting',repelledUntil:0}};if(controlled){for(const prior of inputs.capture())inputs.remove(prior.id);inputs.add(p,simulationTick);}return {token:solo?'browser-solo':undefined,...snapshot(id)};
   }
   if(!room)throw Error('Enter the night district first.');if(!controlled)tick();
   // Browser-solo actions carry their just-sampled pose. Validate it using the
   // same sequenced path as regular movement before spending ammo or interacting.
   if(['flare','reload','collect','ring-bell'].includes(data.action)&&data.pose){
    const current=room.players.find(p=>p.id===id);if(!Number.isInteger(data.seq)||!current||data.seq<=current.seq)throw Error('Stale action position.');
    const posed=command({action:'pose',seq:data.seq,pose:data.pose},id),self=posed.players.find(p=>p.id===id);
    if(self?.poseRejected)throw Error('Position is synchronizing. Try the action again.');
   }
   const now=simTime;
   if(data.action==='join'){if(room.phase!=='lobby')throw Error('This expedition has already started.');if(room.players.length>=6)throw Error('This party is full.');const pid=data.id||id;if(room.players.some(p=>p.id===pid))throw Error('Already joined.');const joined=player(pid,data.name,data.character,data.characterRevision);room.players.push(joined);inputs?.add(joined,simulationTick);return snapshot(pid);}
   const p=room.players.find(p=>p.id===id);if(!p)throw Error('Player not found.');
   if(data.action==='inputs'){if(!controlled||!p.connected||p.status!=='alive')throw Error('Movement input is unavailable.');inputs.enqueue(id,data.frames,simulationTick);return snapshot(id);}
   if(data.action==='reconnect'){p.connected=true;p.disconnectedAt=null;return snapshot(id);}
   if(data.action==='disconnect'){inputs?.clear(id);p.connected=false;p.disconnectedAt=now;p.reloadUntil=0;if(room.countdownUntil){room.countdownUntil=null;room.message='Countdown cancelled: a player disconnected.';}return snapshot(id);}
   if(data.action==='leave'){inputs?.clear(id);if(room.solo){room=null;return {ok:true};}if(room.phase==='lobby'){inputs?.remove(id);room.players=room.players.filter(q=>q!==p);if(room.host===id)room.host=room.players[0]?.id;}else {p.connected=false;p.status='left';p.reloadUntil=0;if(room.host===id)room.host=alive()[0]?.id;finish();}return snapshot(id);}
   if(data.action==='ready'){if(room.huntStarted||room.countdownUntil)throw Error('The bell has already sounded.');p.ready=data.ready!==false;return snapshot(id);}
   if(data.action==='start'){if(id!==room.host)throw Error('Only the host can start.');if(room.phase!=='lobby')throw Error('Already started.');if(!living().every(q=>q.connected&&q.ready))throw Error('Everyone must be connected and ready.');room.phase='playing';return snapshot(id);}
   if(data.action==='chat'){const text=String(data.text||'').trim().slice(0,240);if(text)room.chat.push({id:room.chat.length+1,name:p.name,text,at:now});room.chat=room.chat.slice(-40);return snapshot(id);}
   if(p.status!=='alive'||!p.connected||room.phase!=='playing')throw Error('This expedition has ended.');
   if(data.action==='reset-exploration'){
    if(!room.solo||room.huntStarted||room.countdownUntil)throw Error('Position reset is only available during safe solo exploration.');
    Object.assign(p,{x:layout.spawn[0],y:0,z:layout.spawn[1],yaw:Math.PI,pitch:0,movement:'walk',checkpoint:null,reloadUntil:0,poseRejected:false,dread:0});
    inputs?.reset(id,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,nextTick:simulationTick});
    budgets.set(id,{distance:.5,at:now});airborne.delete(id);groundAwait.delete(id);contacts.delete(id);
    room.message='Returned to the district entrance. Explore safely until you ring the bell.';
   }else if(data.action==='pose'){
    const pose={...data.pose,y:data.pose?.y??0,pitch:data.pose?.pitch??0,movement:data.pose?.movement||data.pose?.mode||'walk'};if(!['x','y','z','yaw','pitch'].every(k=>Number.isFinite(pose[k]))||Math.abs(pose.pitch)>Math.PI/2||!Number.isSafeInteger(data.seq)||data.seq<0||data.seq>p.seq+256||!movementModes.has(pose.movement))throw Error('Invalid position.');
    if(data.seq>p.seq){p.seq=data.seq;const budget=budgets.get(id)||{distance:.8,at:now-.1};const dt=Math.min(.25,Math.max(0,now-budget.at));budget.distance=Math.min(2.5,budget.distance+dt*10);budget.at=now;
     const d=Math.hypot(pose.x-p.x,pose.z-p.z),floor=world.supportAt(pose.x,pose.z,pose.y+.1,root.playerBodyProfile(p.character).radius),grounded=pose.y<=floor+.12;
     const ledge=['hang','mantle','climb','scramble','wallrun'].includes(pose.movement)&&world.boxes.some(b=>pose.x>=b.minX-1.2&&pose.x<=b.maxX+1.2&&pose.z>=b.minZ-1.2&&pose.z<=b.maxZ+1.2&&b.top>=pose.y-.5&&b.top<pose.y+3.2);
     const air=airborne.get(id)||{at:now,base:p.y,peak:p.y};const age=Math.max(0,now-air.at);
     const verticalOK=grounded||(!groundAwait.has(id)&&(ledge||(age<1.8&&pose.y<=air.base+Math.min(3.6,Math.max(0,12*age-9*age*age))+.7&&!(age>.9&&pose.y>p.y+.02))));
     if(d<=budget.distance&&verticalOK&&world.validPose(p,pose,Math.max(dt,.05),p.character)){p.x=pose.x;p.y=pose.y;p.z=pose.z;budget.distance-=d;p.checkpoint={x:p.x,y:p.y,z:p.z};p.poseRejected=false;
      p.yaw=((pose.yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2);p.pitch=pose.pitch;p.movement=pose.movement;if(['bail','hang','mantle','climb','ragdoll','vault','scramble'].includes(p.movement))p.reloadUntil=0;
      if(grounded||ledge){airborne.delete(id);if(grounded)groundAwait.delete(id);}else{air.peak=Math.max(air.peak,p.y);airborne.set(id,air);}
     }else p.poseRejected=true;
     budgets.set(id,budget);
     if(!p.poseRejected&&room.collected.length===room.pages.length&&p.y<1.2&&Math.abs(p.x-layout.exit[0])<1.35&&p.z<layout.exit[1]+1.1){p.status='escaped';p.reloadUntil=0;room.message=p.name+' reached the ceremony.';finish();}
    }
   }else if(data.action==='ring-bell'){
    if(id!==room.host)throw Error('Only the leader can ring the bell.');if(room.huntStarted||room.countdownUntil)throw Error('The bell has already sounded.');if(!living().every(q=>q.connected&&q.ready))throw Error('Everyone must be connected and ready.');if(distance(p,bell)>2.5||!world.sight(p,bell))throw Error('Move closer to the Moon Temple bell.');room.countdownUntil=simTime+3;room.message='The bell will sound in three seconds.';
   }else if(data.action==='interrupt'){p.reloadUntil=0;
   }else if(data.action==='reload'){
    if(p.reloadUntil)throw Error('Already reloading.');if(p.magazine>=2||p.reserve<=0)throw Error('No reload needed.');if(['bail','hang','mantle','climb','ragdoll','vault','scramble'].includes(p.movement))throw Error('Hands are busy.');p.reloadUntil=simTime+flareRules.reload;
   }else if(data.action==='flare'){
    if(!room.huntStarted)throw Error('Flares are reserved for the hunt.');if(p.reloadUntil)throw Error('Reloading.');if(['bail','hang','mantle','climb','ragdoll','vault','scramble'].includes(p.movement))throw Error('Hands are busy.');if(p.magazine<=0)throw Error(p.reserve?'Reload the flare launcher.':'No flares remaining.');if(now<p.flareReadyAt)throw Error('The flare launcher is cooling down.');p.magazine--;p.flares=p.magazine+p.reserve;p.flareReadyAt=now+flareRules.cooldown;p.flareFiredAt=now;
    const w=room.watcher,dx=w.x-p.x,dz=w.z-p.z,d=distance(w,p),horizontal=Math.hypot(dx,dz),alignment=(Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz)/Math.max(.001,horizontal);
    const direct=alignment>=Math.cos(flareRules.aimDegrees*Math.PI/180),assisted=data.aimAssist===true&&alignment>=Math.cos(flareRules.assistDegrees*Math.PI/180);
    const height=['crouch','slide','prone'].includes(p.movement)?.45:1.05;
    const origin={x:p.x,y:p.y+height,z:p.z},muzzle={x:p.x+Math.sin(p.yaw)*Math.cos(p.pitch)*.4+Math.cos(p.yaw)*.18,y:origin.y+Math.sin(p.pitch)*.4,z:p.z+Math.cos(p.yaw)*Math.cos(p.pitch)*.4-Math.sin(p.yaw)*.18},target={x:w.x,y:w.y+1.2,z:w.z};
    const vertical=Math.abs(Math.atan2(target.y-muzzle.y,Math.max(.001,Math.hypot(target.x-muzzle.x,target.z-muzzle.z)))-p.pitch)<=flareRules.verticalDegrees*Math.PI/180;
    // sight() accepts feet coordinates and adds 1.3m. Convert exact projectile heights explicitly.
    const clearShot=(a,b)=>world.sight({...a,y:a.y-1.3},{...b,y:b.y-1.3});
    const unobstructed=clearShot(origin,muzzle)&&clearShot(muzzle,target)&&world.sight(p,w);
    p.flareAssisted=false;p.flareOutcome=unobstructed?'miss':'obstructed';
    if(d<=flareRules.range&&horizontal>.001&&vertical&&(direct||assisted)&&unobstructed){w.repelledUntil=simTime+flareRules.duration;w.state='repelled';contacts.clear();route=[];p.flareAssisted=!direct&&assisted;p.flareOutcome='repelled';room.message='The Attendant recoils from the light. Run.';}else room.message=unobstructed?'Flare spent. Face the Attendant within '+flareRules.range+' metres with a clear view.':'Flare blocked by cover. Find a clear muzzle position.';
   }else if(data.action==='collect'){
    if(!room.huntStarted)throw Error('Ring the Moon Temple bell before collecting pages.');const page=room.pages.find(q=>q.id===data.page);if(!page||distance(p,page)>2.5||Math.abs(p.y-page.y)>1.6||!world.sight(p,page))throw Error('Move closer to the page.');if(!room.collected.includes(page.id)){room.collected.push(page.id);room.message=room.collected.length===room.pages.length?'Eight pages. The pyramid is open.':'You found '+page.title+'.';}
   }else throw Error('Unknown expedition action.');
   return snapshot(id);
  }
  // Trusted persistence API only: never dispatch these methods from public commands.
  function exportCheckpoint(){return room?structuredClone({version:protocolVersion,...(controlled?{worldRevision,simulationTick,inputActors:inputs.capture(),route,repath,contacts:[...contacts]}:{}),savedAt:simTime,room,airborne:[...airborne],groundAwait:[...groundAwait],budgets:[...budgets]}):null;}
  function restoreCheckpoint(checkpoint,{downtimeSeconds=0}={}){
   if(!checkpoint||checkpoint.version!==protocolVersion||!Number.isFinite(checkpoint.savedAt)||!Number.isFinite(downtimeSeconds)||downtimeSeconds<0||downtimeSeconds>31536000)throw Error('Invalid expedition checkpoint.');
   if(controlled&&(checkpoint.worldRevision!==worldRevision||!Number.isSafeInteger(checkpoint.simulationTick)||checkpoint.simulationTick<0))throw Error('Incompatible input checkpoint world.');
   const saved=structuredClone(checkpoint),r=saved.room;
   if(!r||!['lobby','playing','won','lost'].includes(r.phase)||!Array.isArray(r.players)||r.players.length<1||r.players.length>6||!Array.isArray(r.pages)||r.pages.length!==layout.pages.length||!Array.isArray(r.collected)||r.collected.length>r.pages.length||!Array.isArray(r.chat)||r.chat.length>40)throw Error('Invalid expedition checkpoint room.');
   if(r.layoutSeed!==undefined&&r.layoutSeed!==null&&(!Number.isInteger(r.layoutSeed)||r.layoutSeed<0||r.layoutSeed>0xffffffff))throw Error('Invalid expedition checkpoint seed.');
   if((r.protocolVersion!==undefined&&r.protocolVersion!==protocolVersion)||(r.worldVersion!==undefined&&r.worldVersion!==worldVersion))throw Error('Incompatible expedition checkpoint world/protocol version.');
   r.layoutSeed??=null;r.protocolVersion??=protocolVersion;r.worldVersion??=worldVersion;
   const ids=new Set();for(const p of r.players){p.pitch??=0;if(typeof p.id!=='string'||!p.id||p.id.length>128||ids.has(p.id)||!['alive','escaped','caught','left'].includes(p.status)||!['x','y','z','yaw','pitch','dread','seq','magazine','reserve','flareReadyAt','reloadUntil'].every(k=>Number.isFinite(p[k]))||Math.abs(p.pitch)>Math.PI/2||p.x<minX||p.x>maxX||p.z<minZ||p.z>maxZ||p.y<0||p.y>60||!Number.isInteger(p.magazine)||p.magazine<0||p.magazine>2||!Number.isInteger(p.reserve)||p.reserve<0||p.reserve>1)throw Error('Invalid expedition checkpoint player.');ids.add(p.id);}
   if(r.host!=null&&!ids.has(r.host))throw Error('Invalid expedition checkpoint leader.');
   for(const p of r.pages){const spec=layout.pages.find(q=>q.id===p.id);if(!spec||!spec.sockets.some(s=>s[0]===p.x&&s[1]===p.z&&(s[2]||0)===(p.y||0)))throw Error('Invalid expedition checkpoint page.');}
   if(new Set(r.pages.map(p=>p.id)).size!==r.pages.length||new Set(r.collected).size!==r.collected.length||r.collected.some(id=>!r.pages.some(p=>p.id===id)))throw Error('Invalid expedition checkpoint collection.');
   const w=r.watcher;if(!w||!['x','y','z','yaw','repelledUntil'].every(k=>Number.isFinite(w[k]))||w.x<minX||w.x>maxX||w.z<minZ||w.z>maxZ||w.y<0||w.y>60)throw Error('Invalid expedition checkpoint watcher.');
   for(const value of [r.countdownUntil,r.huntStartedAt])if(value!=null&&!Number.isFinite(value))throw Error('Invalid expedition checkpoint timer.');
   for(const field of ['airborne','groundAwait','budgets'])if(!Array.isArray(saved[field])||saved[field].length>6)throw Error('Invalid expedition checkpoint motion.');
   for(const pair of saved.airborne)if(!Array.isArray(pair)||pair.length!==2||!ids.has(pair[0])||!pair[1]||!['at','base','peak'].every(k=>Number.isFinite(pair[1][k])))throw Error('Invalid expedition checkpoint airborne state.');
   for(const pair of saved.budgets)if(!Array.isArray(pair)||pair.length!==2||!ids.has(pair[0])||!pair[1]||!Number.isFinite(pair[1].distance)||!Number.isFinite(pair[1].at))throw Error('Invalid expedition checkpoint budget.');
   if(saved.groundAwait.some(id=>!ids.has(id)))throw Error('Invalid expedition checkpoint recovery.');
   if(controlled){
    const prepared=root.createExpeditionInputs({T,world,layout,worldRevision,getRoom:()=>r,applyPose(){},applyAction(){}});prepared.restore(saved.inputActors,saved.simulationTick);
    if(!Array.isArray(saved.route)||saved.route.length>18000||!saved.route.every(p=>['x','y','z'].every(k=>Number.isFinite(p[k])))||!Number.isFinite(saved.repath)||!Array.isArray(saved.contacts)||saved.contacts.some(v=>!Array.isArray(v)||!ids.has(v[0])||!Number.isFinite(v[1])||v[1]<0||v[1]>.65))throw Error('Invalid input checkpoint pursuit.');
   }
   const now=clock(),shift=now-saved.savedAt-(controlled?0:downtimeSeconds),rebase=v=>v==null?v:v+shift;
   r.huntStartedAt=rebase(r.huntStartedAt);r.countdownUntil=rebase(r.countdownUntil);w.repelledUntil=rebase(w.repelledUntil);
   for(const p of r.players){p.flareReadyAt=rebase(p.flareReadyAt);if(p.reloadUntil){p.reloadUntil=rebase(p.reloadUntil);if(p.reloadUntil<=now){const n=Math.min(2-p.magazine,p.reserve);p.magazine+=n;p.reserve-=n;p.reloadUntil=0;}}p.flareFiredAt=rebase(p.flareFiredAt);p.disconnectedAt=rebase(p.disconnectedAt);p.flares=p.magazine+p.reserve;}
   room=r;room.bell=bell;room.flareRules=flareRules;lastTick=simTime=now;accumulator=0;simulationTick=0;route=[];repath=0;contacts.clear();budgets.clear();airborne.clear();groundAwait.clear();
   for(const [id,b] of saved.budgets)budgets.set(id,{distance:Math.max(0,Math.min(.5,b.distance)),at:now});for(const [id,a] of saved.airborne)airborne.set(id,{...a,at:rebase(a.at)});for(const id of saved.groundAwait)groundAwait.add(id);
   if(controlled){simulationTick=saved.simulationTick;inputs.restore(saved.inputActors,simulationTick);route=saved.route;repath=rebase(saved.repath);for(const [id,contact] of saved.contacts)contacts.set(id,contact);}
   step(0);return snapshot(room.host);
  }
  return {command:(data,id)=>command(data,id),tick,snapshot,pathBetween,verticalRoute,world,exportCheckpoint,restoreCheckpoint,resumeInputs(id){inputs?.resume(id,simulationTick);return snapshot(id);},controller:id=>inputs?.get(id),dispose(){inputs?.dispose();room=null;}};
 }
 root.createSoloExpedition=createSoloExpedition;
 if(typeof module==='object'&&module.exports)module.exports=createSoloExpedition;
})(typeof window==='object'?window:globalThis);
