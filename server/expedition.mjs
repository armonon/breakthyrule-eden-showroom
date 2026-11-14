// The browser and Node service execute the exact same expedition simulation.
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {openExpeditionStorage} from './expedition-storage.mjs';
import {normalizeCharacter,characterRevision} from './character.mjs';

export function loadExpeditionEngine() {
  const root = new URL('../', import.meta.url);
  const context = vm.createContext({structuredClone, performance, console});
  context.window = context;
  for (const file of ['assets/night-pathfinding.js', 'assets/roof-heights.js', 'expedition-world.js', 'solo-expedition.js']) {
    new vm.Script(fs.readFileSync(new URL(file, root), 'utf8'), {filename:file}).runInContext(context);
  }
  const layout = JSON.parse(fs.readFileSync(new URL('night-layout.json', root), 'utf8'));
  return options => context.createSoloExpedition({layout, pathfinding:context.NightPathfinding, roofs:context.edenRoofs, ...options});
}

export class ExpeditionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createExpeditionService({createEngine = loadExpeditionEngine(), clock = () => performance.now()/1000,
  grace = 60, maxRooms = 64, onResult = () => {}, storageDir=null, storageAdapter=null, wallClock=()=>Date.now()/1000} = {}) {
  const rooms = new Map(), sessions = new Map(), accounts = new Map(), limits = new Map();
  const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
  const storage=storageAdapter||(storageDir?openExpeditionStorage(storageDir):null);
  let lastCheckpoint=-Infinity,closed=false,storageFailure=null;
  const fail = (status, message) => { throw new ExpeditionError(status, message); };
  function assertOpen(){if(closed||storageFailure)fail(503,'The expedition service is unavailable.');}
  function checkpoint(force=false){if(!storage||closed)return;const now=clock();if(!force&&now-lastCheckpoint<1)return;
    try{storage.write({version:1,savedWall:wallClock(),rooms:[...rooms.values()].map(room=>({code:room.code,generation:room.generation,created:room.created,reported:[...room.reported],engine:room.engine.exportCheckpoint(),members:[...room.members.values()].map(m=>({id:m.id,userId:m.userId,tokenHash:m.tokenHash,expiresAt:wallClock()+grace-(now-m.seen),nonces:[...m.nonces]}))}))});lastCheckpoint=now;}
    catch(error){storageFailure=error;for(const member of sessions.values()){const stream=member.stream;member.stream=null;stream?.close();}throw error;}
  }
  function restore(){if(!storage)return;const saved=storage.read();if(!saved)return;
    if(saved.version!==1||!Number.isFinite(saved.savedWall)||!Array.isArray(saved.rooms)||saved.rooms.length>maxRooms)throw Error('Invalid expedition checkpoint.');
    const now=clock(),wall=wallClock();if(saved.savedWall>wall+5)throw Error('Expedition checkpoint is from a future clock.');
    for(const value of saved.rooms){
      if(!/^[A-F0-9]{6}$/.test(value.code)||typeof value.generation!=='string'||!/^[a-f0-9-]{36}$/.test(value.generation)||rooms.has(value.code)||!Array.isArray(value.members)||value.members.length>6||!Array.isArray(value.reported)||value.reported.length>6||value.reported.some(id=>typeof id!=='string'))throw Error('Invalid expedition room checkpoint.');
      if(value.members.some(m=>!m||!Number.isFinite(m.expiresAt)||m.expiresAt>saved.savedWall+grace+1))throw Error('Invalid expedition expiry checkpoint.');
      const members=value.members.filter(m=>m.expiresAt>wall);
      if(members.some(m=>typeof m.userId!=='string'||!m.userId))throw Error('Legacy guest expedition checkpoint cannot be restored as an authenticated room.');
      if(!members.length)continue;
      const savedEngine=structuredClone(value.engine);
      if(Array.isArray(savedEngine?.room?.players))for(const p of savedEngine.room.players)if(members.some(m=>m.id===p.id)){p.character=normalizeCharacter(p.character);p.characterRevision=characterRevision(p.character);}
      const engine=createEngine({clock});engine.restoreCheckpoint(savedEngine,{downtimeSeconds:Math.max(0,wall-saved.savedWall)});
      const room={code:value.code,generation:value.generation,engine,members:new Map(),created:now,reported:new Set(value.reported)};
      for(const m of members){if(typeof m.id!=='string'||m.id.length>100||!/^([a-f0-9]{64})$/.test(m.tokenHash)||sessions.has(m.tokenHash)||(m.userId!==null&&typeof m.userId!=='string')||(m.userId&&m.userId!==m.id)||!engine.snapshot().players.some(p=>p.id===m.id)||(m.userId&&accounts.has(m.userId)))throw Error('Invalid expedition membership checkpoint.');
        const member={id:m.id,userId:m.userId,token:null,connectionEpoch:crypto.randomUUID(),tokenHash:m.tokenHash,room,seen:now-(grace-(m.expiresAt-wall)),stream:null,nonces:new Set(Array.isArray(m.nonces)?m.nonces.filter(n=>typeof n==='string'&&n.length<=64).slice(-64):[])};
        room.members.set(m.tokenHash,member);sessions.set(m.tokenHash,member);if(m.userId)accounts.set(m.userId,member);
        engine.command({action:'disconnect'},m.id);
      }
      for(const p of engine.snapshot().players)if(!members.some(m=>m.id===p.id))engine.command({action:'leave'},p.id);
      rooms.set(room.code,room);
    }
  }
  try{restore();}catch(error){storage?.close();throw error;}
  function limit(key, count, period) {
    const now=clock(); let bucket=limits.get(key);
    if(!bucket || now>=bucket.until) { bucket={count:0,until:now+period}; limits.set(key,bucket); }
    if(++bucket.count>count) fail(429,'Slow down a little.');
  }
  function view(member) {
    const value=member.room.engine.snapshot(member.id);
    return {...value, code:member.room.code, selfId:member.id, generation:member.room.generation,...(value.protocolVersion===2?{connectionEpoch:member.connectionEpoch}:{})};
  }
  function authorize(token, user, generation, connectionEpoch, resuming=false) {
    assertOpen();
    const member=typeof token==='string' && /^[a-f0-9]{64}$/.test(token) && sessions.get(digest(token));
    if(!member || clock()-member.seen>grace) fail(401,'This expedition connection expired. Enter a new room.');
    if(!user?.id||member.userId!==user.id) fail(401,'Sign in to the account that entered this expedition.');
    const controlled=member.room.engine.snapshot().protocolVersion===2;
    if((controlled||generation!==undefined)&&generation!==member.room.generation)fail(409,'This expedition generation is stale.');
    if(controlled&&!resuming&&connectionEpoch!==member.connectionEpoch)fail(409,'This expedition connection was replaced. Reconnect to continue.');
    normalizeCharacter(user.character);
    member.token=token;
    return member;
  }
  function disposeMember(member, explicit=false) {
    member.stream?.close(); member.stream=null;
    member.room.engine.command({action:'leave'},member.id);
    member.room.members.delete(member.tokenHash); sessions.delete(member.tokenHash);
    if(member.userId && accounts.get(member.userId)===member) accounts.delete(member.userId);
    if(!member.room.members.size){member.room.engine.dispose?.();rooms.delete(member.room.code);}
  }
  function rotateConnection(member){const old=member.stream;member.stream=null;old?.close();member.connectionEpoch=crypto.randomUUID();member.room.engine.resumeInputs?.(member.id);}
  function credentials(member) { return {token:member.token,...view(member)}; }
  function prepareEntry(data={}, {user=null,ip='local'}={}){
    assertOpen();if(!['create','join','solo'].includes(data?.action))return null;limit('entry:'+ip,20,60);
    if(!user?.id)fail(401,'Sign in and save a character in Eden to enter a private expedition.');const character=normalizeCharacter(user.character);
    const previous=accounts.get(user.id);if(previous&&clock()-previous.seen<=grace)return {user:{...user,character},needsActor:false};
    if(data.action==='join'){const room=rooms.get(String(data.code||'').trim().toUpperCase());if(!room)fail(404,'That expedition code was not found.');if(room.engine.snapshot().phase!=='lobby')fail(409,'This expedition has already started.');if(room.members.size>=6)fail(409,'This expedition already has six players.');}
    else if(rooms.size>=maxRooms)fail(503,'The expedition service is full. Try again shortly.');
    return {user:{...user,character},needsActor:true};
  }
  function command(data={}, {user=null, ip='local',admitted=false}={}) {
    assertOpen();
    if(!data || typeof data!=='object' || Array.isArray(data)) fail(400,'Bad request.');
    const action=data.action;
    if(['create','join','solo'].includes(action)) {
      if(!admitted)limit('entry:'+ip,20,60);
      if(!user?.id)fail(401,'Sign in and save a character in Eden to enter a private expedition.');
      const character=normalizeCharacter(user.character);
      if(user?.id && accounts.has(user.id)) {
        const previous=accounts.get(user.id);
        if(clock()-previous.seen<=grace) {
          if(action==='join' && String(data.code||'').trim().toUpperCase()!==previous.room.code) fail(409,'Leave your current expedition first.');
          if(!previous.token){previous.room.members.delete(previous.tokenHash);sessions.delete(previous.tokenHash);previous.token=crypto.randomBytes(32).toString('hex');previous.tokenHash=digest(previous.token);previous.room.members.set(previous.tokenHash,previous);sessions.set(previous.tokenHash,previous);}
          rotateConnection(previous);previous.seen=clock();checkpoint(true); return credentials(previous);
        }
        disposeMember(previous);
      }
      let room;
      if(action==='join') {
        room=rooms.get(String(data.code||'').trim().toUpperCase());
        if(!room) fail(404,'That expedition code was not found.');
        if(room.engine.snapshot().phase!=='lobby') fail(409,'This expedition has already started.');
        if(room.members.size>=6) fail(409,'This expedition already has six players.');
      } else {
        if(rooms.size>=maxRooms) fail(503,'The expedition service is full. Try again shortly.');
        let code; do {code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();} while(rooms.has(code));
        room={code,generation:crypto.randomUUID(),engine:createEngine({clock}),members:new Map(),created:clock(),reported:new Set()};
      }
      const id=user.id;
      const member={id,userId:user?.id||null,token:crypto.randomBytes(32).toString('hex'),connectionEpoch:crypto.randomUUID(),room,seen:clock(),stream:null,nonces:new Set()};
      member.tokenHash=digest(member.token);
      const identity={id,name:user?.name || 'Wanderer '+id.slice(-4).toUpperCase(),character,characterRevision:characterRevision(character)};
      room.engine.command({action:action==='solo'?'solo':action,code:room.code,...identity},id);
      rooms.set(room.code,room); room.members.set(member.tokenHash,member); sessions.set(member.tokenHash,member);
      if(member.userId) accounts.set(member.userId,member);
      checkpoint(true);return credentials(member);
    }
    const member=authorize(data.token,user,data.generation,data.connectionEpoch,data.action==='resume'); member.seen=clock();
    limit('command:'+member.tokenHash,60,1);
    if(action==='leave') {disposeMember(member,true);checkpoint(true); return {ok:true};}
    if(action==='resume' || action==='sync') {
      // Retire the old stream before reconnecting: its delayed close must not disconnect this resume.
      if(action==='resume')rotateConnection(member);
      member.room.engine.command({action:'reconnect',id:member.id},member.id);checkpoint(action==='resume'); return credentials(member);
    }
    if(!['pose','inputs','ready','start','ring-bell','collect','flare','reload','interrupt','chat'].includes(action)) fail(400,'Unknown expedition action.');
    if(action==='chat') {
      if(typeof data.nonce==='string' && member.nonces.has(data.nonce.slice(0,64)))return view(member);
      limit('chat:'+member.tokenHash,8,10);
    }
    // Identity, time, status and all gameplay outcomes are server-owned.
    const input={action,frames:data.frames,pose:data.pose,seq:data.seq,aimAssist:data.aimAssist===true,page:data.page,ready:data.ready,reason:typeof data.reason==='string'?data.reason.slice(0,20):undefined,text:typeof data.text==='string'?data.text.slice(0,280):'',nonce:typeof data.nonce==='string'?data.nonce.slice(0,64):undefined};
    try {member.room.engine.command(input,member.id);} catch(error) {if(!error.status)error.status=400; throw error;}
    if(action==='chat' && input.nonce){member.nonces.add(input.nonce);if(member.nonces.size>64)member.nonces.delete(member.nonces.values().next().value);}
    checkpoint(!['pose','inputs'].includes(action));
    return view(member);
  }
  function subscribe(token,user,send,close,validate=()=>true,generation,connectionEpoch) {
    const member=authorize(token,user,generation,connectionEpoch); member.seen=clock();
    member.stream?.close();
    member.room.engine.command({action:'reconnect',id:member.id},member.id);
    const stream={send,close,validate}; member.stream=stream;
    send(view(member));
    return () => {if(member.stream===stream){member.stream=null;member.room.engine.command({action:'disconnect'},member.id);}};
  }
  let lastBroadcast=-Infinity;
  function tick() {
    if(closed||storageFailure)return;
    const now=clock();
    const broadcast=now-lastBroadcast>=.1;if(broadcast)lastBroadcast=now;
    for(const [key,bucket] of limits) if(now>=bucket.until)limits.delete(key);
    for(const member of [...sessions.values()]) if(now-member.seen>grace)disposeMember(member);
    for(const room of rooms.values()) {
      room.engine.tick();
      if(!broadcast)continue;
      for(const member of room.members.values()) {
        const value=view(member), player=value.players.find(p=>p.id===member.id);
        if(member.userId && player && ['escaped','caught','lost'].includes(player.status) && !room.reported.has(member.id)) {
          room.reported.add(member.id); onResult(member.userId,{status:player.status,pages:value.collected.length});
        }
        if(member.stream && broadcast) {
          if(!member.stream.validate()) {member.stream.close();member.stream=null;continue;}
          member.stream.send(value);
        }
      }
    }
    checkpoint();
  }
  function close() {if(closed)return;if(storage){if(!storageFailure)checkpoint(true);closed=true;for(const member of sessions.values()){const stream=member.stream;member.stream=null;stream?.close();}for(const room of rooms.values())room.engine.dispose?.();storage.close();rooms.clear();sessions.clear();accounts.clear();}else{for(const member of [...sessions.values()])disposeMember(member);closed=true;}}
  return {command,prepareEntry,subscribe,tick,close,checkpoint:()=>checkpoint(true),stats:()=>({rooms:rooms.size,players:sessions.size}),available:()=>({available:!closed&&!storageFailure,maxPlayers:6,maxRooms,reconnectSeconds:grace,requiresAccount:true,requiresSavedCharacter:true,protocolVersion:createEngine.protocolVersion||1,worldRevision:createEngine.worldRevision||null,transport:'ndjson',durable:!!storage})};
}
