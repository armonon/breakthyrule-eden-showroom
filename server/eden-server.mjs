#!/usr/bin/env node
// Eden local game server: serves the site, accounts, characters, presence and chat, plus a live WebSocket feed.
//
//   node server/eden-server.mjs [--port 8777] [--host 127.0.0.1] [--data server/data]
//
// HTTP (same contract multiplayer.js already uses):  /api/social/{me,register,login,recover,logout,character,sync,
// chat,wave,leave}, plus /api/social/{world,ladder,progress} for the garden's shared state (server/world.mjs).  Live: WebSocket /api/social/live?connectionId=… — the client sends {t:'pose',x,z,yaw} up to
// 15×/s and {t:'punch'} when it throws one (server/brawl.mjs decides hits and knockdowns); the server pushes sync-shaped snapshots ({t:'snapshot',selfId,user,people,messages}) ~20×/s while
// anything changes and at once on chat. Also serves the static site with caching off, the prop editor's
// PUT /assets/props/scene.json, and a local deployment.js that switches the client into live mode.
// No dependencies: the WebSocket framing (RFC 6455) is implemented below.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createArena} from './arena.mjs';
import {createBrawl} from './brawl.mjs';
import {createWorld} from './world.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs, []));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(args.port || 8777), HOST = args.host || '127.0.0.1';
const DATA = path.resolve(args.data || path.join(ROOT, 'server', 'data'));
fs.mkdirSync(DATA, {recursive: true});

// ---------- persistence ----------
const store = {users: {}, sessions: {}};
const STORE_FILE = path.join(DATA, 'accounts.json');
try { Object.assign(store, JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'))); } catch {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 1));
    fs.renameSync(tmp, STORE_FILE);
  }, 200);
}

// ---------- accounts ----------
const PALETTE = ['#c8553d', '#2f6690', '#7a9e7e', '#b388eb', '#e0a458', '#3a7d44', '#d16666', '#5b8e7d', '#8f6593', '#4f6d7a'];
const hash = (secret, salt) => crypto.scryptSync(secret, salt, 32).toString('hex');
const nameKey = name => name.toLowerCase();
const publicUser = u => u && {id: u.id, name: u.name, character: u.character || null, color: u.color, progress: u.progress || null};
function validName(name) { return typeof name === 'string' && /^[A-Za-z0-9 _.-]{3,24}$/.test(name.trim()); }
function newSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  store.sessions[token] = {userId: user.id, created: Date.now()};
  save();
  return token;
}
function userFromRequest(req) {
  const token = /(?:^|;\s*)eden_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  const session = token && store.sessions[token];
  return session ? {user: store.users[session.userId] || null, token} : {user: null, token: null};
}
const sessionCookie = token => `eden_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`;
const clearCookie = 'eden_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';

// simple per-key rate limiter
const buckets = new Map();
function allow(key, perWindow, windowMs) {
  const now = Date.now(), b = buckets.get(key) || {count: 0, reset: now + windowMs};
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count++; buckets.set(key, b);
  return b.count <= perWindow;
}

// ---------- room state ----------
const presence = new Map(); // connectionId -> {userId|null, guestName, pose:{x,z,yaw}, seen, wave}
const messages = []; let messageId = 0; const nonces = new Map();
const PRESENCE_TTL = 15000, MAX_MESSAGES = 80;
let version = 0; // bumps on any change; live clients get a snapshot when it moves
function touch() { version++; }
function guestName(connectionId) { return 'Ghost ' + connectionId.slice(0, 4).toUpperCase(); }
function setPose(connectionId, user, pose) {
  let p = presence.get(connectionId);
  if (!p) { p = {userId: null, zone: 'garden', pose: {x: 0, z: 12, yaw: Math.PI}, seen: 0, wave: 0}; presence.set(connectionId, p); touch(); }
  if (p.userId !== (user?.id || null)) { p.userId = user?.id || null; touch(); }
  p.seen = Date.now();
  if (pose && [pose.x, pose.z, pose.yaw].every(Number.isFinite) && Math.abs(pose.x) < 500 && Math.abs(pose.z) < 500) {
    const zone = p.zone; arena.pose(p, pose);
    const leftArena = zone === 'arena' && p.zone !== 'arena', blockedEntry = pose.zone === 'arena' && p.zone !== 'arena';
    if (!blockedEntry && !(p.arena?.dead && p.zone === 'arena') && (pose.x !== p.pose.x || pose.z !== p.pose.z || pose.yaw !== p.pose.yaw)) { p.pose = {x: +pose.x.toFixed(3), z: +pose.z.toFixed(3), yaw: +pose.yaw.toFixed(3)}; touch(); }
    if (zone !== p.zone || leftArena || p.zone === 'arena') touch();
  }
  return p;
}
function leave(connectionId) { brawl.leave(connectionId); if (presence.delete(connectionId)) touch(); }
setInterval(() => { const now = Date.now(); for (const [id, p] of presence) if (now - p.seen > PRESENCE_TTL && !liveSockets.has(id)) { presence.delete(id); touch(); } }, 2000);
function people() {
  const seenUsers = new Set(), list = [];
  for (const [id, p] of presence) {
    const u = p.userId && store.users[p.userId];
    if (u && seenUsers.has(u.id)) continue; // one avatar per account even with two tabs
    if (u) seenUsers.add(u.id);
    list.push({id: u ? u.id : 'guest:' + id, name: u ? u.name : guestName(id), color: u ? u.color : '#9aa5a0', ghost: !u?.character,
      character: u?.character || null, x: p.pose.x, z: p.pose.z, yaw: p.pose.yaw, wave: p.wave, zone: p.zone || 'garden', arena: arena.publicState(p)});
  }
  return list;
}
function snapshotFor(connectionId, user) {
  return {selfId: user ? user.id : 'guest:' + connectionId, user: publicUser(user), people: people(), messages};
}
function postMessage(user, kind, text, nonce) {
  if (nonce && nonces.has(nonce)) return nonces.get(nonce);
  const message = {id: ++messageId, userId: user.id, name: user.name, color: user.color, kind, text, time: Math.floor(Date.now() / 1000)};
  messages.push(message); if (messages.length > MAX_MESSAGES) messages.shift();
  if (nonce) { nonces.set(nonce, message); if (nonces.size > 500) nonces.delete(nonces.keys().next().value); }
  if (kind === 'wave') for (const p of presence.values()) if (p.userId === user.id) p.wave = message.time;
  touch(); broadcast(true);
  return message;
}

// ---------- social API ----------
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function social(action, req, res, body) {
  const ip = req.socket.remoteAddress || '?';
  const {user, token} = userFromRequest(req);
  const reply = (data, headers = {}) => send(res, 200, JSON.stringify(data), {'Content-Type': 'application/json', ...headers});
  switch (action) {
    case 'me': return reply({user: publicUser(user)});
    case 'register': {
      if (!allow('register:' + ip, 10, 3600e3)) throw new HttpError(429, 'Too many new accounts from here. Try again later.');
      const name = String(body.name || '').trim(), password = String(body.password || '');
      if (!validName(name)) throw new HttpError(400, 'Names are 3-24 letters, numbers, spaces, dots, dashes or underscores.');
      if (password.length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.');
      if (Object.values(store.users).some(u => u.nameKey === nameKey(name))) throw new HttpError(409, 'That name is taken.');
      const salt = crypto.randomBytes(16).toString('hex'), recoveryCode = crypto.randomBytes(9).toString('base64url');
      const id = crypto.randomUUID(), color = PALETTE[Object.keys(store.users).length % PALETTE.length];
      const u = store.users[id] = {id, name, nameKey: nameKey(name), salt, passwordHash: hash(password, salt), recoveryHash: hash(recoveryCode, salt), character: null, color, created: Date.now()};
      save();
      return reply({user: publicUser(u), recoveryCode}, {'Set-Cookie': sessionCookie(newSession(u))});
    }
    case 'login': case 'recover': {
      if (!allow('login:' + ip, 20, 600e3)) throw new HttpError(429, 'Too many attempts. Wait a few minutes.');
      const name = String(body.name || '').trim(), u = Object.values(store.users).find(x => x.nameKey === nameKey(name));
      if (action === 'login') {
        if (!u || !crypto.timingSafeEqual(Buffer.from(hash(String(body.password || ''), u.salt), 'hex'), Buffer.from(u.passwordHash, 'hex'))) throw new HttpError(401, 'That name and password do not match.');
        return reply({user: publicUser(u)}, {'Set-Cookie': sessionCookie(newSession(u))});
      }
      const password = String(body.password || '');
      if (!u || !crypto.timingSafeEqual(Buffer.from(hash(String(body.recoveryCode || ''), u.salt), 'hex'), Buffer.from(u.recoveryHash, 'hex'))) throw new HttpError(401, 'That name and recovery code do not match.');
      if (password.length < 8) throw new HttpError(400, 'Passwords need at least 8 characters.');
      const recoveryCode = crypto.randomBytes(9).toString('base64url');
      u.passwordHash = hash(password, u.salt); u.recoveryHash = hash(recoveryCode, u.salt);
      for (const [t, s] of Object.entries(store.sessions)) if (s.userId === u.id) delete store.sessions[t];
      save();
      return reply({user: publicUser(u), recoveryCode}, {'Set-Cookie': sessionCookie(newSession(u))});
    }
    case 'logout': if (token) { delete store.sessions[token]; save(); } touch(); return reply({ok: true}, {'Set-Cookie': clearCookie});
    case 'delete': {
      if (!user) throw new HttpError(401, 'Sign in first.');
      if (!crypto.timingSafeEqual(Buffer.from(hash(String(body.password || ''), user.salt), 'hex'), Buffer.from(user.passwordHash, 'hex'))) throw new HttpError(401, 'That password is not right.');
      delete store.users[user.id]; world.forget(user.id);
      for (const [t, s] of Object.entries(store.sessions)) if (s.userId === user.id) delete store.sessions[t];
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i].userId === user.id) messages.splice(i, 1);
      save(); touch(); broadcast(true);
      return reply({ok: true}, {'Set-Cookie': clearCookie});
    }
    case 'character': {
      if (!user) throw new HttpError(401, 'Sign in to save a character.');
      const json = JSON.stringify(body.character ?? null);
      if (!body.character || typeof body.character !== 'object' || json.length > 16000) throw new HttpError(400, 'That character could not be saved.');
      user.character = body.character; save(); touch(); broadcast(true);
      return reply({user: publicUser(user)});
    }
    case 'sync': setPose(String(body.connectionId || ''), user, body.pose); return reply(snapshotFor(String(body.connectionId || ''), user));
    case 'chat': case 'wave': {
      if (!user?.character) throw new HttpError(401, 'Create a character to chat.');
      if (!allow('chat:' + user.id, 8, 10e3)) throw new HttpError(429, 'Slow down a little.');
      const text = action === 'wave' ? 'waves' : String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
      if (!text) throw new HttpError(400, 'Say something first.');
      return reply({message: postMessage(user, action, text, typeof body.nonce === 'string' ? body.nonce.slice(0, 64) : null)});
    }
    case 'leave': leave(String(body.connectionId || '')); return reply({ok: true});
    case 'world': return reply(world.state());
    case 'ladder': return reply(world.ladder(user, body));
    case 'progress': return reply(world.progress(user, body));
    default: throw new HttpError(404, 'Unknown action.');
  }
}

// ---------- WebSocket (RFC 6455, server side, text frames only) ----------
const liveSockets = new Map(); // connectionId -> {socket, req, sentVersion}
function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const url = new URL(req.url, 'http://local'), connectionId = (url.searchParams.get('connectionId') || '').slice(0, 64);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(connectionId) || !sameOrigin(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  liveSockets.get(connectionId)?.socket.destroy();
  const client = {socket, req, sentVersion: -1, lastPose: 0};
  liveSockets.set(connectionId, client);
  setPose(connectionId, userFromRequest(req).user, null);
  sendSnapshot(connectionId, client);
  socket.write(frame(Buffer.from(JSON.stringify(world.state()))));
  let buffer = Buffer.alloc(0);
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f, masked = buffer[1] & 0x80; let length = buffer[1] & 0x7f, offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { socket.destroy(); return; } // never needed: client messages are tiny
      if (!masked || length > 65536) { socket.destroy(); return; }
      if (buffer.length < offset + 4 + length) return;
      const mask = buffer.subarray(offset, offset + 4), payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buffer = buffer.subarray(offset + 4 + length);
      if (opcode === 0x8) { socket.end(frame(Buffer.alloc(0), 0x8)); return; }
      if (opcode === 0x9) { socket.write(frame(payload, 0xA)); continue; }
      if (opcode === 0x1) onLiveMessage(connectionId, client, payload.toString('utf8'));
    }
  });
  const close = () => { if (liveSockets.get(connectionId) === client) { liveSockets.delete(connectionId); leave(connectionId); } };
  socket.on('close', close); socket.on('error', close);
}
function frame(payload, opcode = 0x1) {
  const head = payload.length < 126 ? Buffer.from([0x80 | opcode, payload.length])
    : payload.length < 65536 ? Buffer.from([0x80 | opcode, 126, payload.length >> 8, payload.length & 255])
    : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(payload.length), 2); return h; })();
  return Buffer.concat([head, payload]);
}
function onLiveMessage(connectionId, client, text) {
  let message; try { message = JSON.parse(text); } catch { return; }
  if (message.t === 'pose') {
    const now = Date.now(); if (now - client.lastPose < 50) return; client.lastPose = now; // ≤20/s per client
    setPose(connectionId, userFromRequest(client.req).user, message);
  } else if (message.t === 'attack' || message.t === 'shoot') {
    const p = presence.get(connectionId); if (p) arena.action(connectionId, p, message);
  } else if (message.t === 'punch') {
    const p = presence.get(connectionId); if (p) brawl.punch(connectionId, p);
  } else if (message.t === 'weather') {
    world.weather(userFromRequest(client.req).user, message);
  }
}
function sendSnapshot(connectionId, client) {
  if (client.socket.writableLength > 256e3) return; // a slow client skips frames instead of buffering forever
  client.sentVersion = version;
  client.socket.write(frame(Buffer.from(JSON.stringify({t: 'snapshot', ...snapshotFor(connectionId, userFromRequest(client.req).user)}))));
}
function broadcast(force = false) { for (const [id, c] of liveSockets) if (force || c.sentVersion !== version) sendSnapshot(id, c); }
setInterval(broadcast, 50); // ~20 snapshots/s, only to clients that are behind

// Arena combat events go straight out to everyone in the arena (and the snapshot carries health/scores).
const arena = createArena({root: ROOT, presence, emit(events) {
  const payload = frame(Buffer.from(JSON.stringify({t: 'arena', events})));
  for (const [id, c] of liveSockets) if (presence.get(id)?.zone === 'arena') c.socket.write(payload);
  touch();
}});

// Brawl events (punches, knockdowns) go to everyone in the same zone.
const brawl = createBrawl({presence, emit(zone, events) {
  const payload = frame(Buffer.from(JSON.stringify({t: 'brawl', events})));
  for (const [id, c] of liveSockets) if ((presence.get(id)?.zone || 'garden') === zone) c.socket.write(payload);
}});

// Shared garden state (weather lever, Fools' Ladder) goes to every live client.
const world = createWorld({store, save, allow, emit(payload) {
  const data = frame(Buffer.from(JSON.stringify(payload)));
  for (const c of liveSockets.values()) c.socket.write(data);
}});

// ---------- HTTP ----------
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'};
function send(res, status, body, headers = {}) { res.writeHead(status, {'Cache-Control': 'no-store', ...headers}); res.end(body); }
function sameOrigin(req) { const origin = req.headers.origin; return !origin || origin === `http://${req.headers.host}`; }
function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject);
  });
}
const LOCAL_DEPLOYMENT = `'use strict';window.showroomDeployment=${JSON.stringify({mode: 'local', socialApi: '/api/social/', realtime: '/api/social/live'})};`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname.startsWith('/api/social/')) {
      if (!sameOrigin(req)) throw new HttpError(403, 'Cross-site request refused.');
      const raw = req.method === 'POST' ? await readBody(req) : '';
      let body = {}; if (raw) { try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Bad request.'); } }
      return await social(url.pathname.slice('/api/social/'.length), req, res, body);
    }
    if (url.pathname === '/deployment.js') return send(res, 200, LOCAL_DEPLOYMENT, {'Content-Type': TYPES['.js']});
    if (req.method === 'PUT' && url.pathname === '/assets/props/scene.json') {
      if (!sameOrigin(req)) throw new HttpError(403, 'Cross-site request refused.');
      const data = JSON.parse(await readBody(req, 2e6));
      if (!Array.isArray(data.props) || !data.props.every(e => typeof e.url === 'string' && e.url.startsWith('/assets/props/') && Array.isArray(e.placements))) throw new HttpError(400, 'invalid scene');
      const target = path.join(ROOT, 'assets', 'props', 'scene.json'), stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      if (fs.existsSync(target)) fs.copyFileSync(target, target + '.bak-' + stamp);
      fs.writeFileSync(target, JSON.stringify(data, null, 1) + '\n');
      return send(res, 204, '');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) throw new HttpError(403, 'Forbidden.');
    if (file.startsWith(path.join(ROOT, 'server') + path.sep) || path.basename(file).startsWith('.')) throw new HttpError(404, 'Not found.');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) throw new HttpError(404, 'Not found.');
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': fs.statSync(file).size});
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    send(res, status, JSON.stringify({error: status === 500 ? 'Server error.' : error.message}), {'Content-Type': 'application/json'});
  }
});
server.on('upgrade', (req, socket) => {
  if (new URL(req.url, 'http://local').pathname === '/api/social/live') wsAccept(req, socket); else socket.destroy();
});
server.listen(PORT, HOST, () => console.log(`Eden server: http://${HOST}:${PORT}/  (live multiplayer on, data in ${DATA})`));
