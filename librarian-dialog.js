'use strict';
window.createLibrarianConversation=function({onOpen,onClose}){
 const $=id=>document.getElementById(id),dialog=$('librarian-dialog');
 let controller=null,version=0,currentQuery='',snapshot={books:[],failed:[],completed:0,total:15},limit=20,busy=false;
 const liking=new Set();
 function sharedBook(book){const link=(book.links||[]).find(link=>safeURL(link.url));return {title:book.title,author:(book.authors||[]).join(', '),cover:book.cover,url:link?.url,tag:'Atlas pick'};}
 const safeURL=value=>{try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
 function icon(name){const node=document.createElement('i');node.dataset.lucide=name;return node;}
 function setBusy(value){busy=value;$('librarian-cancel').hidden=!value;$('librarian-results').setAttribute('aria-busy',String(value));$('librarian-submit').setAttribute('aria-label',value?'Search for something else':'Search books');}
 function renderResults(){
  const source=$('librarian-source').value;
  const books=snapshot.books.filter(book=>source==='all'||book.sources?.includes(source));
  const fragment=document.createDocumentFragment();
  for(const book of books.slice(0,limit)){
   const row=document.createElement('article');row.className='librarian-result';
   const cover=document.createElement('div');cover.className='result-cover';
   const coverURL=book.cover&&safeURL(book.cover);if(coverURL){const image=document.createElement('img');image.src=coverURL;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>{image.remove();cover.append(icon('book-open'));window.lucide.createIcons();};cover.append(image);}else cover.append(icon('book-open'));
   const content=document.createElement('div'),title=document.createElement('h3'),byline=document.createElement('p'),meta=document.createElement('p'),links=document.createElement('div');
   title.textContent=book.title;byline.textContent=(book.authors||[]).slice(0,2).map(author=>String(author).replace(/https?:\/\/\S+/g,'').trim()).join(', ').slice(0,180)||'Author not listed';meta.className='result-meta';meta.textContent=[book.year,...(book.sources||[]),book.availability].filter(Boolean).join(' / ');links.className='result-links';
   const labels=new Set();
   for(const link of (book.links||[])){const href=safeURL(link.url);if(!href||labels.has(link.label))continue;labels.add(link.label);const anchor=document.createElement('a');anchor.href=href;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent=link.label;anchor.append(icon('arrow-up-right'));anchor.onclick=()=>window.communityLibrary.read({...sharedBook(book),url:link.url}).then(()=>{$('librarian-action-status').textContent='On the shared stand: '+book.title;}).catch(error=>{$('librarian-action-status').textContent=error.message;});links.append(anchor);if(labels.size===3)break;}
   const selected=sharedBook(book),existing=window.communityLibrary?.getState().likes.find(entry=>new URL(entry.url,location.origin).href===safeURL(selected.url)),liked=!!existing?.liked;
   const like=document.createElement('button');like.className='icon-button atlas-like';like.type='button';like.title=(liked?'Unlike ':'Like ')+book.title;like.setAttribute('aria-label',like.title);like.setAttribute('aria-pressed',String(liked));like.disabled=!selected.url||liking.has(selected.url);like.append(icon('heart'));
   const count=document.createElement('span');count.textContent=existing?.likes||0;like.append(count);
   like.onclick=async()=>{liking.add(selected.url);like.disabled=true;try{await window.communityLibrary.like(selected,!liked);$('librarian-action-status').textContent=liked?'Removed your like.':'Added to the Atlas community shelf.';}catch(error){$('librarian-action-status').textContent=error.message;}finally{liking.delete(selected.url);renderResults();}};links.append(like);
   content.append(title,byline,meta,links);row.append(cover,content);fragment.append(row);
  }
  $('librarian-results').replaceChildren(fragment);$('librarian-more').hidden=books.length<=limit;
  $('librarian-count').textContent=books.length+' '+(books.length===1?'book':'books');
  $('librarian-empty').hidden=books.length>0||busy;
  $('librarian-empty').textContent=source!=='all'?'No matches from this source.':snapshot.failed.length===snapshot.total?'The catalogs are unavailable right now. Please try again in a moment.':'I haven\'t found a match. Shall we try another title, author, or subject?';
  window.lucide.createIcons();
 }
 function updateSources(){const select=$('librarian-source'),selected=select.value;select.replaceChildren(new Option('All sources','all'));for(const source of [...new Set(snapshot.books.flatMap(book=>book.sources||[]))].sort())select.add(new Option(source,source));select.value=[...select.options].some(o=>o.value===selected)?selected:'all';}
 function progress(result){snapshot=result;updateSources();$('librarian-status').textContent=result.completed+' / '+result.total+' catalogs searched'+(result.failed.length?' / '+result.failed.length+' unavailable':'');renderResults();}
 async function search(value){
  const query=String(value).trim().slice(0,200);if(!query){$('librarian-query').focus();return;}
  controller?.abort();controller=new AbortController();const id=++version;currentQuery=query;limit=20;
  $('librarian-query').value=query;$('librarian-user').hidden=false;$('librarian-user').textContent=query;
  $('librarian-speech').textContent='Let me look through the catalogs for you.';$('librarian-empty').hidden=true;$('librarian-tools').hidden=false;$('librarian-source').value='all';
  $('librarian-atlas').href=window.LibrarianSearch.appURL(query);$('librarian-retry').hidden=true;setBusy(true);
  try{
   const result=await window.LibrarianSearch.search(query,{signal:controller.signal,onProgress:result=>{if(id===version)progress(result);}});
   if(id!==version)return;setBusy(false);progress(result);
   $('librarian-speech').textContent=result.books.length?'Here is what I found. Take your time; a good book is worth it.':result.failed.length===result.total?'I couldn\'t reach the catalogs just now. We can try again.':'Nothing on that search yet. Try a shorter title or an author\'s name.';
   $('librarian-retry').hidden=result.failed.length===0;
  }catch(error){if(id!==version||error.name==='AbortError')return;setBusy(false);$('librarian-speech').textContent='Something interrupted the search. Shall we try again?';$('librarian-status').textContent='Search unavailable';$('librarian-retry').hidden=false;renderResults();}
 }
 function cancel(){version++;controller?.abort();controller=null;setBusy(false);$('librarian-speech').textContent='We can leave that search there. What else is on your mind?';$('librarian-status').textContent='Search stopped';renderResults();if(!snapshot.books.length)$('librarian-empty').textContent='The search was stopped before any books arrived.';}
 function open(){onOpen();if(!dialog.open)dialog.showModal();$('librarian-query').focus();}
 $('librarian-form').onsubmit=event=>{event.preventDefault();search($('librarian-query').value);};
 $('librarian-cancel').onclick=cancel;$('librarian-retry').onclick=()=>search(currentQuery);$('librarian-more').onclick=()=>{limit+=20;renderResults();};
 $('librarian-source').onchange=()=>{limit=20;renderResults();};$('close-librarian').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(busy)cancel();onClose();});
 $('librarian-atlas').href=window.LibrarianSearch.appURL();
 window.addEventListener('community-library-change',()=>{if(dialog.open)renderResults();});
 window.lucide.createIcons();
 return {open,dialog};
};
