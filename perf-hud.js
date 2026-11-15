'use strict';
// Frame-time overlay for finding stutter on a real machine. F8 (or ?perf=1) toggles it.
// It graphs the last 4 s of frames and names each spike (> 25 ms) by what changed during that frame:
// "shader compile" (new GPU programs), "texture upload" (new textures), "geometry", "resolution change",
// "GC" (the JS heap shrank by > 4 MB). "Copy report" puts the last spikes and the renderer totals on the clipboard.
//   const hud=createPerfHud({renderer,quality});  every frame, after rendering: hud.frame(time)
(function(root){
 root.createPerfHud=function({renderer,quality=null,host=document.body,key='F8'}={}){
  let on=/[?&]perf=1/.test(location.search),el=null,canvas=null,ctx=null,text=null,last=0,prev=null;
  const times=new Float32Array(240);let head=0;const spikes=[];
  function snapshot(){const i=renderer.info;return {programs:i.programs?.length||0,textures:i.memory.textures,geometries:i.memory.geometries,ratio:renderer.getPixelRatio(),heap:performance.memory?.usedJSHeapSize||0};}
  function build(){
   el=document.createElement('div');el.id='perf-hud';el.setAttribute('aria-hidden','true');
   el.style.cssText='position:fixed;right:10px;bottom:10px;z-index:9999;width:300px;padding:8px;background:rgba(6,8,9,.82);color:#e8e4d8;font:11px/1.35 ui-monospace,Menlo,monospace;border-radius:8px;pointer-events:auto;backdrop-filter:blur(6px)';
   el.innerHTML='<canvas width="284" height="60" style="width:284px;height:60px;display:block"></canvas><pre style="margin:6px 0 4px;white-space:pre-wrap"></pre><button type="button" style="font:inherit;background:#e8e4d8;color:#111;border:0;border-radius:4px;padding:3px 8px;cursor:pointer">Copy report</button>';
   host.append(el);canvas=el.querySelector('canvas');ctx=canvas.getContext('2d');text=el.querySelector('pre');
   el.querySelector('button').onclick=()=>{navigator.clipboard?.writeText(JSON.stringify(report(),null,1)).catch(()=>{});};
  }
  function report(){const i=renderer.info;return {when:new Date().toISOString(),ua:navigator.userAgent,quality:quality?.inspect?.()||null,render:{calls:i.render.calls,triangles:i.render.triangles},...snapshot(),spikes:spikes.slice(-20)};}
  addEventListener('keydown',e=>{if(e.key===key){on=!on;if(el)el.hidden=!on;}});
  return {
   frame(time){
    const now=snapshot(),dt=last?time-last:16.7;last=time;times[head]=dt;head=(head+1)%times.length;
    if(prev&&dt>25){const why=[];if(now.programs>prev.programs)why.push('shader compile x'+(now.programs-prev.programs));if(now.textures>prev.textures)why.push('texture upload x'+(now.textures-prev.textures));
     if(now.geometries>prev.geometries+2)why.push('geometry +'+(now.geometries-prev.geometries));if(now.ratio!==prev.ratio)why.push('resolution '+prev.ratio+'→'+now.ratio);if(prev.heap-now.heap>4e6)why.push('GC '+((prev.heap-now.heap)/1048576).toFixed(0)+'MB');
     spikes.push({ms:Math.round(dt),at:Math.round(time/100)/10,why:why.length?why:['main thread or GPU (unlabelled)']});if(spikes.length>60)spikes.shift();}
    prev=now;if(!on)return;if(!el)build();
    // graph: 16.7 ms and 33 ms lines, bars per frame
    ctx.clearRect(0,0,284,60);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(0,60-16.7*1.2,284,1);ctx.fillRect(0,60-33.3*1.2,284,1);
    for(let k=0;k<times.length;k++){const v=times[(head+k)%times.length];if(!v)continue;ctx.fillStyle=v>33?'#ff5a3d':v>20?'#ffc23d':'#8fd18a';const h=Math.min(60,v*1.2);ctx.fillRect(k*284/times.length,60-h,1.2,h);}
    if(time-(text.dataset.t||0)>250){text.dataset.t=time;let sum=0,n=0,worst=0;for(const v of times)if(v){sum+=v;n++;worst=Math.max(worst,v);}
     const i=renderer.info;text.textContent=`${(1000/(sum/n||16.7)).toFixed(0)} fps · avg ${(sum/n).toFixed(1)} ms · worst ${worst.toFixed(0)} ms\ncalls ${i.render.calls} · tris ${(i.render.triangles/1000).toFixed(0)}k · ratio ${now.ratio}\nprograms ${now.programs} · textures ${now.textures} · geos ${now.geometries}\n`+spikes.slice(-4).reverse().map(s=>`${s.ms}ms @${s.at}s ${s.why.join(', ')}`).join('\n');}
   },
   report,inspect:()=>({on,spikes:spikes.slice(-10)})
  };
 };
})(window);
