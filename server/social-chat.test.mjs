import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Garden chat over the real server: who may post, what is kept of the text, the rate limit, and that every visitor's
// snapshot carries the message (the on-screen feed in multiplayer.js renders it as text, never as HTML).
async function startServer(directory){
 const child=spawn(process.execPath,['server/eden-server.mjs','--port','0','--data',directory],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-4000);});
 const base=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Server startup timed out'+(errors?'\n'+errors:''))),30000);
  child.stdout.on('data',chunk=>{output=(output+chunk).slice(-4000);const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited during startup ('+code+')'+(errors?'\n'+errors:'')));});
 });
 return {child,base};
}
async function stopServer(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise(resolve=>{const force=setTimeout(()=>child.kill('SIGKILL'),3000);child.once('exit',()=>{clearTimeout(force);resolve();});child.kill('SIGTERM');});
}

test('garden chat: characters only, cleaned text, rate limited, shared with every visitor',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'eden-chat-'));const {child,base}=await startServer(directory);
 try{
  const post=async(route,body,cookie='')=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});return {status:response.status,data:await response.json(),response};};
  const account=async(name)=>{const r=await post('/api/social/register',{name,password:'temporary-test-only-password'});assert.equal(r.status,200,JSON.stringify(r.data));return r.response.headers.get('set-cookie').split(';')[0];};
  const alice=await account('Chat Tester'),bob=await account('Chat Listener');

  assert.equal((await post('/api/social/chat',{text:'hello'},alice)).status,401,'a ghost (no character) cannot chat');
  for(const cookie of [alice,bob])assert.equal((await post('/api/social/character',{character:{version:1,height:180}},cookie)).status,200);

  assert.equal((await post('/api/social/chat',{text:'   '},alice)).status,400,'nothing to say');
  assert.equal((await post('/api/social/chat',{text:'‮​\u0007'},alice)).status,400,'only invisible characters is nothing to say');

  const sent=await post('/api/social/chat',{text:'  hi\n\tthere ‮gnorw‬ <b>bold</b> 👨‍👩‍👧 ',nonce:'n-1'},alice);
  assert.equal(sent.status,200);
  assert.equal(sent.data.message.text,'hi there gnorw <b>bold</b> 👨‍👩‍👧','whitespace collapsed, direction overrides dropped, markup kept as plain text, emoji joiners kept');
  assert.equal((await post('/api/social/chat',{text:'  hi\n\tthere',nonce:'n-1'},alice)).data.message.id,sent.data.message.id,'a retried send (same nonce) is not posted twice');
  assert.equal((await post('/api/social/chat',{text:'x'.repeat(400)},alice)).data.message.text.length,280,'long messages are cut to 280 characters');

  const seen=await post('/api/social/sync',{connectionId:'listener',pose:null},bob);
  assert.ok(seen.data.messages.some(m=>m.id===sent.data.message.id&&m.name==='Chat Tester'),"another visitor's snapshot has the message and its sender's name");

  // Eight attempts per ten seconds, counting refused and retried ones too: five are used, three more pass, then it waits.
  const statuses=[];for(let i=0;i<5;i++)statuses.push((await post('/api/social/chat',{text:'message '+i},alice)).status);
  assert.deepEqual(statuses,[200,200,200,429,429],'the ninth attempt within ten seconds is refused');
  assert.equal((await post('/api/social/chat',{text:'still here'},bob)).status,200,'the limit is per person');
 }finally{await stopServer(child);await rm(directory,{recursive:true,force:true});}
});
