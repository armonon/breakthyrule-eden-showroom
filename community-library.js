'use strict';
window.createCommunityLibrary=function({onChange=()=>{}}={}){
 const config=window.showroomDeployment||{},configured=typeof config.libraryApi==='string'&&config.libraryApi.length>0;
 const endpoint=configured?config.libraryApi:config.libraryApi===null||config.mode==='preview'?null:'/api/library';
 const founding=window.showroomBooks.slice(),covers=new Map();
 let state={revision:-1,reading:null,books:[],likes:[]},connected=false,inflight=null,stopped=false,timer=null,failures=0,missing=false;
 let reason=endpoint?'Connecting to the shared library…':'Shared reading, likes and PDF uploads are unavailable in this build. You can still read the books and search the catalogs.';
 const emit=()=>window.dispatchEvent(new Event('community-library-change'));
 const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const validBook=b=>plain(b)&&typeof b.title==='string'&&b.title.length>0&&b.title.length<=1000&&typeof b.url==='string'&&b.url.length<=4096&&(()=>{try{return ['http:','https:'].includes(new URL(b.url,location.href).protocol);}catch{return false;}})();
 function validate(data){
  if(!plain(data)||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.books)||!Array.isArray(data.likes)||data.books.length>10000||data.likes.length>10000||!data.books.every(validBook)||!data.likes.every(validBook)||(data.reading!==null&&(!plain(data.reading)||!validBook(data.reading.book))))throw Error('The shared library returned invalid data. Your last shelf has been kept.');
  if(data.revision<state.revision)throw Error('The shared library returned an older shelf. Your latest shelf has been kept.');
  return structuredClone({revision:data.revision,reading:data.reading,books:data.books,likes:data.likes});
 }
 function cover(title){
  if(covers.has(title))return covers.get(title);
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=600;
  const c=canvas.getContext('2d');c.fillStyle='#294a46';c.fillRect(0,0,400,600);c.fillStyle='#b1c9b5';c.fillRect(28,28,4,544);
  c.fillStyle='#f6f6ed';c.font='20px Arial';c.fillText('THE OPEN LIBRARY',55,75);c.font='bold 32px Georgia';
  const words=String(title).match(/.{1,18}(?:\s|$)|.{1,18}/g)||[title];words.slice(0,9).forEach((line,i)=>c.fillText(line.trim(),55,170+i*39,300));
  const result=canvas.toDataURL('image/png');covers.set(title,result);return result;
 }
 function normalize(book){return {...book,file:book.file||book.id,cover:book.cover||cover(book.title)};}
 function apply(data){
  const next=validate(data),merged=founding.slice();
  for(const entry of [...next.books,...next.likes,...(next.reading?[next.reading.book]:[])])if(!merged.some(book=>book.url===entry.url))merged.push(normalize(entry));
  const changed=JSON.stringify(next)!==JSON.stringify(state);state=next;connected=true;failures=0;missing=false;reason='Shared library connected';window.showroomBooks=merged;
  if(changed)onChange(state);emit();return data;
 }
 async function request(action,book,liked){
  if(!endpoint)throw Error(reason);
  const response=await fetch(endpoint+(action?'?action='+action:''),{method:action?'POST':'GET',credentials:'same-origin',headers:action?{'Content-Type':'application/json'}:{},body:action?JSON.stringify({book:{title:book.title,author:book.author,url:book.url,cover:book.cover?.startsWith('data:')?'':book.cover,tag:book.tag,sizeMB:book.sizeMB},liked}):undefined,signal:AbortSignal.timeout(20000)});
  if(!response.ok){const data=await response.json().catch(()=>null);if([404,410].includes(response.status))missing=true;throw Error(data?.error||'Shared library unavailable (HTTP '+response.status+').');}
  let data;try{data=await response.json();}catch{throw Error('The shared library returned an unreadable response. Your last shelf has been kept.');}
  return apply(data);
 }
 function schedule(){clearTimeout(timer);timer=null;if(endpoint&&!stopped&&!missing)timer=setTimeout(()=>refresh({automatic:true}),Math.min(120000,10000*2**Math.min(failures,4)));}
 function refresh({automatic=false}={}){
  if(inflight)return inflight;
  if(!endpoint||stopped||automatic&&(document.hidden||missing)){if(endpoint&&!missing&&!stopped)schedule();return Promise.resolve(state);}
  if(!automatic)missing=false;
  inflight=(async()=>{try{await request();}catch(error){connected=false;failures++;reason=error.message;emit();}finally{inflight=null;schedule();}return state;})();return inflight;
 }
 const visible=()=>{if(!document.hidden&&!missing)refresh({automatic:true});};
 const hide=()=>{stopped=true;clearTimeout(timer);timer=null;};
 const show=()=>{stopped=false;if(!missing)refresh({automatic:true});};
 document.addEventListener('visibilitychange',visible);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
 const ready=refresh();
 return {ready,refresh,apply,cover,normalize,endpoint,read:book=>request('read',book),like:(book,liked)=>request('like',book,liked),getState:()=>state,isConnected:()=>connected,availability:()=>({available:!!endpoint,connected,reason,missing,failures}),founding,
  dispose(){hide();document.removeEventListener('visibilitychange',visible);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);}};
};
