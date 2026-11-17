import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeItem, priceCart, unitsFor, describeItem} from '../../labkit/pricing.mjs';
import {STUDIO_PRODUCTS} from '../../labkit/product-options.mjs';
import {createLab, MemoryStore} from './storefront-api.mjs';

const selected = (productId, quantity = 1, options = {color: 'black'}) => ({product: 'studio-product', productId, quantity, options});

test('headband and skully quantities count complete three-piece packs at catalog prices', () => {
  for (const [id, cents] of [['accessory-headband-black',3500],['accessory-headband-white',3500],['accessory-skully-black',4500],['accessory-skully-white',4500],['sacrificial-beanie',4500]]) {
    for (const quantity of [1,2,5]) {
      const normalized = normalizeItem({...selected(id,quantity),packSize:1,unitCents:1});
      assert.equal(normalized.ok,true,id);
      assert.equal(normalized.item.packSize,3);
      const quote = priceCart([normalized.item]);
      assert.equal(quote.subtotalCents,cents*quantity,id);
      assert.equal(unitsFor(normalized.item),3*quantity);
      assert.match(describeItem(normalized.item).title,/3-pack/);
      assert.match(describeItem(normalized.item).spec.join(' '),/Pack contents: 3/);
    }
  }
});

test('truckers remain $45 each and glove prices remain $35 per existing product', () => {
  const hat = {style:'trucker',colors:{front:'#ffffff',brim:'#123456',mesh:'#ffffff'},picks:[]};
  for (const product of Object.values(STUDIO_PRODUCTS).filter(p=>['trucker','gloves'].includes(p.family))) {
    const n=normalizeItem(selected(product.id,2,product.family==='trucker'?hat:{color:'white'}));
    assert.equal(n.ok,true);
    assert.equal(priceCart([n.item]).subtotalCents,product.family==='trucker'?9000:7000);
    assert.equal(n.item.packSize,undefined);
  }
});

test('actual Netlify checkout service charges per pack and records physical contents', async () => {
  const store=new MemoryStore();
  await store.set('capacity',{slots:{
    'studio:accessory-headband-black':{limit:10,used:0,reserved:0,open:true},
    'studio:accessory-skully-white':{limit:10,used:0,reserved:0,open:true},
    'studio:accessory-trucker-cobalt':{limit:10,used:0,reserved:0,open:true}
  }});
  const env={CONTEXT:'deploy-preview',LAB_PREVIEW:'true',LAB_SESSION_SECRET:'accessory-pack-test-'.repeat(3),LAB_PAYMENT_PROVIDER:'test-gateway',LAB_ALLOW_TEST_GATEWAY:'true'};
  const lab=createLab({store,env,artworkPool:[]});
  const items=[selected('accessory-headband-black',2),selected('accessory-skully-white',1,{color:'white'}),selected('accessory-trucker-cobalt',1,{style:'trucker',colors:{front:'#ffffff',brim:'#123456',mesh:'#ffffff'},picks:[]})];
  const result=await lab.checkout({items:items.map(item=>({...item,unitCents:1,packSize:99})),idempotencyKey:'accessory_pack_quote_20261116',origin:'https://fixture.invalid'});
  const {value:order}=await store.get('orders/'+result.orderId);
  assert.equal(order.subtotalCents,16000);
  assert.deepEqual(order.items.map(item=>({price:item.unitCents,quantity:item.quantity,units:item.units})),[
    {price:3500,quantity:2,units:6},{price:4500,quantity:1,units:3},{price:4500,quantity:1,units:1}
  ]);
  assert.deepEqual(order.reservation.needs.slots,{'studio:accessory-headband-black':2,'studio:accessory-skully-white':1,'studio:accessory-trucker-cobalt':1});
  assert.equal(order.payment.status,'pending');
});
