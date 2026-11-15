import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// A busy development host can take longer to schedule Node. Readiness remains
// bounded, and every failed start must reap its child instead of hanging the suite.
const STARTUP_TIMEOUT=30000;
async function stopServer(child){
  if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return;
  await new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(force);clearTimeout(deadline);child.removeListener('exit',exited);};
    const exited=()=>{cleanup();resolve();};
    const force=setTimeout(()=>child.kill('SIGKILL'),3000);
    const deadline=setTimeout(()=>{cleanup();reject(Error('Test server did not exit after SIGKILL'));},8000);
    // Subscribe before signalling: a fast exit must not be missed. Signal exits
    // have exitCode === null, so signalCode also matters on subsequent cleanup.
    child.once('exit',exited);child.kill('SIGTERM');
    if(child.exitCode!==null||child.signalCode!==null)exited();
  });
}
async function startServer(directory,env=process.env){
  const child=spawn(process.execPath,['server/eden-server.mjs','--port','0','--data',directory],{cwd:fileURLToPath(new URL('../',import.meta.url)),env,stdio:['ignore','pipe','pipe']});
  let output='',errors='';
  // Drain both pipes, including after readiness, so logging cannot stall the child.
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-4000);});
  try{
    const base=await new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{clearTimeout(timer);child.removeListener('exit',exited);child.removeListener('error',failed);};
      const finish=(error,url)=>{if(settled)return;settled=true;cleanup();if(error)reject(error);else resolve(url);};
      const failed=error=>finish(error);
      const exited=(code,signal)=>finish(Error('Server exited during startup ('+(signal||code)+')'+(errors?'\n'+errors:'')));
      const timer=setTimeout(()=>finish(Error('Server startup timed out after '+STARTUP_TIMEOUT+'ms'+(errors?'\n'+errors:''))),STARTUP_TIMEOUT);
      child.stdout.on('data',chunk=>{if(settled)return;output=(output+chunk).slice(-4000);const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)finish(null,match[0]);});
      child.once('exit',exited);child.once('error',failed);
    });
    return {child,base};
  }catch(error){await stopServer(child);throw error;}
}

test('real HTTP rooms, accounts, readiness, streaming, invalid origins, resume and leave', {timeout:120000}, async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eden-expedition-test-'));
  let child,stream;
  try {
    const started=await startServer(directory,{...process.env,EDEN_ALLOWED_ORIGINS:'https://game.example.test'});child=started.child;const base=started.base;
    async function post(route,body,cookie='',origin=base){const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});return {response,data:await response.json()};}
    assert.equal((await (await fetch(base+'/api/expedition')).json()).available,true);
    const physics=await fetch(base+'/assets/vendor/jolt-physics-1.1.1/jolt-physics.wasm.wasm',{method:'HEAD'});assert.equal(physics.status,200);assert.equal(physics.headers.get('content-type'),'application/wasm','physics supports streaming compilation instead of a warned fallback');
    const registration=await post('/api/social/register',{name:'Temporary Tester',password:'temporary-test-only-password'});
    assert.equal(registration.response.status,200);
    const cookie=registration.response.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/api/expedition',{action:'create'},cookie)).response.status,400,'save a character before entry');
    assert.equal((await post('/api/social/character',{character:{version:1,height:999}},cookie)).response.status,400);
    assert.equal((await post('/api/social/character',{character:{version:1,height:180}},cookie)).response.status,200);
    const host=(await post('/api/expedition',{action:'create'},cookie)).data;
    assert.equal(host.players[0].name,'Temporary Tester');
    assert.equal((await post('/api/expedition',{action:'join',code:host.code})).response.status,401,'guests stay in solo');
    const peerRegistration=await post('/api/social/register',{name:'Temporary Peer',password:'temporary-peer-only-password'}),peerCookie=peerRegistration.response.headers.get('set-cookie').split(';')[0];
    await post('/api/social/character',{character:{version:1,height:145}},peerCookie);
    const guest=(await post('/api/expedition',{action:'join',code:host.code},peerCookie)).data;
    assert.equal(guest.players.length,2);
    assert.equal((await post('/api/expedition',{action:'sync',token:guest.token},peerCookie,'https://game.example.test')).response.status,200);
    assert.equal((await post('/api/expedition',{action:'resume',token:host.token})).response.status,401);
    assert.equal((await post('/api/expedition',{action:'start',token:host.token},cookie)).response.status,400);
    await post('/api/expedition',{action:'ready',ready:true,token:host.token},cookie);
    await post('/api/expedition',{action:'ready',ready:true,token:guest.token},peerCookie);
    assert.equal((await post('/api/expedition',{action:'start',token:host.token},cookie)).data.phase,'playing');
    assert.equal((await post('/api/expedition',{action:'join',code:host.code},peerCookie)).response.status,200);
    assert.equal((await post('/api/expedition',{action:'resume',token:guest.token},peerCookie,'https://attacker.invalid')).response.status,403);
    const abort=new AbortController();
    stream=await fetch(base+'/api/expedition/events',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:peerCookie},body:JSON.stringify({token:guest.token}),signal:abort.signal});
    assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/ndjson/);
    const reader=stream.body.getReader(),chunk=await reader.read();
    const snapshot=JSON.parse(new TextDecoder().decode(chunk.value).trim().split('\n')[0]);
    assert.equal(snapshot.selfId,guest.selfId);assert.equal(snapshot.generation,guest.generation);assert.equal(snapshot.token,undefined);
    abort.abort();
    const resumed=(await post('/api/expedition',{action:'resume',token:guest.token},peerCookie)).data;
    assert.equal(resumed.selfId,guest.selfId);
    const pose=await post('/api/expedition',{action:'pose',token:guest.token,seq:1,pose:{x:999,y:99,z:999,yaw:0}},peerCookie);
    assert.equal(pose.response.status,200,pose.data.error);
    assert.notEqual(pose.data.players.find(p=>p.id===guest.selfId).x,999);
    assert.equal((await post('/api/expedition',{action:'leave',token:guest.token},peerCookie)).data.ok,true);
    assert.equal((await post('/api/expedition',{action:'resume',token:guest.token},peerCookie)).response.status,401);
    await post('/api/expedition',{action:'leave',token:host.token},cookie);
  } finally {
    try{await stopServer(child);}finally{await rm(directory,{recursive:true,force:true});}
  }
});

test('real process restart releases ownership and resumes authenticated room generation', {timeout:120000}, async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'eden-restart-test-'));let child,base;
  async function start(){({child,base}=await startServer(directory));}
  async function stop(){await stopServer(child);child=null;}
  async function post(route,body,cookie=''){const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:JSON.stringify(body)});return {response,data:await response.json()};}
  try{await start();
    const registration=await post('/api/social/register',{name:'Restart Tester',password:'temporary-restart-test-password'});
    const cookie=registration.response.headers.get('set-cookie').split(';')[0];
    await post('/api/social/character',{character:{version:1,shirtColor:'#123456'}},cookie);
    const first=(await post('/api/expedition',{action:'create'},cookie)).data;
    await post('/api/expedition',{action:'chat',text:'Restart checkpoint',token:first.token,generation:first.generation},cookie);
    await stop();await start();
    const resumed=await post('/api/expedition',{action:'resume',token:first.token,generation:first.generation},cookie);
    assert.equal(resumed.response.status,200);assert.equal(resumed.data.selfId,first.selfId);assert.equal(resumed.data.generation,first.generation);
    assert.equal(resumed.data.players[0].character.shirtColor,'#123456');assert.equal(resumed.data.chat[0].text,'Restart checkpoint');
    assert.ok(resumed.data.serverTime>=first.serverTime);
    assert.equal((await post('/api/expedition',{action:'resume',token:first.token,generation:'old-generation'},cookie)).response.status,409);
  }finally{try{await stop();}finally{await rm(directory,{recursive:true,force:true});}}
});
