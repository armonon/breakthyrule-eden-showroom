'use strict';
// Shared chrome for the public site: header, tabs, footer, and the discussion board
// (CreatingCo's hosted Circle community, with earlier browser notes kept separately).
(()=>{
 const tabs=[['/', 'Products','home'],['/lab','Lab','lab'],['/gallery','Gallery','gallery'],['/archive','Archive','archive'],['/archive#forum','Forum','forum'],['/about','About','about'],['/account','Account','account']];
 const page=document.body.dataset.page||'';
 // Keep old shared About links working at the dedicated page.
 if(new URLSearchParams(location.search).has('about')){location.replace('/about');return;}
 const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children.filter(c=>c!=null));return node;};
 window.siteEl=el;

 const header=el('header',{className:'site-top'});
 const logo=(cls)=>el('img',{className:'site-logo '+cls+(cls==='in-footer'?' btr-logo-night-image':''),src:cls==='in-footer'?'/assets/brand/logo-night.svg?v=1':'/assets/brand/logo.webp?v=1',alt:'BreakThyRule, anonymous archive',width:1400,height:381});
 const brand=el('a',{className:'brand'},logo('in-header'));brand.href='/';
 brand.setAttribute('aria-label','Break Thy Rule home');
 const nav=el('nav',{className:'tabs'});nav.setAttribute('aria-label','Main');
 for(const [href,label,id] of tabs){const a=el('a',{href,textContent:label});if(id===page)a.setAttribute('aria-current','page');if(id==='about')a.className='btr-about-link';nav.append(a);}
 const enter=el('a',{className:'enter-showroom',href:'/showroom',ariaLabel:'Enter the 3D showroom',title:'Enter the 3D showroom'},el('span',{textContent:'Enter the 3D showroom'}),el('span',{textContent:'↗',ariaHidden:'true'}));
 header.append(brand,nav,enter);
 document.body.prepend(header);

 const footer=el('footer',{className:'site-foot'});
 footer.append(
  el('div',{className:'foot-mark'},logo('in-footer')),
  el('p',{textContent:'Here ends the first book. A codex worn on the body.'}),
  el('div',{className:'foot-links'},
   el('a',{href:'/about',textContent:'About'}),
   el('a',{href:'/archive#forum',textContent:'Forum'}),
   el('a',{href:'/account',textContent:'Account'}),
   el('a',{href:'/lab',textContent:'Garment Lab'}),
   el('a',{href:'/showroom',textContent:'3D Showroom'}),
   el('a',{href:'/broadcast.html',textContent:'Broadcast Room'}),
   el('a',{href:siteConfig.instagram,textContent:'Instagram',target:'_blank',rel:'noopener'}),
   el('a',{href:siteConfig.librarianApp,textContent:'Librarian',target:'_blank',rel:'noopener'}))
 );
 document.body.append(footer);

 // Discussion board. `key` names the thread (forum, gallery, topic:symbols …).
 window.siteCommunityDiscussion=function(mount,{key,space,title='Discussion',prompt='Say something…',allowImages=true}){
  const circle=siteConfig.circle||{};
  mount.classList.add('discussion');
  const root=mount;
  if(circle.community){
   // Circle/Now owns its member session. Never imply that a link signs the shop in.
   const local=el('details',{className:'community-local-notes'},el('summary',{textContent:'Earlier notes on this device'}));
   mount=el('div');local.append(mount);
   root.replaceChildren(
    el('section',{className:'community-handoff'},
     el('p',{className:'kicker',textContent:'The Circle / thecreatingco'}),
     el('h3',{textContent:'Share it with the community.'}),
     el('p',{textContent:'Post your fit, share a source, and meet other makers in The Circle.'}),
     el('div',{className:'community-actions'},
      el('a',{href:circle.community,className:'solid',textContent:'Open The Circle ↗'}),
      el('a',{href:'/account',className:'ghost',textContent:'Your account'}))),local);
  }
  const storeKey='btr-board:'+key;
  const load=()=>{try{const value=JSON.parse(localStorage.getItem(storeKey)||'[]');return Array.isArray(value)?value:null;}catch{return null;}};
  const save=posts=>{try{localStorage.setItem(storeKey,JSON.stringify(posts));return true;}catch{return false;}};
  const list=el('ol',{className:'posts'});
  const status=el('p',{className:'fine',role:'status'});
  const name=el('input',{name:'name',placeholder:'Name',maxLength:40,autocomplete:'nickname',required:true});
  const text=el('textarea',{name:'text',placeholder:prompt,maxLength:1200,rows:3,required:true});
  const file=el('input',{type:'file',accept:'image/*',name:'image'});
  const form=el('form',{className:'compose'},
   el('div',{className:'compose-row'},name,allowImages?el('label',{className:'attach'},file,el('span',{textContent:'Add image'})):null),
   text,el('button',{type:'submit',className:'solid',textContent:'Save local note'}));
  try{name.value=localStorage.getItem('btr-name')||'';}catch{}
  function render(){
   const posts=load();
   if(posts===null){list.replaceChildren(el('li',{className:'empty',textContent:'Your saved notes could not be read. Existing notes have not been changed.'}));return;}
   list.replaceChildren(...posts.filter(p=>p&&typeof p.text==='string').slice().reverse().map(p=>el('li',{},
    el('div',{className:'post-meta'},el('strong',{textContent:p.name}),el('time',{textContent:new Date(p.at).toLocaleString()})),
    el('p',{textContent:p.text}),p.image?el('img',{src:p.image,alt:'Shared by '+p.name,loading:'lazy'}):null)));
   if(!posts.length)list.append(el('li',{className:'empty',textContent:'No posts yet. Start the thread.'}));
  }
  async function shrink(f){
   const img=await createImageBitmap(f),scale=Math.min(1,900/Math.max(img.width,img.height));
   const c=el('canvas',{width:Math.round(img.width*scale),height:Math.round(img.height*scale)});c.getContext('2d').drawImage(img,0,0,c.width,c.height);
   return c.toDataURL('image/jpeg',.78);
  }
  form.onsubmit=async event=>{
   event.preventDefault();try{localStorage.setItem('btr-name',name.value.trim());}catch{}
   let image='';if(file.files[0]){try{image=await shrink(file.files[0]);}catch{status.textContent='That image could not be read.';return;}}
   const posts=load();if(posts===null){status.textContent='Your existing notes could not be read. This draft has not been saved.';return;}posts.push({name:name.value.trim(),text:text.value.trim(),image,at:Date.now()});
   if(!save(posts)){status.textContent='This device is out of space for images. Try a smaller one.';return;}
   text.value='';file.value='';status.textContent='Saved on this device. This note is not posted to Circle.';render();
  };
  mount.replaceChildren(
   el('p',{className:'preview-note',textContent:'Private local notes — saved only in this browser. To share with other people, post in The Circle.'}),
   form,status,list);
  render();
 };
 // Keep older page integrations working. Gallery uses the direct community helper:
 // a historical enhancement intentionally suppresses its old siteDiscussion board.
 window.siteDiscussion=window.siteCommunityDiscussion;

 // The glow behind a garment takes the strongest ink colour in its photo (skips paper-white and grey).
 const haloCache=new Map();
 window.siteHalo=function(src){
  if(haloCache.has(src))return haloCache.get(src);
  const job=new Promise(resolve=>{const img=new Image();img.onload=()=>{try{
    const c=el('canvas',{width:40,height:50}),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,40,50);
    const d=x.getImageData(0,0,40,50).data;let r=0,g=0,b=0,w=0;
    for(let i=0;i<d.length;i+=4){const max=Math.max(d[i],d[i+1],d[i+2]),min=Math.min(d[i],d[i+1],d[i+2]),sat=max?(max-min)/max:0;
     if(sat<.28||max<45||d[i+3]<200)continue;const k=sat*sat;r+=d[i]*k;g+=d[i+1]*k;b+=d[i+2]*k;w+=k;}
    resolve(w>1.5?`rgb(${Math.round(r/w)},${Math.round(g/w)},${Math.round(b/w)})`:null);}catch{resolve(null);}};
   img.onerror=()=>resolve(null);img.src=src;});
  haloCache.set(src,job);return job;
 };
 window.siteRoman=n=>{let out='';for(const [v,s] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=v){out+=s;n-=v;}return out;};

 window.siteGarments=()=>(window.showroomCollection||[]).map(item=>({...item,photo:window.showroomAssets?.web(item.images[0])||item.images[0]}));
})();
