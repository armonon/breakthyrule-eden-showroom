'use strict';
window.GardenCharacterDetails={
 faceUV(x,y,z){return y<5.9?[.02,.02]:[.5+Math.atan2(x,z-.55)/(2*Math.PI),Math.max(.025,Math.min(.975,(y-5.8)/2.9))];},
 faceTexture(T,a){
  // Bake small, hand-painted-style features in bind space so all face morphs carry them.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d');c.fillStyle=a.skinTone;c.fillRect(0,0,512,512);
  const point=(x,y,z=1.4)=>{const [u,v]=this.faceUV(x,y,z);return [u*512,(1-v)*512];};
  function shade(x,y,rx,ry,color,alpha,z=1.4){const p=point(x,y,z);c.save();c.translate(...p);c.scale(rx,ry);const g=c.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.globalAlpha=alpha;c.fillStyle=g;c.fillRect(-1,-1,2,2);c.restore();}
  function stroke(points,color,width,alpha){c.save();c.strokeStyle=color;c.lineWidth=width;c.globalAlpha=alpha;c.lineJoin=c.lineCap='round';c.beginPath();points.forEach((p,i)=>{const v=point(...p);i?c.lineTo(...v):c.moveTo(...v);});c.stroke();c.restore();}
  for(const s of [-1,1]){
   shade(s*.34,7.34,22,16,'#50382f',.25);
   shade(s*.48,6.98,20,33,'#713f31',.05+a.faceDefinition*.065);
   shade(s*.5,7.12,18,11,'#ffe6bf',.14);
   shade(s*.42,6.63,8,27,'#70442f',a.age*.22);
   shade(s*.14,6.87,5,5,'#281c19',.5,1.65);
   stroke([[s*.15,7.24],[s*.3,7.20],[s*.46,7.24]],'#5b3a30',.8,.35);
  }
  shade(0,6.57,21,10,'#a95b53',.18);
  stroke([[-.25,6.59,1.54],[-.11,6.575,1.59],[0,6.58,1.61],[.11,6.575,1.59],[.25,6.59,1.54]],'#63362d',1,.65);
  shade(0,6.46,20,7,'#583b2d',.24);shade(0,6.36,18,9,'#ffe1b6',.13);
  shade(0,7.03,7,31,'#ffdfbe',.17,1.65);
  for(let i=0;i<3;i++)stroke([[-.38,7.72+i*.085],[0,7.74+i*.085],[.38,7.72+i*.085]],'#614536',.7,a.age*.14);
  let seed=1427;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<14000;i++){const x=random()*512,y=random()*470;c.globalAlpha=.025+random()*.025;c.fillStyle=i%2?'#fff1d8':'#412b23';c.fillRect(x,y,1,1);}c.globalAlpha=1;
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.name='Painted 512px character skin';return texture;
 },
 clothTexture(T,kind){
  const canvas=document.createElement('canvas');canvas.width=kind==='pants'?512:256;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#eeeeeb';c.fillRect(0,0,canvas.width,256);
  for(let i=0;i<canvas.width+64;i+=2){c.strokeStyle=i%4?'#e7e7e4':'#f5f5f1';c.lineWidth=.35;c.beginPath();c.moveTo(i,0);c.lineTo(i-64,256);c.stroke();}
  const path=(points,color,width)=>{c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();};
  if(kind==='pants'){
   for(let back=0;back<2;back++){
    c.save();c.translate(back*256,0);
    for(const x of [40,216]){path([[x,0],[x,256]],'#c2c5c6',1.5);path([[x+2,0],[x+2,256]],'#e6ddc8',.6);}
    path([[0,5],[256,5]],'#68696b',9);path([[0,12],[256,12]],'#c5c1b7',1);
    if(back)for(const x of [58,145])path([[x,22],[x+53,22],[x+49,54],[x+26,63],[x+4,54],[x,22]],'#bdc0c0',1.4);
    else{path([[53,18],[73,33],[91,36]],'#a5abad',1.4);path([[203,18],[183,33],[165,36]],'#a5abad',1.4);path([[127,12],[127,46],[121,51]],'#b3b6b7',1.2);}
    for(const y of [128,170,229]){const g=c.createLinearGradient(0,y-5,0,y+9);g.addColorStop(0,'#eeeeeb00');g.addColorStop(.45,'#8e939422');g.addColorStop(.6,'#ffffff3d');g.addColorStop(1,'#eeeeeb00');c.fillStyle=g;c.fillRect(0,y-5,256,14);}
    c.restore();
   }
  }else{
   path([[6,0],[6,256]],'#c1c1bf',3);path([[250,0],[250,256]],'#c1c1bf',3);
   path([[0,247],[256,247]],'#b3b3b0',2);path([[0,251],[256,251]],'#fafaf5',1);
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;texture.name='Painted '+kind+' fabric';return texture;
 },
 shoeTexture(T){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#dfdfd8';c.fillRect(0,0,256,256);
  c.fillStyle='#999fa2';c.beginPath();c.moveTo(75,66);c.lineTo(180,66);c.lineTo(168,195);c.lineTo(90,195);c.closePath();c.fill();
  c.strokeStyle='#adb0af';c.lineWidth=4;c.beginPath();c.ellipse(127,81,94,68,0,Math.PI,2*Math.PI);c.stroke();
  for(let i=0;i<5;i++){const y=78+i*18;c.fillStyle='#4b5256';for(const x of [83,173]){c.beginPath();c.arc(x,y,3.5,0,Math.PI*2);c.fill();}c.strokeStyle='#f8f6e9';c.lineWidth=5;c.beginPath();c.moveTo(83,y);c.lineTo(173,y+11);c.moveTo(173,y);c.lineTo(83,y+11);c.stroke();}
  c.fillStyle='#6b7379';c.fillRect(7,118,21,71);c.fillRect(228,118,21,71);c.fillRect(81,224,93,32);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.name='Painted sneaker panels and laces';return texture;
 },
 shirtTexture(T){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#f0f1dc';c.fillRect(0,0,256,256);
  for(const [x,y,angle] of [[40,43,-.35],[166,112,.4],[65,206,.7],[235,235,-.4]]){
   c.save();c.translate(x,y);c.rotate(angle);c.strokeStyle='#4f766b';c.lineWidth=3;c.beginPath();c.moveTo(0,42);c.quadraticCurveTo(11,16,0,0);c.stroke();
   for(let i=0;i<7;i++){const theta=-Math.PI+i*Math.PI/6;c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(Math.cos(theta)*32,Math.sin(theta)*27-7,Math.cos(theta)*46,Math.sin(theta)*12+10);c.lineWidth=7-i%2*2;c.stroke();}c.restore();
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;return texture;
 },
 add({T,a,morph,head,headOrigin,torso,torsoOrigin}){
  const mat=(color,extra={})=>new T.MeshStandardMaterial({color,roughness:.9,...extra});
  function attach(g,m,parent,origin,name){g.translate(-origin.x,-origin.y,-origin.z);const mesh=new T.Mesh(g,m);mesh.name=name;mesh.castShadow=true;parent.add(mesh);return mesh;}
  function surface(points,indices,m,parent=head,origin=headOrigin,name='Character detail'){
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(morph),3));g.setIndex(indices);g.computeVertexNormals();return attach(g,m,parent,origin,name);
  }
  // Closed, tapered lock volumes keep every hairstyle readable from the back and side.
  const hp=[],huv=[],hi=[];
  const center=new T.Vector3(0,7.4,.55),skull=[];
  for(let i=0;i<13380*3;i+=3){const p=new T.Vector3(...GardenHumanBase.positions.slice(i,i+3));if(p.y>7.05&&(Math.abs(p.x)<.75||p.y>7.72)){const delta=p.sub(center);skull.push({direction:delta.clone().normalize(),radius:delta.length()});}}
  function fit(point,lift=.065){const direction=point.clone().sub(center).normalize();let best=-Infinity,radius=1;for(const v of skull){const score=direction.dot(v.direction);if(score>best){best=score;radius=v.radius;}}return center.clone().addScaledVector(direction,radius+lift);}
  function lock(points,width=.13,depth=.72,taper=.75,fitted=false){
   const rawCurve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),steps=points.length>10?10:14,sides=6;
   const curve=fitted?new T.CatmullRomCurve3(Array.from({length:25},(_,j)=>{const p=rawCurve.getPointAt(j/24);return fit(p,(style==='slick'?.025:.065)+(fitted==='quiff'?Math.max(0,p.y-8.35)*.48:0));})):rawCurve;
   const frames=curve.computeFrenetFrames(steps,false),offset=hp.length/3;
   for(let j=0;j<=steps;j++){
    const t=j/steps,p=curve.getPointAt(t),radius=width*(.65+.35*Math.sin(Math.PI*t))*(1-taper*Math.pow(t,5));
    for(let k=0;k<=sides;k++){const phi=k/sides*Math.PI*2,v=p.clone().addScaledVector(frames.normals[j],Math.cos(phi)*radius).addScaledVector(frames.binormals[j],Math.sin(phi)*radius*depth);hp.push(...morph(v.toArray()));huv.push(k/sides,t);if(j<steps&&k<sides){const n=offset+j*(sides+1)+k;hi.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}}
   }
  }
  const style=a.hairStyle,volume=a.hairVolume,length=a.hairLength;
  if(['side','slick','quiff','crop'].includes(style)){
   const count=style==='crop'?14:9;
   for(let i=0;i<count;i++){
    const x=-.79+i/(count-1)*1.58,arch=Math.sqrt(Math.max(.1,1-(x/1.1)**2));
    if(style==='side')lock([[-.55+x*.2,8.28,.12],[x*.45,8.5+.24*volume,.68],[.5+x*.4,8.19+.18*volume,1.02],[.85+x*.12,7.64+.16*(1-length),.8-x*.17]],.13*volume,.58,.8,true);
    if(style==='slick')lock([[x,7.77+arch*.1,1.04],[x,8.38+arch*.2*volume,.66],[x*.91,8.34,-.3],[x*.78,7.3-.25*length,-.69]],.17*volume,.24,.85,true);
    if(style==='quiff')lock([[x,7.8,1.05],[x*.95,8.28+arch*.52*volume,1.14],[x*.93,8.57+arch*.12,.4],[x*.76,8.15,-.26*length]],.14*volume,.76,.55,'quiff');
    if(style==='crop')lock([[x*.92,8.05,.83],[x*.93,8.38+arch*.14*volume,.62],[x*.86,8.38,.1],[x*.8,8.15-.1*length,-.25]],.13*volume,.65,.8,true);
   }
  }
  if(['bob','long','locs'].includes(style)){
   const count=style==='locs'?26:24;
   for(let i=0;i<count;i++){
    const theta=.84+(Math.PI*2-1.68)*i/(count-1),sin=Math.sin(theta),cos=Math.cos(theta),long=style!=='bob';
    const bottom=long?6.15-1.6*length:6.62-.55*length,wave=Math.sin(i*2.4)*.06;
    lock([fit(new T.Vector3(sin*.32,8.37,.55+cos*.28)).toArray(),fit(new T.Vector3(sin*.84,7.95,.55+cos*.89)).toArray(),[sin*(.94+volume*.07),7.05,.55+cos*(1.01+wave)],[sin*(long?1.35:1.01)*volume,bottom,.55+cos*(long?1.15:1.03)]],(style==='locs'?.1:.18)*volume,style==='locs'?1:.56,style==='locs'?.1:.55);
   }
   if(style==='bob')for(let i=0;i<8;i++){const x=-.8+i*.17;lock([[x*.4,8.41,.36],[x*.8,8.32,1.04],[x,7.78,1.16],[x+.13,7.6,1.1]],.12*volume,.45,.85,true);}
   if(style==='long')for(const side of [-1,1])for(let i=0;i<5;i++){const k=i/5;lock([[side*(.05+k*.16),8.4,.82],[side*(.25+k*.18),8.23,1.23],[side*(.66+k*.08),7.74,1.5],[side*.89,7.23,1.18]],.1*volume,.6,.6,true);}
  }
  if(style==='curls'){
   for(let i=0;i<160;i++){
    const y=.04+(i+.5)/160*.94,theta=i*2.39996,r=Math.sqrt(1-y*y),points=[];
    const curlCenter=fit(new T.Vector3(Math.cos(theta)*r,7.65+y*.95,.55+Math.sin(theta)*r),.085*volume);
    for(let j=0;j<13;j++){const t=j/12,angle=t*Math.PI*3;points.push([curlCenter.x+Math.cos(angle)*.085*volume,curlCenter.y+(t-.5)*.2*length,curlCenter.z+Math.sin(angle)*.085*volume]);}lock(points,.082*volume,1,.1);
   }
  }
  if(['bun','ponytail'].includes(style)){
   for(let i=0;i<14;i++){const x=-.83+i/13*1.66;lock([[x,7.82,1.0],[x*.92,8.45,.5],[x*.72,8.05,-.6],[x*.18,7.65,-.87]],.115*volume,.58,.3,true);}
   if(style==='bun')for(let i=0;i<8;i++){const p=[];for(let j=0;j<12;j++){const theta=j/11*Math.PI*2;p.push([Math.cos(theta)*(.3+i*.011)*volume,7.65+Math.sin(theta)*.32*volume,-.53-i*.055*length]);}lock(p,.095,.8,.2);}
   else for(let i=0;i<10;i++){const x=(i-4.5)*.045;lock([[x,7.69,-.49],[x*1.5,7.5,-.97],[x*2.2,6.45,-1.05],[x*1.3,7.1-2.2*length,-.88]],.11*volume,.85,.7);}
  }
  if(hp.length){
   const c=document.createElement('canvas');c.width=64;c.height=128;const ctx=c.getContext('2d');
   const highlight=ctx.createLinearGradient(0,0,64,0);highlight.addColorStop(0,'#676767');highlight.addColorStop(.42,'#e3e3e3');highlight.addColorStop(.66,'#bfbfbf');highlight.addColorStop(1,'#747474');ctx.fillStyle=highlight;ctx.fillRect(0,0,64,128);
   for(let i=0;i<22;i++){ctx.strokeStyle=i%3===0?'#929292':'#d6d6d6';ctx.globalAlpha=.45;ctx.lineWidth=i%3===0?1:.6;ctx.beginPath();ctx.moveTo(i*3,0);ctx.bezierCurveTo(i*3+3,40,i*3-2,85,i*3,128);ctx.stroke();}
   const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const hair=mat(a.hairColor,{map}),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(hp,3));g.setAttribute('uv',new T.Float32BufferAttribute(huv,2));g.setIndex(hi);g.computeVertexNormals();attach(g,hair,head,headOrigin,'Styled hair locks');
  }
  if(a.outfit==='resort'){
   const collar=mat(a.shirtColor,{side:T.DoubleSide});
   for(const sign of [-1,1])surface([[sign*.44,5.84,.93],[sign*1.03,5.4,1.09],[sign*.78,4.76,1.48],[sign*.25,5.17,1.39],[sign*.56,5.45,1.48]], [0,1,4,1,2,4,2,3,4,3,0,4],collar,torso,torsoOrigin,'Folded resort collar');
   const buttons=mat('#ece8d5');for(const y of [3.9,2.9,1.9]){const g=new T.SphereGeometry(.014,8,6),p=new T.Vector3(...morph([0,y,1.2]));g.translate(p.x,p.y,p.z);attach(g,buttons,torso,torsoOrigin,'Shirt button');}
  }
  if(a.eyewear!=='none'){
   const metal=mat(a.eyewear==='aviators'?'#b7a578':'#17181b',{metalness:.55,roughness:.35}),lens=mat('#162f32',{roughness:.25,metalness:.2,side:T.DoubleSide});
   function bar(points,r=.014){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...morph(p))));return attach(new T.TubeGeometry(curve,24,r*.105,6,false),metal,head,headOrigin,'Eyewear frame');}
   for(const sign of [-1,1]){
    const x=sign*.325,y=7.27,aviator=a.eyewear==='aviators';const pts=aviator?[[-.23,.14],[.19,.14],[.23,-.06],[.09,-.2],[-.16,-.16],[-.23,.14]]:[[-.24,.14],[.23,.14],[.2,-.15],[-.2,-.15],[-.24,.14]];
    const points=pts.map(([dx,dy])=>[x+dx,y+dy,1.57-Math.abs(x+dx)*.05]);surface(points,[0,1,2,0,2,3,...(aviator?[0,3,4]:[])],lens);bar(points,a.eyewear==='aviators'?.014:.033);bar([[x+sign*.23,y+.09,1.54],[sign*.74,y+.09,.92],[sign*.79,y-.02,.35]],.022);
   }bar([[-.095,7.35,1.59],[0,7.39,1.7],[.095,7.35,1.59]],.018);
  }
 }
};
