/* A transparent 360 turntable. The video stores RGB on its left half and
 * the original render's grayscale alpha on its right half. No chroma key. */
(() => {
  if (customElements.get('transparent-spin')) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pageActive=()=>window.showroomPageActive?.()??!document.hidden;
  const vertex = `attribute vec2 p; varying vec2 uv;
    void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
  const fragment = `precision mediump float; varying vec2 uv;
    uniform sampler2D movie; uniform vec2 size;
    void main(){
      float y=1.-uv.y;
      float x=clamp(uv.x,.5/size.x,1.-.5/size.x);
      vec3 rgb=texture2D(movie,vec2(x*.5,y)).rgb;
      float a=texture2D(movie,vec2(.5+x*.5,y)).r;
      // Remove sub-code-value compression noise in the empty background.
      a=clamp((a-.004)/.996,0.,1.);
      gl_FragColor=vec4(rgb,a);
    }`;
  class TransparentSpin extends HTMLElement {
    static get observedAttributes(){return ['src','poster','width','height','label'];}
    connectedCallback(){
      if(this.ready)return;
      this.ready=true; this.wanted=this.hasAttribute('autoplay')&&!motion.matches;
      this.visible=false; this.inFrame=0;
      this.classList.add('transparent-spin');
      this.image=document.createElement('img');
      this.image.className='transparent-spin__poster';
      this.image.decoding='async';this.image.loading='lazy';
      this.button=document.createElement('button');this.button.type='button';
      this.button.className='transparent-spin__toggle';
      this.button.addEventListener('click',event=>{
        event.stopPropagation();this.wanted=!this.wanted;
        if(this.wanted){this.visible=true;this.start();}else this.pause();
        this.syncButton();
      });
      this.append(this.image,this.button);
      this.observer=new IntersectionObserver(entries=>{
        this.visible=entries[0].isIntersecting&&entries[0].intersectionRatio>.05;
        if(this.visible&&this.wanted&&pageActive()){clearTimeout(this.disposeTimer);this.start();}
        else this.release();
      },{threshold:[0,.05,.3]});
      this.observer.observe(this);
      this.documentVisibility=()=>!pageActive()?this.pause():(this.visible&&this.wanted&&this.start());
      document.addEventListener('visibilitychange',this.documentVisibility);
      document.addEventListener('btr:page-visibility',this.documentVisibility);
      this.motionChange=()=>{if(motion.matches){this.wanted=false;this.pause();this.syncButton();}};
      motion.addEventListener('change',this.motionChange);
      this.update();
    }
    disconnectedCallback(){
      if(!this.ready)return;
      this.observer.disconnect();clearTimeout(this.disposeTimer);this.release();
      document.removeEventListener('visibilitychange',this.documentVisibility);
      document.removeEventListener('btr:page-visibility',this.documentVisibility);
      motion.removeEventListener('change',this.motionChange);
      this.image.remove();this.button.remove();this.ready=false;
    }
    attributeChangedCallback(){if(this.ready)this.update();}
    update(){
      const width=+(this.getAttribute('width')||640),height=+(this.getAttribute('height')||900);
      if(this.canvas&&(width!==this.width||height!==this.height))this.release();
      this.width=width;this.height=height;
      this.style.setProperty('--spin-ratio',`${this.width} / ${this.height}`);
      this.image.src=this.getAttribute('poster')||'';
      this.image.alt=this.getAttribute('label')||'Pendant with chain';
      this.image.width=this.width;this.image.height=this.height;
      if(this.video&&this.loadedSource!==this.getAttribute('src'))this.release();
      this.syncButton();if(this.visible&&this.wanted)this.start();
    }
    syncButton(){
      const playing=this.wanted&&this.video&&!this.video.paused;
      this.button.textContent=playing?'Pause 360°':'Play 360°';
      this.button.setAttribute('aria-label',`${playing?'Pause':'Play'} 360 degree view of ${this.getAttribute('label')||'pendant'}`);
      this.button.setAttribute('aria-pressed',String(!!playing));
    }
    createRenderer(){
      this.canvas=document.createElement('canvas');this.canvas.width=this.width;this.canvas.height=this.height;
      this.canvas.className='transparent-spin__canvas';this.canvas.setAttribute('aria-hidden','true');
      this.insertBefore(this.canvas,this.button.parentNode===this?this.button:null);
      const gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
      if(!gl){this.canvas.remove();this.canvas=null;return false;}
      this.gl=gl;
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
      const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);this.program=program;
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);this.buffer=buffer;
      const location=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      gl.uniform2f(gl.getUniformLocation(program,'size'),this.width,this.height);
      gl.uniform1i(gl.getUniformLocation(program,'movie'),0);
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.viewport(0,0,this.width,this.height);
      this.canvas.addEventListener('webglcontextlost',event=>{
        if(event.currentTarget!==this.canvas||this.releasing)return;
        event.preventDefault();this.release(true);
        if(this.visible&&this.wanted&&pageActive())requestAnimationFrame(()=>this.start());
      });
      return true;
    }
    async start(){
      clearTimeout(this.disposeTimer);
      if(!this.visible||!this.wanted||this.suspended||!pageActive())return;
      let playingVideo;
      try {
        if(!this.video){
          if(!this.createRenderer()){this.button.hidden=true;return;}
          const v=document.createElement('video');v.muted=true;v.defaultMuted=true;v.loop=true;v.playsInline=true;
          v.setAttribute('playsinline','');v.setAttribute('muted','');v.preload='none';
          v.crossOrigin='anonymous';v.src=this.loadedSource=this.getAttribute('src');this.video=v;
          v.addEventListener('loadeddata',()=>this.draw());
          v.addEventListener('seeked',()=>this.draw());
          v.addEventListener('error',()=>{this.wanted=false;this.pause();this.classList.remove('is-rendering');this.syncButton();});
        }
        playingVideo=this.video;
        await playingVideo.play();
        if(playingVideo!==this.video)return;
        if(!this.visible||!this.wanted||this.suspended||!pageActive()){this.pause();return;}
        this.syncButton();this.animate();
      }catch(error){if(playingVideo&&playingVideo!==this.video)return;this.wanted=false;this.pause();this.syncButton();}
    }
    draw(){
      if(!pageActive()||!this.visible||this.suspended||!this.gl||!this.video||this.video.readyState<2)return;
      const gl=this.gl;
      try{
        gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.video);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);this.classList.add('is-rendering');
      }catch(error){this.wanted=false;this.pause();this.classList.remove('is-rendering');this.syncButton();}
    }
    animate(){
      if(!pageActive()||!this.visible||this.suspended||this.inFrame||!this.video||this.video.paused)return;
      const next=()=>{this.inFrame=0;if(!this.video||this.video.paused)return;this.draw();this.animate();};
      this.videoFrameCallback=typeof this.video.requestVideoFrameCallback==='function';
      this.inFrame=this.videoFrameCallback?this.video.requestVideoFrameCallback(next):requestAnimationFrame(next);
    }
    pause(){
      if(this.video){this.video.pause();if(this.inFrame){if(this.videoFrameCallback)this.video.cancelVideoFrameCallback(this.inFrame);else cancelAnimationFrame(this.inFrame);this.inFrame=0;}}
      this.syncButton();
    }
    release(contextAlreadyLost=false){
      this.releasing=true;
      this.pause();
      if(this.video){this.video.removeAttribute('src');this.video.load();this.video=null;}
      if(this.gl){this.gl.deleteTexture(this.texture);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);if(!contextAlreadyLost)this.gl.getExtension('WEBGL_lose_context')?.loseContext();this.gl=null;}
      if(this.canvas){this.canvas.remove();this.canvas=null;}
      this.classList.remove('is-rendering');
      this.releasing=false;
    }
    play(){this.wanted=true;this.visible=true;return this.start();}
    stop(){this.wanted=false;this.pause();}
    suspend(){this.suspended=true;this.release();}
    resume(){this.suspended=false;if(this.visible&&this.wanted)return this.start();}
  }
  customElements.define('transparent-spin',TransparentSpin);
})();
