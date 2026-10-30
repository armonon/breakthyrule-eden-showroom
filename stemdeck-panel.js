'use strict';
window.createStemDeckPanel=function({onOpen=()=>{},onClose=()=>{},onSoundDesk=()=>{}}={}){
 const $=id=>document.getElementById(id),panel=$('stemdeck-dialog'),frame=$('stemdeck-frame'),status=$('stemdeck-status');
 let initialized=false,loading=false;
 async function load(){
  if(initialized||loading)return;
  loading=true;status.hidden=false;status.textContent='Connecting to Sattari StemDeck...';$('stemdeck-retry').hidden=true;
  try{
   const response=await fetch('/stemdeck-config.json',{cache:'no-store'});if(!response.ok)throw Error();
   const config=await response.json(),url=new URL(config.url,location.href);
   if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();
   const health=await fetch(url.href,{method:'HEAD',signal:AbortSignal.timeout(6000)});if(!health.ok)throw Error();
   frame.onload=()=>{status.hidden=true;frame.hidden=false;};
   frame.src=url.href;initialized=true;
  }catch(error){status.textContent='The local StemDeck studio is unavailable.';$('stemdeck-retry').hidden=false;}
  finally{loading=false;}
 }
 function open(){onOpen();if(!panel.open)panel.showModal();$('stemdeck-launcher').hidden=false;load();}
 $('close-stemdeck').onclick=()=>panel.close();
 $('stemdeck-launcher').onclick=open;
 $('stemdeck-retry').onclick=load;
 $('stemdeck-sound-desk').onclick=()=>{panel.close();onSoundDesk();};
 panel.addEventListener('close',onClose);
 return {open,close(){if(panel.open)panel.close();},get opened(){return panel.open;}};
};
