import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const base=new URL('../../',import.meta.url),guard=readFileSync(new URL('game-input-guard.js',base),'utf8');
const entry=readFileSync(new URL('expedition-entry.js',base),'utf8');
const start=entry.indexOf("  listen(document,'keydown',event=>{if(event.defaultPrevented");
const end=entry.indexOf("  listen(document,'keyup'",start);
assert.ok(start>=0&&end>start,'actual entry movement listener is available');

function fixture(){
 const listeners=new Map(),windowListeners=new Map(),keys=new Set();
 const document={activeElement:null,addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);}};
 class Element{
  constructor(tag='div',{id='',classes=[],parent=null,editable=false}={}){this.tagName=tag.toUpperCase();this.id=id;this.classes=classes;this.parentElement=parent;this.isContentEditable=editable;this.attributes=new Map();this.focusCalls=[];}
  hasAttribute(name){return this.attributes.has(name);}
  get tabIndex(){return this.attributes.has('tabindex')?Number(this.attributes.get('tabindex')):-1;}
  set tabIndex(value){this.attributes.set('tabindex',String(value));}
  matches(selector){
   if(selector==='#scene canvas')return this.tagName==='CANVAS'&&!!this.parentElement?.closest('#scene');
   if(selector.startsWith('#'))return this.id===selector.slice(1);
   if(selector.startsWith('.'))return this.classes.includes(selector.slice(1));
   if(selector.startsWith('[contenteditable]'))return this.isContentEditable;
   if(selector.startsWith('['))return false;
   return this.tagName===selector.toUpperCase();
  }
  closest(selector){for(let node=this;node;node=node.parentElement)if(selector.split(',').some(s=>node.matches(s.trim())))return node;return null;}
  focus(options){this.focusCalls.push(options);if(this.hasAttribute('tabindex')||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(this.tagName)||this.isContentEditable)document.activeElement=this;}
 }
 let cleared=0;
 const scope={document,Element,window:{getSelection:()=>({isCollapsed:false,removeAllRanges(){cleared++;}}),addEventListener:(type,fn)=>windowListeners.set(type,fn)},
  listen:(target,type,fn)=>target.addEventListener(type,fn),ready:true,modalOpen:()=>false,bail:null,preferences:{get:()=>({sprintMode:'hold',crouchMode:'hold'})},keys,requestDraw(){}};
 vm.createContext(scope);vm.runInContext(guard,scope);vm.runInContext(entry.slice(start,end),scope);
 const world=new Element('section',{id:'world'}),scene=new Element('div',{id:'scene',parent:world}),canvas=new Element('canvas',{parent:scene}),button=new Element('button',{parent:world});
 document.activeElement=button;
 function dispatch(type,target,options={}){const event={target,button:0,pointerId:1,pointerType:'mouse',isPrimary:true,buttons:1,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...options};for(const fn of listeners.get(type)||[])fn(event);return event;}
 return {Element,document,world,scene,canvas,button,keys,dispatch,cleared:()=>cleared,
  press(key){return dispatch('keydown',document.activeElement,{key,repeat:false});}};
}

test('clicking the gameplay canvas after View restores focus and the actual movement key handler',()=>{
 const f=fixture();f.press('w');assert.equal(f.keys.has('w'),false,'focused buttons keep their native keyboard contract');
 const event=f.dispatch('pointerdown',f.canvas);
 assert.equal(event.defaultPrevented,true,'selection protection remains enabled');
 assert.equal(f.cleared(),1);assert.equal(f.document.activeElement,f.canvas);
 assert.equal(f.canvas.tabIndex,-1,'programmatic focus does not add a new Tab stop');
 assert.equal(f.canvas.focusCalls[0]?.preventScroll,true,'returning to play cannot scroll the page');
 f.press('w');assert.equal(f.keys.has('w'),true,'W now reaches the real movement listener');
});

test('returning to a canvas preserves an existing tabindex and deliberately leaves an input',()=>{
 const f=fixture(),input=new f.Element('input',{parent:f.world});input.focus();f.canvas.tabIndex=0;
 f.dispatch('pointerdown',f.canvas);
 assert.equal(f.document.activeElement,f.canvas);assert.equal(f.canvas.tabIndex,0);
 assert.equal(input.focusCalls.length,1);
});

test('pointer events inside editable controls or a dialog retain native focus and selection',()=>{
 const f=fixture();
 for(const tag of ['input','textarea','select']){
  const input=new f.Element(tag,{parent:f.world});input.focus();const event=f.dispatch('pointerdown',input);
  assert.equal(event.defaultPrevented,false);assert.equal(f.document.activeElement,input);
 }
 const editor=new f.Element('div',{editable:true,parent:f.world}),text=new f.Element('span',{parent:editor});editor.focus();
 assert.equal(f.dispatch('pointerdown',text).defaultPrevented,false);assert.equal(f.document.activeElement,editor);
 const dialog=new f.Element('dialog',{parent:f.world}),scene=new f.Element('div',{id:'scene',parent:dialog}),canvas=new f.Element('canvas',{parent:scene});
 assert.equal(f.dispatch('pointerdown',canvas).defaultPrevented,false);assert.equal(f.document.activeElement,editor);
 assert.equal(f.canvas.focusCalls.length,0);assert.equal(canvas.focusCalls.length,0);assert.equal(f.cleared(),0);
});

test('touch canvas/stick gestures retain selection protection without stealing keyboard focus',()=>{
 const f=fixture(),stick=new f.Element('div',{classes:['tc-stick'],parent:f.world});
 for(const target of [f.canvas,stick]){
  const down=f.dispatch('pointerdown',target,{pointerType:'touch'});
  assert.equal(down.defaultPrevented,true);assert.equal(f.document.activeElement,f.button);
  assert.equal(f.dispatch('pointermove',target,{pointerType:'touch'}).defaultPrevented,true);
  f.dispatch('pointerup',target,{pointerType:'touch'});
 }
 assert.equal(f.canvas.focusCalls.length,0);assert.equal(stick.focusCalls.length,0);
});

test('noncanvas gestures, secondary buttons and unrelated canvases cannot steal focus',()=>{
 const f=fixture(),stick=new f.Element('div',{classes:['tc-stick'],parent:f.world}),otherCanvas=new f.Element('canvas',{parent:f.world});
 for(const target of [f.button,f.world,stick,otherCanvas]){f.dispatch('pointerdown',target);assert.equal(f.document.activeElement,f.button);}
 f.dispatch('pointerdown',f.canvas,{button:2});assert.equal(f.document.activeElement,f.button);
 f.dispatch('pointerdown',f.canvas,{isPrimary:false});assert.equal(f.document.activeElement,f.button);
 assert.equal(f.canvas.focusCalls.length,0);
});
