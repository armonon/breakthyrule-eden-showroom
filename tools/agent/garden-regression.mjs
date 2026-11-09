#!/usr/bin/env node
// Walk the site's main views and the garment viewer in headless Chrome, saving screenshots and every console problem.
//   node tools/agent/garden-regression.mjs --url http://127.0.0.1:8790/ --out DIR
import fs from 'node:fs';
import path from 'node:path';
import { openPage, sleep } from './headless-chrome.mjs';
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : null).filter(Boolean));
const out = args.out, base = args.url || 'http://127.0.0.1:8790/'; fs.mkdirSync(out, { recursive: true });
const page = await openPage({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
await page.goto(base + 'showroom.html'); await page.ready(); await sleep(9000);
for (const view of ['library', 'approach', 'wall', 'amphitheater', 'librarian']) {
  await page.evaluate(`breakThyRuleShowroom.go('${view}',true)`); await sleep(view === 'approach' ? 14000 : 5000);
  await page.shot(path.join(out, `${view}.jpg`)); console.log(view, await page.evaluate(`JSON.stringify({view:breakThyRuleShowroom.getState().view,calls:edenPost.profile().calls})`));
}
await page.evaluate(`breakThyRuleShowroom.go('spawn',true);breakThyRuleShowroom.inspect(0);`); await sleep(2500);
await page.evaluate(`document.getElementById('show-3d')?.click()`); await sleep(9000);
await page.shot(path.join(out, 'garment-3d.jpg')); console.log('garment', await page.evaluate(`document.getElementById('model-status')?.textContent`));
const study = await openPage({ width: 1000, height: 700 }); await study.goto(base + 'shirt-study.html'); await sleep(12000); await study.shot(path.join(out, 'shirt-study.jpg')); console.log('study problems', [...new Set(study.problems)].slice(0, 5).join('\n').slice(0, 900)); await study.close();
console.log('problems', [...new Set(page.problems)].slice(0, 12).join('\n').slice(0, 2500));
await page.close();
