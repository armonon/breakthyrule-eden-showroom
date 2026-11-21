'use strict';
// One melee system for every kind of close combat in the game. The four fighters that used to keep their own numbers,
// sounds and feedback all read them from here:
//   the fists against the Violet Trickster (fist-combat.js), the body punch in the garden (player-body.js),
//   the gun bash and the axe (combat.js, battle-arena.js bots) and the sword in the online arena (arena.js).
//
// What is shared:
//   MOVES   timings (windup until the blow lands, recover until the next one), reach, cone, damage and the impact tier.
//   TIERS   how a landed blow feels: hit-stop (frozen milliseconds), screen shake, knockback and the target's reaction.
//   sound() one synthesised set: whoosh, miss, hit, heavy, block, parry, thud (plus the jester's laugh and boing).
//   pop()   the one popup word in the middle of the screen (JAB, BLOCKED, PARRY!, 3 HIT COMBO, FINISHER).
//   charge() the one input rule: tap the melee key for the light attack, hold it for the heavy one.
//   combo   one counter across every fighter, so chaining blows reads the same everywhere.
//   lunge() a short step into a target just out of reach, so melee feels magnetic instead of whiffing at air.
//   guard   one block for every defender: raised just before a blow it parries (and opens a counter); held, it
//           blocks but each blow drains its stamina (heavies far more), and an empty guard breaks.
//   finisher a heavy that ends a chain of three or more hits: a special knockdown with a slow-motion beat.
//   timeScale() the slow-motion multiplier the game loop applies to its frame time.
(function(root){
 const now=()=>performance.now()/1000;
 const MOVES={
  // Fists.
  jab:      {windup:.10,recover:.26,reach:1.75,arc:40,damage:8, force:1.6,tier:'light',stamina:10,label:'JAB'},
  cross:    {windup:.13,recover:.34,reach:1.8, arc:40,damage:12,force:2.2,tier:'light',stamina:14,label:'CROSS'},
  haymaker: {windup:.25,recover:.62,reach:1.9, arc:40,damage:22,force:4,  tier:'heavy',stamina:28,label:'HAYMAKER'},
  // The garden body punch (no health in the garden: it shoves and can knock someone over).
  shove:    {windup:.18,recover:.45,reach:1.4, arc:57,damage:0, force:1.2,tier:'light',label:'POW'},
  // Whatever gun is in your hands, driven into someone's face; held, a wound-up overhead smash.
  bash:     {windup:.11,recover:.64,reach:2.4, arc:13,damage:55,force:3.1,tier:'heavy',label:'BASH'},
  slam:     {windup:.24,recover:.95,reach:2.6, arc:15,damage:80,force:4.4,tier:'heavy',label:'SLAM',knockdown:true},
  // The axe: a quick chop, or held, a heavy two-handed swing.
  chop:     {windup:.26,recover:.56,reach:2.2, arc:12,damage:55,force:3.4,tier:'light',label:'CHOP'},
  cleave:   {windup:.33,recover:.70,reach:2.2, arc:12,damage:94,force:4.6,tier:'heavy',label:'CLEAVE',knockdown:true},
  // The online arena sword (damage is the server's: arena-layout.json).
  slash:    {windup:.10,recover:.55,reach:2.4, arc:55,damage:35,force:2.6,tier:'light',label:'SLASH'},
  lunge:    {windup:.24,recover:.95,reach:2.9, arc:40,damage:55,force:4.2,tier:'heavy',label:'LUNGE'},
  // Bots in the battle telegraph their swings (a glint and a wind-up) long enough to read and parry.
  botBash:  {windup:.42,recover:1.2, reach:2.6, arc:40,damage:45,force:3.1,tier:'heavy',label:'BASH'},
  botChop:  {windup:.5, recover:.85, reach:2.2, arc:40,damage:44,force:3.4,tier:'heavy',label:'CHOP'},
  tackle:   {windup:0,  recover:1.4, reach:1.15,arc:60,damage:15,force:4.5,tier:'heavy',label:'TACKLE'}
 };
 // hitStop in milliseconds, shake 0..1 (each fighter scales it to its own camera), knock in metres,
 // reaction: what the one who was hit does (flinch: a jolt; stagger: a stumble back; down: knocked over).
 const TIERS={
  light:  {hitStop:55, shake:.16,knock:.3, reaction:'flinch', sound:'hit'},
  heavy:  {hitStop:105,shake:.32,knock:.8, reaction:'stagger',sound:'heavy'},
  ko:     {hitStop:160,shake:.42,knock:1.2,reaction:'down',   sound:'heavy'},
  blocked:{hitStop:35, shake:.10,knock:.15,reaction:'block',  sound:'block'},
  parried:{hitStop:60, shake:.08,knock:0,  reaction:'parried',sound:'parry'},
  world:  {hitStop:40, shake:.16,knock:0,  reaction:'none',   sound:null},
  broken: {hitStop:120,shake:.38,knock:.9, reaction:'stagger',sound:'heavy'},
  finisher:{hitStop:140,shake:.5,knock:1.4,reaction:'down',   sound:'heavy'}
 };
 // Guard: how much of a raised guard's stamina each kind of blow costs, the parry window and how fast it recovers.
 const GUARD={cost:{light:12,heavy:34,ko:50,tackle:45},parry:.25,regen:28,regenHeld:0,broken:1.2,chip:.15};
 const COMBO_WINDOW=1.4;
 let reduced=!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

 // ---------- Sound (synthesised, no assets) ----------
 let audio=null;
 function sound(kind,gain=1){
  if(!kind)return;
  try{
   audio??=new (root.AudioContext||root.webkitAudioContext)();if(audio.state==='suspended')audio.resume();
   const t=audio.currentTime,out=audio.createGain();out.gain.value=.32*gain;out.connect(audio.destination);
   const noise=(duration,filterType,from,to,level,delay=0)=>{const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const src=audio.createBufferSource();src.buffer=buffer;const f=audio.createBiquadFilter();f.type=filterType;f.frequency.setValueAtTime(from,t+delay);f.frequency.exponentialRampToValueAtTime(to,t+delay+duration);const g=audio.createGain();g.gain.value=level;src.connect(f).connect(g).connect(out);src.start(t+delay);};
   const tone=(type,from,to,duration,level,delay=0)=>{const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(from,t+delay);o.frequency.exponentialRampToValueAtTime(to,t+delay+duration);g.gain.setValueAtTime(0,t+delay);g.gain.linearRampToValueAtTime(level,t+delay+.012);g.gain.exponentialRampToValueAtTime(.001,t+delay+duration);o.connect(g).connect(out);o.start(t+delay);o.stop(t+delay+duration+.02);};
   if(kind==='whoosh')noise(.18,'bandpass',600,2600,.6);
   if(kind==='swoosh')noise(.3,'bandpass',380,2200,.75);                       // a heavy wind-up swing
   if(kind==='miss')noise(.22,'bandpass',1400,500,.45);                         // the blow carries on through air
   if(kind==='hit'){noise(.11,'lowpass',2400,300,1.4);tone('sine',140,48,.2,1);}
   if(kind==='heavy'){noise(.2,'lowpass',1800,120,1.8);tone('sine',110,38,.35,1.3);}
   if(kind==='block'){tone('square',1300,900,.06,.25);noise(.05,'highpass',3000,5000,.5);}
   if(kind==='parry'){tone('triangle',1800,2400,.12,.4);tone('square',1300,900,.06,.22);noise(.06,'highpass',3500,6000,.5);}
   if(kind==='thud'){tone('sine',80,30,.45,1.4);noise(.25,'lowpass',500,80,1.2);}
   if(kind==='charge')tone('sine',180,420,.28,.18);                             // a held heavy is ready
   if(kind==='glint'){tone('sine',2600,3400,.16,.22);tone('triangle',1300,1700,.12,.12,.03);}  // a bot winds up
   if(kind==='guardbreak'){tone('square',420,90,.3,.3);noise(.3,'lowpass',2600,200,1.6);}
   if(kind==='finisher'){tone('sine',90,30,.7,1.5);noise(.45,'lowpass',2200,90,2);tone('triangle',660,330,.5,.25,.08);}
   if(kind==='laugh')for(let i=0;i<5;i++)tone('triangle',470-i*22+Math.random()*30,300-i*18,.13,.5,i*.16);
   if(kind==='boing')tone('sine',220,660,.3,.5);
  }catch{}
 }

 // ---------- The popup word ----------
 let popEl=null,popTimer=0;
 function popElement(){
  if(popEl?.isConnected)return popEl;
  popEl=document.getElementById('fight-pop');
  if(!popEl){popEl=document.createElement('div');popEl.id='fight-pop';popEl.setAttribute('aria-live','polite');(document.getElementById('world')||document.body).append(popEl);}
  return popEl;
 }
 function pop(text,tone='hit'){
  if(!text||typeof document==='undefined')return;const el=popElement();
  el.textContent=text;el.className='show '+tone;clearTimeout(popTimer);void el.offsetWidth;popTimer=setTimeout(()=>{el.className='';},700);
 }

 // ---------- Combo: one counter for every fighter ----------
 const combo={count:0,until:0,best:0};
 function addCombo(){const t=now();if(t>combo.until)combo.count=0;combo.count++;combo.until=t+COMBO_WINDOW;combo.best=Math.max(combo.best,combo.count);return combo.count;}
 function breakCombo(){combo.count=0;combo.until=0;}
 function comboCount(){return now()>combo.until?0:combo.count;}
 // Each blow in a chain hits a little harder, up to +60 %.
 function comboMultiplier(){return Math.min(1.6,1+comboCount()*.15);}

 // ---------- Landing a blow ----------
 // Plays the tier's sound, freezes the frame, shakes the camera, counts the combo and shows the word.
 // hooks: {hitStop(ms), shake(amount), pop:false to stay quiet, label: the word to show}.
 function land(tierName,hooks={}){
  const tier=TIERS[tierName]||TIERS.light;
  sound(hooks.sound===undefined?tier.sound:hooks.sound,hooks.gain??1);
  if(tier.hitStop&&!reduced)hooks.hitStop?.(tier.hitStop*(hooks.stopScale??1));
  hooks.shake?.(tier.shake*(hooks.shakeScale??1));
  // hooks.combo:false for blows you take rather than give (being hit breaks your chain instead).
  let count=0;
  if(hooks.combo===false)breakCombo();
  else if(tierName==='light'||tierName==='heavy'||tierName==='ko')count=addCombo();
  else if(tierName==='blocked')breakCombo();
  if(hooks.pop!==false){
   const text=tierName==='finisher'?'COMBO FINISHER':tierName==='broken'?'GUARD BROKEN':tierName==='ko'?'K.O.!':tierName==='blocked'?'BLOCKED':tierName==='parried'?'PARRY!':count>2?count+' HIT COMBO':hooks.label;
   if(text)pop(text,tierName==='ko'||tierName==='finisher'?'ko':tierName==='blocked'||tierName==='parried'||tierName==='broken'?'block':'hit');
  }
  if(tierName==='finisher'){slowMo(.9,.3);breakCombo();}
  if(tierName==='parried')openCounter();
  return {...tier,combo:count};
 }
 // A swing that met nothing.
 function whiff(hooks={}){sound('miss',.8);breakCombo();hooks.shake?.(.04);}

 // ---------- Reach ----------
 // Is a point within a move's reach and cone? from/at: {x,z}; forward: {x,z}, normalised.
 function inReach(from,forward,at,move,slack=.35){
  const spec=typeof move==='string'?MOVES[move]:move,dx=at.x-from.x,dz=at.z-from.z,d=Math.hypot(dx,dz);
  if(d>spec.reach+slack)return false;if(d<.2)return true;
  return (dx*forward.x+dz*forward.z)/d>Math.cos(spec.arc*Math.PI/180);
 }
 // A short magnetic step into a target that is just beyond reach (up to 1.1 m further, within 35° of where you look).
 // Returns {x,z,distance} to move, or null. targets: [{x,z}].
 function lunge(from,forward,targets,move){
  const spec=typeof move==='string'?MOVES[move]:move;let best=null,bestD=spec.reach+1.1;
  for(const at of targets){const dx=at.x-from.x,dz=at.z-from.z,d=Math.hypot(dx,dz);if(d<=spec.reach*.85||d>=bestD)continue;if((dx*forward.x+dz*forward.z)/d<Math.cos(35*Math.PI/180))continue;best={dx:dx/d,dz:dz/d,d};bestD=d;}
  if(!best)return null;const distance=Math.min(1.1,best.d-spec.reach*.8);
  return distance>.05?{x:best.dx,z:best.dz,distance}:null;
 }

 // ---------- Input: tap for light, hold for heavy ----------
 // The heavy fires as soon as the hold passes `hold` seconds (with a rising tone), not on release, so it never feels late.
 function charge({light,heavy,hold=.24,onCharge=()=>{}}){
  let pressed=false,fired=false,timer=0;
  return {
   down(){if(pressed)return;pressed=true;fired=false;onCharge(true);clearTimeout(timer);timer=setTimeout(()=>{if(!pressed)return;fired=true;sound('charge');onCharge(false);heavy();},hold*1000);},
   up(){if(!pressed)return;pressed=false;clearTimeout(timer);onCharge(false);if(!fired)light();},
   cancel(){pressed=false;clearTimeout(timer);onCharge(false);},
   held:()=>pressed
  };
 }

 // ---------- Guard, parry and guard break ----------
 // A guard: {raised, raisedAt, stamina 0..100, brokenUntil}. raise() / lower() follow the block input.
 function newGuard(){
  const g={raised:false,raisedAt:-9,stamina:100,brokenUntil:0,
   raise(){if(g.raised||now()<g.brokenUntil)return false;g.raised=true;g.raisedAt=now();return true;},
   lower(){g.raised=false;},
   broken:()=>now()<g.brokenUntil};
  return g;
 }
 // A blow arrives at a guard. facing: the defender faces the attacker. Returns
 //   'parried' (raised within the parry window: no damage, the attacker is thrown off and a counter opens),
 //   'blocked' (chip damage only, stamina spent), 'broken' (the guard gives way: full damage and a stagger) or 'hit'.
 function defend(g,{tier='light',facing=true,kind=null}={}){
  if(!g?.raised||!facing||now()<g.brokenUntil)return 'hit';
  if(now()-g.raisedAt<GUARD.parry)return 'parried';
  g.stamina-=GUARD.cost[kind==='tackle'?'tackle':tier]??GUARD.cost.light;
  if(g.stamina<=0){g.stamina=0;g.raised=false;g.brokenUntil=now()+GUARD.broken;sound('guardbreak');return 'broken';}
  return 'blocked';
 }
 // Guard stamina recovers only while the guard is lowered.
 function guardTick(g,dt){if(g&&now()>=g.brokenUntil)g.stamina=Math.min(100,g.stamina+dt*(g.raised?GUARD.regenHeld:GUARD.regen));}
 // A parry opens a counter: the next blow you land within 1.3 s hits half again as hard.
 let counterUntil=0;
 function openCounter(seconds=1.3){counterUntil=now()+seconds;}
 function counterReady(){return now()<counterUntil;}
 function takeCounter(){if(!counterReady())return false;counterUntil=0;return true;}

 // ---------- Combo finishers and slow motion ----------
 // A heavy that lands as the third (or later) blow of a chain is a finisher.
 function wouldFinish(tier){return tier==='heavy'&&comboCount()>=2;}
 let slowUntil=0,slowFrom=0,slowScale=1;
 function slowMo(seconds,scale){if(reduced)return;const t=now();slowFrom=t;slowUntil=t+seconds;slowScale=scale;}
 // Holds the slow scale, then eases back to full speed over the last 40 % of the beat.
 function timeScale(){const t=now();if(t>=slowUntil)return 1;const k=(t-slowFrom)/(slowUntil-slowFrom);return k<.6?slowScale:slowScale+(1-slowScale)*((k-.6)/.4);}

 // ---------- Reactions ----------
 // Which tier a blow of this damage lands as (for blows that do not name one): 45+ is heavy.
 function tierFor(damage,{killed=false,heavy=false}={}){return killed?'ko':heavy||damage>=45?'heavy':'light';}

 root.EdenMelee={MOVES,TIERS,move:id=>MOVES[id],tier:id=>TIERS[id],sound,pop,land,whiff,inReach,lunge,charge,tierFor,
  combo:{add:addCombo,reset:breakCombo,count:comboCount,multiplier:comboMultiplier,best:()=>combo.best},
  GUARD,guard:newGuard,defend,guardTick,openCounter,counterReady,takeCounter,wouldFinish,slowMo,timeScale,
  setReduced(value){reduced=!!value;},
  inspect:()=>({combo:comboCount(),best:combo.best,reduced,counter:counterReady(),timeScale:+timeScale().toFixed(2)})};
})(typeof window!=='undefined'?window:globalThis);
