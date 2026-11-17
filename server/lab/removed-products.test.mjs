import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItem, priceCart, describeItem } from '../../labkit/pricing.mjs';
import { PRODUCT_DESIGNS, STUDIO_PRODUCTS } from '../../labkit/product-options.mjs';
import { allSlots } from '../../labkit/catalog.mjs';
import { createLab, MemoryStore } from './storefront-api.mjs';

const retired = ['god-loves-you-tee', 'blackmarket-baby-tee', 'cave-painting-tee', 'initiates-coach-jacket', 'all-seeing-tee', 'hermetic-hoodie'];
const garment = id => ({ product: 'garment', construction: 'canvas', labMode: 'blank', garment: PRODUCT_DESIGNS[id].garment,
  size: 'M', fit: 'blank', color: 'white', artwork: 'product-design', productDesign: { id, graphic: 'Red' }, quantity: 1 });
const cobalt = { product: 'studio-product', productId: 'accessory-trucker-cobalt', quantity: 1,
  options: { style: 'trucker', colors: { front: '#ffffff', brim: '#123456', mesh: '#ffffff' }, picks: [] } };

test('removed garments cannot be reordered through saved designs or edited source designs', () => {
  for (const id of retired) {
    const saved = garment(id);
    assert.equal(PRODUCT_DESIGNS[id].available, false, id);
    assert.equal(normalizeItem(saved).ok, false, id);
    assert.equal(priceCart([saved]).ok, false, id);
    const edited = { ...saved, artwork: 'pick', sourceDesign: id, productDesign: undefined, picks: { front: ['war'], back: [] } };
    const result = normalizeItem(edited, { artworkPool: ['war'] });
    assert.equal(result.ok, false, id);
    assert.match(result.errors.join(' '), /source garment is unavailable/i);
  }
});

test('cobalt trucker is unavailable for checkout and production capacity', () => {
  assert.equal(STUDIO_PRODUCTS[cobalt.productId].available, false);
  assert.equal(normalizeItem(cobalt).ok, false);
  assert.equal(priceCart([cobalt]).ok, false);
  assert.equal(allSlots().some(entry => entry.slot === 'studio:' + cobalt.productId), false);
  assert.equal(allSlots().some(entry => entry.slot === 'studio:accessory-trucker-cherry'), true);
});

test('historical descriptions still resolve, and similarly named designs remain available', () => {
  for (const id of retired) assert.ok(describeItem(garment(id)).spec.includes('Design: ' + PRODUCT_DESIGNS[id].name), id);
  assert.equal(describeItem(cobalt).title, STUDIO_PRODUCTS[cobalt.productId].name);
  assert.equal(normalizeItem(garment('god-loves-you-v2-tee')).ok, true);
  assert.equal(normalizeItem(garment('green-eye-crewneck')).ok, true);
});

test('the deployed checkout handler rejects all seven removed products without reserving stock', async () => {
  const store = new MemoryStore();
  const capacity = { slots: {
    'canvas:tee': { limit: 10, used: 0, reserved: 0, open: true },
    'canvas:hoodie': { limit: 10, used: 0, reserved: 0, open: true },
    'studio:accessory-trucker-cobalt': { limit: 10, used: 0, reserved: 0, open: true }
  } };
  await store.set('capacity', capacity);
  const env = { CONTEXT: 'deploy-preview', LAB_PREVIEW: 'true', LAB_SESSION_SECRET: 'retired-product-test-'.repeat(3), LAB_PAYMENT_PROVIDER: 'test-gateway', LAB_ALLOW_TEST_GATEWAY: 'true' };
  const lab = createLab({ store, env, artworkPool: [] });
  for (const [index, item] of [...retired.map(garment), cobalt].entries()) {
    await assert.rejects(lab.checkout({ items: [item], idempotencyKey: 'retired_products_20261117_' + index, origin: 'https://fixture.invalid' }), error => error.status === 400);
  }
  assert.deepEqual((await store.get('capacity')).value, capacity);
});
