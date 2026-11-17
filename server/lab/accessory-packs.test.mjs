import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeItem, priceCart, unitsFor, describeItem} from '../../labkit/pricing.mjs';
import {STUDIO_PRODUCTS} from '../../labkit/product-options.mjs';
import {createLab, MemoryStore} from './storefront-api.mjs';

const selected = (productId, quantity = 1, options = {color: 'black'}) => ({product: 'studio-product', productId, quantity, options});

test('headbands are single pieces at $60, with a $5 heavy-fabric option', () => {
  for (const id of ['accessory-headband-black','accessory-headband-white']) {
    for (const weight of ['thin','heavy']) for (const quantity of [1,2]) {
      const n=normalizeItem({...selected(id,quantity,{color:'black',weight}),packSize:99,unitCents:1});
      assert.equal(n.ok,true,id);
      assert.equal(n.item.packSize,undefined);
      assert.equal(priceCart([n.item]).subtotalCents,(weight==='heavy'?6500:6000)*quantity);
      assert.equal(unitsFor(n.item),quantity);
      assert.doesNotMatch(describeItem(n.item).title,/pack/i);
      assert.match(describeItem(n.item).spec.join(' '),new RegExp('Fabric weight: '+(weight==='heavy'?'Heavy':'Thin')));
    }
    assert.equal(normalizeItem(selected(id,1,{color:'white'})).item.options.weight,'thin');
    assert.equal(normalizeItem(selected(id,1,{color:'white',weight:'invalid'})).ok,false);
  }
});

test('Daily Apple is a $45 three-tee pack with one required shared size', () => {
  for (const size of ['S','M','L','XL','XXL']) for (const quantity of [1,2]) {
    const n=normalizeItem({...selected('daily-apple-3-pack',quantity,{size}),packSize:1,unitCents:1});
    assert.equal(n.ok,true);
    assert.equal(n.item.packSize,3);
    assert.equal(n.item.options.color,'white');
    assert.equal(priceCart([n.item]).subtotalCents,4500*quantity);
    assert.equal(unitsFor(n.item),3*quantity);
    assert.match(describeItem(n.item).spec.join(' '),new RegExp('Size: '+size+' · all three tees'));
  }
  for (const options of [{},{size:'XS'},{size:'3XL'},{size:'M',color:'red'}]) assert.equal(normalizeItem(selected('daily-apple-3-pack',1,options)).ok,false);
});

test('skullies and the legacy skully link are single pieces at $50 or $55 heavy', () => {
  for (const id of ['accessory-skully-black','accessory-skully-white','sacrificial-beanie']) {
    for (const weight of ['thin','heavy']) for (const quantity of [1,2]) {
      const n=normalizeItem({...selected(id,quantity,{color:'white',weight}),packSize:99,unitCents:1});
      assert.equal(n.ok,true,id);
      assert.equal(n.item.packSize,undefined);
      assert.equal(priceCart([n.item]).subtotalCents,(weight==='heavy'?5500:5000)*quantity);
      assert.equal(unitsFor(n.item),quantity);
      assert.doesNotMatch(describeItem(n.item).title,/pack/i);
    }
    assert.equal(normalizeItem(selected(id,1,{color:'white'})).item.options.weight,'thin');
    assert.equal(normalizeItem(selected(id,1,{color:'white',weight:'invalid'})).ok,false);
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

test('actual Netlify checkout charges single headwear and Daily Apple packs correctly', async () => {
  const store=new MemoryStore();
  await store.set('capacity',{slots:{
    'studio:accessory-headband-black':{limit:10,used:0,reserved:0,open:true},
    'studio:accessory-skully-white':{limit:10,used:0,reserved:0,open:true},
    'studio:daily-apple-3-pack':{limit:10,used:0,reserved:0,open:true},
    'studio:accessory-trucker-cobalt':{limit:10,used:0,reserved:0,open:true}
  }});
  const env={CONTEXT:'deploy-preview',LAB_PREVIEW:'true',LAB_SESSION_SECRET:'accessory-pack-test-'.repeat(3),LAB_PAYMENT_PROVIDER:'test-gateway',LAB_ALLOW_TEST_GATEWAY:'true'};
  const lab=createLab({store,env,artworkPool:[]});
  const items=[selected('accessory-headband-black',2,{color:'black',weight:'heavy'}),selected('accessory-skully-white',1,{color:'white',weight:'heavy'}),selected('daily-apple-3-pack',1,{size:'L',color:'white'}),selected('accessory-trucker-cobalt',1,{style:'trucker',colors:{front:'#ffffff',brim:'#123456',mesh:'#ffffff'},picks:[]})];
  const result=await lab.checkout({items:items.map(item=>({...item,unitCents:1,packSize:99})),idempotencyKey:'accessory_pack_quote_20261116',origin:'https://fixture.invalid'});
  const {value:order}=await store.get('orders/'+result.orderId);
  assert.equal(order.subtotalCents,27500);
  assert.deepEqual(order.items.map(item=>({price:item.unitCents,quantity:item.quantity,units:item.units})),[
    {price:6500,quantity:2,units:2},{price:5500,quantity:1,units:1},{price:4500,quantity:1,units:3},{price:4500,quantity:1,units:1}
  ]);
  assert.deepEqual(order.reservation.needs.slots,{'studio:accessory-headband-black':2,'studio:accessory-skully-white':1,'studio:daily-apple-3-pack':1,'studio:accessory-trucker-cobalt':1});
  assert.equal(order.payment.status,'pending');
});
