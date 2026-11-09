'use strict';
(async()=>{
 const el=window.siteEl,$=id=>document.getElementById(id),garments=window.siteGarments(),books=window.showroomBooks||[];
 let topics=[];try{topics=(await (await fetch('/site/data/topics.json',{cache:'no-cache'})).json()).topics;}catch{}
 const all={id:'all',title:'Everything',blurb:'The whole shelf and the open discussion.',tags:books.map(b=>b.tag),chapters:[],query:''};
 topics.unshift(all);
 const safe=url=>{try{const u=new URL(url,location.origin);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
 function bookCard({title,author,cover,url,meta}){
  const link=safe(url);
  const a=el(link?'a':'div',{className:'book'},el('div',{className:'cover',style:cover?`background-image:url("${encodeURI(cover)}")`:''}),el('strong',{textContent:title}),el('span',{textContent:[author,meta].filter(Boolean).join(' · ')}));
  if(link){a.href=link;a.target='_blank';a.rel='noopener';}return a;
 }
 const buttons=[];
 function select(topic,push=true){
  for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.id===topic.id));
  $('topic-kicker').textContent=topic.id==='all'?'All topics':'Topic';$('topic-title').textContent=topic.title;$('topic-blurb').textContent=topic.blurb;
  const pieces=garments.filter(g=>topic.chapters.includes(g.chapter)).slice(0,12);
  $('topic-garments-wrap').hidden=!pieces.length;
  $('topic-garments').replaceChildren(...pieces.map(g=>el('a',{href:'/product?item='+encodeURIComponent(g.slug),title:g.name},el('img',{src:g.photo,alt:g.name,loading:'lazy'}))));
  showShelf(books.filter(b=>topic.tags.includes(b.tag)).map(b=>({title:b.title,author:b.author,cover:b.cover,url:b.url,meta:b.tag})),'On the shelf');
  $('query').value=topic.query||'';$('search-status').textContent='';
  const space=topic.circle||siteConfig.circle.spaces.topics?.[topic.id]||siteConfig.circle.spaces.archive;
  window.siteDiscussion($('discussion'),{key:'topic:'+topic.id,space,title:topic.title,prompt:'Share a source, a question or a reading.'});
  if(push)history.replaceState(null,'','#'+topic.id);
 }
 function showShelf(list,label){
  $('shelf-label').textContent=label;
  $('shelf').replaceChildren(...(list.length?list.map(bookCard):[el('p',{className:'fine',textContent:'Nothing on this shelf yet — ask the Librarian above.'})]));
 }
 for(const t of topics){
  const count=books.filter(b=>t.tags.includes(b.tag)).length;
  const b=el('button',{type:'button'},el('span',{textContent:t.title}),el('span',{textContent:count?String(count):''}));
  b.dataset.id=t.id;b.onclick=()=>select(t);buttons.push(b);$('topics').append(b);
 }
 select(topics.find(t=>t.id===location.hash.slice(1))||all,false);

 // The Librarian: our shelf plus the open catalogs, streamed as each one answers.
 let controller=null;
 $('search').onsubmit=async event=>{
  event.preventDefault();const q=$('query').value.trim();if(!q)return;
  controller?.abort();controller=new AbortController();
  if(!window.LibrarianSearch){$('search-status').textContent='The Librarian is unavailable right now.';return;}
  const render=snap=>{
   showShelf(snap.books.slice(0,30).map(b=>({title:b.title,author:(b.authors||[]).slice(0,2).join(', '),cover:b.cover,url:b.links?.[0]?.url,meta:[b.year,b.availability].filter(Boolean).join(' · ')})),'The Librarian found');
   $('search-status').textContent=`Searched ${snap.completed} of ${snap.total} catalogs`+(snap.failed.length?` (${snap.failed.length} unavailable)`:'')+' — ';
   $('search-status').append(el('a',{href:LibrarianSearch.appURL(q),target:'_blank',rel:'noopener',textContent:'open the full Librarian ↗',style:'text-decoration:underline'}));
  };
  try{render(await LibrarianSearch.search(q,{signal:controller.signal,onProgress:render}));}
  catch(error){if(error.name!=='AbortError')$('search-status').textContent='The Librarian could not reach the catalogs.';}
 };
})();
