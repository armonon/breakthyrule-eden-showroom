#!/usr/bin/env node
// Run after editing the canonical catalog; categories then arrive with the HTML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEmbeddedTopics, sameCatalog } from './validate-topics.mjs';

const args = process.argv.slice(2), rootIndex = args.indexOf('--root');
const root = rootIndex < 0 ? fileURLToPath(new URL('../../', import.meta.url)) : path.resolve(args[rootIndex + 1]);
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'site/data/topics.json'), 'utf8'));
const page = path.join(root, 'archive.html'), html = fs.readFileSync(page, 'utf8');
const embedded = parseEmbeddedTopics(html);
if (args.includes('--check')) {
  if (!sameCatalog(catalog, embedded)) throw new Error('Embedded archive topics are stale; run node tools/archive/embed-topics.mjs');
  console.log('Embedded archive topics match the canonical catalog.');
} else {
  const json = JSON.stringify(catalog).replace(/</g, '\\u003c');
  const script = '<script id="archive-topics-data" type="application/json">' + json + '</script>';
  const result = html.replace(/<script\b[^>]*\bid\s*=\s*['"]archive-topics-data['"][^>]*>[\s\S]*?<\/script\s*>/i, () => script);
  if (result !== html) fs.writeFileSync(page, result);
  console.log('Embedded ' + catalog.topics.length + ' archive topics in ' + catalog.groups.length + ' groups.');
}
