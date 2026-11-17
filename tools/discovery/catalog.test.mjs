import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildDiscoveryCatalog, createDiscoveryScheduler, curatedDiscoveryPicks, DISCOVERY_GRAPHICS, DISCOVERY_WEIGHTS} from '../../site/discovery-catalog.mjs';
import * as labCatalog from '../../labkit/catalog.mjs';
import {normalizeItem, priceItem, sidesFor} from '../../labkit/pricing.mjs';
import {ARTWORK_POOL} from '../../labkit/artwork-pool.mjs';
import {mulberry32} from '../../labkit/random.mjs';
import {randomProductDesign} from '../../site/lab-product-route.mjs';

const root = new URL('../../', import.meta.url), scope = {};
for (const path of ['garment-catalog.js','core-collection/catalog.js','accessory-collection/catalog.js','btr-belts/catalog.js']) {
  vm.runInNewContext(fs.readFileSync(new URL(path, root),'utf8'),{window:scope});
}
const pendants=JSON.parse(fs.readFileSync(new URL('pendant-collection/catalog.json',root),'utf8'));
const catalog=await buildDiscoveryCatalog({scope,labCatalog,pendants});
const artPool=ARTWORK_POOL.map(art=>art.id);

test('every current accessory and metal product has a real model, price and product link',()=>{
  assert.equal(new Set(catalog.map(item=>item.id)).size,catalog.length);
  for(const source of [...scope.BTR_ACCESSORIES,...scope.BTR_BELTS]) {
    const item=catalog.find(item=>item.sourceItem.id===source.id);
    assert.ok(item,source.id);
    assert.ok(item.priceCents>0,source.id+' price');
    assert.match(item.href,/^\/product\?item=/);
    assert.ok(fs.existsSync(new URL(item.model.replace(/^\//,'').split('?')[0],root)),item.model);
  }
  assert.equal(catalog.filter(item=>item.category==='necklace').length,pendants.length);
  assert.equal(catalog.find(item=>item.id==='daily-apple-3-pack').priceCents,4500);
  assert.match(catalog.find(item=>item.id==='daily-apple-3-pack').model,/retail-bag-3/);
  const gloves=catalog.filter(item=>item.sourceItem.family==='gloves');
  assert.equal(gloves.length,1);assert.match(gloves[0].model,/gloves-white/);assert.equal(gloves[0].priceCents,3500);
  assert.ok(catalog.filter(item=>item.renderKind==='hat').every(item=>item.sourceItem.hatStyle==='trucker'&&item.sourceItem.defaultGraphic==='centaur'));
});

test('FW27 labels show the canonical Random to Cut and Sew ranges',()=>{
  const core=catalog.filter(item=>item.category==='core');assert.equal(core.length,6);
  for(const item of core){
    const kind=item.sourceId.replace('core-','');
    assert.match(item.name,/^FW27/);
    assert.deepEqual(item.priceRangeCents,[labCatalog.RANDOM_OFFERINGS[kind].priceCents,labCatalog.OFFERINGS['cut-sew'][kind].priceCents]);
    assert.match(item.priceText,/^\$\d+–\$\d+$/);
  }
});

test('new generated looks use only approved graphics and preserve exact Lab artwork through normalization',()=>{
  const seen=new Set();
  for(let seed=1;seed<=250;seed++)for(const garment of ['tee','hoodie','crewneck']){
    const picks=curatedDiscoveryPicks(seed,artPool);
    assert.deepEqual(picks,curatedDiscoveryPicks(seed,artPool));
    assert.equal(picks.front.length,1);assert.equal(picks.back.length,1);assert.notEqual(picks.front[0],picks.back[0]);
    for(const id of [...picks.front,...picks.back]){assert.ok(DISCOVERY_GRAPHICS.includes(id));seen.add(id);}
    const raw={product:'garment',construction:'canvas',garment,size:'M',fit:'blank',color:'random',artwork:'pick',picks,seed,quantity:1};
    const normalized=normalizeItem(raw,{artworkPool:artPool});assert.equal(normalized.ok,true);
    assert.deepEqual(sidesFor(normalized.item),picks);
    const pageRaw=randomProductDesign(new URLSearchParams({g:garment,seed:String(seed),art:'curated-1'}));
    const pageItem=normalizeItem({...pageRaw,size:'M'},{artworkPool:artPool});
    assert.equal(pageItem.ok,true);assert.deepEqual(sidesFor(pageItem.item),picks);
    const previous=normalizeItem({...raw,artwork:'random-experimental'},{artworkPool:artPool});
    assert.equal(previous.ok,true);assert.equal(priceItem(normalized.item).totalCents,priceItem(previous.item).totalCents);
  }
  assert.equal(seen.size,DISCOVERY_GRAPHICS.length);
});

test('existing seed-only garment links preserve their previous artwork while fresh links are curated',()=>{
  const legacy=randomProductDesign(new URLSearchParams({g:'hoodie',seed:'123'}));
  assert.equal(legacy.artwork,'random-experimental');assert.equal(legacy.seed,123);
  const fresh=randomProductDesign(new URLSearchParams(),{newSeed:()=>123});
  assert.equal(fresh.artwork,'pick');assert.deepEqual(fresh.picks,curatedDiscoveryPicks(123));
});

test('the rotation covers every product with nine catalog offers to one generated design',()=>{
  for(const seed of [1,42,20261117]){
    const scheduler=createDiscoveryScheduler(catalog,{random:mulberry32(seed),makeGenerated:({sequence})=>({id:'generated-'+sequence,origin:'generated'})});
    const firstAccessories=[];let previous;
    for(let batch=0;batch<400;batch++){
      const items=Array.from({length:10},()=>scheduler.next());
      assert.equal(items.filter(item=>item.origin==='generated').length,1);
      for(const item of items){assert.notEqual(item.id,previous);previous=item.id;if(item.category==='accessory'&&firstAccessories.length<5)firstAccessories.push(item.sourceItem.family);}
    }
    assert.equal(new Set(firstAccessories).size,5,'Every accessory shape appears before extra colorways');
    const stats=scheduler.stats();assert.equal(stats.uniqueCatalog,catalog.length);
    for(const [group,weight] of Object.entries(DISCOVERY_WEIGHTS))assert.equal(stats.groups[group],180*weight);
    assert.ok(stats.packages['one-tee']>stats.packages.outerwear);
  }
});
