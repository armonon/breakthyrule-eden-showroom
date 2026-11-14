#!/usr/bin/env node
// LOCAL TESTING ONLY: puts test stock and capacity into the local order store so the full flow can be
// tried with the test gateway. These numbers are placeholders, not real inventory — never run against
// the live store (the script refuses unless the store is the local file store).
import { FileStore } from '../../server/lab/store.mjs';
import { allSkus, allSlots } from '../../labkit/catalog.mjs';
import path from 'node:path';
if (process.env.LAB_STORE && process.env.LAB_STORE !== 'file') { console.error('Refusing: this only seeds the local file store.'); process.exit(1); }
const dir = process.env.LAB_DATA_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../server/data/lab');
const store = new FileStore(dir);
await store.update('inventory', inv => { inv = inv || { skus: {} }; for (const { sku } of allSkus()) inv.skus[sku] = { onHand: 4, reserved: inv.skus[sku]?.reserved || 0 }; return inv; });
await store.update('capacity', cap => { cap = cap || { slots: {} }; for (const { slot } of allSlots()) cap.slots[slot] = { limit: slot.startsWith('cut-sew') ? 3 : 25, used: cap.slots[slot]?.used || 0, reserved: cap.slots[slot]?.reserved || 0, leadTimeDays: null, open: true }; return cap; });
await store.update('settings', s => ({ ...(s || {}), notice: 'Local test store — stock and capacity here are placeholders for testing.' }));
console.log('Seeded local TEST stock and capacity in', dir);
