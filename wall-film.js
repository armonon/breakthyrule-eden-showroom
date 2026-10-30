'use strict';
// Project video pixels through the same camera as the physical screen.
// Keeping the player behind a depth-tested WebGL cutout preserves occlusion.
window.wallFilmMatrix = function wallFilmMatrix(T, camera, film, width, height) {
  const c=Math.cos(film.rotationY||0),s=Math.sin(film.rotationY||0);
  const model=new T.Matrix4().set(
    c*film.width/960,0,s,film.x-c*film.width/2,
    0,-film.height/540,0,film.y+film.height/2,
    -s*film.width/960,0,c,film.z+s*film.width/2,
    0,0,0,1);
  const viewport=new T.Matrix4().set(width/2,0,0,width/2,0,-height/2,0,height/2,0,0,1,0,0,0,0,1);
  return viewport.multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(model);
};
window.createWallFilm = function createWallFilm(T, stage, film, reducedMotion, onStatus=()=>{}) {
  const surface=document.createElement('div');surface.className='wall-film';surface.style.visibility='hidden';
  const video=document.createElement('video');
  video.width=960;video.height=540;video.tabIndex=-1;
  video.setAttribute('aria-label','Break Thy Rule moving signal');
  video.muted=true;video.defaultMuted=true;video.playsInline=true;video.controls=false;
  video.preload='auto';video.poster='/assets/og-default.jpg';
  surface.appendChild(video);stage.prepend(surface);
  let destroyed=false,interactive=false,playbackRequested=false,ready=false;
  const start=53;
  function report(status){if(!destroyed)onStatus(status);}
  function play(){
    if(destroyed||document.hidden)return;
    const promise=video.play();
    promise?.catch(error=>{if(!destroyed&&error.name!=='AbortError')report(error.name==='NotAllowedError'?'blocked':'unavailable');});
  }
  function playWithSound(){
    playbackRequested=true;video.muted=false;if(video.volume===0)video.volume=.7;play();
  }
  function metadata(){video.currentTime=Number.isFinite(video.duration)&&video.duration>start?start:0;}
  function canPlay(){ready=true;clearTimeout(loadTimer);report('ready');}
  function ended(){metadata();play();}
  function failed(){clearTimeout(loadTimer);report('unavailable');}
  function visibility(){if(document.hidden)video.pause();else if(!reducedMotion||playbackRequested)play();}
  video.addEventListener('loadedmetadata',metadata);
  video.addEventListener('canplay',canPlay);
  video.addEventListener('playing',canPlay);
  video.addEventListener('ended',ended);
  video.addEventListener('error',failed);
  document.addEventListener('visibilitychange',visibility);
  const loadTimer=setTimeout(()=>{if(!ready)report('unavailable');},20000);
  video.src='/bg-firefly-boom.mp4';video.load();
  if(!reducedMotion)play();
  const center=new T.Vector3(film.x,film.y,film.z),view=new T.Vector3();
  const normal=new T.Vector3(Math.sin(film.rotationY||0),0,Math.cos(film.rotationY||0));
  return {
    update(camera) {
      view.copy(center).applyMatrix4(camera.matrixWorldInverse);
      const visible=normal.dot(new T.Vector3().subVectors(camera.position,center))>.05 && view.z < -.1;
      surface.style.visibility=visible?'visible':'hidden';
      if(!visible)return;
      const matrix=window.wallFilmMatrix(T,camera,film,stage.clientWidth,stage.clientHeight);
      const e=matrix.elements;
      if([[0,0],[960,0],[0,540],[960,540]].some(([x,y])=>e[3]*x+e[7]*y+e[15]<.05)){
        surface.style.visibility='hidden';return;
      }
      surface.style.transform='matrix3d('+e.join(',')+')';
    },
    playWithSound,
    setInteractive(active){
      const leaving=interactive&&!active;interactive=active;
      video.tabIndex=active?0:-1;video.controls=active;
      if(!active){video.muted=true;if(leaving&&(!reducedMotion||playbackRequested))play();}
    },
    destroy(){
      destroyed=true;clearTimeout(loadTimer);document.removeEventListener('visibilitychange',visibility);
      video.removeEventListener('loadedmetadata',metadata);video.removeEventListener('canplay',canPlay);
      video.removeEventListener('playing',canPlay);video.removeEventListener('ended',ended);video.removeEventListener('error',failed);
      video.pause();video.removeAttribute('src');video.load();surface.remove();
    }
  };
};
