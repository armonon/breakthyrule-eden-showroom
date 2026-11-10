#!/usr/bin/env node
// Prints a password hash for LAB_BOOTSTRAP_OWNER ("email:hash") or for a staff record.
//   node tools/lab/hash-password.mjs owner@example.com
// The password is read from the terminal (not echoed into shell history).
import { hashPassword } from '../../server/lab/auth.mjs';
import readline from 'node:readline';
const email = (process.argv[2] || '').trim().toLowerCase();
if (!email.includes('@')) { console.error('Usage: node tools/lab/hash-password.mjs you@example.com'); process.exit(1); }
const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl.stdoutMuted = true; rl._writeToOutput = s => { if (!rl.stdoutMuted || s.includes('Password')) process.stderr.write(s); };
rl.question('Password (10+ characters): ', pw => { rl.close(); process.stderr.write('\n'); try { console.log(`${email}:${hashPassword(pw)}`); } catch (e) { console.error(e.message); process.exit(1); } });
