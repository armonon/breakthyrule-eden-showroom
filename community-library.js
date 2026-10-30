'use strict';
window.createCommunityLibrary=function({onChange}){
 const endpoint=window.showroomDeployment?.mode==='preview'?'/community-library':'/api/library';
 const founding=window.showroomBooks.slice(),covers=new Map();
 let state={revision:-1,reading:null,books:[],likes:[]},connected=false,polling=false,stopped=false,timer,pollVersion=0;
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
  const reconnected=!connected;connected=true;
  if(data.revision<state.revision)return;
  const changed=JSON.stringify(data)!==JSON.stringify(state);state=data;
  if(!changed){if(reconnected)window.dispatchEvent(new Event('community-library-change'));return;}
  const merged=founding.slice();for(const entry of [...data.books,...data.likes,...(data.reading?[data.reading.book]:[])])if(!merged.some(book=>book.url===entry.url))merged.push(normalize(entry));
  window.showroomBooks=merged;onChange(state);window.dispatchEvent(new Event('community-library-change'));
 }
 async function request(action,book,liked){
  const response=await fetch(endpoint+(action?'?action='+action:''),{method:action?'POST':'GET',headers:action?{'Content-Type':'application/json'}:{},body:action?JSON.stringify({book:{title:book.title,author:book.author,url:book.url,cover:book.cover?.startsWith('data:')?'':book.cover,tag:book.tag,sizeMB:book.sizeMB},liked}):undefined,signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({error:'The shared library is unavailable.'}));if(!response.ok)throw Error(data.error||'The shared library is unavailable.');apply(data);return data;
 }
 async function refresh(){if(polling)return;polling=true;try{await request();}catch{connected=false;window.dispatchEvent(new Event('community-library-change'));}finally{polling=false;}}
 async function poll(){const version=++pollVersion;clearTimeout(timer);if(stopped)return;if(!document.hidden)await refresh();if(!stopped&&version===pollVersion)timer=setTimeout(poll,10000);}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
 window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});
 window.addEventListener('pageshow',()=>{if(stopped){stopped=false;poll();}});
 const ready=poll();
 return {ready,refresh,apply,cover,normalize,endpoint,read:book=>request('read',book),like:(book,liked)=>request('like',book,liked),getState:()=>state,isConnected:()=>connected,founding};
};
