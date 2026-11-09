'use strict';
(async()=>{
 const el=window.siteEl,$=id=>document.getElementById(id),spaces=siteConfig.circle.spaces;
 // Boards: each one a Circle space when connected, or a local preview thread.
 const boards=[
  {key:'forum',label:'General',space:spaces.forum,prompt:'What are you thinking about?'},
  {key:'fits',label:'Fits',space:spaces.gallery,prompt:'Share a photo of what you are wearing.'},
  {key:'readings',label:'Readings',space:spaces.archive,prompt:'A book, a video, a source worth sharing.'},
  {key:'drops',label:'Drops & events',space:spaces.forum,prompt:'Ask about the next drop or a meet-up.'}
 ];
 // With Circle connected the boards collapse into one embedded community.
 const connected=!!siteConfig.circle.community;
 function open(board){for(const b of $('boards').children)b.setAttribute('aria-pressed',String(b.dataset.key===board.key));
  window.siteDiscussion($('discussion'),{key:'community:'+board.key,space:board.space||spaces.forum,title:board.label,prompt:board.prompt});}
 if(connected&&spaces.forum)$('boards').hidden=true;
 for(const board of boards){const b=el('button',{type:'button',textContent:board.label});b.dataset.key=board.key;b.onclick=()=>open(board);$('boards').append(b);}
 open(boards[0]);

 try{
  const gallery=await (await fetch('/site/data/gallery.json',{cache:'no-cache'})).json();
  const people=gallery.items.filter(i=>['worn','instagram','models'].includes(i.category));
  const pick=(people.length?people:gallery.items).slice(0,9);
  $('wall').replaceChildren(...pick.map(i=>el('a',{href:'/gallery'},el('img',{src:i.src,alt:i.alt,loading:'lazy'}))));
 }catch{$('wall').closest('.panel').hidden=true;}
 try{
  const {channels}=await (await fetch('/assets/broadcast/channels.json')).json();
  $('channels').replaceChildren(...channels.map(c=>el('li',{},el('a',{href:c.url,target:'_blank',rel:'noopener',textContent:c.title}),el('span',{className:'fine',textContent:(c.videos?.length||0)+' videos'}))));
 }catch{$('channels').closest('.panel').hidden=true;}
})();
