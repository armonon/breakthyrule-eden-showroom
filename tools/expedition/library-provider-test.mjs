import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
test('actual catalog adapters use valid provider-specific filters and projections',async()=>{
 const scope={window:{}},urls=[];vm.runInNewContext(read('librarian-engine.js'),scope);
 const engine=scope.window.createLibrarianAtlasEngine(async url=>{urls.push(new URL(url));return {results:[],message:{items:[]}};});
 await engine.fetchers.OpenAlex.fn('Codex Magica');await engine.fetchers.Crossref.fn('Codex Magica');
 assert.equal(urls[0].searchParams.get('filter'),'type:book|dissertation');assert.equal(urls[0].searchParams.get('per_page'),'100');
 assert.equal(urls[1].searchParams.get('filter'),'type:monograph,type:book,type:reference-book');assert.ok(!urls[1].searchParams.get('select').split(',').includes('language'));
});
function client(fetch){
 const scope={window:{showroomBooks:[{file:'local.pdf',title:'Codex Magica',author:'A',tag:'History',url:'/local.pdf'}]},URL,AbortController,DOMException,setTimeout,clearTimeout,fetch};
 scope.window.createLibrarianAtlasEngine=request=>({merge:records=>[...records],fetchers:{'Google Books':{tier:'fast',fn:async()=>{const results=await Promise.allSettled([request('https://www.googleapis.com/books/v1/volumes','json')]);return results.flatMap(r=>r.status==='fulfilled'?r.value:[]);}},Other:{tier:'fast',fn:()=>request('https://example.com/books','json')}}});
 vm.runInNewContext(read('librarian-client.js'),scope);return scope.window.LibrarianSearch;
}
test('quota failure preserves immediate shelf results, reason and bounded retry cooldown',async()=>{
 const calls=[],search=client(async url=>{calls.push(url);return url.includes('googleapis')?{ok:false,status:429,headers:{get:()=> '120'}}:{ok:true,json:async()=>[{title:'External book'}]};}),progress=[];
 const start=Date.now(),first=await search.search('Codex',{onProgress:s=>progress.push(s)});
 assert.equal(progress[0].books[0].title,'Codex Magica');assert.equal(progress[0].completed,0);assert.equal(first.books.length,2);assert.equal(first.successful,1);assert.equal(first.failures[0].status,429);assert.equal(first.failures[0].reason,'provider quota limit');assert.ok(first.failures[0].retryAt>=start+120000);
 const second=await search.search('Codex');assert.equal(second.books.length,2);assert.equal(second.successful,1);assert.equal(calls.filter(u=>u.includes('googleapis')).length,1);assert.equal(calls.filter(u=>u.includes('example.com')).length,2);
});
test('valid empty catalogs remain distinct from unavailable catalogs',async()=>{
 const search=client(async()=>({ok:true,json:async()=>[]})),result=await search.search('not-on-shelf');assert.equal(result.books.length,0);assert.equal(result.successful,2);assert.equal(result.failed.length,0);
});
test('cancellation does not turn pending providers into reported failures',async()=>{
 const search=client(async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError'))))),controller=new AbortController(),progress=[];
 const pending=search.search('Codex',{signal:controller.signal,onProgress:s=>progress.push(s)});controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(progress[0].books.length,1);assert.equal(progress[0].failed.length,0);
});
