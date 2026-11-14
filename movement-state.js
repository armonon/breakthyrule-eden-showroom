'use strict';
(function(root){
// Controller snapshots contain vectors and stable world references, never a copy
// of the district's height fields or browser objects. Both runtimes use this codec.
root.createMovementStateCodec=function({T,boxes=()=>[],fields=()=>[]}){
 const fail=()=>{throw Error('Invalid movement snapshot.');};
 function transform(input,decode){const boxList=boxes(),fieldList=fields();
 function walk(value,decode,depth=0){
  if(depth>20)fail();if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))fail();return value;}
  if(typeof value==='string'){if(value.length>128)fail();return value;}
  if(!value||typeof value!=='object')fail();
  if(!decode){if(value.isVector3)return {$vector:[value.x,value.y,value.z].map(n=>walk(n,false))};let i=boxList.indexOf(value);if(i>=0)return {$box:i};i=fieldList.indexOf(value);if(i>=0)return {$field:i};if(('minX' in value&&'maxX' in value&&'top' in value)||('cols' in value&&'h' in value))fail();}
  if(Array.isArray(value)){if(value.length>128)fail();return value.map(v=>walk(v,decode,depth+1));}
  const keys=Object.keys(value);if(keys.length>64||keys.some(k=>['__proto__','constructor','prototype'].includes(k)))fail();
  if(decode&&keys.some(k=>k.startsWith('$'))){if(keys.length!==1)fail();const key=keys[0],data=value[key];
   if(key==='$vector'){if(!Array.isArray(data)||data.length!==3||![0,1,2].every(i=>Number.isFinite(data[i])))fail();return new T.Vector3(...data);}
   const list=key==='$box'?boxList:key==='$field'?fieldList:null;if(!list||!Number.isSafeInteger(data)||data<0||data>=list.length)fail();return list[data];
  }
  const result={};for(const key of keys)result[key]=walk(value[key],decode,depth+1);return result;
 }
 return walk(input,decode);}
 return {encode:value=>transform(value,false),decode:value=>transform(value,true)};
};
})(typeof window==='object'?window:globalThis);
