'use strict';
// Network smoothing for other visitors: each keeps its last few poses and is drawn a little in the past, interpolated
// between real samples (extrapolated briefly if the next one is late), so uneven packets do not make them jitter, stall
// or snap. When the server says when it took each pose, samples live on the server's clock; otherwise they are placed
// on a steady timeline estimated from arrivals. Time is passed in, so the same code runs in tests.
(function(root){
 function createVisitorSmoothing({keep=32,minDelay=.07,maxDelay=.6,lookAhead=.25,teleport=6}={}){
  const samples=[];let interval=0,late=0,lastArrival=0,shown=null,offset=null,serverClock=false;
  const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  const push=(t,x,z,yaw)=>{const last=samples.at(-1);if(last&&Math.hypot(x-last.x,z-last.z)>teleport){samples.length=0;shown=null;}samples.push({t,x,z,yaw});if(samples.length>keep)samples.shift();};
  return {
   // A pose arrived at time `now` (seconds, ours). at: when it was taken (ms, on the sender's or the server's clock), if
   // known. Any steady clock works: only gaps between samples, and the smallest delay seen, are used.
   add(now,x,z,yaw,at=0){
    const last=samples.at(-1);
    if(at>0){
     const t=at/1000;if(!serverClock){serverClock=true;samples.length=0;}
     if(last&&t<last.t-5){samples.length=0;offset=null;late=0;}// their clock restarted (a reload): start over
     else if(last&&t<=last.t)return;// a repeat of a pose we already have
     // How far behind our clock the server's is: the smallest gap seen, drifting up slowly in case the clocks run at
     // slightly different rates. How late a packet is beyond that is network jitter, which the delay must cover.
     const gap=now-t;offset=offset===null?gap:Math.min(offset+.0002,gap);late=Math.max(gap-offset,late*.996);
     if(last)interval+=((Math.min(t-last.t,(interval||.1)*1.6))-interval)*.1;
     lastArrival=now;push(t,x,z,yaw);return;}
    if(serverClock)return;
    if(last&&last.x===x&&last.z===z&&last.yaw===yaw&&now-lastArrival<1){lastArrival=now;return;}
    let t=now;
    if(last){const gap=Math.min(1.5,now-lastArrival);
     // Packets leave at a steady rate but arrive unevenly: place each on a steady timeline (allowing for dropped ones)
     // and pull that timeline only slowly towards the arrivals, so arrival jitter does not become speed jitter.
     interval=interval?interval+(Math.min(gap,interval*1.6)-interval)*.1:gap;
     const steps=Math.max(1,Math.round(gap/Math.max(.01,interval)));t=last.t+steps*interval;t+=(now-t)*.08;t=Math.max(t,last.t+.005);
     late=Math.max(Math.abs(now-t),late*.996);}
    lastArrival=now;push(t,x,z,yaw);},
   delay:()=>Math.min(maxDelay,Math.max(minDelay,(interval||.1)*1.15+late+.02)),
   // Where to draw the visitor at time `now`, into `out` {x,z,yaw}; false until a pose has arrived.
   sample(now,out){if(!samples.length)return false;const t=(serverClock?now-offset:now)-this.delay(),b=samples;
    if(t<=b[0].t){out.x=b[0].x;out.z=b[0].z;out.yaw=b[0].yaw;return true;}
    for(let i=b.length-1;i>0;i--)if(b[i-1].t<=t){const s0=b[i-1],s1=b[i];if(t<=s1.t){const k=(t-s0.t)/Math.max(1e-3,s1.t-s0.t);out.x=s0.x+(s1.x-s0.x)*k;out.z=s0.z+(s1.z-s0.z)*k;out.yaw=s0.yaw+angle(s0.yaw,s1.yaw)*k;return true;}break;}
    const s1=b.at(-1),s0=b.at(-2),ahead=Math.min(t-s1.t,lookAhead);
    if(s0&&ahead>0){const span=Math.max(1e-3,s1.t-s0.t);out.x=s1.x+(s1.x-s0.x)/span*ahead;out.z=s1.z+(s1.z-s0.z)/span*ahead;}else{out.x=s1.x;out.z=s1.z;}
    out.yaw=s1.yaw;return true;},
   // sample() plus a light, frame-rate independent smoothing of the drawn spot (snaps on a teleport).
   draw(now,out){if(!this.sample(now,out))return false;
    if(!shown||Math.hypot(out.x-shown.x,out.z-shown.z)>teleport)shown={x:out.x,z:out.z,t:now};
    else{const k=1-Math.exp(-22*Math.max(0,Math.min(.1,now-shown.t)));shown.x+=(out.x-shown.x)*k;shown.z+=(out.z-shown.z)*k;shown.t=now;out.x=shown.x;out.z=shown.z;}
    return true;},
   recent:now=>samples.length>1&&now-lastArrival<1
  };
 }
 root.createVisitorSmoothing=createVisitorSmoothing;
 if(typeof module==='object'&&module.exports)module.exports={createVisitorSmoothing};
})(typeof window==='object'?window:globalThis);
