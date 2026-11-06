// How movement should feel, each as a scripted run. Returns the number of failures.
const beside = `const near=(minTop)=>{const c=S.climbs().find(c=>c.top>=minTop&&crateSpot(c,3));const sp=crateSpot(c,3);settle();S.sprintTo(1e-6);S.teleport(sp.x,sp.z,0);return {c,dx:Math.sign(sp.x-c.x),dz:Math.sign(sp.z-c.z)};};
  const hangOn=({c,dx,dz})=>{const P=S.parkour();S.dropAt(c.x+dx*1.45,c.z+dz*1.45,c.top-1.9,c.x,c.z);S.sprintTo(3);let n=0;while(P.inspect().state!=='hang'&&n++<20)S.sim(1,1/60,[]);S.sim(30,1/60,[]);return P.inspect().state==='hang';};
  const feetNow=()=>S.sim(0,1/60,[]).feet;
  const key=(k,down)=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{key:k,bubbles:true}));const run=down=>{key('w',down);key('Shift',down);};
  const m=()=>S.getState().movement,speed=()=>Math.hypot(m().velocity[0],m().velocity[2]);`;
const list = {
  'A jump just after walking off an edge still works': `const s=spot();at(s);S.sim(12,1/60,['w','shift']);S.sim(90,1/60,['w','shift'],true);S.sim(30,1/60,[]);S.face(Math.atan2(s.x-s.ax,-(s.z-s.az)));
    let left=false;for(let i=0;i<240&&!left;i++){S.sim(1,1/60,['w']);left=m().airborne;}S.sim(3,1/60,['w']);S.sim(1,1/60,['w'],true);return {ok:left&&m().vy>3,left,upSpeed:+m().vy.toFixed(2)};`,
  'A jump pressed just before landing fires on landing': `const s=spot();at(s);S.sim(1,1/60,[],true);let n=0;while(m().vy>-4.6&&n++<120)S.sim(1,1/60,[]);S.sim(1,1/60,[],true);let landed=false,again=false;for(let i=0;i<30;i++){S.sim(1,1/60,[]);if(!m().airborne)landed=true;if(m().vy>3)again=true;}return {ok:again,again,landed};`,
  'Catching a ledge mid-fall is not a landing': `const n=near(5),P=S.parkour(),before=P.inspect().stats.hard;S.dropAt(n.c.x+n.dx*1.45,n.c.z+n.dz*1.45,n.c.top+2,n.c.x,n.c.z);let k=0;while(feetNow()>n.c.top-.5&&k++<90)S.sim(1,1/60,[]);let caught=false;for(let i=0;i<30;i++){S.sim(1,1/60,['w']);if(P.inspect().state)caught=true;}S.sim(60,1/60,[]);const hard=P.inspect().stats.hard-before;return {ok:caught&&hard===0,caught,hard};`,
  'Falling from a hang counts from where you let go': `const n=near(5),P=S.parkour(),hung=hangOn(n);const from=feetNow(),hard=P.inspect().stats.hard;S.sim(30,1/60,['s']);S.sim(90,1/60,[]);const fell=P.inspect().stats.hard>hard,fall=fell?P.inspect().stats.lastFall:0;return {ok:hung&&fall<=from+.2,hung,letGoAt:from,top:n.c.top,measuredFall:fall};`,
  'Arrow keys climb up from a hang': `const n=near(5),P=S.parkour(),hung=hangOn(n);S.sim(3,1/60,['arrowup']);const state=P.inspect().state;S.sim(60,1/60,[]);return {ok:hung&&state==='climb',hung,state};`,
  'A quick climb keeps your speed': `const s=spot();at(s);S.sim(14,1/60,['w','shift']);const entry=speed();S.sim(1,1/60,['w','shift'],true);const P=S.parkour();let climbed=false,exit=null;for(let i=0;i<110&&exit==null;i++){S.sim(1,1/60,['w','shift']);const st=P.inspect().state;if(st==='climb')climbed=true;else if(climbed&&!st)exit=speed();}return {ok:climbed&&exit>2,entry:+entry.toFixed(2),exit:exit&&+exit.toFixed(2)};`,
  'Letting go of W in the air keeps the run-up': `const s=spot();const dx=Math.sign(s.x-s.ax),dz=Math.sign(s.z-s.az);settle();S.teleport(s.x+dx*12,s.z+dz*12,Math.atan2(-dx,dz));S.sim(40,1/60,['w','shift']);S.sim(1,1/60,['w','shift'],true);const a=speed();S.sim(30,1/60,[]);const b=speed();return {ok:a>4&&b>a*.85,before:+a.toFixed(2),after:+b.toFixed(2)};`,
  'A slide and a dive both still work': `const s=spot();const dx=Math.sign(s.x-s.ax),dz=Math.sign(s.z-s.az);settle();S.teleport(s.x+dx*14,s.z+dz*14,Math.atan2(-dx,dz));run(true);S.sim(30,1/60,[]);pressC(true);const modes=new Set();for(let i=0;i<60;i++){S.sim(1,1/60,[]);modes.add(S.getState().feel.mode);}pressC(false);run(false);S.sim(60,1/60,[]);return {ok:modes.has('slide')&&modes.has('dive'),modes:[...modes]};`,
  'One thing at a time: a dive into a ledge climbs, with no belly-flop': `const s=spot();const dx=Math.sign(s.x-s.ax),dz=Math.sign(s.z-s.az);let result=null;for(const back of [5,6,7,8,9,10]){settle();S.teleport(s.ax+dx*back,s.az+dz*back,Math.atan2(-dx,dz));run(true);S.sim(30,1/60,[]);pressC(true);const P=S.parkour();const modes=new Set();let bad=0,dived=false,climbed=false;for(let i=0;i<110;i++){S.sim(1,1/60,[]);const f=S.getState().feel,st=P.inspect().state;modes.add(f.mode);if(f.mode==='dive')dived=true;if(st==='climb'&&dived)climbed=true;if(st&&(f.dive||f.slide))bad++;}pressC(false);run(false);S.sim(60,1/60,[]);result={ok:bad===0,bad,back,dived,climbed,modes:[...modes]};if(climbed)break;}return result;`,
};
export async function checks(evaluate) {
  let failed = 0;
  for (const [name, code] of Object.entries(list)) {
    let r; try { r = await evaluate(`seed(11);(()=>{${beside}${code}})()`); } catch (e) { r = {ok: false, note: String(e.message).split('\n')[0]}; }
    if (!r?.ok) failed++;
    console.log(`${r?.ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(r)}`);
  }
  console.log(failed ? `${failed} failed` : 'All passed');
  return failed;
}
