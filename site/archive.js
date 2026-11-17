'use strict';
(async () => {
 const $ = id => document.getElementById(id), el = window.siteEl;
 const themeToggle=$('theme-toggle'), themeKey='btr-archive-theme';
 function setTheme(theme,remember=false){
  const night=theme==='night';
  document.documentElement.dataset.archiveTheme=night?'night':'day';
  document.documentElement.style.colorScheme=night?'dark':'light';
  document.querySelector('meta[name="theme-color"]').content=night?'#141912':'#ffffff';
  themeToggle.setAttribute('aria-pressed',String(night));
  themeToggle.querySelector('.market-theme-state').textContent=night?'on':'off';
  themeToggle.title=night?'Turn night mode off':'Turn night mode on';
  if(remember){try{localStorage.setItem(themeKey,night?'night':'day');}catch{}}
 }
 setTheme(document.documentElement.dataset.archiveTheme);
 themeToggle.hidden=false;
 themeToggle.onclick=()=>setTheme(document.documentElement.dataset.archiveTheme==='night'?'day':'night',true);
 addEventListener('storage',event=>{if(event.key===themeKey||event.key===null)setTheme(event.newValue);});
 const books=window.showroomBooks||[], views=['library','archive','forum'];
 const all={id:'all',title:'Everything',blurb:'Books and source material already on our shelf.',tags:books.map(b=>b.tag),query:''};
 let topics=[all], topicsError='', subjectGroups=[], topicsReady=false;
 const expandTopics=$('topic-expand-all');
 const initialHash=location.hash;
 const topicRequest=(async()=>{
  // Keep the complete directory available with the page, even on a slow connection.
  try{const saved=JSON.parse($('archive-topics-data')?.textContent||'null');if(Array.isArray(saved?.topics)&&Array.isArray(saved?.groups)&&saved.topics.length)return saved;}catch{}
  const topicAbort=new AbortController(),topicTimer=setTimeout(()=>topicAbort.abort(),6000);
  try{const response=await fetch('/site/data/topics.json',{cache:'no-cache',signal:topicAbort.signal});if(!response.ok)throw new Error();return await response.json();}
  catch{topicsError='Topic list unavailable. You can still browse and search all books.';return {topics:[],groups:[]};}
  finally{clearTimeout(topicTimer);}
 })();
 $('archive-total').textContent=`${books.length} texts`;
 const safe=value=>{try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}};
 const shelfBook=book=>({...book,authors:[book.author||''],subjects:[book.tag||''],meta:[book.tag,book.file?'PDF':null,book.sizeMB!=null?book.sizeMB+' MB':null].filter(Boolean).join(' · ')});
 const normalize=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const guidePattern=/\b(guides?|manuals?|handbooks?|workbooks?|tutorials?|primers?|how to)\b/i;
 let libraryAuthorQuery='';
 function matchingAuthor(book){
  const tokens=normalize(libraryAuthorQuery).split(' ').filter(Boolean);
  return (book.authors||[book.author||'']).find(author=>{const words=normalize(author).split(' ');return tokens.every(token=>words.includes(token));});
 }
 function filteredLibrary(){
  return libraryList.filter(book=>(!libraryAuthorQuery||matchingAuthor(book))&&($('library-format').value!=='guides'||guidePattern.test(normalize([book.title,...(book.subjects||[])].join(' '))))).map(book=>libraryAuthorQuery?{...book,author:matchingAuthor(book)}:book);
 }
 function bookCard(book){
  const href=book.url&&safe(book.url);
  const cover=el('div',{className:'market-cover'},el('span',{className:'market-cover-fallback',textContent:book.title}));
  if(book.cover&&safe(book.cover)){const image=el('img',{src:safe(book.cover),alt:'',loading:'lazy',decoding:'async'});image.onerror=()=>image.remove();cover.append(image);}
  const card=el(href?'a':'div',{className:'market-book'},cover,el('strong',{textContent:book.title}),el('span',{className:'market-author',textContent:book.author||'Author not listed'}),el('span',{className:'market-meta',textContent:book.meta||'Catalog entry'}));
  if(book.source)card.append(el('span',{className:'market-source',textContent:book.source}));
  if(href){card.href=href;card.target='_blank';card.rel='noopener';card.setAttribute('aria-label',book.title+' — opens in a new tab');}return card;
 }
 function sorted(list,order){return order==='shelf'?[...list]:[...list].sort((a,b)=>String(a[order]||'').localeCompare(String(b[order]||''),undefined,{sensitivity:'base'}));}
 function fillBooks(mount,list,empty){mount.replaceChildren(...(list.length?list.map(bookCard):[el('p',{className:'market-empty',textContent:empty})]));}
 let activeView='library', archiveTopic=all, forumTopic=all;
 const mobileReadingLayout=matchMedia('(max-width:700px)'),readingSidebar=$('reading-sidebar');
 const readingLayout=document.querySelector('.reading-layout'),readingContent=document.querySelector('.reading-content'),libraryDiscovery=document.querySelector('.library-discovery');
 function placeReadingSidebar(){
  const inLibrary=mobileReadingLayout.matches&&activeView==='library';
  const inForum=activeView==='forum';
  readingLayout.dataset.view=activeView;
  const parent=inForum?$('forum-local-notes'):inLibrary?$('panel-library'):readingLayout;
  if(readingSidebar.parentElement===parent)return;
  const focused=readingSidebar.contains(document.activeElement)?document.activeElement:null;
  if(inForum)parent.querySelector('summary').after(readingSidebar);
  else if(inLibrary)libraryDiscovery.after(readingSidebar);else readingLayout.insertBefore(readingSidebar,readingContent);
  focused?.focus({preventScroll:true});
 }
 mobileReadingLayout.addEventListener('change',placeReadingSidebar);
 const libraryPageSize=30;
 let libraryList=books.slice(0,4).map(shelfBook),libraryMode='featured',libraryTopic=null,libraryPage=1,libraryBusy=false,controller=null,generation=0;
 const libraryPagers=['top','bottom'].map(position=>{
  const mount=$('library-pagination-'+position);
  const previous=el('button',{type:'button',textContent:'Previous'}),next=el('button',{type:'button',textContent:'Next'});
  const select=el('select',{id:'library-page-'+position}),total=el('span',{id:'library-pages-'+position}),note=el('span',{className:'pagination-note'});
  select.setAttribute('aria-label','Go to results page');select.setAttribute('aria-describedby',total.id);
  const label=el('label',{className:'pagination-current'},el('span',{textContent:'Page'}),select,total);
  mount.append(el('div',{className:'pagination-controls'},previous,label,next),note);
  previous.onclick=()=>changeLibraryPage(libraryPage-1);next.onclick=()=>changeLibraryPage(libraryPage+1);select.onchange=()=>changeLibraryPage(Number(select.value));
  return {mount,previous,next,select,total,note};
 });
 const boards=new Map(),archiveButtons=[],forumButtons=[],libraryButtons=[];
 let communityFeed=null,communityFeedModule=null;
 function loadCommunityFeed(){
  if(communityFeed){communityFeed.load();return;}
  if(communityFeedModule)return;
  const mount=$('circle-feed');
  mount.setAttribute('aria-busy','true');
  mount.replaceChildren(el('p',{role:'status',textContent:'Loading public conversations…'}));
  communityFeedModule=import('/site/community-feed.mjs?v=1').then(({mountCommunityFeed})=>{
   communityFeed=mountCommunityFeed(mount);
   return communityFeed.load();
  }).catch(()=>{
   communityFeedModule=null;mount.setAttribute('aria-busy','false');
   const retry=el('button',{type:'button',className:'community-feed-refresh',textContent:'Try again'});retry.onclick=loadCommunityFeed;
   mount.replaceChildren(el('p',{role:'status',textContent:'The community feed could not be loaded. Try again, or open The Circle above.'}),retry);
  });
 }
 const topicSections=[],openGroups=new Set();
 function updateLibraryTopics(){
  for(const button of libraryButtons)button.setAttribute('aria-pressed',String(button.dataset.id==='new'?libraryMode==='featured':button.dataset.id===libraryTopic));
 }
 function drawLibrary(){
  const list=sorted(filteredLibrary(),$('library-sort').value),pages=Math.max(1,Math.ceil(list.length/libraryPageSize));
  libraryPage=Math.max(1,Math.min(libraryPage,pages));
  const start=(libraryPage-1)*libraryPageSize,shown=list.slice(start,start+libraryPageSize);
  const empty=$('library-format').value==='guides'?'No guides or manuals matched. Try a broader subject or choose All books.':libraryAuthorQuery?'No books credited to this name were found. Try another spelling or fewer names.':'No books found. Try another title, author or subject.';
  fillBooks($('library-results'),shown,libraryBusy?'Searching the catalogs. Books will appear here as they arrive.':empty);
  $('library-count').textContent=libraryMode==='featured'?`${shown.length} selected texts`:`${list.length} ${list.length===1?'result':'results'}`;
  $('library-total').textContent=libraryMode==='featured'?`${books.length} texts in the Archive`:list.length?`Showing ${start+1}–${start+shown.length} of ${list.length} results`:libraryBusy?'Searching catalogs…':'No matching books';
  for(const pager of libraryPagers){
   pager.mount.hidden=libraryMode==='featured'||pages===1;
   if(pager.select.options.length!==pages)pager.select.replaceChildren(...Array.from({length:pages},(_,index)=>el('option',{value:String(index+1),textContent:String(index+1)})));
   pager.select.value=String(libraryPage);pager.total.textContent='of '+pages;
   pager.previous.disabled=libraryBusy||libraryPage===1;pager.next.disabled=libraryBusy||libraryPage===pages;pager.select.disabled=libraryBusy;
   pager.note.textContent=libraryBusy?'Finishing search before page browsing…':'';
   pager.note.hidden=!libraryBusy;
  }
 }
 function changeLibraryPage(page){
  if(libraryBusy||!Number.isInteger(page))return;
  libraryPage=page;drawLibrary();
  $('library-results-title').focus({preventScroll:true});$('library-results-title').scrollIntoView({block:'start'});
 }
 function stopLibrarySearch(){
  const wasBusy=libraryBusy;controller?.abort();controller=null;generation++;libraryBusy=false;$('library-results').setAttribute('aria-busy','false');
  if(wasBusy){$('library-status').textContent='Search paused. Your results are kept here; search again to finish.';drawLibrary();}
 }
 function resetLibrary(){
  stopLibrarySearch();libraryMode='featured';libraryTopic=null;libraryAuthorQuery='';libraryPage=1;libraryList=books.slice(0,4).map(shelfBook);
  $('library-format').value='all';$('library-search-by').value='books';updateSearchHelp();
  $('library-query').value='';$('library-sort').value='shelf';$('library-status').textContent='';
  $('library-results-title').textContent='A few from our archive';$('library-results-description').textContent='Already on our shelf. Use the search above to discover more.';
  $('browse-archive').textContent='Browse the collection »';$('full-librarian').href=window.siteConfig?.librarianApp||'https://librarian-atlas.netlify.app/';
  drawLibrary();updateLibraryTopics();$('library-query').focus();
 }
 function renderArchive(){
  const query=$('archive-query').value.trim().toLowerCase(),tokens=query.split(/\s+/).filter(Boolean);
  const list=books.filter(book=>(archiveTopic.id==='all'||archiveTopic.tags.includes(book.tag))&&tokens.every(token=>(book.title+' '+book.author+' '+book.tag).toLowerCase().includes(token))).map(shelfBook);
  $('topic-title').textContent=archiveTopic.id==='all'?'The collection':archiveTopic.title;
  $('topic-kicker').textContent=archiveTopic.id==='all'?'All topics':archiveTopic.title;
  $('topic-blurb').textContent=archiveTopic.blurb;
  $('result-count').textContent=`${list.length} ${list.length===1?'text':'texts'}`;
  $('shelf-total').textContent=list.length?`Showing 1–${list.length} of ${list.length}`:'No matching texts';
  $('archive-status').textContent=topicsError;
  fillBooks($('shelf'),sorted(list,$('sort').value),'Nothing on this shelf yet. Search the Library to discover books on this subject.');
  for(const button of archiveButtons)button.setAttribute('aria-pressed',String(button.dataset.id===archiveTopic.id));
  $('discuss-topic').href='#forum'+(archiveTopic.id==='all'?'':'/'+archiveTopic.id);
  $('discuss-topic').textContent=archiveTopic.id==='all'?'Discuss this collection in the Forum »':'Discuss '+archiveTopic.title+' in the Forum »';
 }
 function renderForum(){
  $('forum-topic-title').textContent=forumTopic.id==='all'?'General notes':forumTopic.title;
  $('forum-topic-blurb').textContent=forumTopic.id==='all'?'What are you reading? Leave a source, a thought, or a question.':forumTopic.blurb;
  for(const button of forumButtons)button.setAttribute('aria-pressed',String(button.dataset.id===forumTopic.id));
  if(!boards.has(forumTopic.id)){
   const mount=el('div',{className:'forum-board'});mount.setAttribute('aria-label',forumTopic.title+' notes');$('forum-boards').append(mount);
   createLocalForumBoard(mount,forumTopic,el);boards.set(forumTopic.id,mount);
  }
  for(const [id,mount] of boards)mount.hidden=id!==forumTopic.id;
 }
 function routeHash(view,topic){return '#'+view+(view!=='library'&&topic.id!=='all'?'/'+topic.id:'');}
 function showView(view,topic=null,push=true){
  if(activeView==='library'&&view!=='library')stopLibrarySearch();
  activeView=view;
  if(view==='archive'&&topic&&topic.id!==archiveTopic.id){archiveTopic=topic;$('archive-query').value='';$('sort').value='shelf';}
  if(view==='forum'&&topic){forumTopic=topic;if(topic.id!=='all')$('forum-local-notes').open=true;}
  for(const name of views){const selected=name===view;$('panel-'+name).hidden=!selected;$('sidebar-'+name).hidden=!selected;$('tab-'+name).setAttribute('aria-selected',String(selected));$('tab-'+name).tabIndex=selected?0:-1;}
  placeReadingSidebar();
  if(view==='archive')renderArchive();else if(view==='forum'){renderForum();loadCommunityFeed();}
  revealTopic(view==='archive'?archiveTopic.id:view==='forum'?forumTopic.id:libraryTopic);
  document.title='Break Thy Rule — '+view[0].toUpperCase()+view.slice(1);
  const hash=routeHash(view,view==='archive'?archiveTopic:forumTopic);
  if(push&&location.hash!==hash)history.pushState(null,'',hash);
  document.dispatchEvent(new CustomEvent('btr:reading-view'));
 }
 function readRoute(){
  let hash='';try{hash=decodeURIComponent(location.hash.slice(1));}catch{}
  const [view,id]=hash.split('/');
  if(views.includes(view))return {view,topic:topics.find(t=>t.id===id)||all};
  const oldTopic=topics.find(t=>t.id===hash);if(oldTopic)return {view:'archive',topic:oldTopic};
  if(hash==='archive-notes'||hash==='discussion')return {view:'forum',topic:all};
  if(hash==='archive-main')return {view:activeView,topic:activeView==='archive'?archiveTopic:forumTopic};
  return {view:'library',topic:all};
 }
 for(const [index,view] of views.entries()){
  const tab=$('tab-'+view);
  tab.onclick=()=>showView(view);
  tab.onkeydown=event=>{
   let next=null;
   if(event.key==='ArrowRight')next=(index+1)%views.length;
   if(event.key==='ArrowLeft')next=(index+views.length-1)%views.length;
   if(event.key==='Home')next=0;
   if(event.key==='End')next=views.length-1;
   if(next!==null){event.preventDefault();$('tab-'+views[next]).focus();showView(views[next]);}
  };
 }
 function revealTopic(id){
  if(!id||id==='all')return;
  const group=topicSections.find(item=>item.members.some(topic=>topic.id===id));
  if(group){openGroups.add(group.id);for(const item of topicSections)if(item.id===group.id)item.section.open=true;}
 }
 function filterTopics(){
  const query=normalize($('topic-query').value),tokens=query.split(' ').filter(Boolean),matched=new Set(),groups=new Set();
  for(const item of topicSections){
   let visible=0;
   item.buttons.forEach((button,index)=>{
    const topic=item.members[index],text=normalize([item.title,topic.title,...(topic.keywords||[])].join(' '));
    button.hidden=!tokens.every(token=>text.includes(token));
    if(!button.hidden){visible++;matched.add(topic.id);}
   });
   item.section.hidden=!visible;item.section.open=query?visible>0:openGroups.has(item.id);
   item.count.textContent=String(visible);if(visible)groups.add(item.id);
  }
  $('topic-matches').textContent=topicsError||(!topicsReady?'Loading subjects…':query?(matched.size?`${matched.size} matching ${matched.size===1?'topic':'topics'}`:'No topics match. Try another word.'):`${groups.size} groups · ${matched.size} topics`);
  syncExpandTopics();
 }
 function syncExpandTopics(){
  if(!expandTopics)return;
  const shown=topicSections.filter(item=>!item.section.hidden),expanded=shown.length>0&&shown.every(item=>item.section.open);
  expandTopics.hidden=!topicsReady||!shown.length;
  expandTopics.disabled=!!$('topic-query').value.trim();
  expandTopics.textContent=expanded?'Collapse all groups':'Expand all groups';
  expandTopics.setAttribute('aria-expanded',String(expanded));
 }
 if(expandTopics)expandTopics.onclick=()=>{
  const expand=expandTopics.getAttribute('aria-expanded')!=='true';
  for(const item of topicSections){if(item.section.hidden)continue;expand?openGroups.add(item.id):openGroups.delete(item.id);item.section.open=expand;}
  syncExpandTopics();
 };
 $('topic-query').oninput=filterTopics;
 function buildTopics(){
  $('topics').replaceChildren();$('forum-topics').replaceChildren();$('library-topics').replaceChildren();archiveButtons.length=0;forumButtons.length=0;libraryButtons.length=0;topicSections.length=0;
  function topicButton(view,topic){
   const label=topic.id==='all'?(view==='forum'?'General discussion':'All texts'):topic.title;
   const button=el('button',{type:'button'},el('span',{textContent:label}));button.dataset.id=topic.id;
   if(view==='archive'){
    const count=books.filter(book=>topic.id==='all'||topic.tags.includes(book.tag)).length;
    button.append(el('span',{className:'topic-count',textContent:'('+count+')'}));archiveButtons.push(button);
    button.onclick=()=>{$('archive-query').value='';$('sort').value='shelf';showView('archive',topic);};
   }else if(view==='forum'){
    forumButtons.push(button);button.onclick=()=>showView('forum',topic);
   }else{
    libraryButtons.push(button);button.onclick=()=>{$('library-search-by').value='books';updateSearchHelp();$('library-query').value=topic.query||topic.title;searchLibrary(topic);};
   }
   return button;
  }
  const newSearch=el('button',{type:'button'},el('span',{textContent:'New book search'}));newSearch.dataset.id='new';newSearch.onclick=resetLibrary;libraryButtons.push(newSearch);$('library-topics').append(newSearch);
  $('topics').append(topicButton('archive',all));$('forum-topics').append(topicButton('forum',all));
  const assigned=new Set(subjectGroups.flatMap(group=>group.ids));
  const groups=[...subjectGroups,{id:'more',title:'More subjects',ids:topics.filter(topic=>topic.id!=='all'&&!assigned.has(topic.id)).map(topic=>topic.id)}];
  for(const group of groups){
   const members=group.ids.map(id=>topics.find(topic=>topic.id===id)).filter(Boolean);if(!members.length)continue;
   for(const view of views){
    const buttons=members.map(topic=>topicButton(view,topic)),count=el('span',{className:'topic-group-count',textContent:String(members.length)});
    const summary=el('summary',{},el('span',{textContent:group.title}),count);
    const section=el('details',{className:'topic-group'},summary,el('div',{className:'topic-group-links'},...buttons));
    section.open=openGroups.has(group.id);
    section.ontoggle=()=>{if($('topic-query').value.trim())return;section.open?openGroups.add(group.id):openGroups.delete(group.id);for(const item of topicSections)if(item.id===group.id&&item.section.open!==section.open)item.section.open=section.open;syncExpandTopics();};
    topicSections.push({id:group.id,title:group.title,members,buttons,section,count});
    $(view==='archive'?'topics':view+'-topics').append(section);
   }
  }
  updateLibraryTopics();filterTopics();
 }
 buildTopics();
 document.querySelectorAll('[data-view]').forEach(link=>link.onclick=event=>{event.preventDefault();const view=link.dataset.view;if(link.dataset.topic==='all'){$('archive-query').value='';$('sort').value='shelf';}showView(view,link.dataset.topic==='all'?all:null);$('tab-'+view).focus();});
 $('discuss-topic').onclick=event=>{event.preventDefault();showView('forum',archiveTopic);$('tab-forum').focus();};
 $('search-archive-topic').onclick=event=>{event.preventDefault();showView('library');if(archiveTopic.id==='all'){resetLibrary();return;}$('library-search-by').value='books';updateSearchHelp();$('library-query').value=archiveTopic.query||archiveTopic.title;searchLibrary(archiveTopic);$('library-results-title').focus();};
 addEventListener('hashchange',()=>{const route=readRoute();showView(route.view,route.topic,false);});
 $('archive-search').onsubmit=event=>{event.preventDefault();renderArchive();};
 $('archive-query').oninput=renderArchive;
 $('sort').onchange=renderArchive;
 $('library-sort').onchange=()=>{libraryPage=1;drawLibrary();};
 $('full-librarian').href=window.siteConfig?.librarianApp||'https://librarian-atlas.netlify.app/';
 function updateSearchHelp(){
  const byAuthor=$('library-search-by').value==='authors',guides=$('library-format').value==='guides';
  document.querySelector('label[for="library-query"]').textContent=byAuthor?'Find books by an author or teacher':'Search for new books';
  $('library-query').placeholder=byAuthor?'An author or teacher’s name…':'A book title or a subject…';
  $('library-search-help').textContent=(byAuthor?'Enter a name. Matches use the authors credited in catalog records.':'Searches Open Library, Google Books, Project Gutenberg and more.')+(guides?' Guides & manuals are matched using book titles and catalog subjects.':' Results link to the available book or catalog record.');
 }
 $('library-search-by').onchange=()=>{updateSearchHelp();$('library-query').focus();};
 $('library-format').onchange=()=>{updateSearchHelp();libraryPage=1;drawLibrary();};
 async function searchLibrary(topic=null){
  const query=$('library-query').value.trim();if(!query){$('library-query').focus();return;}
  libraryAuthorQuery=$('library-search-by').value==='authors'?query:'';
  const searchQuery=query;
  stopLibrarySearch();const request=generation;controller=new AbortController();libraryMode='results';libraryTopic=topic?.id||null;libraryPage=1;libraryBusy=true;updateLibraryTopics();
  revealTopic(libraryTopic);
  $('library-sort').value='shelf';$('library-results-title').textContent='Books found';$('library-results-description').textContent=(libraryAuthorQuery?'Books credited to “':'Results for “')+query+'”. Open a book to visit its source.';
  $('browse-archive').textContent='Browse our archive instead »';$('library-results').setAttribute('aria-busy','true');
  const tokens=query.toLowerCase().split(/\s+/).filter(Boolean);
  const localMatches=books.map(shelfBook).filter(b=>libraryAuthorQuery?matchingAuthor(b):tokens.every(t=>(b.title+' '+b.author+' '+b.tag).toLowerCase().includes(t)));
  libraryList=localMatches;
  drawLibrary();$('library-status').textContent='Searching open catalogs… Results appear as they arrive.';
  $('full-librarian').href=window.LibrarianSearch?.appURL(searchQuery)||window.siteConfig?.librarianApp||'https://librarian-atlas.netlify.app/';
  if(!window.LibrarianSearch){libraryBusy=false;$('library-results').setAttribute('aria-busy','false');$('library-status').textContent='Catalog search is unavailable. Showing matches from our archive; try the full Librarian below.';drawLibrary();return;}
  const render=snapshot=>{
   if(request!==generation)return;
   libraryList=snapshot.books.map(book=>({title:book.title,authors:book.authors||[],subjects:book.subjects||[],author:(book.authors||[]).slice(0,2).join(', '),cover:book.cover,url:book.links?.[0]?.url,meta:[book.year,book.availability].filter(Boolean).join(' · '),source:(book.sources||[]).slice(0,2).join(' · ')}));
   if(libraryAuthorQuery){const returned=new Set(libraryList.map(book=>book.url));libraryList.push(...localMatches.filter(book=>!returned.has(book.url)));}
   drawLibrary();$('library-status').textContent=`Searched ${snapshot.completed} of ${snapshot.total} catalogs`+(snapshot.failed.length?` · ${snapshot.failed.length} unavailable`:'')+'.';
  };
  try{render(await LibrarianSearch.search(searchQuery,{signal:controller.signal,onProgress:render}));}
  catch(error){if(request===generation&&error.name!=='AbortError')$('library-status').textContent='Some catalogs could not be reached. Showing available results.';}
  finally{if(request===generation){libraryBusy=false;controller=null;$('library-results').setAttribute('aria-busy','false');drawLibrary();}}
 }
 $('library-search').onsubmit=event=>{event.preventDefault();searchLibrary();};
 drawLibrary();renderArchive();const route=readRoute();showView(route.view,route.topic,false);
 const loadedTopics=await topicRequest;topicsReady=true;topics.push(...(loadedTopics.topics||[]));subjectGroups=loadedTopics.groups||[];buildTopics();
 $('archive-total').textContent=`${books.length} texts · ${topics.length-1} topics`;renderArchive();
 if(location.hash===initialHash){const readyRoute=readRoute();showView(readyRoute.view,readyRoute.topic,false);}else if(activeView==='forum')renderForum();
})();
// Local topic notes. Mount once per topic and retain the DOM to preserve drafts.
// Storage keys and record fields match the original archive discussion board.
function createLocalForumBoard(mount, topic, el) {
 const storeKey='btr-board:topic:'+topic.id;
 const list=el('ol',{className:'posts'});
 list.setAttribute('aria-label','Saved notes for '+topic.title);
 const status=el('p',{className:'fine',role:'status'});
 status.setAttribute('aria-live','polite');
 const name=el('input',{name:'name',placeholder:'Your name',maxLength:40,autocomplete:'nickname',required:true});
 const note=el('textarea',{name:'text',placeholder:'Share a source, a question or a reading.',maxLength:1200,rows:4,required:true});
 const file=el('input',{name:'image',type:'file',accept:'image/*'});
 const attachmentName=el('span',{className:'forum-attachment-name'});
 const clearImage=el('button',{type:'button',className:'forum-remove-image',textContent:'Remove image'});
 const attachmentInfo=el('div',{className:'forum-attachment-info',hidden:true},attachmentName,clearImage);
 const submit=el('button',{type:'submit',className:'solid',textContent:'Save note'});
 const nameLabel=el('label',{className:'forum-field'},el('span',{textContent:'Your name'}),name);
 const noteLabel=el('label',{className:'forum-field'},el('span',{textContent:'Your note'}),note);
 const attachment=el('label',{className:'attach'},file,el('span',{textContent:'Add image (optional)'}));
 const form=el('form',{className:'compose'},el('div',{className:'compose-row'},nameLabel,attachment),attachmentInfo,noteLabel,submit);
 form.setAttribute('aria-label','Save a local note for '+topic.title);
 clearImage.addEventListener('click',()=>{file.value='';attachmentName.textContent='';attachmentInfo.hidden=true;});
 file.addEventListener('change',()=>{
  attachmentName.textContent=file.files[0]?.name||'';
  attachmentInfo.hidden=!file.files.length;
 });
 try{name.value=localStorage.getItem('btr-name')||'';}catch{}

 function readNotes(){
  try{
   const raw=localStorage.getItem(storeKey);
   if(raw===null)return [];
   const records=JSON.parse(raw);
   // Do not overwrite unreadable storage with an empty collection.
   if(!Array.isArray(records))throw new Error('Invalid notes');
   return records;
  }catch{return null;}
 }
 function drawNotes(records){
  if(records===null){
   list.replaceChildren(el('li',{className:'empty',textContent:'Saved notes could not be loaded in this browser. Existing notes have not been changed.'}));
   return;
  }
  const entries=[];
  for(const record of [...records].reverse()){
   if(!record||typeof record!=='object'||typeof record.text!=='string')continue;
   const author=typeof record.name==='string'?record.name:'Reader';
   const at=new Date(record.at);
   const time=el('time',{textContent:Number.isFinite(at.getTime())?at.toLocaleString():''});
   if(Number.isFinite(at.getTime()))time.dateTime=at.toISOString();
   const body=el('p',{textContent:record.text});
   body.style.whiteSpace='pre-wrap';
   const item=el('li',{},el('div',{className:'post-meta'},el('strong',{textContent:author}),time),body);
   // Existing attachments are locally generated raster data URLs.
   if(typeof record.image==='string'&&/^data:image\/(?:jpeg|png|webp|gif|avif);base64,/i.test(record.image)){
    item.append(el('img',{src:record.image,alt:'Image attached by '+author,loading:'lazy'}));
   }
   entries.push(item);
  }
  list.replaceChildren(...(entries.length?entries:[el('li',{className:'empty',textContent:'No saved notes for this topic yet. Add the first one above.'})]));
 }
 function refresh(){drawNotes(readNotes());}
 async function shrinkImage(selected){
  const image=await createImageBitmap(selected);
  try{
   if(!image.width||!image.height)throw new Error('Empty image');
   const scale=Math.min(1,900/Math.max(image.width,image.height));
   const canvas=el('canvas',{width:Math.max(1,Math.round(image.width*scale)),height:Math.max(1,Math.round(image.height*scale))});
   const context=canvas.getContext('2d');
   if(!context)throw new Error('Canvas unavailable');
   context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
   context.drawImage(image,0,0,canvas.width,canvas.height);
   return canvas.toDataURL('image/jpeg',.78);
  }finally{image.close?.();}
 }
 let saving=false;
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(saving)return;
  const author=name.value.trim(),text=note.value.trim();
  if(!author||!text){status.textContent='Enter your name and a note before saving.';(author?note:name).focus();return;}
  saving=true;form.setAttribute('aria-busy','true');submit.textContent='Saving…';
  for(const control of [name,note,file,clearImage,submit])control.disabled=true;
  status.textContent='';
  try{
   let image='';
   if(file.files[0]){
    try{image=await shrinkImage(file.files[0]);}
    catch{status.textContent='That image could not be read. Choose a different image or remove it and try again.';return;}
   }
   // Reload before writing so notes saved in another tab are retained.
   const records=readNotes();
   if(records===null){status.textContent='This browser could not read your saved notes. Your new note has not been saved; the draft is still here.';return;}
   records.push({name:author,text,image,at:Date.now()});
   try{localStorage.setItem(storeKey,JSON.stringify(records));}
   catch{status.textContent='This note could not be saved in this browser. Storage may be full or unavailable. Try a smaller image; your draft is still here.';return;}
   // Remembering a name is optional and must not undo a successfully saved note.
   try{localStorage.setItem('btr-name',author);}catch{}
   name.value=author;note.value='';file.value='';attachmentName.textContent='';attachmentInfo.hidden=true;
   drawNotes(records);
   status.textContent='Saved in this browser only. Your note is not shared with other readers.';
  }finally{
   saving=false;form.setAttribute('aria-busy','false');submit.textContent='Save note';
   for(const control of [name,note,file,clearImage,submit])control.disabled=false;
  }
 });
 const onStorage=event=>{if(event.key===storeKey||event.key===null)refresh();};
 window.addEventListener('storage',onStorage);
 mount.classList.add('forum-board','discussion');
 mount.replaceChildren(form,status,list);
 refresh();
 return {refresh,destroy:()=>window.removeEventListener('storage',onStorage)};
}
