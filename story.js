'use strict';
// The story's milestones, in order: eight pages -> the office -> the ticket or the showdown -> keys -> the black cube
// -> the garment lab. A milestone, once reached, is locked for good (nothing in the world can undo it: the Watcher
// cannot take back delivered pages once the office is open). Kept on this device; when the Eden server is live the
// same milestones are shared by the room and follow the account (sync()).
window.edenStory=(()=>{
 const KEY='eden-story-v1',ORDER=['pages','office','ticket','showdown','keys','cube','garment'];
 let s={};try{s=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{}
 const subs=new Set(),save=()=>{try{localStorage.setItem(KEY,JSON.stringify(s));}catch{}};
 return {ORDER,
  has:m=>!!s[m],get:()=>({...s}),
  // Returns true the first time a milestone is reached.
  set(m,value=true){if(s[m])return false;s[m]=value===true?Date.now():value;save();for(const f of subs)try{f(m,s[m]);}catch(e){console.warn(e);}return true;},
  next:()=>ORDER.find(m=>!s[m])||null,
  on(f){subs.add(f);return()=>subs.delete(f);},
  // Server copy wins where it has more: merged in when a signed-in session receives the room's progress.
  sync(remote={}){let changed=false;for(const m of ORDER)if(remote[m]&&!s[m]){s[m]=remote[m];changed=true;}if(changed){save();for(const f of subs)f('sync');}},
  reset(){s={};save();for(const f of subs)f('reset');}
 };
})();
