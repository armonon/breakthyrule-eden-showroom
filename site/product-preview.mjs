import { GRAPHIC_COLORS } from '/labkit/product-options.mjs';
const looks=new WeakMap();
export function tintProductDesign(root,color,design,graphic='Red',customColor=''){
 const T=window.THREE;if(!root||!T)return;
 if(design?.core&&window.BTRCoreCycle){let a=looks.get(root);if(!a){a=window.BTRCoreCycle.appearance(root,color==='white'?'white':'black');looks.set(root,a);}a.apply(color==='white'?'white':'black',Math.max(0,GRAPHIC_COLORS.indexOf(graphic)));}
 const fabric=color==='white'?'#eeeae0':color==='custom'&&CSS.supports('color',customColor)?customColor:color==='random'?'#a6a28f':'#151619';
 root.traverse(o=>{if(!o.isMesh)return;for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m&&(/^(Archive (fabric|rib knit|seams)|Core (fabric|rib knit|stitching))/i.test(m.name))){m.color.set(fabric);m.needsUpdate=true;}});
}
