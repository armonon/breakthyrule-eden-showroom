'use strict';
// Body-camera sound for the Beyond Eden night world (and only there). Everything is synthesised here; no audio files.
//   spaces   the listener's surroundings (district walls and roofs) are read five times a second and mixed into three
//            reverbs whose impulse responses are generated in code: open courtyard (sparse facade echoes, long dark
//            tail), street between buildings (flutter between two facades), indoors (dense, short, boomy)
//   gunshots combat-audio.js asks shotPlan()/voice() how to play each recorded layer: a louder close crack, slap-backs
//            off the nearest facades (delay = the real path), a longer distant tail, and a low-pass with attenuation
//            when a wall stands between listener and source
//   body     cloth rustle and gear rattle from speed and turning, breathing after a sprint, footsteps per surface
//            (asphalt, concrete, paving, metal, grass, dirt)
//   mic      the body-cam microphone on the Beyond bus: band-limited, lightly compressed, soft-clipped on loud shots.
//            One switch: beyondAudio.setMic(false), stored in localStorage 'eden-bodycam-mic' ('0' = off, default on)
// Outside Beyond the bus is a plain pass-through (unity gain, no reverb, no mic), so garden and arena sound as before.
// It never creates or starts an AudioContext: it lives on the context combat-audio.js hands to attach(), and only
// resumes that one after a real user gesture. All continuous nodes are built once; one-shots reuse pooled channels.
(function(root){
 const SETTING='eden-bodycam-mic';
 const SPACES=['courtyard','street','indoor'];
 const WET={courtyard:.42,street:.48,indoor:.7};
 const SURFACES=['asphalt','concrete','paving','metal','grass','dirt'];
 const ALIAS={stone:'paving',brick:'paving',pavement:'paving',cobble:'paving',tile:'concrete',wood:'concrete',floor:'concrete',road:'asphalt',tarmac:'asphalt',steel:'metal',iron:'metal',grate:'metal',soil:'dirt',mud:'dirt',sand:'dirt',gravel:'dirt',lawn:'grass'};
 const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 const RAYS=12,RAY_MAX=45;

 root.createBeyondAudio=function(options={}){
  const lite=options.lite??(/Android|iPhone|iPad|Mobile/i.test(root.navigator?.userAgent||'')||(root.navigator?.maxTouchPoints>1&&Math.min(root.innerWidth||9999,root.innerHeight||9999)<700));
  let rig=null,camera=options.camera||null,active=false,forced=null,surfaceQuery=options.surfaceAt||null,gesture=false,disposed=false;
  let mic=true;try{mic=root.localStorage?.getItem(SETTING)!=='0';}catch{}
  let seed=options.seed||90210;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};

  /* ------------------------------------------------------------ surroundings */
  // Walls: [x,z,w,d,top] (garden.district.walls) or boxes {minX,maxX,minZ,maxZ,top}. Packed once per list.
  let wallsRef=null,wallsLen=-1,W=new Float32Array(0),nW=0,surfaces=null;
  function setWalls(list){
   if(!list||(list===wallsRef&&list.length===wallsLen))return;wallsRef=list;wallsLen=list.length;W=new Float32Array(list.length*5);nW=0;
   for(const w of list){let a,b,c,d,top;if(Array.isArray(w)){a=w[0]-w[2]/2;b=w[0]+w[2]/2;c=w[1]-w[3]/2;d=w[1]+w[3]/2;top=w[4]??99;}else if(w&&w.minX!=null&&!w.field&&!w.roof){a=w.minX;b=w.maxX;c=w.minZ;d=w.maxZ;top=w.top??99;}else continue;
    const o=nW++*5;W[o]=a;W[o+1]=b;W[o+2]=c;W[o+3]=d;W[o+4]=top;}
  }
  // Nearest wall along a unit direction (2D slab test); walls lower than minTop do not count.
  function ray(ox,oz,dx,dz,max,minTop){
   let best=max;for(let i=0;i<nW;i++){const o=i*5;if(W[o+4]<minTop)continue;let t0=0,t1=best;
    if(Math.abs(dx)<1e-9){if(ox<W[o]||ox>W[o+1])continue;}else{let u=(W[o]-ox)/dx,v=(W[o+1]-ox)/dx;if(u>v){const s=u;u=v;v=s;}if(u>t0)t0=u;if(v<t1)t1=v;if(t0>t1)continue;}
    if(Math.abs(dz)<1e-9){if(oz<W[o+2]||oz>W[o+3])continue;}else{let u=(W[o+2]-oz)/dz,v=(W[o+3]-oz)/dz;if(u>v){const s=u;u=v;v=s;}if(u>t0)t0=u;if(v<t1)t1=v;if(t0>t1)continue;}
    if(t0>.05&&t0<best)best=t0;}
   return best;
  }
  // How many walls stand on the straight line between two points (0..3). Thin posts are ignored; a wall both ends can
  // see over is ignored.
  function wallsBetween(ax,ay,az,bx,by,bz){
   const dx=bx-ax,dz=bz-az,minTop=Math.max(ay,by)+.3;let n=0;
   for(let i=0;i<nW&&n<3;i++){const o=i*5;if(W[o+4]<minTop||(W[o+1]-W[o]<1.2&&W[o+3]-W[o+2]<1.2))continue;let t0=0,t1=1;
    if(Math.abs(dx)<1e-9){if(ax<W[o]||ax>W[o+1])continue;}else{let u=(W[o]-ax)/dx,v=(W[o+1]-ax)/dx;if(u>v){const s=u;u=v;v=s;}if(u>t0)t0=u;if(v<t1)t1=v;if(t0>t1)continue;}
    if(Math.abs(dz)<1e-9){if(az<W[o+2]||az>W[o+3])continue;}else{let u=(W[o+2]-az)/dz,v=(W[o+3]-az)/dz;if(u>v){const s=u;u=v;v=s;}if(u>t0)t0=u;if(v<t1)t1=v;if(t0>t1)continue;}
    if(t0>.001&&t1<.999)n++;}
   return n;
  }
  // A roof or deck over the listener's head: a roof-height field (district model roofs) or a wide slab.
  function roofOver(x,y,z){
   if(!surfaces)return false;
   for(const s of surfaces){
    if(s.field){const F=s.field,c=Math.floor((x-F.minX)/F.cell),r=Math.floor((z-F.minZ)/F.cell);if(c>=0&&r>=0&&c<F.cols&&r<F.rows){const h=F.h?.[r*F.cols+c];if(h>y+.4&&h<y+14)return true;}continue;}
    if(s.wall||s.top==null||x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
    const bottom=s.bottom??s.top-.3;if(bottom>y-.2&&bottom<y+9&&(s.maxX-s.minX)*(s.maxZ-s.minZ)>=12)return true;}
   return false;
  }
  const L={x:0,y:1.75,z:0,fx:0,fz:-1,rx:1,rz:0,valid:false};           // listener: position, forward and right on the ground plane
  const rays=Array.from({length:RAYS},(_,i)=>({dx:Math.cos(i/RAYS*Math.PI*2),dz:Math.sin(i/RAYS*Math.PI*2),d:RAY_MAX}));
  const target={courtyard:1,street:0,indoor:0},mix={courtyard:1,street:0,indoor:0};
  let roof=false,analysedAt=-1;
  function analyse(){
   const minTop=L.y+.5;let near=0;for(const r of rays){r.d=ray(L.x,L.z,r.dx,r.dz,RAY_MAX,minTop);if(r.d<9)near++;}
   roof=roofOver(L.x,L.y,L.z);
   // A street: facades close on both sides of one axis while the axis across it runs open.
   let canyon=0;for(let i=0;i<RAYS/2;i++){const width=rays[i].d+rays[i+RAYS/2].d,j=(i+RAYS/4)%RAYS,along=rays[j].d+rays[(j+RAYS/2)%RAYS].d;
    canyon=Math.max(canyon,clamp((26-width)/10,0,1)*clamp((along-22)/14,0,1)*(Math.min(rays[i].d,rays[i+RAYS/2].d)<14?1:.5));}
   const indoor=roof?1:smooth((near/RAYS-.7)/.3)*.7,street=(1-indoor)*canyon;
   target.indoor=indoor;target.street=street;target.courtyard=Math.max(0,1-indoor-street);
  }
  function listenerFrom(state){
   const cam=state?.camera||camera||root.edenCamera,p=state?.position||cam?.position;if(!p)return false;
   L.x=p.x;L.y=p.y??1.75;L.z=p.z;L.valid=true;
   const q=cam?.quaternion;if(q){let fx=-2*(q.x*q.z+q.w*q.y),fz=-(1-2*(q.x*q.x+q.y*q.y));const n=Math.hypot(fx,fz)||1;fx/=n;fz/=n;L.fx=fx;L.fz=fz;L.rx=-fz;L.rz=fx;}
   return true;
  }
  const district=()=>root.breakThyRuleShowroom?.garden?.()?.district||null;
  function refresh(state,now){
   if(!listenerFrom(state))return;
   if(now-analysedAt<.2&&analysedAt>=0)return;const dt=analysedAt<0?1:Math.min(1,now-analysedAt);analysedAt=now;
   const d=state?.walls&&state?.surfaces?null:district();setWalls(state?.walls||d?.walls);surfaces=state?.surfaces||d?.surfaces||surfaces;
   analyse();const k=1-Math.exp(-dt/.45);
   for(const s of SPACES){const want=forced?(forced===s?1:0):target[s];mix[s]+=(want-mix[s])*(forced?1:k);if(mix[s]<.004)mix[s]=0;}
   if(rig){const t=rig.ctx.currentTime;for(const s of SPACES){const g=rig.pre[s].gain,v=active?mix[s]:0;if(Math.abs(v-rig.sent[s])>.002||(v===0&&rig.sent[s]!==0)){rig.sent[s]=v;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(v,t+.25);}}}
  }

  /* ------------------------------------------------------------ generated sound: impulse responses, steps, gear */
  // Courtyard: nothing close, then single echoes off stone facades 12-70 m away, under a long dark tail.
  // Street: the shot bounces between two facing walls (a flutter every 47 ms) and dies quicker and brighter.
  // Indoors: dense from the first millisecond, short, with low-end boom.
  const IR={
   courtyard:{len:2,rt:1.7,tone0:5200,tone1:900,pre:.035,build:.07,diffuse:.55,echoes:[[.071,.5,-.7],[.118,.42,.6],[.164,.3,-.3],[.231,.24,.8],[.305,.16,-.6],[.42,.1,.4]]},
   street:{len:1.3,rt:1.05,tone0:7000,tone1:1500,pre:.012,build:.02,diffuse:.6,flutter:{period:.047,decay:.74,n:14}},
   indoor:{len:.85,rt:.62,tone0:6500,tone1:2200,pre:.003,build:.004,diffuse:1,early:18,boom:.5}
  };
  function impulse(ctx,name){
   const P=IR[name],sr=ctx.sampleRate,scale=lite?.6:1,rt=P.rt*(lite?.75:1),n=Math.ceil(sr*P.len*scale),channels=lite?1:2,buffer=ctx.createBuffer(channels,n,sr);
   const burst=(d,at,width,amp,tone)=>{const i0=Math.round(at*sr),m=Math.max(8,Math.round(width*sr)),k=Math.exp(-2*Math.PI*tone/sr);let lp=0;for(let i=0;i<m&&i0+i<n;i++){lp=lp*k+(rnd()*2-1)*(1-k);d[i0+i]+=lp*amp*Math.sin(Math.PI*(i+.5)/m)*3;}};
   const taps=[];
   for(const [at,amp,pan] of P.echoes||[])taps.push([at,.003,amp,pan,4200-at*6000]);
   if(P.flutter)for(let k=1;k<=P.flutter.n;k++)taps.push([P.flutter.period*k*(1+(rnd()-.5)*.05),.0015+k*.00028,Math.pow(P.flutter.decay,k),k%2?-.8:.8,6500*Math.pow(.86,k)]);
   if(P.early)for(let k=0;k<P.early;k++)taps.push([.003+rnd()*.037,.0012,(.35+rnd()*.5)*(1-k/P.early*.5),rnd()*2-1,6000]);
   let energy=0;
   for(let c=0;c<channels;c++){const d=buffer.getChannelData(c);let lp=0,low=0;const kb=Math.exp(-2*Math.PI*260/sr);
    let k=0,env=0,boom=0;
    for(let i=0;i<n;i++){const white=rnd()*2-1;
     if(!(i&31)){const t=i/sr;k=Math.exp(-2*Math.PI*P.tone0*Math.pow(P.tone1/P.tone0,t/(P.len*scale))/sr);env=t<P.pre?0:(1-Math.exp(-(t-P.pre)/P.build))*Math.pow(10,-3*t/rt)*P.diffuse;boom=P.boom?P.boom*4*Math.pow(10,-3*t/(rt*.8)):0;}
     lp=lp*k+white*(1-k);let v=lp*env;if(boom){low=low*kb+white*(1-kb);v+=low*boom;}d[i]=v;}
    for(const [at,width,amp,pan,tone] of taps)burst(d,at*(lite?.9:1),width,amp*(channels===1?1:c?Math.sqrt((1+pan)/2):Math.sqrt((1-pan)/2))*.6,Math.max(700,tone));
    const fade=Math.round(sr*.03);for(let i=0;i<fade;i++)d[n-1-i]*=i/fade;
    for(let i=0;i<n;i++)energy+=d[i]*d[i];}
   const norm=1/Math.sqrt(energy/channels||1);for(let c=0;c<channels;c++){const d=buffer.getChannelData(c);for(let i=0;i<n;i++)d[i]*=norm;}
   return buffer;
  }
  // In-place Chamberlin state-variable filter over a Float32Array.
  function svf(d,sr,fc,q,mode){const f=2*Math.sin(Math.PI*Math.min(fc,sr*.16)/sr),damp=1/q;let lo=0,bd=0;for(let i=0;i<d.length;i++){const hi=d[i]-lo-damp*bd;bd+=f*hi;lo+=f*bd;d[i]=mode==='lp'?lo:mode==='hp'?hi:bd;}return d;}
  const STEP={
   asphalt:{noise:[1900,.8,'bp',.06,.9],thump:[120,70,.05,.5],grit:[900,.09,.35,3500],partials:[],attack:.003},
   concrete:{noise:[2700,1.1,'bp',.04,.8],thump:[160,90,.04,.6],grit:[200,.05,.15,4200],partials:[[520,.03,.15]],attack:.002},
   paving:{noise:[3300,1.4,'bp',.035,.7],thump:[210,120,.035,.45],grit:[350,.06,.2,3000],partials:[[430,.05,.3],[910,.03,.12]],attack:.002},
   metal:{noise:[4200,1,'bp',.03,.5],thump:[140,100,.05,.35],grit:[0,.05,0,4000],partials:[[312,.22,.35],[741,.17,.3],[1187,.13,.22],[2263,.09,.14],[3410,.06,.08]],attack:.001},
   grass:{noise:[950,.7,'lp',.1,1],thump:[90,60,.07,.3],grit:[500,.1,.12,5000],partials:[],attack:.012},
   dirt:{noise:[1400,.7,'lp',.08,.9],thump:[100,60,.06,.4],grit:[1200,.11,.4,2600],partials:[],attack:.006}
  };
  function normalise(d,peak){let m=0;for(let i=0;i<d.length;i++)m=Math.max(m,Math.abs(d[i]));if(m>0){const k=peak/m;for(let i=0;i<d.length;i++)d[i]*=k;}return d;}
  function stepBuffer(ctx,kind){
   const P=STEP[kind],sr=ctx.sampleRate,n=Math.ceil(sr*.34),out=new Float32Array(n),a=new Float32Array(n),g=new Float32Array(n),vary=.94+rnd()*.12;
   for(let i=0;i<n;i++)a[i]=rnd()*2-1;svf(a,sr,P.noise[0]*vary,P.noise[1],P.noise[2]);
   if(P.grit[0]){const p=P.grit[0]/sr;for(let i=0;i<n;i++)g[i]=rnd()<p?(rnd()*2-1)*3:0;svf(g,sr,P.grit[3]*vary,1.2,'bp');}
   const ph=P.partials.map(()=>rnd()*6.283);let phase=0;
   for(let i=0;i<n;i++){const t=i/sr,att=Math.min(1,t/P.attack);
    let v=a[i]*P.noise[4]*att*Math.exp(-t/P.noise[3])+g[i]*P.grit[2]*Math.exp(-t/P.grit[1]);
    phase+=2*Math.PI*lerp(P.thump[0],P.thump[1],Math.min(1,t/P.thump[2]))/sr;v+=Math.sin(phase)*P.thump[3]*Math.exp(-t/P.thump[2])*att;
    for(let k=0;k<P.partials.length;k++){const q=P.partials[k];v+=Math.sin(2*Math.PI*q[0]*vary*t+ph[k])*q[2]*Math.exp(-t/q[1]);}
    out[i]=v;}
   const fade=Math.round(sr*.02);for(let i=0;i<fade;i++)out[n-1-i]*=i/fade;
   const b=ctx.createBuffer(1,n,sr);b.getChannelData(0).set(normalise(out,.9));return b;
  }
  // Gear: two to four small hard things knocking (buckles, a magazine in its pouch, the radio) and a duller strap knock.
  function rattleBuffer(ctx){
   const sr=ctx.sampleRate,n=Math.ceil(sr*.22),out=new Float32Array(n),clicks=2+Math.floor(rnd()*3);
   for(let c=0;c<clicks;c++){const at=c?rnd()*.11:0,amp=c?.3+rnd()*.5:.8,i0=Math.round(at*sr),parts=[[2200+rnd()*1800,.012+rnd()*.02],[4300+rnd()*1500,.008+rnd()*.012],[6400+rnd()*1100,.005+rnd()*.006]];
    for(let i=0;i0+i<n;i++){const t=i/sr;let v=0;for(const [f,d] of parts)v+=Math.sin(2*Math.PI*f*t)*Math.exp(-t/d);if(t<.002)v+=(rnd()*2-1)*1.5;out[i0+i]+=v*amp*.3;}}
   const knock=new Float32Array(n);for(let i=0;i<n;i++)knock[i]=(rnd()*2-1)*Math.exp(-i/sr/.025);svf(knock,sr,820+rnd()*300,2,'bp');for(let i=0;i<n;i++)out[i]+=knock[i]*.5;
   const b=ctx.createBuffer(1,n,sr);b.getChannelData(0).set(normalise(out,.8));return b;
  }
  function thudBuffer(ctx){const sr=ctx.sampleRate,n=Math.ceil(sr*.26),b=ctx.createBuffer(1,n,sr),d=b.getChannelData(0);let ph=0;for(let i=0;i<n;i++){const t=i/sr;ph+=2*Math.PI*(42+53*Math.exp(-t/.05))/sr;d[i]=Math.sin(ph)*Math.min(1,t/.006)*Math.exp(-t/.07)*.9;}return b;}

  /* ------------------------------------------------------------ the rig: one per AudioContext */
  //   input ─┬─ bypass ─────────────────────────────────────────────┬─ destination
  //          └─ highpass ─ lowpass×2 ─ presence ─ compressor ─ clip ─┘        (the body-cam microphone)
  //   send ─ pre[space] ─ convolver[space] ─ wet[space] ─ input              (three spaces, mixed by the surroundings)
  function build(ctx,destination){
   const G=v=>{const g=ctx.createGain();g.gain.value=v;return g;},F=(type,f,q=.707,gain=0)=>{const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;b.gain.value=gain;return b;};
   const r={ctx,destination,input:G(1),send:G(1),bypass:G(1),micOut:G(0),pre:{},conv:{},wet:{},sent:{courtyard:0,street:0,indoor:0},nodes:[],body:null,pool:[],steps:null,micOn:false,lastResume:0};
   r.input.connect(r.bypass).connect(destination);
   const hp=F('highpass',130),lp1=F('lowpass',7000,.8),lp2=F('lowpass',9000,.6),presence=F('peaking',2700,.9,3.5),comp=ctx.createDynamicsCompressor(),clip=ctx.createWaveShaper();
   comp.threshold.value=-22;comp.knee.value=6;comp.ratio.value=4;comp.attack.value=.003;comp.release.value=.2;
   // Soft clip: unity gain for quiet sound, bending over towards a ceiling of 0.65; a close shot flattens against it.
   const curve=new Float32Array(1025),drive=1.35;for(let i=0;i<1025;i++){const x=i/512-1;curve[i]=Math.tanh(x*drive)/drive;}clip.curve=curve;clip.oversample=lite?'none':'2x';
   r.input.connect(hp).connect(lp1).connect(lp2).connect(presence).connect(comp).connect(clip).connect(r.micOut).connect(destination);
   r.nodes.push(hp,lp1,lp2,presence,comp,clip);
   for(const s of SPACES){const pre=G(0),conv=ctx.createConvolver(),wet=G(WET[s]);conv.normalize=false;conv.buffer=impulse(ctx,s);r.send.connect(pre).connect(conv).connect(wet).connect(r.input);r.pre[s]=pre;r.conv[s]=conv;r.wet[s]=wet;}
   return r;
  }
  function attach(ctx,destination,{camera:cam}={}){
   if(disposed||!ctx||!destination)return null;if(cam)camera=cam;
   if(rig&&rig.ctx===ctx&&rig.destination===destination)return rig.link;
   if(rig)teardown();
   try{rig=build(ctx,destination);}catch(e){rig=null;console.warn('Beyond audio unavailable; sound stays as before.',e);return null;}
   rig.link={input:rig.input,send:rig.send};applyMic(true);return rig.link;
  }
  function teardown(){if(!rig)return;const r=rig;rig=null;try{r.body?.source.stop();}catch{}
   for(const n of [r.input,r.send,r.bypass,r.micOut,...r.nodes,...SPACES.flatMap(s=>[r.pre[s],r.conv[s],r.wet[s]]),...(r.body?.nodes||[]),...r.pool.flatMap(c=>[c.gain,c.pan,c.send])])try{n.disconnect();}catch{}}
  // Mic in Beyond with the switch on; a plain wire otherwise. Cross-faded so the switch never clicks.
  function applyMic(instant=false){
   if(!rig)return;const on=active&&mic;if(on===rig.micOn&&!instant)return;rig.micOn=on;const t=rig.ctx.currentTime;
   for(const [p,v] of [[rig.bypass.gain,on?0:1],[rig.micOut.gain,on?1:0]]){p.cancelScheduledValues(t);if(instant)p.setValueAtTime(v,t);else{p.setValueAtTime(p.value,t);p.linearRampToValueAtTime(v,t+.2);}}
  }
  function setActive(on){
   on=!!on&&!disposed;if(on===active)return;active=on;applyMic();
   if(!on&&rig){const t=rig.ctx.currentTime;for(const s of SPACES){const g=rig.pre[s].gain;rig.sent[s]=0;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(0,t+.25);}
    if(rig.body){for(const g of [rig.body.cloth,rig.body.rub,rig.body.breath]){g.gain.cancelScheduledValues(t);g.gain.setTargetAtTime(0,t,.08);}}}
   if(on)analysedAt=-1;
  }

  /* ------------------------------------------------------------ body */
  const body={speed:0,turn:0,turnSmooth:0,stride:0,exertion:0,sprinting:false,grounded:true,nextBreath:0,lastRattle:0,lastStep:0,lastHostStep:-9,lastParams:0,pfx:0,pfy:0,pfz:-1,px:0,pz:0,hasPrev:false,surface:'paving',steps:0,rattles:0,breaths:0,dropped:0};
  function ensureBody(){
   const r=rig;if(!r||r.body)return r?.body||null;const ctx=r.ctx,sr=ctx.sampleRate;
   const noise=ctx.createBuffer(1,sr*2,sr),d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=rnd()*2-1;
   const G=()=>{const g=ctx.createGain();g.gain.value=0;return g;},F=(type,f,q)=>{const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q;return b;};
   const source=ctx.createBufferSource();source.buffer=noise;source.loop=true;
   const clothF=F('bandpass',1900,.6),cloth=G(),rubF=F('bandpass',300,.9),rub=G(),breathF=F('bandpass',1500,1.1),breath=G(),out=ctx.createGain(),send=ctx.createGain();send.gain.value=.12;
   source.connect(clothF).connect(cloth).connect(out);source.connect(rubF).connect(rub).connect(out);source.connect(breathF).connect(breath).connect(out);out.connect(r.input);out.connect(send).connect(r.send);source.start();
   for(let i=0;i<8;i++){const gain=ctx.createGain(),pan=ctx.createStereoPanner(),s=ctx.createGain();s.gain.value=0;gain.connect(pan).connect(r.input);pan.connect(s).connect(r.send);r.pool.push({gain,pan,send:s,until:0,source:null});}
   r.steps={};for(const k of SURFACES)r.steps[k]=[stepBuffer(ctx,k),stepBuffer(ctx,k),stepBuffer(ctx,k)];
   r.rattles=[rattleBuffer(ctx),rattleBuffer(ctx),rattleBuffer(ctx),rattleBuffer(ctx)];r.thud=thudBuffer(ctx);
   r.body={source,cloth,clothF,rub,breath,breathF,nodes:[clothF,cloth,rubF,rub,breathF,breath,out,send]};return r.body;
  }
  // A pooled one-shot: the BufferSource is the only node made per sound, and it is released when it ends.
  function oneShot(buffer,{gain=1,rate=1,pan=0,send=.15,delay=0}={}){
   const r=rig;if(!r||r.ctx.state!=='running')return false;const t=r.ctx.currentTime,c=r.pool.find(c=>c.until<=t);if(!c){body.dropped++;return false;}
   const at=t+delay;c.until=at+buffer.duration/rate+.02;c.gain.gain.setValueAtTime(gain,at);c.pan.pan.setValueAtTime(clamp(pan,-1,1),at);c.send.gain.setValueAtTime(send,at);
   const src=r.ctx.createBufferSource();src.buffer=buffer;src.playbackRate.value=rate;src.connect(c.gain);c.source=src;src.onended=()=>{src.disconnect();if(c.source===src)c.source=null;};src.start(at);return true;
  }
  const pick=list=>list[Math.floor(rnd()*list.length)%list.length];
  function rattle(level,delay=0){if(!rig?.rattles)return;if(oneShot(pick(rig.rattles),{gain:.11*level,rate:.9+rnd()*.25,pan:(rnd()-.5)*.5,send:.1,delay}))body.rattles++;}
  // Ground under the listener: the injected surfaceAt(x,z) when there is one, else a guess from the surroundings
  // (indoors concrete, a raised deck metal, between facades asphalt, the open court paving, off the map grass).
  function groundKind(hint){
   let k=null;try{k=surfaceQuery?.(L.x,L.z,L.y)||null;}catch{}
   if(k&&typeof k==='object')k=k.kind||k.type||k.surface||null;
   if(typeof k==='string'){k=k.toLowerCase();k=ALIAS[k]||k;if(STEP[k])return k;}
   if(mix.indoor>.5)return 'concrete';
   if(surfaces&&L.y>3.2){const feet=L.y-1.75;for(const s of surfaces)if(!s.field&&!s.wall&&s.top!=null&&Math.abs(s.top-feet)<.35&&L.x>=s.minX&&L.x<=s.maxX&&L.z>=s.minZ&&L.z<=s.maxZ)return s.route?'metal':'concrete';return 'concrete';}
   if(hint==='brick'||hint==='stone')return 'paving';
   if(mix.street>.45)return 'asphalt';
   let open=0;for(const r of rays)if(r.d>=RAY_MAX)open++;return open>=RAYS-1&&nW>0?'grass':'paving';
  }
  function step(hint,speed=3.4,{host=true}={}){
   if(!ready())return false;const t=rig.ctx.currentTime;if(t-body.lastStep<.16)return true;body.lastStep=t;if(host)body.lastHostStep=t;
   const kind=body.surface=groundKind(hint),level=clamp(.5+speed*.1,.4,1.35);
   if(oneShot(pick(rig.steps[kind]),{gain:.34*level,rate:(.92+rnd()*.16)*(speed>5?1.05:1),pan:(body.steps%2?.12:-.12),send:.16+.2*mix.indoor}))body.steps++;
   if(speed>1.2&&rnd()<clamp(speed/5.5,.3,1))rattle(clamp(speed/6,.3,1),.03+rnd()*.03);
   return true;
  }
  function land(hint,strength=.5){
   if(!ready())return false;const t=rig.ctx.currentTime;body.lastStep=body.lastHostStep=t;const kind=body.surface=groundKind(hint);
   oneShot(rig.thud,{gain:.3+.45*strength,send:.1});oneShot(pick(rig.steps[kind]),{gain:.4+.35*strength,rate:.78+rnd()*.08,send:.25});rattle(.6+strength*.6,.02);body.steps++;return true;
  }
  function slide(hint,duration=.7){
   if(!ready())return false;const t=rig.ctx.currentTime,b=rig.body,kind=body.surface=groundKind(hint);
   oneShot(pick(rig.steps[kind]),{gain:.3,rate:.6,send:.2});b.rub.gain.cancelScheduledValues(t);b.rub.gain.setTargetAtTime(.22,t,.03);b.rub.gain.setTargetAtTime(0,t+duration*.8,.08);body.lastParams=t+duration;return true;
  }
  function ready(){if(!active||!rig||rig.ctx.state!=='running')return false;ensureBody();return true;}
  function updateBody(dt,state,now){
   const cam=state?.camera||camera||root.edenCamera,q=cam?.quaternion;
   // turning: the angle the lens swept this frame
   if(q){const fx=-2*(q.x*q.z+q.w*q.y),fy=2*(q.w*q.x-q.y*q.z),fz=-(1-2*(q.x*q.x+q.y*q.y));if(body.hasPrev&&dt>0)body.turn=Math.acos(clamp(fx*body.pfx+fy*body.pfy+fz*body.pfz,-1,1))/dt;body.pfx=fx;body.pfy=fy;body.pfz=fz;}
   let speed=state?.speed;if(speed==null&&state?.velocity)speed=Math.hypot(state.velocity.x,state.velocity.z);
   if(speed==null){const v=root.breakThyRuleShowroom?._player?.()?.walkVelocity;if(v)speed=Math.hypot(v.x,v.z);}
   if(speed==null){const moved=body.hasPrev&&dt>0?Math.hypot(L.x-body.px,L.z-body.pz)/dt:0;speed=moved>20?0:moved;}
   body.px=L.x;body.pz=L.z;body.hasPrev=true;if(body.turn>40)body.turn=0;
   body.speed+=(speed-body.speed)*Math.min(1,dt*12);body.turnSmooth+=(body.turn-body.turnSmooth)*Math.min(1,dt*9);
   body.grounded=state?.grounded??true;body.sprinting=state?.sprint??(body.speed>5.2);
   body.exertion=clamp(body.exertion+dt*(body.sprinting&&body.speed>4?.2:-.065),0,1);
   if(!ready())return;const b=rig.body,t=now,move=clamp(body.speed/6.5,0,1),turn=clamp(body.turnSmooth/3.5,0,1);
   // stride: cloth swishes once per step; when the host is not sending footsteps, gear knocks on the same beat
   const before=body.stride;body.stride+=dt*(body.speed>.6&&body.grounded?1.5+body.speed*.28:0);
   if(Math.floor(body.stride)!==Math.floor(before)&&t-body.lastHostStep>1&&body.speed>1.6&&rnd()<clamp(body.speed/5.5,.3,1))rattle(clamp(body.speed/6,.3,1));
   if(body.turnSmooth>2.8&&t-body.lastRattle>.3){body.lastRattle=t;rattle(clamp(body.turnSmooth/6,.35,1));}
   if(t>=body.lastParams+.05){body.lastParams=t;const swish=.55+.45*Math.cos(body.stride*Math.PI*2);
    b.cloth.gain.setTargetAtTime((.02*move*swish+.034*turn)*(body.grounded?1:.6),t,.035);b.clothF.frequency.setTargetAtTime(1500+1300*Math.max(move,turn),t,.08);
    b.rub.gain.setTargetAtTime(.05*turn*turn+.012*move*swish,t,.04);}
   // breath: in through the nose band, out lower and louder; faster and stronger the more winded you are
   if(body.exertion>.22&&t>=body.nextBreath-.05){
    const e=smooth((body.exertion-.2)/.7),period=lerp(2.3,1.05,e),t0=Math.max(t,body.nextBreath),a=.06*e*(body.sprinting?.6:1),g=b.breath.gain,f=b.breathF.frequency;
    f.setValueAtTime(2300,t0);g.setValueAtTime(0,t0);g.linearRampToValueAtTime(a*.55,t0+period*.18);g.linearRampToValueAtTime(0,t0+period*.42);
    f.setValueAtTime(1250,t0+period*.47);g.setValueAtTime(0,t0+period*.47);g.linearRampToValueAtTime(a,t0+period*.6);g.linearRampToValueAtTime(0,t0+period*.95);
    body.nextBreath=t0+period;body.breaths++;}
  }

  /* ------------------------------------------------------------ per frame */
  let hostUpdate=-9;
  // state (all optional): {active, camera, position:{x,y,z}, velocity:{x,z} | speed, grounded, sprint, walls, surfaces}
  // Anything left out is read from the page: edenCamera, breakThyRuleShowroom (world, player velocity, district).
  function update(dt=.016,state={},internal=false){
   if(disposed)return;if(!internal)hostUpdate=performance.now();
   setActive(state.active!=null?state.active:root.breakThyRuleShowroom?.worlds?.()?.world?.()==='beyond');
   if(!active||!rig)return;const ctx=rig.ctx,now=ctx.currentTime;
   if(ctx.state==='suspended'&&gesture&&ctx.resume&&performance.now()-rig.lastResume>1000){rig.lastResume=performance.now();ctx.resume().catch(()=>{});}
   refresh(state,now);updateBody(clamp(dt,0,.1),state,now);
  }
  // Without a host hook the module still follows the world by itself (4 checks a second while idle, each frame in Beyond).
  let frame=0,lastFrame=0;const loop=time=>{frame=0;if(disposed)return;const dt=lastFrame?(time-lastFrame)/1000:.016;lastFrame=time;
   if(performance.now()-hostUpdate>500){update(dt,{},true);if(active)frame=root.requestAnimationFrame(loop);}};
  const watch=options.auto===false?0:root.setInterval?.(()=>{if(frame||performance.now()-hostUpdate<=500)return;
   const beyond=root.breakThyRuleShowroom?.worlds?.()?.world?.()==='beyond';if(beyond){lastFrame=0;frame=root.requestAnimationFrame(loop);}else if(active)setActive(false);},250);
  const onGesture=e=>{if(e.isTrusted)gesture=true;};
  for(const type of ['pointerdown','keydown','touchend'])root.addEventListener?.(type,onGesture,{capture:true,passive:true});

  /* ------------------------------------------------------------ what combat-audio.js asks */
  function fresh(){if(rig)refresh(null,rig.ctx.currentTime);}
  // Any positioned sound: muffled and quieter behind walls, with a little of the room on it.
  function voice(pos){
   fresh();const base=.12+.18*mix.indoor+.06*mix.street;if(!pos||!L.valid)return {gain:1,lowpass:20000,send:base,walls:0};
   const n=wallsBetween(L.x,L.y,L.z,pos.x,pos.y??L.y,pos.z);
   return {gain:[1,.55,.38,.28][n],lowpass:[20000,1500,950,700][n],send:(base+.13)*(n?1.5:1),walls:n};
  }
  // A gunshot. pos null = the player's own weapon.
  let lastSlap=-9;
  function shotPlan(kind,pos){
   fresh();const heavy={pistol:.8,smg:.7,rifle:1,pump:1.15,sniper:1.3}[kind]||1,indoor=mix.indoor,street=mix.street,t=rig?rig.ctx.currentTime:0;
   const D=pos?Math.hypot(pos.x-L.x,(pos.y??L.y)-L.y,pos.z-L.z):0,distant=D>25;
   const plan={distant,crack:{gain:pos?(distant?.9:1.08):1.3,send:pos?.3+.4*Math.min(1,D/60):.3+.25*indoor},
    tail:{gain:(.2+.1*street+.06*(1-indoor))*heavy*(1-.4*indoor),delay:.09,send:.7},mech:!distant,slaps:[],far:null};
   if(t-lastSlap<.085)return plan;lastSlap=t;
   // Slap-backs: the two nearest facades in different directions; the echo arrives after the real extra path.
   const order=rays.filter(r=>r.d>4.5&&r.d<RAY_MAX).sort((a,b)=>a.d-b.d),chosen=[];
   for(const r of order){if(chosen.length>=2)break;if(chosen.length&&chosen[0].dx*r.dx+chosen[0].dz*r.dz>.5)continue;chosen.push(r);}
   for(const r of chosen){let delay=2*r.d/343;
    if(pos){const wx=L.x+r.dx*r.d,wz=L.z+r.dz*r.d;delay=(Math.hypot(pos.x-wx,pos.z-wz)+r.d-D)/343;if(delay<.025)continue;}
    plan.slaps.push({delay,gain:(pos?.45:.5)*heavy/(1+r.d*.045)*(1-.7*indoor),lowpass:Math.max(1200,3200-25*r.d),pan:clamp(r.dx*L.rx+r.dz*L.rz,-1,1)*.85,send:.3});}
   // The report rolling back from the far end of the district (hardly heard from inside a room).
   if(!distant&&indoor<.9)plan.far={gain:(pos?.18:.26)*heavy*(1-.9*indoor),delay:.13+.05*(1-street),lowpass:1800,send:.8};
   return plan;
  }

  const api={
   attach,update,voice,shotPlan,step,land,slide,
   active:()=>active&&!!rig,
   // Wrap the page's footsteps object: in Beyond the steps come from here, everywhere else from the original.
   wrapFootsteps(original){return {
    step:(surface,speed)=>{if(!step(surface,speed))original?.step?.(surface,speed);},
    land:(surface,strength)=>{if(!land(surface,strength))original?.land?.(surface,strength);},
    slide:(surface,duration)=>{if(!slide(surface,duration))original?.slide?.(surface,duration);},
    dispose:()=>original?.dispose?.()};},
   // surfaceAt(x,z[,y]) -> 'asphalt' | 'concrete' | 'paving' | 'metal' | 'grass' | 'dirt' (or null to fall back).
   setSurfaceQuery(fn){surfaceQuery=typeof fn==='function'?fn:null;},
   setMic(on){mic=!!on;try{root.localStorage?.setItem(SETTING,mic?'1':'0');}catch{}applyMic();},
   get mic(){return mic;},
   // Pin the space (for checks): 'courtyard' | 'street' | 'indoor' | null.
   setSpace(name){forced=SPACES.includes(name)?name:null;analysedAt=-1;},
   input:()=>rig?.input||null,
   surfaces:SURFACES.slice(),setting:SETTING,
   inspect:()=>({attached:!!rig,active,mic,micOn:!!rig?.micOn,lite,state:rig?.ctx.state||null,forced,roof,walls:nW,
    space:Object.fromEntries(SPACES.map(s=>[s,+mix[s].toFixed(3)])),dominant:SPACES.reduce((a,b)=>mix[b]>mix[a]?b:a),
    nearest:+Math.min(...rays.map(r=>r.d)).toFixed(1),impulse:rig?Object.fromEntries(SPACES.map(s=>[s,+rig.conv[s].buffer.duration.toFixed(2)])):null,
    body:{speed:+body.speed.toFixed(2),turn:+body.turnSmooth.toFixed(2),exertion:+body.exertion.toFixed(2),surface:body.surface,steps:body.steps,rattles:body.rattles,breaths:body.breaths,dropped:body.dropped,built:!!rig?.body},
    pool:rig?{size:rig.pool.length,busy:rig.pool.filter(c=>c.until>rig.ctx.currentTime).length}:null,host:performance.now()-hostUpdate<=500}),
   dispose(){if(disposed)return;disposed=true;active=false;if(watch)root.clearInterval(watch);if(frame)root.cancelAnimationFrame(frame);for(const type of ['pointerdown','keydown','touchend'])root.removeEventListener?.(type,onGesture,{capture:true});teardown();}
  };
  return api;
 };
 root.beyondAudio=root.createBeyondAudio();
})(window);
