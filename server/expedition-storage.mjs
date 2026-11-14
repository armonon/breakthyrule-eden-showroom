// A private single-host checkpoint store. Never put this directory under a web root.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

export function openExpeditionStorage(directory) {
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,'rooms.json'),lock=path.join(directory,'writer.lock');
  const owner=crypto.randomUUID();let released=false;
  try {const fd=fs.openSync(lock,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({owner,pid:process.pid,host:os.hostname()}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  catch(error){if(error.code==='EEXIST')throw Error('Expedition storage is locked by another writer or an unclean shutdown. Stop all writers and verify ownership before removing writer.lock.');throw error;}
  function owns(){if(released)throw Error('Expedition storage is closed.');let actual;try{actual=JSON.parse(fs.readFileSync(lock,'utf8'));}catch{throw Error('Expedition storage ownership was lost.');}if(actual.owner!==owner)throw Error('Expedition storage ownership was lost.');}
  function close(){if(released)return;owns();fs.unlinkSync(lock);released=true;}
  function read(){owns();if(!fs.existsSync(file))return null;const stat=fs.statSync(file);if(stat.size>32*1024*1024)throw Error('Expedition checkpoint is too large.');return JSON.parse(fs.readFileSync(file,'utf8'));}
  function write(value){owns();const temporary=file+'.'+owner+'.tmp';let fd;
    try{fd=fs.openSync(temporary,'w',0o600);fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;owns();fs.renameSync(temporary,file);
      const directoryFD=fs.openSync(directory,'r');try{fs.fsyncSync(directoryFD);}finally{fs.closeSync(directoryFD);}
    }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  return {read,write,close};
}
