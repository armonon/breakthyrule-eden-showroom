import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpeditionService,loadExpeditionEngine} from './expedition.mjs';
import {normalizeCharacter} from './character.mjs';
const person=id=>({id,name:'Player '+id,character:{version:1,height:175}});
function fixture(options={}){
 let now=0;const engines=[];
 function createEngine(){let state={phase:'lobby',players:[],collected:[],chat:[]};const commands=[];
  const engine={commands,command(data,id){commands.push({data,id});if(['create','solo','join'].includes(data.action))state.players.push({id:data.id,name:data.name,character:data.character,characterRevision:data.characterRevision,status:'alive'});if(data.action==='start')state.phase='playing';if(data.action==='leave')state.players=state.players.filter(p=>p.id!==id);if(data.action==='chat')state.chat.push({name:state.players.find(p=>p.id===id).name,text:data.text});},snapshot:()=>structuredClone(state),tick(){},setStatus(id,status){state.players.find(p=>p.id===id).status=status;}};engines.push(engine);return engine;}
 const service=createExpeditionService({clock:()=>now,createEngine,...options});return {service,engines,advance(seconds){now+=seconds;service.tick();}};
}
test('private rooms require a signed-in saved character before admission or duplicate return',()=>{
 const {service}=fixture();for(const action of ['create','join','solo'])assert.throws(()=>service.command({action,code:'ABCDEF'}),{status:401});
 for(const character of [null,[],{version:1,height:999},{version:1,modelURL:'external'}])assert.throws(()=>service.command({action:'create'},{user:{id:'a',character}}),{status:400});
 assert.deepEqual(service.stats(),{rooms:0,players:0});const user=person('a');service.command({action:'create'},{user});user.character=null;assert.throws(()=>service.command({action:'create'},{user}),{status:400});service.close();
});
test('six signed-in slots, normalized codes, private tokens and server identity',()=>{
 const {service}=fixture(),user=person('a'),host=service.command({action:'create',id:'forged',name:'forged'},{user});assert.equal(host.selfId,'a');assert.match(host.token,/^[a-f0-9]{64}$/);
 for(let i=0;i<5;i++)service.command({action:'join',code:host.code.toLowerCase()},{user:person('b'+i)});
 assert.throws(()=>service.command({action:'join',code:host.code},{user:person('overflow')}),{status:409});const state=service.command({action:'sync',token:host.token},{user});assert.equal(state.players.length,6);assert.ok(state.players.every(p=>!p.token));service.close();assert.deepEqual(service.stats(),{rooms:0,players:0});
});
test('membership is cookie-bound and character edits do not alter the frozen run appearance',()=>{
 const {service,engines}=fixture(),user=person('a'),host=service.command({action:'create'},{user});
 assert.throws(()=>service.command({action:'pose',token:host.token}),{status:401});assert.throws(()=>service.command({action:'resume',token:host.token},{user:person('other')}),{status:401});
 const frozen=host.players[0];assert.deepEqual(frozen.character,normalizeCharacter(user.character));assert.match(frozen.characterRevision,/^[a-f0-9]{64}$/);user.character.height=210;
 const duplicate=service.command({action:'create'},{user});assert.equal(duplicate.token,host.token);assert.deepEqual(duplicate.players[0].character,frozen.character);assert.equal(duplicate.players[0].characterRevision,frozen.characterRevision);
 service.command({action:'pose',token:host.token,id:'other',status:'escaped',pose:{x:0,z:0,y:0}},{user});assert.equal(engines[0].commands.at(-1).id,'a');assert.equal(engines[0].commands.at(-1).data.id,undefined);service.close();
});
test('reconnect replaces stream without stale close disconnecting replacement',()=>{
 const {service,engines,advance}=fixture(),user=person('a'),host=service.command({action:'create'},{user});let closes=0,sent=0;
 const old=service.subscribe(host.token,user,()=>sent++,()=>closes++),current=service.subscribe(host.token,user,()=>sent++,()=>closes++);old();assert.equal(engines[0].commands.at(-1).data.action,'reconnect');assert.equal(closes,1);advance(.2);assert.equal(sent,3);current();assert.equal(engines[0].commands.at(-1).data.action,'disconnect');advance(30);assert.equal(service.command({action:'resume',token:host.token},{user}).selfId,host.selfId);advance(61);assert.deepEqual(service.stats(),{rooms:0,players:0});assert.throws(()=>service.command({action:'resume',token:host.token},{user}),{status:401});
});
test('room capacity, chat bounds, invalid payloads and late joins remain enforced',()=>{
 const {service}=fixture({maxRooms:1}),user=person('a'),host=service.command({action:'create'},{user}),command=data=>service.command({...data,token:host.token},{user});
 assert.throws(()=>service.command({action:'create'},{user:person('b')}),{status:503});assert.throws(()=>service.command(null),{status:400});command({action:'chat',text:'a'.repeat(500)});assert.equal(command({action:'sync'}).chat[0].text.length,280);for(let i=0;i<7;i++)command({action:'chat',text:'Hi'});assert.throws(()=>command({action:'chat',text:'flood'}),{status:429});command({action:'start'});assert.throws(()=>service.command({action:'join',code:host.code},{user:person('b')}),{status:409});assert.throws(()=>command({action:'impersonate'}),{status:400});service.close();
});
test('stream authorization expiry and bounded output cadence',()=>{
 const {service,advance}=fixture(),user=person('a'),host=service.command({action:'create'},{user});let valid=true,sent=0,closed=0;service.subscribe(host.token,user,()=>sent++,()=>closed++,()=>valid);advance(.01);advance(.01);advance(.01);assert.equal(sent,2);valid=false;advance(.2);assert.equal(closed,1);service.close();
});
test('a delayed old stream close cannot disconnect an explicit resume',()=>{
 const {service,engines}=fixture(),user=person('a'),host=service.command({action:'create'},{user});let closed=0;const old=service.subscribe(host.token,user,()=>{},()=>closed++);service.command({action:'resume',token:host.token},{user});assert.equal(closed,1);old();assert.equal(engines[0].commands.at(-1).data.action,'reconnect');service.close();
});
test('result callbacks are once per account per room; chat nonce is scoped per account',()=>{
 const results=[],{service,engines,advance}=fixture({onResult:(id,result)=>results.push({id,...result})}),user=person('a'),other=person('b'),host=service.command({action:'create'},{user}),peer=service.command({action:'join',code:host.code},{user:other});
 service.command({action:'chat',token:host.token,text:'Hello',nonce:'same'},{user});service.command({action:'chat',token:host.token,text:'Retry',nonce:'same'},{user});service.command({action:'chat',token:peer.token,text:'Another player',nonce:'same'},{user:other});assert.equal(service.command({action:'sync',token:host.token},{user}).chat.length,2);engines[0].setStatus(host.selfId,'escaped');advance(.2);advance(.2);assert.deepEqual(results,[{id:'a',status:'escaped',pages:0}]);service.close();
});
test('real shared core: six saved characters, readiness, leader succession and reconnect',()=>{
 let now=10;const service=createExpeditionService({createEngine:loadExpeditionEngine(),clock:()=>now}),users=Array.from({length:7},(_,i)=>person('account-'+i));
 const party=[service.command({action:'create'},{user:users[0]})];for(let i=1;i<6;i++)party.push(service.command({action:'join',code:party[0].code},{user:users[i]}));
 const command=(i,data)=>service.command({...data,token:party[i].token},{user:users[i]});assert.throws(()=>service.command({action:'join',code:party[0].code},{user:users[6]}),{status:409});assert.throws(()=>command(1,{action:'start'}),/host/);assert.throws(()=>command(0,{action:'start'}),/ready/);for(let i=0;i<6;i++)command(i,{action:'ready',ready:true});const started=command(0,{action:'start'});assert.equal(started.players.length,6);assert.equal(started.phase,'playing');assert.throws(()=>command(1,{action:'ring-bell'}),/leader|host/);
 const unsubscribe=service.subscribe(party[1].token,users[1],()=>{},()=>{});unsubscribe();assert.equal(command(0,{action:'sync'}).players.find(p=>p.id===party[1].selfId).connected,false);now+=5;service.tick();const reconnected=command(1,{action:'resume'});assert.equal(reconnected.selfId,party[1].selfId);assert.equal(reconnected.players.find(p=>p.id===party[1].selfId).connected,true);command(0,{action:'leave'});assert.equal(command(1,{action:'sync'}).host,party[1].selfId);now+=61;service.tick();assert.deepEqual(service.stats(),{rooms:0,players:0});
});
