// Small event-driven DOM fixture for input ownership. It does not emulate layout,
// native browser gestures, WebGL or physical device performance.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

export function mobileFixture(script){
 const timers=new Map(),observers=[];let serial=0;
 class Classes{constructor(){this.values=new Set();}add(...names){names.forEach(n=>this.values.add(n));}remove(...names){names.forEach(n=>this.values.delete(n));}contains(n){return this.values.has(n);}toggle(n,on=!this.contains(n)){on?this.add(n):this.remove(n);return on;}}
 class Node extends EventTarget{
  constructor(tag='div'){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.classList=new Classes();this.style={};this.hidden=false;this.disabled=false;this.open=false;this.textContent='';this.captures=new Set();this.rect={left:0,top:0,x:0,y:0,width:112,height:112};}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.classList=new Classes(),this.classList.add(...v.split(/\s+/));if(k==='id')this.id=v;}
  getAttribute(k){return this.attributes[k]??null;}
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
  set innerHTML(html){this.children=[];const stack=[this];for(const m of html.matchAll(/<\/?([\w-]+)([^>]*)>/g)){if(m[0][1]==='/'){if(stack.length>1)stack.pop();continue;}const n=new Node(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))n.setAttribute(a[1],a[2]??'');n.hidden='hidden'in n.attributes;stack.at(-1).append(n);if(!/^(input|br|path|circle|rect)$/.test(m[1])&&!m[0].endsWith('/>'))stack.push(n);}}
  matches(s){if(s==='dialog[open]')return this.tagName==='DIALOG'&&this.open;if(s.includes(':not([hidden])'))return !this.hidden&&this.matches(s.split(':')[0]);if(s.startsWith('#'))return this.id===s.slice(1);if(s.startsWith('.'))return this.classList.contains(s.slice(1));const attr=s.match(/^\[([^=]+)="([^"]+)"\]$/);if(attr)return this.attributes[attr[1]]===attr[2];return this.tagName===s.toUpperCase();}
  querySelectorAll(s){const out=[];for(const n of this.children){if(s.split(',').some(p=>n.matches(p.trim())))out.push(n);out.push(...n.querySelectorAll(s));}return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  getBoundingClientRect(){return {...this.rect,right:this.rect.left+this.rect.width,bottom:this.rect.top+this.rect.height};}
  setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
  showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}
  click(){if(!this.disabled)this.onclick?.({detail:0});}
 }
 const document=new Node('document');document.body=new Node('body');document.append(document.body);document.hidden=false;document.createElement=tag=>new Node(tag);document.getElementById=id=>document.querySelector('#'+id);
 const root=new Node('window'),media=new Node();media.matches=true;root.visualViewport=new Node();
 class KeyboardEvent extends Event{constructor(type,options={}){super(type,{bubbles:true,cancelable:true});for(const [k,v]of Object.entries(options))if(k!=='bubbles')Object.defineProperty(this,k,{value:v});}}
 const context=vm.createContext({window:root,document,matchMedia:()=>media,AbortController,KeyboardEvent,performance:{now:()=>1000},console,
  setInterval:fn=>(timers.set(++serial,fn),serial),clearInterval:id=>timers.delete(id),setTimeout:fn=>(timers.set(++serial,fn),serial),clearTimeout:id=>timers.delete(id),
  MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.fn=()=>{};}}});
 vm.runInContext(readFileSync(new URL('../../'+script,import.meta.url),'utf8'),context);
 const emit=(node,type,options={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'touch',button:0,buttons:1,clientX:56,clientY:56,isPrimary:true,detail:1,...options});node.dispatchEvent(e);node['on'+type]?.(e);return e;};
 return {root,document,media,Node,emit,tick(){for(const fn of [...timers.values()])fn();},mutate(){observers.forEach(o=>o.fn());}};
}
