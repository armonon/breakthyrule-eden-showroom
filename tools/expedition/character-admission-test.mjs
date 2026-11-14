import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCharacter,characterRevision} from '../../server/character.mjs';
test('saved appearance uses the actual creator schema with stable canonical defaults',()=>{
 const a=normalizeCharacter({version:1,height:145,shoulders:.8,skinTone:'#AbC123'});assert.equal(a.height,145);assert.equal(a.skinTone,'#abc123');assert.equal(a.character,'boulevard');
 const b=normalizeCharacter({version:1,height:210,shoulders:1.3});assert.equal(b.height,210);assert.equal(b.shoulders,1.3);assert.equal(characterRevision(a),characterRevision({...a}));assert.notEqual(characterRevision(a),characterRevision(b));
});
test('saved appearance rejects invalid records, dimensions, choices, colors and extensions',()=>{
 for(const value of [null,[],{version:2},{version:1,height:NaN},{version:1,height:Infinity},{version:1,height:'175'},{version:1,height:null},{version:1,height:211},{version:1,shoulders:2},{version:1,hairStyle:'injected'},{version:1,skinTone:'url(javascript:alert(1))'},{version:1,modelURL:'https://untrusted.invalid/model.glb'}])assert.throws(()=>normalizeCharacter(value),/valid character/);
});
