import fs from 'node:fs';
import crypto from 'node:crypto';
const schema=JSON.parse(fs.readFileSync(new URL('../character-schema.json',import.meta.url),'utf8'));
const keys=new Set(['version',...Object.keys(schema.numbers),...Object.keys(schema.colors),...Object.keys(schema.choices)]);
export function normalizeCharacter(value){
 const fail=()=>{const error=new Error('Save a valid character in Eden before entering a private expedition.');error.status=400;throw error;};
 if(!value||typeof value!=='object'||Array.isArray(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value))||value.version!==schema.version||Object.keys(value).some(k=>!keys.has(k)))fail();
 const result={version:schema.version},get=(key,s)=>Object.hasOwn(value,key)?value[key]:s.default;
 for(const [key,s] of Object.entries(schema.numbers)){const n=get(key,s);if(typeof n!=='number'||!Number.isFinite(n)||n<s.min||n>s.max)fail();result[key]=n;}
 for(const [key,s] of Object.entries(schema.colors)){const color=get(key,s);if(typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))fail();result[key]=color.toLowerCase();}
 for(const [key,s] of Object.entries(schema.choices)){const choice=get(key,s);if(typeof choice!=='string'||!Object.hasOwn(s.options,choice))fail();result[key]=choice;}
 return result;
}
export function characterRevision(character){return crypto.createHash('sha256').update(JSON.stringify(normalizeCharacter(character))).digest('hex');}
