import test from 'node:test';
import assert from 'node:assert/strict';
import { garmentSizes, garmentSizeGuide, SHAKA_CHARTS, GARMENT_CHART_IDS } from '../../labkit/sizing.mjs';
import { normalizeItem } from '../../labkit/pricing.mjs';

const blank = { product:'garment',construction:'canvas',labMode:'blank',garment:'tee',size:'M',fit:'blank',color:'black',artwork:'artists-choice',quantity:1 };
test('Shaka checkout rejects unsupported XS while custom and mystery sizes remain separate', () => {
  assert.equal(normalizeItem({ ...blank,size:'XS' }).ok, false);
  assert.equal(normalizeItem({ ...blank,size:'XXL' }).ok, true);
  assert.equal(normalizeItem({ ...blank,construction:'cut-sew',labMode:'cut-sew',fit:'regular',size:'XS' }).ok,true);
  assert.equal(normalizeItem({product:'mystery-pack',package:'one-tee',fit:'regular',size:'XS',quantity:1}).ok,true);
});
test('size choices match the published supplier references and Cut & Sew has no borrowed chart', () => {
  const guide=garmentSizeGuide({ construction:'cut-sew',garment:'tee' });
  assert.equal(guide.href,null);
  assert.match(guide.note,/No Cut & Sew size chart/);
  assert.ok(garmentSizes({construction:'cut-sew'}).includes('XS'));
  const byId=new Map(SHAKA_CHARTS.map(c=>[c.id,c]));
  for(const [garment,ids] of Object.entries(GARMENT_CHART_IDS)) for(const id of ids){
    const chart=byId.get(id);assert.ok(chart,id);
    assert.deepEqual(chart.sizes,garmentSizes({construction:'canvas',garment}));
    for(const row of chart.rows){assert.equal(row.values.length,chart.sizes.length);assert.ok(row.values.every(v=>Number(v)>0));}
  }
  const pants=SHAKA_CHARTS.find(c=>c.id.includes('baggy-sweatpants'));
  assert.ok(!pants.rows.some(r=>r.label==='Inseam'),'ambiguous supplier measurement must not be silently relabeled');
});
