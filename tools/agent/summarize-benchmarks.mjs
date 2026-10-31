#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const files = process.argv.slice(2).filter(file => file.endsWith('.json'));
if (!files.length) {
  console.error('Usage: node tools/agent/summarize-benchmarks.mjs benchmark-1.json benchmark-2.json benchmark-3.json [...]');
  process.exit(2);
}

const rows = [];
for (const file of files) {
  let report;
  try { report = JSON.parse(await readFile(file, 'utf8')); }
  catch { continue; }
  if (report.schema !== 'beyond-eden-benchmark-v1' || !Array.isArray(report.results)) continue;
  report.results.forEach(result => rows.push({ ...result, sourceFile: path.resolve(file), reportCreatedAt: report.createdAt }));
}
if (!rows.length) {
  console.error('No Beyond Eden benchmark results found in the supplied JSON files.');
  process.exit(3);
}

const groups = new Map();
for (const row of rows) {
  const key = `${row.backend} :: ${row.preset}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const selections = [];
for (const [key, group] of groups) {
  const sorted = [...group].sort((a, b) => (a.p95FrameMs || Infinity) - (b.p95FrameMs || Infinity));
  const median = sorted[Math.floor(sorted.length / 2)];
  selections.push({ key, runs: group.length, selectionRule: 'median p95 frame time', selected: median, allRuns: sorted });
}
selections.sort((a, b) => a.key.localeCompare(b.key));

const markdown = [
  '# Beyond Eden benchmark summary',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  'Each condition selects the median run by p95 frame time. Keep all raw JSON files.',
  '',
  '| Backend | Preset | Runs | Mean FPS | 1% low | p95 ms | p99 ms | Calls | Triangles | Texture MiB est. | Transfer MiB |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
];
for (const item of selections) {
  const row = item.selected;
  markdown.push(`| ${row.backend} | ${row.preset} | ${item.runs} | ${(row.meanFps || 0).toFixed(1)} | ${(row.onePercentLowFps || 0).toFixed(1)} | ${(row.p95FrameMs || 0).toFixed(2)} | ${(row.p99FrameMs || 0).toFixed(2)} | ${row.drawCalls ?? '—'} | ${row.triangles ?? '—'} | ${(row.textureMemoryMiBEstimated || 0).toFixed(1)} | ${(row.sliceTransferMiB || 0).toFixed(1)} |`);
}
markdown.push('', '## Selected source files', '');
selections.forEach(item => markdown.push(`- **${item.key}** — ${item.selected.sourceFile}`));

const outputDirectory = path.dirname(path.resolve(files[0]));
const jsonPath = path.join(outputDirectory, 'benchmark-summary.json');
const mdPath = path.join(outputDirectory, 'benchmark-summary.md');
await writeFile(jsonPath, `${JSON.stringify({ schema: 'beyond-eden-benchmark-summary-v1', generatedAt: new Date().toISOString(), selections }, null, 2)}\n`);
await writeFile(mdPath, `${markdown.join('\n')}\n`);
console.log(markdown.join('\n'));
console.log(`\nWrote:\n  ${jsonPath}\n  ${mdPath}`);
