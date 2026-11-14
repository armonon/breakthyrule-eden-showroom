'use strict';
(function(){
const cooldowns=new Map();
window.LibrarianSearch={
 appURL(query=''){const url=new URL('https://librarian-atlas.netlify.app/');if(query)url.searchParams.set('q',query);return url.href;},
 async search(query,{signal,onProgress=()=>{}}={}){
  const q=String(query).trim().slice(0,200);
  if(!q)return {books:[],completed:0,failed:[],total:0};
  const tokens=q.toLowerCase().split(/\s+/).filter(Boolean);
  const shelf=window.showroomBooks.filter(book=>tokens.every(token=>(book.title+' '+book.author+' '+book.tag).toLowerCase().includes(token))).map(book=>({
   id:'eden:'+book.file,title:book.title,authors:[book.author],cover:book.cover,subjects:[book.tag],sources:['Garden library'],availability:'PDF on our shelf',links:[{label:'Read PDF',url:book.url}],ids:[],langs:[],year:''
  }));
  let records=[...shelf],completed=0;const failed=[],failures=[],statuses=new Map();
  function checkAbort(){if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');}
  function sourceKey(url){const u=new URL(url);return u.searchParams.get('api')||u.hostname;}
  async function request(url,type){
   checkAbort();const controller=new AbortController(),cancel=()=>controller.abort();
   signal?.addEventListener('abort',cancel,{once:true});const timeout=setTimeout(cancel,11000);
   const key=sourceKey(url);statuses.set(key,{ok:false});
   try{const response=await fetch(url,{signal:controller.signal});if(!response.ok){const error=new Error('Catalog unavailable');error.httpStatus=response.status;const retry=response.headers?.get('Retry-After'),seconds=Number(retry);error.retryMs=retry?(Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()):null;throw error;}const data=await response[type]();statuses.set(key,{ok:true});return data;}
   catch(error){statuses.set(key,{ok:false,error});throw error;}
   finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
  }
  const engine=window.createLibrarianAtlasEngine(request),entries=Object.entries(engine.fetchers),total=entries.length;
  const domains={'Open Library':'openlibrary.org','Google Books':'www.googleapis.com','Project Gutenberg / Gutendex':'gutendex.com'};
  const snapshot=()=>({books:engine.merge(records,q),completed,total,failed:[...failed],failures:[...failures],successful:completed-failed.length});
  onProgress(snapshot());
  for(const tier of ['fast','slow']){
   checkAbort();await Promise.all(entries.filter(([,adapter])=>adapter.tier===tier).map(async([name,adapter])=>{
    const cooling=cooldowns.get(name);
    if(cooling?.retryAt>Date.now()){failed.push(name);failures.push({...cooling,name});completed++;if(!signal?.aborted)onProgress(snapshot());return;}
    try{const books=await adapter.fn(q);checkAbort();const result=domains[name]&&statuses.get(domains[name]);if(result?.ok===false)throw result.error||new Error('Catalog unavailable');records.push(...books);cooldowns.delete(name);}
    catch(error){if(signal?.aborted)return;const status=error.httpStatus||null,reason=status===429?'provider quota limit':status===400?'catalog query unavailable':[401,403].includes(status)?'provider access unavailable':'could not respond';
     const fallback=status===429?60000:[400,401,403].includes(status)?300000:15000,delay=Number.isFinite(error.retryMs)?Math.max(30000,Math.min(3600000,error.retryMs)):fallback;
     const failure={name,status,reason,retryAt:Date.now()+delay};failed.push(name);failures.push(failure);cooldowns.set(name,failure);}
    completed++;if(!signal?.aborted)onProgress(snapshot());
   }));
  }
  checkAbort();return snapshot();
 }
};
})();
