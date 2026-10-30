'use strict';
window.createSpinViewer=function createSpinViewer({element,textures,onAngle,onInteraction}) {
  const T=THREE, scene=new T.Scene(), renderer=new T.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xffffff);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden','true');element.appendChild(renderer.domElement);
  const camera=new T.PerspectiveCamera(35,1,.05,40);
  scene.add(new T.HemisphereLight(0xffffff,0x8d8583,2));
  const key=new T.DirectionalLight(0xffffff,2.8);key.position.set(-3,5,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.018;Object.assign(key.shadow.camera,{left:-2,right:2,top:2,bottom:-2});scene.add(key);
  const fill=new T.DirectionalLight(0xe6e9ff,1.3);fill.position.set(4,1,-4);scene.add(fill);
  const garment=new T.Group();scene.add(garment);
  const floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.ShadowMaterial({opacity:.10}));floor.rotation.x=-Math.PI/2;floor.position.y=-.96;floor.receiveShadow=true;scene.add(floor);
  let visible=false,auto=false,frame=0,last=0,yaw=.38,pitch=0,zoom=100,drag=null,angleReported=-1;
  const pointers=new Map();let pinch=null;
  function resize(){if(!visible)return;const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();request();}
  function request(){if(visible&&!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
  function draw(time){frame=0;if(!visible)return;const dt=Math.min((time-(last||time))/1000,.05);last=time;if(auto)yaw+=dt*.36;
    garment.rotation.set(pitch,yaw,0);const distance=Math.max(3.7,2.18/(2*Math.tan(camera.fov*Math.PI/360)*camera.aspect)) / (zoom/100);
    camera.position.set(0,.2,distance);camera.lookAt(0,.035,0);renderer.render(scene,camera);
    const degrees=(Math.round(yaw*180/Math.PI)%360+360)%360;if(degrees!==angleReported){angleReported=degrees;onAngle(degrees);}
    if(auto)request();else last=0;
  }
  function interact(){auto=false;onInteraction();}
  element.addEventListener('pointerdown',event=>{if(event.button!==0)return;interact();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});element.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,yaw,pitch};
    if(pointers.size===2){const p=[...pointers.values()];pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom};}
  });
  element.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2&&pinch){const p=[...pointers.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);const value=T.MathUtils.clamp(Math.round(pinch.zoom*distance/pinch.distance/25)*25,100,250);element.dispatchEvent(new CustomEvent('garmentzoom',{detail:value}));}
    else if(drag){yaw=drag.yaw+(event.clientX-drag.x)*.009;pitch=T.MathUtils.clamp(drag.pitch+(event.clientY-drag.y)*.006,-.42,.42);}request();
  });
  function release(event){pointers.delete(event.pointerId);pinch=null;drag=null;if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);if(pointers.size===1){const p=[...pointers.values()][0];drag={x:p.x,y:p.y,yaw,pitch};}}
  element.addEventListener('pointerup',release);element.addEventListener('pointercancel',release);
  element.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();interact();if(event.key==='ArrowLeft')yaw-=Math.PI/12;if(event.key==='ArrowRight')yaw+=Math.PI/12;if(event.key==='ArrowUp')pitch=Math.max(-.42,pitch-.1);if(event.key==='ArrowDown')pitch=Math.min(.42,pitch+.1);request();}});
  element.addEventListener('webglcontextlost',()=>element.dispatchEvent(new CustomEvent('viewerfailed')),{capture:true});
  new ResizeObserver(resize).observe(element);
  document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else request();});
  return {
    setModel(model){
      garment.clear();const copy=model.clone(true),size=new T.Vector3(...model.userData.size);
      const scale=1.8/Math.max(size.x,size.y,size.z);copy.scale.setScalar(scale);garment.add(copy);
      floor.position.y=-size.y*scale/2-.025;request();
    },
    show(){visible=true;angleReported=-1;resize();request();},
    hide(){visible=false;auto=false;last=0;if(frame)cancelAnimationFrame(frame);frame=0;},
    setZoom(value){zoom=value;request();},
    setAuto(value){auto=value;last=0;request();return auto;},
    isAuto:()=>auto,
    reset(){yaw=.38;pitch=0;zoom=100;auto=false;request();}
  };
};
