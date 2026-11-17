import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveCollectionReturn } from '../../site/collection-return.mjs';

function events(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    emit(type, event = {}) { for (const fn of listeners.get(type) || []) fn(event); }
  }, extra);
}
function fixture({type = 'back_forward', saved = {section:'belts',item:'belt-neon-shamrock',offset:180}, loaded = true, complete = true} = {}) {
  let ready = complete, fontsResolve;
  const frames = new Map(), timers = new Map(), scrolls = [];
  let sequence = 0;
  globalThis.scrollY = 0;
  globalThis.location = {href:'https://shop.test/?nocover=1',origin:'https://shop.test'};
  globalThis.performance = {getEntriesByType: () => [{type}]};
  globalThis.history = {state:{btrCompactCollections:{belts:true},btrCollectionReturn:saved},replaceState(value) { this.state=value; }};
  globalThis.document = events({readyState:loaded?'complete':'loading',fonts:{ready:new Promise(resolve=>fontsResolve=resolve)}});
  globalThis.window = events({scrollTo(value) { scrolls.push(value); globalThis.scrollY=value.top; }});
  globalThis.requestAnimationFrame = fn => { frames.set(++sequence, fn); return sequence; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.setTimeout = fn => { timers.set(++sequence, fn); return sequence; };
  globalThis.clearTimeout = id => timers.delete(id);
  const section={dataset:{compactCollection:'belts'},getBoundingClientRect:()=>({top:3000-scrollY})};
  const card={getBoundingClientRect:()=>({top:3600-scrollY})};
  const link={href:'https://shop.test/product?item=belt-neon-shamrock',target:'',hasAttribute:()=>false,
    closest(selector) { return selector==='[data-compact-collection]'?section:selector==='a[href]'?link:card; }};
  const state={expanded:true,definition:{id:'belts'},section,grid:{querySelectorAll:()=>[link]}};
  const sections=new Map([['belts',state]]);
  preserveCollectionReturn(sections,()=>ready);
  return {scrolls,link,state,document,window,history,
    async fonts() { fontsResolve(); await Promise.resolve(); },
    complete() { ready=true; document.emit('btr:collection-ready'); },
    frame() { const work=[...frames.values()];frames.clear();for(const fn of work)fn(); },
    deadline() { const work=[...timers.values()];timers.clear();for(const fn of work)fn(); }
  };
}

test('Back waits for expanded shelves, fonts and load before restoring the clicked belt', async()=>{
  const h=fixture({loaded:false,complete:false});
  await h.fonts(); h.frame(); assert.equal(h.scrolls.length,0);
  h.window.emit('load');h.frame();assert.equal(h.scrolls.length,0);
  h.complete();h.frame();assert.equal(h.scrolls.length,0);
  h.frame();assert.equal(h.scrolls[0].top,3420);
  assert.equal(h.history.state.btrCompactCollections.belts,true);
});
test('fresh visits and reloads never restore a stale collection position',async()=>{
  for(const type of ['navigate','reload']){
    const h=fixture({type});await h.fonts();h.window.emit('load');h.complete();h.frame();h.frame();h.deadline();h.frame();h.frame();
    assert.equal(h.scrolls.length,0);
  }
});
test('manual browsing cancels a pending Back restoration',async()=>{
  const h=fixture();await h.fonts();h.frame();h.document.emit('wheel');h.frame();
  assert.equal(h.scrolls.length,0);
});
test('a delayed neighboring catalog cannot block return to a ready belt shelf',async()=>{
  const h=fixture({complete:false});await h.fonts();h.frame();assert.equal(h.scrolls.length,0);
  h.deadline();h.frame();h.frame();assert.equal(h.scrolls[0].top,3420);
});
test('product clicks remember the card and retain existing collection state',async()=>{
  const h=fixture({type:'navigate'});globalThis.scrollY=3250;
  h.document.emit('click',{button:0,target:h.link});
  assert.deepEqual(h.history.state.btrCollectionReturn,{section:'belts',item:'belt-neon-shamrock',offset:350});
  assert.equal(h.history.state.btrCompactCollections.belts,true);
  h.document.emit('click',{button:0,target:h.link,metaKey:true});
  assert.equal(h.history.state.btrCollectionReturn.offset,350);
});
