// Bakes the game's animation clips into assets/anim/clips.json (see bake.mjs for the format).
// Sources (both free for commercial use):
//   Quaternius Universal Animation Library 1 and 2, Standard (CC0): https://quaternius.com
//   Microsoft Rocketbox animations (MIT): https://github.com/microsoft/Microsoft-Rocketbox (Assets/Animations)
// Put the source files in .anim-work/ (ual1.glb, ual2.glb, rb/*.fbx, rb/avatar.fbx for the Rocketbox rest pose),
// install three@0.158.0 there (npm install --prefix .anim-work three@0.158.0), serve the site on localhost:8765, then:
//   node tools/animation/bake-clips.cjs
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const U1='/.anim-work/ual1.glb',U2='/.anim-work/ual2.glb',RB=n=>`/.anim-work/rb/${n}.max.fbx`;
const J=(id,src,url,clip,loop=false,maxDur=0)=>({id,src,url,clip,loop,maxDur,...(src==='rb'?{fps:24}:{})});
const jobs=[
 // locomotion and stance (Quaternius 1)
 J('idle','ual',U1,'Idle_Loop',true),J('walk','ual',U1,'Walk_Loop',true),J('jog','ual',U1,'Jog_Fwd_Loop',true),J('sprint','ual',U1,'Sprint_Loop',true),
 J('crouchIdle','ual',U1,'Crouch_Idle_Loop',true),J('crouchWalk','ual',U1,'Crouch_Fwd_Loop',true),
 J('jumpStart','ual',U1,'Jump_Start'),J('jumpLoop','ual',U1,'Jump_Loop',true),J('jumpLand','ual',U1,'Jump_Land'),J('roll','ual',U1,'Roll'),
 J('death','ual',U1,'Death01'),J('hitChest','ual',U1,'Hit_Chest'),J('hitHead','ual',U1,'Hit_Head'),J('jab','ual',U1,'Punch_Jab'),J('cross','ual',U1,'Punch_Cross'),
 J('interact','ual',U1,'Interact'),J('pickup','ual',U1,'PickUp_Table'),J('push','ual',U1,'Push_Loop',true),J('dance','ual',U1,'Dance_Loop',true),
 J('pistolIdle','ual',U1,'Pistol_Idle_Loop',true),J('pistolShoot','ual',U1,'Pistol_Shoot'),J('pistolReload','ual',U1,'Pistol_Reload'),
 J('pistolAimUp','ual',U1,'Pistol_Aim_Up'),J('pistolAim','ual',U1,'Pistol_Aim_Neutral'),J('pistolAimDown','ual',U1,'Pistol_Aim_Down'),
 // parkour and combat (Quaternius 2)
 J('climbUp','ual',U2,'ClimbUp_1m'),J('slideStart','ual',U2,'Slide_Start'),J('slideLoop','ual',U2,'Slide_Loop',true),J('slideExit','ual',U2,'Slide_Exit'),
 J('flipStart','ual',U2,'NinjaJump_Start'),J('flipLoop','ual',U2,'NinjaJump_Idle_Loop',true),J('flipLand','ual',U2,'NinjaJump_Land'),
 J('knockback','ual',U2,'Hit_Knockback'),J('getUp','ual',U2,'LayToIdle'),J('hook','ual',U2,'Melee_Hook'),J('throw','ual',U2,'OverhandThrow'),
 J('dash','ual',U2,'Shield_Dash'),J('chestOpen','ual',U2,'Chest_Open'),J('swingA','ual',U2,'Sword_Regular_A'),J('swingB','ual',U2,'Sword_Regular_B'),
 J('nod','ual',U2,'Yes'),J('foldArms','ual',U2,'Idle_FoldArms_Loop',true),
 // people (Rocketbox motion capture)
 J('walkM','rb',RB('m_walk_neutral_01'),null,true),J('walkF','rb',RB('f_walk_neutral_01'),null,true),J('runM','rb',RB('m_run_neutral'),null,true),
 J('idleM','rb',RB('m_idle_neutral_01'),null,true,6),J('idleF','rb',RB('f_idle_neutral_01'),null,true,6),J('cheer','rb',RB('m_cheer_01'),null,false,4.5),J('wave','rb',RB('m_wave_01'),null,false,3),
 J('clap','rb',RB('m_claphands_01'),null,false,4),J('danceCool','rb',RB('m_dancing_cool'),null,true,8),J('talk','rb',RB('m_gestic_talk_neutral_01'),null,true,8),J('lookAround','rb',RB('m_idle_look_around_01'),null,false,4.6)
];
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8765/tools/animation/bake.html');await p.waitForFunction(()=>window.ready,null,{timeout:60000});
 const out=await p.evaluate(({jobs})=>window.bake(jobs,{rb:'/.anim-work/rb/avatar.fbx'},30),{jobs});
 out.credits='Quaternius Universal Animation Library 1 & 2 (CC0, quaternius.com); Microsoft Rocketbox animations (MIT, github.com/microsoft/Microsoft-Rocketbox).';
 const file=path.join(__dirname,'../../assets/anim/clips.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(out));
 console.log('clips',Object.keys(out.clips).length,'bytes',fs.statSync(file).size,'dirs',JSON.stringify(out.sources));
 for(const [id,c] of Object.entries(out.clips))console.log(id,c.src,c.duration+'s',c.n+'f','phase0',c.phase0);
 console.log(errs.join('\n')||'no errors');await b.close();})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
