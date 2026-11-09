'use strict';
// Shared chrome for the public site: header, tabs, footer, and the discussion board
// (a Circle space when one is configured, otherwise a local preview board).
(()=>{
 const tabs=[['/', 'Products','home'],['/gallery','Gallery','gallery'],['/archive','Archive','archive'],['/community','Community','community']];
 const page=document.body.dataset.page||'';
 const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children.filter(c=>c!=null));return node;};
 window.siteEl=el;

 const header=el('header',{className:'site-top'});
 const brand=el('a',{className:'brand',href:'/'},el('img',{src:'/products/web/logo.webp',alt:'',width:40,height:42}),el('span',{textContent:'BREAKTHYRULE'}));
 brand.setAttribute('aria-label','Break Thy Rule home');
 const nav=el('nav',{className:'tabs'});nav.setAttribute('aria-label','Main');
 for(const [href,label,id] of tabs){const a=el('a',{href,textContent:label});if(id===page)a.setAttribute('aria-current','page');nav.append(a);}
 const enter=el('a',{className:'enter-showroom',href:'/showroom'},el('span',{textContent:'Enter the 3D showroom'}),el('span',{textContent:'↗',ariaHidden:'true'}));
 header.append(brand,nav,enter);
 document.body.prepend(header);

 const footer=el('footer',{className:'site-foot'});
 footer.append(
  el('div',{className:'foot-mark',textContent:'BREAKTHYRULE'}),
  el('p',{textContent:'A codex worn on the body.'}),
  el('div',{className:'foot-links'},
   el('a',{href:'/showroom',textContent:'3D Showroom'}),
   el('a',{href:'/broadcast.html',textContent:'Broadcast Room'}),
   el('a',{href:siteConfig.instagram,textContent:'Instagram',target:'_blank',rel:'noopener'}),
   el('a',{href:siteConfig.librarianApp,textContent:'Librarian',target:'_blank',rel:'noopener'}))
 );
 document.body.append(footer);

 // Discussion board. `key` names the thread (forum, gallery, topic:symbols …).
 window.siteDiscussion=function(mount,{key,space,title='Discussion',prompt='Say something…',allowImages=true}){
  const circle=siteConfig.circle||{};
  mount.classList.add('discussion');
  if(circle.community&&space){
   const src=circle.community.replace(/\/$/,'')+'/'+space.replace(/^\//,'')+'?iframe=true';
   const frame=el('iframe',{src,title:title+' on Circle',loading:'lazy'});frame.setAttribute('allow','clipboard-write');
   mount.replaceChildren(el('div',{className:'circle-frame'},frame),el('p',{className:'fine'},el('a',{href:src.replace('?iframe=true',''),target:'_blank',rel:'noopener',textContent:'Open in Circle ↗'})));
   return;
  }
  const storeKey='btr-board:'+key;
  const load=()=>{try{return JSON.parse(localStorage.getItem(storeKey))||[];}catch{return [];}};
  const save=posts=>{try{localStorage.setItem(storeKey,JSON.stringify(posts.slice(-60)));return true;}catch{return false;}};
  const list=el('ol',{className:'posts'});
  const status=el('p',{className:'fine',role:'status'});
  const name=el('input',{name:'name',placeholder:'Name',maxLength:40,autocomplete:'nickname',required:true});
  const text=el('textarea',{name:'text',placeholder:prompt,maxLength:1200,rows:3,required:true});
  const file=el('input',{type:'file',accept:'image/*',name:'image'});
  const form=el('form',{className:'compose'},
   el('div',{className:'compose-row'},name,allowImages?el('label',{className:'attach'},file,el('span',{textContent:'Add image'})):null),
   text,el('button',{type:'submit',className:'solid',textContent:'Post'}));
  name.value=localStorage.getItem('btr-name')||'';
  function render(){
   const posts=load();list.replaceChildren(...posts.slice().reverse().map(p=>el('li',{},
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
   event.preventDefault();localStorage.setItem('btr-name',name.value.trim());
   let image='';if(file.files[0]){try{image=await shrink(file.files[0]);}catch{status.textContent='That image could not be read.';return;}}
   const posts=load();posts.push({name:name.value.trim(),text:text.value.trim(),image,at:Date.now()});
   if(!save(posts)){status.textContent='This device is out of space for images. Try a smaller one.';return;}
   text.value='';file.value='';status.textContent='Posted.';render();
  };
  mount.replaceChildren(
   el('p',{className:'preview-note',textContent:'Preview board — posts stay on this device until the Circle community is connected in site/config.js.'}),
   form,status,list);
  render();
 };

 window.siteGarments=()=>(window.showroomCollection||[]).map(item=>({...item,photo:window.showroomAssets?.web(item.images[0])||item.images[0]}));
})();
