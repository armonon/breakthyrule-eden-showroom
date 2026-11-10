// Key–value storage for the Garment Lab with optimistic concurrency (etags).
// Every write can be conditional, so inventory and capacity updates are safe under concurrent checkouts:
// `update()` reads, applies a function and writes only if nothing changed in between, retrying otherwise.
//
//   memory  — tests
//   file    — the local server (server/data/lab/), atomic rename writes, one process
//   blobs   — Netlify Blobs (requires the @netlify/blobs package; see docs/lab/README.md)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class ConflictError extends Error { constructor(key) { super('Concurrent update on ' + key); this.code = 'CONFLICT'; } }

class BaseStore {
  // fn(current|null) → next value, or undefined to leave unchanged. Returns the stored value.
  async update(key, fn, { retries = 12 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const cur = await this.get(key);
      const next = await fn(cur ? structuredClone(cur.value) : null);
      if (next === undefined) return cur?.value ?? null;
      const ok = await this.set(key, next, cur ? { ifMatch: cur.etag } : { ifNew: true });
      if (ok) return next;
      await new Promise(r => setTimeout(r, Math.random() * 15 * (attempt + 1)));
    }
    throw new ConflictError(key);
  }
}

export class MemoryStore extends BaseStore {
  constructor() { super(); this.map = new Map(); this.n = 0; }
  async get(key) { const e = this.map.get(key); return e ? { value: structuredClone(e.value), etag: e.etag } : null; }
  async set(key, value, { ifMatch, ifNew } = {}) {
    const e = this.map.get(key);
    if (ifNew && e) return false;
    if (ifMatch && (!e || e.etag !== ifMatch)) return false;
    this.map.set(key, { value: structuredClone(value), etag: 'e' + (++this.n) });
    return true;
  }
  async delete(key) { this.map.delete(key); }
  async list(prefix = '') { return [...this.map.keys()].filter(k => k.startsWith(prefix)).sort(); }
}

export class FileStore extends BaseStore {
  constructor(dir) { super(); this.dir = dir; fs.mkdirSync(dir, { recursive: true }); this.locks = new Map(); }
  file(key) { return path.join(this.dir, encodeURIComponent(key) + '.json'); }
  async lock(key, fn) {
    const prev = this.locks.get(key) || Promise.resolve();
    let release; const next = new Promise(r => { release = r; });
    this.locks.set(key, prev.then(() => next));
    await prev;
    try { return await fn(); } finally { release(); if (this.locks.get(key) === next) this.locks.delete(key); }
  }
  read(key) {
    try { const raw = fs.readFileSync(this.file(key), 'utf8'); const w = JSON.parse(raw); return { value: w.value, etag: w.etag }; }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  async get(key) { return this.read(key); }
  async set(key, value, { ifMatch, ifNew } = {}) {
    return this.lock(key, () => {
      const cur = this.read(key);
      if (ifNew && cur) return false;
      if (ifMatch && (!cur || cur.etag !== ifMatch)) return false;
      const etag = crypto.randomBytes(8).toString('hex');
      const tmp = this.file(key) + '.' + process.pid + '.' + etag + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ etag, value }));
      fs.renameSync(tmp, this.file(key));
      return true;
    });
  }
  async delete(key) { try { fs.unlinkSync(this.file(key)); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  async list(prefix = '') {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => decodeURIComponent(f.slice(0, -5))).filter(k => k.startsWith(prefix)).sort();
  }
}

export class BlobsStore extends BaseStore {
  constructor(store) { super(); this.s = store; }
  static async open(name = 'garment-lab') {
    const pkg = '@netlify/blobs'; // resolved at runtime so the site still builds without it
    let mod;
    try { mod = await import(pkg); } catch { const e = new Error('Netlify Blobs is not installed. Run `npm install @netlify/blobs` (see docs/lab/README.md).'); e.code = 'STORE_UNAVAILABLE'; throw e; }
    return new BlobsStore(mod.getStore({ name, consistency: 'strong' }));
  }
  async get(key) { const r = await this.s.getWithMetadata(key, { type: 'json' }); return r ? { value: r.data, etag: r.etag } : null; }
  async set(key, value, { ifMatch, ifNew } = {}) {
    const opts = ifMatch ? { onlyIfMatch: ifMatch } : ifNew ? { onlyIfNew: true } : {};
    const r = await this.s.setJSON(key, value, opts);
    return r?.modified !== false;
  }
  async delete(key) { await this.s.delete(key); }
  async list(prefix = '') { const r = await this.s.list({ prefix }); return r.blobs.map(b => b.key).sort(); }
}

export async function openStore(env = process.env) {
  const kind = env.LAB_STORE || (env.NETLIFY || env.NETLIFY_BLOBS_CONTEXT ? 'blobs' : 'file');
  if (kind === 'memory') return new MemoryStore();
  if (kind === 'blobs') return BlobsStore.open();
  return new FileStore(env.LAB_DATA_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../data/lab'));
}
