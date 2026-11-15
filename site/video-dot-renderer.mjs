/* GPU-sampled video bitmap: one point draw, no CPU pixel readback or internal scheduler. */
const VERTEX = `
precision highp float;
attribute vec2 a_position;
uniform sampler2D u_video;
uniform vec2 u_sourceSize;
uniform float u_cropY;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_ripple;
uniform float u_scrollDissolve;
uniform float u_hover;
uniform float u_rippleAge;
uniform float u_step;
uniform float u_dpr;
uniform float u_pointLimit;
varying vec3 v_color;

float hash(vec2 p) {
 return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
}
vec2 direction(vec2 delta) {
 return delta / max(length(delta), 0.001);
}
float bayer2(vec2 cell) {
 vec2 bit = mod(cell,2.0);
 return bit.x*2.0+bit.y*3.0-bit.x*bit.y*4.0;
}
void main() {
 vec2 anchor = a_position;
 vec2 id = a_position / max(u_step,1.0);
 vec2 center = u_resolution*0.5;
 vec2 position = anchor;

 // Cover-crop the source in texture space, using top-origin DOM texture rows.
 float sourceAspect = u_sourceSize.x/u_sourceSize.y;
 float viewAspect = u_resolution.x/u_resolution.y;
 vec2 span = viewAspect>sourceAspect ? vec2(1.0,sourceAspect/viewAspect) : vec2(viewAspect/sourceAspect,1.0);
 vec2 uv = anchor/u_resolution*span+(vec2(1.0)-span)*vec2(0.5,u_cropY);
 vec3 sourceColor = texture2D(u_video,clamp(uv,vec2(0.0),vec2(1.0))).rgb;

 // Eight ink levels and fine ordered dither match the photographic bitmap treatment.
 vec2 cell = floor(a_position/u_step);
 float order = 4.0*bayer2(cell)+bayer2(floor(cell*0.5));
 float offset = (order/15.0-0.5)*22.0;
 vec3 ink = clamp(floor(((sourceColor*255.0-128.0)*1.08+128.0+offset)/(255.0/7.0)+0.5)/7.0,vec3(0.0),vec3(1.0));

 // Quiet local repulsion while the cursor is over the photograph.
 vec2 mouseDelta = anchor-u_mouse;
 float distanceToMouse = length(mouseDelta);
 float influence = max(0.0,1.0-distanceToMouse/150.0);
 position += direction(mouseDelta)*influence*influence*4.0*u_hover;
 vec2 parallax = clamp((u_mouse-center)/max(center,vec2(1.0)),vec2(-1.0),vec2(1.0));
 position += parallax*1.5*u_hover;

 // A fading ring gives a tap or pointer movement a small, readable reaction.
 if(u_rippleAge>=0.0 && u_rippleAge<2.5) {
  vec2 delta = anchor-u_ripple;
  float radius = 12.0+u_rippleAge*250.0;
  float band = (length(delta)-radius)/30.0;
  float pulse = exp(-band*band)*exp(-u_rippleAge*2.3);
  position += direction(delta)*pulse*6.0;
 }

 // A fixed spatial pattern breaks the lower edge into smaller, scattered dots.
 // Its spatial hashes never depend on transition progress, keeping the edge perfectly stable.
 float edge = clamp((anchor.y-u_resolution.y+150.0)/150.0,0.0,1.0);
 float loosen = edge*edge;
 vec2 edgeRandom = vec2(hash(id+vec2(19.17,83.41)),hash(id.yx+vec2(71.73,12.19)));
 position += vec2((edgeRandom.x-0.5)*36.0,edgeRandom.y*26.0)*loosen;
 float keep = 1.0-smoothstep(0.08,0.98,edge);
 float shade = 1.0-smoothstep(0.18,1.0,edge);

 // Scrolling sheds individual ink grains using a fixed threshold for each grid cell.
 // Thresholds are mostly hashed to avoid large repeating patches, with a little Bayer order.
 float scroll = clamp(u_scrollDissolve,0.0,1.0);
 float scrollThreshold = 0.03+0.94*mix(hash(cell+vec2(83.17,29.73)),(order+0.5)/16.0,0.1);
 float grain = smoothstep(max(0.0,scrollThreshold-0.12),scrollThreshold,scroll);
 vec2 grainDirection = vec2(hash(cell+vec2(31.7,92.1)),hash(cell.yx+vec2(11.9,43.3)))-vec2(0.5);
 // Do not move already-clipped edge dots into view while the photograph dissolves.
 if(position.x>=0.0 && position.x<=u_resolution.x && position.y>=0.0 && position.y<=u_resolution.y) {
  position += direction(grainDirection)*grain*8.0;
 }
 vec2 clip = position/u_resolution*2.0-1.0;
 gl_Position = vec4(clip.x,-clip.y,0.0,1.0);
 // Cull whole dots rather than changing fragment alpha on the unpremultiplied canvas.
 float thinning = hash(id+vec2(43.91,57.23));
 if(thinning>=keep || scroll>=scrollThreshold) gl_Position = vec4(3.0,3.0,0.0,1.0);
 gl_PointSize = clamp(u_step*u_dpr*1.04*mix(1.0,0.55,loosen),1.0,u_pointLimit);
 v_color = ink*shade;
}
`;

const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
void main() {
 // Stepped edges make every halftone dot read as a tiny bitmap instead of a smooth circle.
 vec2 pixel = (floor(gl_PointCoord*8.0)+0.5)/8.0-vec2(0.5);
 if(dot(pixel,pixel)>0.25) discard;
 gl_FragColor = vec4(v_color,1.0);
}
`;

/**
 * Render a video or image directly from a GPU texture; no canvas pixel readback.
 * Optional cropY (0..1, default .5) controls the vertical object-position for cover cropping.
 * resize() returns the actual aligned grid. setFrame() uploads one decoded frame and
 * returns false while the source is not ready. The caller owns all frame scheduling.
 * Sources must be same-origin or served with CORS approval. WebGL1 vertex textures
 * are required; construction throws if unsupported so the caller can show its fallback.
 */
export function createVideoDotRenderer(canvas,{cropY=0.5}={}) {
 if(!canvas || typeof canvas.getContext!=='function') throw new TypeError('A canvas is required.');
 const options={alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'};
 const gl=canvas.getContext('webgl',options)||canvas.getContext('experimental-webgl',options);
 if(!gl || gl.isContextLost()) throw new Error('WebGL is unavailable.');
 if(!(gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)>0))throw new Error('Video bitmap rendering requires vertex-texture support.');
 const maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);

 let program=null,vertex=null,fragment=null,positions=null,texture=null;
 let destroyed=false,lost=false,width=0,height=0,step=0,dpr=1,count=0,columns=0,rows=0;
 let points=null,sourceWidth=0,sourceHeight=0,hasFrame=false;
 const attributes={},uniforms={};
 const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
 const verticalCrop=Math.min(1,Math.max(0,finite(cropY,0.5)));

 function compile(type,source) {
  const shader=gl.createShader(type);
  if(!shader) throw new Error('Unable to allocate a bitmap shader.');
  gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
   const reason=gl.getShaderInfoLog(shader)||'Unknown shader error';gl.deleteShader(shader);
   throw new Error('Bitmap shader failed: '+reason);
  }
  return shader;
 }
 function release() {
  if(positions)gl.deleteBuffer(positions);
  if(texture)gl.deleteTexture(texture);
  if(program)gl.deleteProgram(program);
  if(vertex)gl.deleteShader(vertex);
  if(fragment)gl.deleteShader(fragment);
  positions=texture=program=vertex=fragment=null;
  hasFrame=false;
  points=null;
 }
 try {
  vertex=compile(gl.VERTEX_SHADER,VERTEX);fragment=compile(gl.FRAGMENT_SHADER,FRAGMENT);
  program=gl.createProgram();if(!program)throw new Error('Unable to allocate the bitmap program.');
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Bitmap program failed: '+(gl.getProgramInfoLog(program)||'Unknown link error'));
  for(const name of ['position']) {
   attributes[name]=gl.getAttribLocation(program,'a_'+name);
   if(attributes[name]<0)throw new Error('Missing bitmap attribute: '+name);
  }
  for(const name of ['resolution','sourceSize','cropY','video','mouse','ripple','scrollDissolve','hover','rippleAge','step','dpr','pointLimit']) {
   uniforms[name]=gl.getUniformLocation(program,'u_'+name);
   if(uniforms[name]===null)throw new Error('Missing bitmap uniform: '+name);
  }
  positions=gl.createBuffer();texture=gl.createTexture();
  if(!positions||!texture)throw new Error('Unable to allocate video bitmap resources.');
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
 } catch(error) {release();throw error;}

 const pointRange=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
 const pointLimit=pointRange&&pointRange[1]>0?pointRange[1]:64;
 canvas.dataset.dotContextLost='false';
 function contextLost(event) {
  event.preventDefault();lost=true;canvas.dataset.dotContextLost='true';
 }
 canvas.addEventListener('webglcontextlost',contextLost,false);
 function requireReady() {
  if(destroyed)throw new Error('The bitmap renderer was destroyed.');
  if(lost||gl.isContextLost())throw new Error('The bitmap context was lost.');
 }
 function bindAttributes() {
  gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.enableVertexAttribArray(attributes.position);
  gl.vertexAttribPointer(attributes.position,2,gl.FLOAT,false,0,0);

 }
 function resize(widthCSS,heightCSS,stepCSS) {
  requireReady();
  if(!Number.isFinite(widthCSS)||!Number.isFinite(heightCSS)||!Number.isFinite(stepCSS)||widthCSS<=0||heightCSS<=0||stepCSS<=0)throw new RangeError('Bitmap dimensions and spacing must be positive finite numbers.');
  const nextDpr=Math.min(1.5,Math.max(1,finite(typeof window==='undefined'?1:window.devicePixelRatio,1)));
  // Whole backing-pixel cells prevent alternating dot shapes from fractional grid spacing.
  const physicalCell=Math.ceil(stepCSS*nextDpr),nextStep=physicalCell/nextDpr;
  const nextColumns=Math.ceil(widthCSS/nextStep),nextRows=Math.ceil(heightCSS/nextStep),nextCount=nextColumns*nextRows;
  if(!Number.isSafeInteger(nextCount)||nextCount>2000000)throw new RangeError('Bitmap grid is too large.');
  const oldCount=count;width=widthCSS;height=heightCSS;columns=nextColumns;rows=nextRows;count=nextCount;
  step=nextStep;dpr=nextDpr;
  const backingWidth=Math.max(1,Math.round(width*dpr)),backingHeight=Math.max(1,Math.round(height*dpr));
  if(canvas.width!==backingWidth)canvas.width=backingWidth;
  if(canvas.height!==backingHeight)canvas.height=backingHeight;
  if(!points||oldCount!==count)points=new Float32Array(count*2);
  for(let row=0,i=0;row<rows;row++)for(let column=0;column<columns;column++) {
   points[i++]=(column+0.5)*step;points[i++]=(row+0.5)*step;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.bufferData(gl.ARRAY_BUFFER,points,gl.STATIC_DRAW);

  gl.viewport(0,0,canvas.width,canvas.height);
  return {columns,rows,count};
 }
 function setFrame(source) {
  requireReady();
  if(!source)return false;
  const isVideo=typeof source.videoWidth==='number';
  const nextWidth=isVideo?source.videoWidth:(source.naturalWidth??source.width);
  const nextHeight=isVideo?source.videoHeight:(source.naturalHeight??source.height);
  if(!Number.isFinite(nextWidth)||!Number.isFinite(nextHeight)||nextWidth<=0||nextHeight<=0)return false;
  if((isVideo&&source.readyState<2)||source.complete===false)return false;
  if(nextWidth>maxTextureSize||nextHeight>maxTextureSize)throw new RangeError('The video frame exceeds this GPU texture-size limit.');
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  const allocate=!hasFrame||nextWidth!==sourceWidth||nextHeight!==sourceHeight;
  // Reuse the same GPU allocation for subsequent video frames at the same resolution.
  if(allocate)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
  if(allocate){const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error('Unable to upload the video bitmap texture (WebGL '+error+').');}
  sourceWidth=nextWidth;sourceHeight=nextHeight;hasFrame=true;return true;
 }
 function draw({scrollDissolve=0,mouseX=-9999,mouseY=-9999,hover=0,rippleX=-9999,rippleY=-9999,rippleAge=10}={}) {
  if(destroyed||lost||!count||!hasFrame||gl.isContextLost())return;
  gl.useProgram(program);bindAttributes();
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform2f(uniforms.resolution,width,height);
  gl.uniform2f(uniforms.sourceSize,sourceWidth,sourceHeight);
  gl.uniform1f(uniforms.cropY,verticalCrop);gl.uniform1i(uniforms.video,0);
  gl.uniform2f(uniforms.mouse,finite(mouseX,-9999),finite(mouseY,-9999));
  gl.uniform2f(uniforms.ripple,finite(rippleX,-9999),finite(rippleY,-9999));
  gl.uniform1f(uniforms.scrollDissolve,Math.min(1,Math.max(0,finite(scrollDissolve,0))));
  gl.uniform1f(uniforms.hover,Math.min(1,Math.max(0,finite(hover,0))));
  gl.uniform1f(uniforms.rippleAge,finite(rippleAge,10));
  gl.uniform1f(uniforms.step,step);gl.uniform1f(uniforms.dpr,dpr);gl.uniform1f(uniforms.pointLimit,pointLimit);
  gl.drawArrays(gl.POINTS,0,count);
 }
 function destroy() {
  if(destroyed)return;destroyed=true;
  canvas.removeEventListener('webglcontextlost',contextLost,false);
  release();
 }
 return {resize,setFrame,draw,destroy};
}
