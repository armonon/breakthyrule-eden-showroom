'use strict';
/*
 * Beyond Eden enemies and cash (used by battle-arena.js).
 *
 * KINDS: who walks the district besides the rival bots. Each kind is the same Rocketbox person re-dressed in the shader
 * (character-rocketbox.js LOOKS) plus a few meshes added here, with its own numbers and behaviour:
 *  agent   dark suit, white shirt, tie, dark glasses, an earpiece. Few, tough, quick and accurate with a pistol; they
 *          track you across the district and side-step most shots.
 *  order   a hooded secret society in black robes. They move as a pack behind a leader with ritual axes, quieter and
 *          faster at night, and see further in the dark.
 *  zombie  grey-green, bruised, bloody. Slow shamble with the arms out, a burst when close; soak body shots, a headshot
 *          does triple. They come as a horde, attack anyone living, and get back up quickly.
 *
 * EdenWallet: cash, kept in this browser (localStorage). Kills pay by kind (headshots half as much again); the black
 * market in the arena HUD spends it.
 */
(function(root){
 const rand=(a,b)=>a+Math.random()*(b-a);
 const ANY=['boulevard','harbor','midnight','coast','riviera','marina','garden','sunset'];
 const KINDS={
  rival:{cash:100,points:10},
  agent:{label:'AGENT',names:['AGENT VOSS','AGENT KANE','AGENT HALE','AGENT REID','AGENT MERCER','AGENT CROSS'],look:'agent',characters:['harbor','midnight','coast'],height:[182,193],weight:[76,90],
   gait:{walk:'walkFormal'},hp:150,shield:100,skill:[.72,.86],reaction:[.18,.3],speed:1.15,dodge:.8,kit:{pistol:{loaded:12,reserve:96}},
   cash:250,points:20,team:'agents',respawn:[14,20],hunts:140},
  order:{label:'HOODED',names:['THE HOODED','INITIATE','ACOLYTE','KEEPER','VEILED ONE','ADEPT'],look:'order',characters:ANY,height:[170,190],weight:[60,85],
   hp:120,shield:40,skill:[.5,.6],reaction:[.3,.45],speed:1.08,nightSpeed:1.3,melee:'axe',cash:150,points:15,team:'order',respawn:[10,14],sight:[20,34],pack:3},
  zombie:{label:'ZOMBIE',names:['ZOMBIE'],look:'zombie',characters:ANY,height:[160,188],weight:[50,95],
   gait:{walk:'walkCarry',jog:'walkCarry',sprint:'walkCarry'},hp:160,shield:0,skill:[.5,.5],reaction:[.5,.8],unarmed:true,hit:16,
   headMul:3,bodyMul:.7,cash:40,points:3,team:'zombies',respawn:[4,7],sight:[16,16],noPower:true,horde:true}
 };
 function appearance(kind,base){
  const K=KINDS[kind];if(!K?.look)return base;
  const a={...base,look:K.look,character:K.characters[Math.random()*K.characters.length|0],height:rand(...K.height),weight:rand(...K.weight)};
  if(kind==='agent')a.hairStyle='slick';
  return a;
 }
 // Meshes a look needs on top of the body, hung on its bones (they scale with the body). Only once the Rocketbox rig
 // has arrived: the low-poly stand-in's bones are replaced when it does.
 let mats=null;
 function materials(T){
  return mats??={
   robe:new T.MeshStandardMaterial({color:0x0b0a0c,roughness:.96,metalness:0,side:T.DoubleSide}),
   lens:new T.MeshStandardMaterial({color:0x040405,roughness:.12,metalness:.5}),
   frame:new T.MeshStandardMaterial({color:0x0a0a0a,roughness:.4,metalness:.6}),
   bud:new T.MeshStandardMaterial({color:0xd8d6d0,roughness:.5,metalness:0})};
 }
 const ready=model=>model?.root?.userData.characterStyle==='rocketbox'&&model.byName?.head;
 function dress(T,b){
  if(b.dressed||!ready(b.model))return false;b.dressed=true;
  const by=b.model.byName,M=materials(T),add=(bone,mesh)=>{mesh.userData.noHit=true;mesh.castShadow=true;mesh.name='Enemy gear';bone.add(mesh);return mesh;};
  if(b.kind==='order'){
   // Hood: a shell over the head, open at the face, with a fold to a point at the back.
   const hood=new T.SphereGeometry(.14,22,14,Math.PI/2+.95,Math.PI*2-1.9,0,Math.PI*.7);hood.scale(1.02,1.16,1.1);
   const h=add(by.head,new T.Mesh(hood,M.robe));h.position.set(0,.1,-.012);
   const tip=add(by.head,new T.Mesh(new T.ConeGeometry(.06,.14,10,1,true),M.robe));tip.position.set(0,.2,-.11);tip.rotation.x=-1.05;
   // A short mantle over the shoulders joins hood and robe.
   if(by.spine01){const mantle=add(by.spine01,new T.Mesh(new T.CylinderGeometry(.13,.27,.26,22,1,true),M.robe));mantle.position.set(0,.13,-.01);mantle.scale.z=.8;}
   // The robe falls from the hips to the ankles; the legs walk inside it.
   if(by.root){const skirt=add(by.root,new T.Mesh(new T.CylinderGeometry(.19,.38,.84,24,1,true),M.robe));skirt.position.set(0,-.4,0);skirt.scale.z=.82;}
  }
  if(b.kind==='agent'){
   const g=new T.Group();g.position.set(0,.102,.108);by.head.add(g);
   for(const s of [-1,1]){const lens=new T.Mesh(new T.BoxGeometry(.046,.03,.006),M.lens);lens.position.x=s*.032;g.add(lens);
    const arm=new T.Mesh(new T.BoxGeometry(.004,.006,.1),M.frame);arm.position.set(s*.058,.006,-.05);g.add(arm);}
   const bridge=new T.Mesh(new T.BoxGeometry(.02,.005,.005),M.frame);bridge.position.y=.008;g.add(bridge);
   g.traverse(n=>{n.userData.noHit=true;});
   const bud=add(by.head,new T.Mesh(new T.SphereGeometry(.009,8,6),M.bud));bud.position.set(-.074,.085,0);
   const wire=add(by.head,new T.Mesh(new T.CylinderGeometry(.0018,.0018,.12,4),M.bud));wire.position.set(-.07,.03,-.02);wire.rotation.x=.25;
  }
  return true;
 }
 // Cash. A number in localStorage; listeners hear every change with the amount and why.
 const KEY='btr-cash-v1',subs=new Set();
 let cash=0;try{cash=Math.max(0,Math.floor(+root.localStorage?.getItem(KEY)||0));}catch{}
 const wallet={
  get:()=>cash,
  add(n,why=''){n=Math.round(n);if(!n)return cash;cash=Math.max(0,cash+n);try{root.localStorage?.setItem(KEY,String(cash));}catch{}for(const f of subs)try{f(cash,n,why);}catch{}return cash;},
  spend(n,why='buy'){if(n>cash)return false;wallet.add(-n,why);return true;},
  onChange(f){subs.add(f);return()=>subs.delete(f);},
  format:n=>'$'+Math.max(0,Math.round(n)).toLocaleString('en-US')
 };
 root.EdenEnemies={KINDS,appearance,dress,ready};
 root.EdenWallet=wallet;
})(typeof window==='object'?window:globalThis);
