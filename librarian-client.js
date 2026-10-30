'use strict';
window.LibrarianSearch={
 appURL(query=''){const url=new URL('https://librarian-atlas.netlify.app/');if(query)url.searchParams.set('q',query);return url.href;},
 async search(query,{signal,onProgress=()=>{}}={}){
  const q=String(query).trim().slice(0,200);
  if(!q)return {books:[],completed:0,failed:[],total:0};
  const tokens=q.toLowerCase().split(/\s+/).filter(Boolean);
  const shelf=window.showroomBooks.filter(book=>tokens.every(token=>(book.title+' '+book.author+' '+book.tag).toLowerCase().includes(token))).map(book=>({
   id:'eden:'+book.file,title:book.title,authors:[book.author],cover:book.cover,subjects:[book.tag],sources:['Garden library'],availability:'PDF on our shelf',links:[{label:'Read PDF',url:book.url}],ids:[],langs:[],year:''
  }));
  let records=[...shelf],completed=0;const failed=[],statuses=new Map();
  function checkAbort(){if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');}
  function sourceKey(url){const u=new URL(url);return u.searchParams.get('api')||u.hostname;}
  async function request(url,type){
   checkAbort();const controller=new AbortController(),cancel=()=>controller.abort();
   signal?.addEventListener('abort',cancel,{once:true});const timeout=setTimeout(cancel,11000);
   const key=sourceKey(url);statuses.set(key,false);
   try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw new Error('Catalog unavailable');const data=await response[type]();statuses.set(key,true);return data;}
   finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
  }
  const engine=window.createLibrarianAtlasEngine(request),entries=Object.entries(engine.fetchers),total=entries.length;
  const domains={'Open Library':'openlibrary.org','Google Books':'www.googleapis.com','Project Gutenberg / Gutendex':'gutendex.com'};
  const snapshot=()=>({books:engine.merge(records,q),completed,total,failed:[...failed]});
  onProgress(snapshot());
  for(const tier of ['fast','slow']){
   checkAbort();await Promise.all(entries.filter(([,adapter])=>adapter.tier===tier).map(async([name,adapter])=>{
    try{const books=await adapter.fn(q);checkAbort();if(domains[name]&&statuses.get(domains[name])===false)throw new Error('Catalog unavailable');records.push(...books);}
    catch(error){if(signal?.aborted)return;failed.push(name);}
    completed++;if(!signal?.aborted)onProgress(snapshot());
   }));
  }
  checkAbort();return snapshot();
 }
};
