'use strict';
// This is the site's own Studio application and shares its origin-backed projects.
// Pin the embedded route before granting ordinary first-party iframe privileges.
window.stemDeckURL=function(value,base=location.href){
 const parent=new URL(base),url=new URL(value,parent);
 if(!['https:','http:'].includes(url.protocol)||url.origin!==parent.origin||url.username||url.password||!['/studio','/studio/'].includes(url.pathname)||url.search||url.hash)throw Error('The embedded Studio must use this site’s /studio route.');
 return new URL('/studio',parent.origin).href;
};
window.createStemDeckPanel=function({onOpen=()=>{},onClose=()=>{},onSoundDesk=()=>{}}={}){
 const $=id=>document.getElementById(id),panel=$('stemdeck-dialog'),frame=$('stemdeck-frame'),status=$('stemdeck-status');
 let phase='idle',attempt=0,deadline=null,request=null;
 function failed(ticket,message){if(ticket!==attempt)return;clearTimeout(deadline);deadline=null;request?.abort();phase='error';status.hidden=false;status.textContent=message;$('stemdeck-retry').hidden=false;}
 async function load(){
  if(phase==='document-loaded'||phase==='loading')return;
  const ticket=++attempt;request?.abort();request=new AbortController();phase='loading';status.hidden=false;status.textContent='Opening Sattari StemDeck…';$('stemdeck-retry').hidden=true;
  deadline=setTimeout(()=>failed(ticket,'Studio is taking too long to open. You can retry.'),20000);
  try{
   const response=await fetch('/stemdeck-config.json',{cache:'no-store',signal:request.signal});if(!response.ok)throw Error('Studio configuration is unavailable.');
   const config=await response.json(),url=window.stemDeckURL(config.url);
   const health=await fetch(url,{method:'HEAD',redirect:'error',signal:request.signal});if(!health.ok)throw Error('The Studio document is unavailable.');
   if(ticket!==attempt||phase!=='loading')return;
   frame.onload=()=>{if(ticket!==attempt||phase!=='loading')return;clearTimeout(deadline);deadline=null;phase='document-loaded';status.hidden=true;frame.hidden=false;};
   frame.onerror=()=>failed(ticket,'Studio could not load. You can retry.');
   // Load is document readiness only. Studio owns its application/error UI;
   // closing and reopening preserves its mounted editor, audio and saved project.
   frame.hidden=true;frame.removeAttribute('sandbox');frame.src=url;
  }catch(error){if(ticket===attempt&&phase==='loading')failed(ticket,error.message||'Studio is unavailable.');}
 }
 function open(){onOpen();if(!panel.open)panel.showModal();$('stemdeck-launcher').hidden=false;load();}
 $('close-stemdeck').onclick=()=>panel.close();$('stemdeck-launcher').onclick=open;
 $('stemdeck-retry').onclick=()=>{if(phase==='error')load();};
 $('stemdeck-sound-desk').onclick=()=>{panel.close();onSoundDesk();};panel.addEventListener('close',onClose);
 return {open,close(){if(panel.open)panel.close();},get opened(){return panel.open;},inspect:()=>({phase}),dispose(){attempt++;clearTimeout(deadline);request?.abort();frame.onload=frame.onerror=null;panel.removeEventListener('close',onClose);}};
};
