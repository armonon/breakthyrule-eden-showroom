import {createExpeditionService,ExpeditionError} from './expedition.mjs';
import {loadExpeditionRuntime} from './expedition-runtime.mjs';
import {prepareExpeditionActor} from './expedition-actor.mjs';
import {openExpeditionStorage} from './expedition-storage.mjs';
import {characterRevision,normalizeCharacter} from './character.mjs';

export async function createInputExpeditionService(options={}){
 const maxRooms=options.maxRooms??4,maxActors=maxRooms*6,resources=new Map(),actors=new Map();
 const storage=options.storageDir?openExpeditionStorage(options.storageDir):null;
 let service,closed=false,queued=0,tail=Promise.resolve();
 try{
  const runtime=options.runtime||await loadExpeditionRuntime();
  async function prepare(id,character){if(resources.has(id)||actors.size+resources.size>=maxActors)throw new ExpeditionError(503,'Character capacity is full.');const appearance=normalizeCharacter(character),resource=await prepareExpeditionActor(runtime,appearance);resources.set(id,{resource,revision:characterRevision(appearance)});}
  function createActor(player,controller,world){const entry=resources.get(player.id);if(!entry||entry.revision!==characterRevision(player.character))throw Error('Authoritative character was not prepared.');resources.delete(player.id);const actor=entry.resource.attach({controller,world}),dispose=actor.dispose;actor.dispose=()=>{dispose();if(actors.get(player.id)===actor)actors.delete(player.id);};actors.set(player.id,actor);return actor;}
  const factory=engineOptions=>runtime.createEngine({...engineOptions,createActor});factory.protocolVersion=2;factory.worldRevision=runtime.revision.worldRevision;
  const saved=storage?.read(),wall=(options.wallClock||(()=>Date.now()/1000))();
  if(saved){if(saved.version!==1||!Array.isArray(saved.rooms)||saved.rooms.length>maxRooms)throw Error('Invalid authoritative room checkpoint.');
   for(const room of saved.rooms){if(!Array.isArray(room.members)||room.members.length>6)throw Error('Invalid authoritative room members.');if(!room.members.some(m=>m.expiresAt>wall))continue;
    if(room.engine?.version!==2||room.engine.worldRevision!==runtime.revision.worldRevision||!Array.isArray(room.engine.room?.players)||room.engine.room.players.length>6)throw Error('Room checkpoint uses another simulation build.');
    for(const p of room.engine.room.players)await prepare(p.id,p.character);
   }
  }
  service=createExpeditionService({...options,maxRooms,createEngine:factory,storageAdapter:storage,storageDir:null});
  async function command(data,context={}){
   if(closed)throw new ExpeditionError(503,'The expedition service is unavailable.');
   if(!['create','join','solo'].includes(data?.action))return service.command(data,context);
   if(queued>=6)throw new ExpeditionError(503,'Character entry is busy. Try again shortly.');queued++;
   const run=tail.then(async()=>{if(closed)throw new ExpeditionError(503,'The expedition service is unavailable.');const admission=service.prepareEntry(data,context),id=admission.user.id;
    try{if(admission.needsActor)await prepare(id,admission.user.character);if(closed)throw new ExpeditionError(503,'The expedition service is unavailable.');return service.command(data,{...context,user:admission.user,admitted:true});}
    finally{resources.get(id)?.resource.dispose();resources.delete(id);}
   });tail=run.catch(()=>{});try{return await run;}finally{queued--;}
  }
  return {...service,command,close(){if(closed)return;closed=true;service.close();for(const entry of resources.values())entry.resource.dispose();resources.clear();for(const actor of actors.values())actor.dispose();actors.clear();},stats:()=>({...service.stats(),physicalActors:actors.size,preparing:queued}),available:()=>({...service.available(),physicalCharacters:true,simulationHz:60,physicsHz:120})};
 }catch(error){service?.close();storage?.close();for(const entry of resources.values())entry.resource.dispose();for(const actor of actors.values())actor.dispose();throw error;}
}
