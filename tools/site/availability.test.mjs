import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { hasAvailability, madeToOrderLabel } from '../../site/availability.mjs';

test('unlimited null-count offerings accept quantities without inventing remaining stock', () => {
  const info = { available: null, unlimited: true, leadTimeDays: null };
  assert.equal(hasAvailability(info, 5), true);
  assert.equal(madeToOrderLabel(info), 'Made to order');
  assert.equal(madeToOrderLabel({ ...info, leadTimeDays: 12 }), 'Made to order — about 12 days to make');
});

test('finite, missing, malformed, and closed availability still fail closed', () => {
  assert.equal(hasAvailability({ available: 2 }, 2), true);
  assert.equal(hasAvailability({ available: 2 }, 3), false);
  for (const info of [null, {}, { available: 0 }, { available: null }, { available: null, unlimited: 'true' }, { available: 2, open: false }, { available: null, unlimited: true, open: false }]) {
    assert.equal(hasAvailability(info), false);
    assert.equal(madeToOrderLabel(info), '');
  }
  for (const quantity of [0, -1, 1.5, NaN, '2']) assert.equal(hasAvailability({ unlimited: true }, quantity), false);
});

// Exercise the real admin save callbacks with a small DOM fixture and mocked HTTP.
// This catches losing the persisted unlimited flag when saving another field.
async function adminFixture(role = 'owner') {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.value = ''; this.disabled = false; }
    append(...children) { this.children.push(...children.filter(x => x != null && x !== false)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener() {}
    querySelectorAll() { return []; }
    reportValidity() { return true; }
    setAttribute(name, value) { this[name] = value; }
  }
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Element('div')); return nodes.get(id); };
  const updates = [];
  const stock = {
    skus: [{ sku: 'mystery-pack:light-pack:M', label: 'Light pack M', onHand: 17, reserved: 2, unlimited: true }],
    slots: [{ slot: 'canvas:tee', label: 'Tee', limit: 7, used: 3, reserved: 1, leadTimeDays: null, open: false, unlimited: true }]
  };
  const context = vm.createContext({
    document: { getElementById: node, createElement: tag => new Element(tag), querySelectorAll: () => [] },
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    PRODUCTION_STATUSES: [], PAYMENT_STATUSES: [], ARTWORK_POOL: [],
    alert(message) { throw Error(message); },
    fetch: async (url, options) => {
      if (options.method === 'POST') updates.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => stock };
    }
  });
  const source = fs.readFileSync(new URL('../../site/lab-admin.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInContext(source, context);
  await vm.runInContext(`me = {role:${JSON.stringify(role)}}; loadStock()`, context);
  return { nodes, updates };
}

test('admin preserves unlimited and stored counts when saving stock and lead-time changes', async () => {
  const { nodes, updates } = await adminFixture();
  const stockCells = nodes.get('skus').children[0].children;
  const stockToggle = stockCells[1].children[0], count = stockCells[2].children[0], stockSave = stockCells[4].children[0];
  assert.equal(stockToggle.checked, true);
  assert.equal(count.disabled, true);
  await stockSave.onclick();
  assert.deepEqual(updates.pop().body, { sku: 'mystery-pack:light-pack:M', onHand: 17, unlimited: true });
  stockToggle.checked = false; stockToggle.onchange();
  assert.equal(count.disabled, false);
  await stockSave.onclick();
  assert.deepEqual(updates.pop().body, { sku: 'mystery-pack:light-pack:M', onHand: 17, unlimited: false });

  const slotCells = nodes.get('slots').children[0].children;
  const slotToggle = slotCells[1].children[0], limit = slotCells[2].children[0], lead = slotCells[5].children[0], open = slotCells[6].children[0], slotSave = slotCells[7].children[0];
  assert.equal(slotToggle.checked, true);
  assert.equal(limit.disabled, true);
  assert.equal(open.checked, false);
  assert.equal(lead.value, '');
  await slotSave.onclick();
  assert.deepEqual(updates.pop().body, { slot: 'canvas:tee', limit: 7, leadTimeDays: null, open: false, unlimited: true });
  lead.value = '9'; await slotSave.onclick();
  assert.deepEqual(updates.pop().body, { slot: 'canvas:tee', limit: 7, leadTimeDays: 9, open: false, unlimited: true });
  slotToggle.checked = false; slotToggle.onchange();
  assert.equal(limit.disabled, false);
  assert.equal(limit.value, 7);
});

test('non-owner stock controls remain read only', async () => {
  const { nodes, updates } = await adminFixture('artist');
  const cells = nodes.get('skus').children[0].children;
  assert.equal(cells[1].children[0].disabled, true);
  assert.equal(cells[2].children[0].disabled, true);
  assert.equal(cells[4].children.length, 0);
  assert.equal(updates.length, 0);
});
