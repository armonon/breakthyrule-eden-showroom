#!/usr/bin/env node
// Adds a studio account to the LOCAL order store (server/data/lab or LAB_DATA_DIR).
//   node tools/lab/create-staff.mjs you@example.com owner|artist
// Prompts for the password. On Netlify, create the first owner with LAB_BOOTSTRAP_OWNER instead
// (see docs/lab/README.md), then add others from the studio's Staff tab.
import { FileStore } from '../../server/lab/store.mjs';
import { hashPassword } from '../../server/lab/auth.mjs';
import path from 'node:path';
import readline from 'node:readline';
const [email, role = 'owner'] = process.argv.slice(2);
if (!email?.includes('@') || !['owner', 'artist'].includes(role)) { console.error('Usage: node tools/lab/create-staff.mjs you@example.com owner|artist'); process.exit(1); }
const dir = process.env.LAB_DATA_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../server/data/lab');
async function password() {
  if (process.env.LAB_NEW_PASSWORD) return process.env.LAB_NEW_PASSWORD;
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  rl._writeToOutput = s => { if (s.includes('Password')) process.stderr.write(s); };
  return new Promise(r => rl.question('Password (10+ characters): ', pw => { rl.close(); process.stderr.write('\n'); r(pw); }));
}
const store = new FileStore(dir);
const pw = await password();
await store.set('staff/' + email.toLowerCase(), { email: email.toLowerCase(), role, passwordHash: hashPassword(pw), active: true, at: new Date().toISOString() });
console.log(`Added ${role} ${email.toLowerCase()} to ${dir}`);
