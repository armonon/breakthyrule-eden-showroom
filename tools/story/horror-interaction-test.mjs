import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as T from 'three';

function chapter({milestones=['pages'],office=true,crowd=0}={}){
 const nodes=[],listeners=[],flags=new Set(milestones),cards=[];let modal=false,veils=0;
 class Node extends EventTarget{
  constructor(tag){super();this.tagName=tag.toUpperCase();this.attributes={};this.classList={add(){},remove(){}};}
  setAttribute(name,value){this.attributes[name]=String(value);}
 }
 const document={body:{append(node){nodes.push(node);},classList:{add(){},remove(){}}},createElement:tag=>new Node(tag),querySelector:()=>modal?new Node('dialog'):null,addEventListener:(type,fn,options)=>listeners.push({type,fn,options})};
 const scene=new T.Scene(),hall=new T.Group();hall.name='The masked gathering';scene.add(hall);
 for(let n=0;n<crowd;n++){const card=new T.Mesh(new T.PlaneGeometry(),new T.MeshBasicMaterial());card.name='Masked guest image card';card.position.set((n-1)*1.5,1.2,-4);card.scale.y=1.8;hall.add(card);}
 const cube=new T.Group();cube.name='Black box (inside)';scene.add(cube);
 const camera=new T.PerspectiveCamera();camera.position.set(0,1.7,0);
 const scope={console,document,localStorage:{getItem:()=>null,setItem(){}},setTimeout,clearTimeout,Promise,edenStory:{has:id=>flags.has(id),set(id){const fresh=!flags.has(id);flags.add(id);return fresh;}}};scope.window=scope;vm.createContext(scope);
 vm.runInContext(fs.readFileSync(new URL('../../horror-chapter.js',import.meta.url),'utf8'),scope);
 const worlds={card(...args){cards.push(args);},chapter:async()=>({sealed:'Keys required'}),loading:()=>false,veil(){veils++;return new Promise(()=>{});}};
 const game=scope.createHorrorChapter({T,scene,camera,garden:{nightBuilt:()=>true,pyramid:{gathering:{inspect:()=>({inside:office})}}},pockets:{inside:()=>null},worlds,battle:()=>({hurtPlayer(){}}),playerBody:{model:()=>null},requestDraw(){}});
 return {game,scene,hall,camera,flags,nodes,listeners,cards,get veils(){return veils;},set modal(value){modal=value;}};
}

test('the real office prompt is tappable and collects its single ticket once',()=>{
 const s=chapter();s.game.update(1.1);const prompt=s.nodes.find(n=>n.id==='horror-prompt');
 assert.equal(prompt.tagName,'BUTTON');assert.equal(prompt.type,'button');assert.equal(prompt.disabled,false);assert.equal(prompt.attributes['aria-label'],'TAKE THE TICKET');
 prompt.dispatchEvent(new Event('click',{cancelable:true}));
 assert.equal(s.flags.has('ticket'),true);assert.equal(s.game.inspect().ticket,false);
 assert.equal(s.game.interact(),false);assert.equal(s.cards.filter(c=>c[0]==='THE TICKET').length,1);
});

test('modal dialogs and typing do not consume a story interaction',()=>{
 const s=chapter();s.game.update(1.1);s.modal=true;assert.equal(s.game.interact(),false);s.modal=false;
 const key=s.listeners.find(l=>l.type==='keydown');assert.equal(key.options,true);
 key.fn({key:'f',repeat:false,target:{tagName:'INPUT'}});assert.equal(s.flags.has('ticket'),false);
 let cancelled=0;key.fn({key:'f',repeat:false,target:{tagName:'DIV'},preventDefault(){cancelled++;},stopPropagation(){cancelled++;}});
 assert.equal(s.flags.has('ticket'),true);assert.equal(cancelled,2);
});

test('the cube remains gated and repeated touch activation opens only one transition',()=>{
 const locked=chapter({milestones:[],office:false});locked.camera.position.set(71.7,1.7,0);locked.game.update(.1);
 assert.equal(locked.game.interact(),false);assert.equal(locked.veils,0);assert.equal(locked.flags.has('cube'),false);
 const open=chapter({milestones:['keys'],office:false});open.camera.position.set(71.7,1.7,0);open.game.update(.1);
 const prompt=open.nodes.find(n=>n.id==='horror-prompt');prompt.dispatchEvent(new Event('click',{cancelable:true}));
 assert.equal(open.game.interact(),true);assert.equal(open.veils,1);assert.equal(open.flags.has('cube'),true);
});

test('shooting the actual masked crowd triggers the showdown and leaves collectible cube keys',()=>{
 const s=chapter({crowd:3});s.game.update(1.1);
 for(const figure of [...s.hall.children].filter(n=>n.name==='Masked guest image card')){
  const origin=s.camera.position.clone(),direction=figure.getWorldPosition(new T.Vector3()).sub(origin).normalize();
  const hit=s.game.shotHook(origin,direction,20);assert.ok(hit);assert.equal(hit.apply(50,{head:true}).killed,true);
 }
 s.game.update(.1);assert.equal(s.flags.has('showdown'),true);assert.equal(s.game.inspect().alive,0);assert.equal(s.game.inspect().keysOut,14);
 const key=s.scene.children.find(n=>n.isGroup&&n.children.some(c=>c.geometry?.type==='TorusGeometry'));
 assert.ok(key);s.camera.position.copy(key.position);s.camera.position.y=1.6;s.game.update(.1);
 assert.equal(s.flags.has('keys'),true);assert.ok(s.game.inspect().keyCount>0);
});
