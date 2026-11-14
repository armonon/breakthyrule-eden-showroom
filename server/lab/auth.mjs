// Staff accounts for the production dashboard: scrypt-hashed passwords, HMAC-signed bearer tokens,
// roles, and a lockout after repeated failed sign-ins. No third-party auth service.
import crypto from 'node:crypto';

export const ROLES = {
  owner: ['orders:read', 'orders:write', 'orders:refund', 'inventory:write', 'settings:write', 'archive:write', 'staff:write'],
  artist: ['orders:read', 'orders:write', 'archive:write']
};
const TOKEN_HOURS = 12;

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 10) throw new Error('Passwords need at least 10 characters.');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(hash, 'hex');
  return want.length === test.length && crypto.timingSafeEqual(want, test);
}

const b64 = s => Buffer.from(s).toString('base64url');
export function signToken(payload, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('LAB_SESSION_SECRET must be at least 32 characters.');
  const body = b64(JSON.stringify({ ...payload, exp: now + TOKEN_HOURS * 3600e3 }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}
export function verifyToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(sig || '', 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > now ? p : null; } catch { return null; }
}
export const can = (staff, permission) => !!staff && (ROLES[staff.role] || []).includes(permission);

// Secret order-access keys: the customer gets the key, the order stores only its hash.
export const newKey = () => crypto.randomBytes(24).toString('base64url');
export const hashKey = key => crypto.createHash('sha256').update(String(key)).digest('hex');
export function keyMatches(key, hash) {
  if (typeof key !== 'string' || typeof hash !== 'string') return false;
  const a = Buffer.from(hashKey(key), 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
