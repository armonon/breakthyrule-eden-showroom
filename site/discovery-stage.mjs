// One bounded, visibility-aware WebGL scene for the discovery hero.
const TAU = Math.PI * 2;
const eachMaterial = (root, fn) => { const seen = new Set(); root?.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material || [])) if (m && !seen.has(m)) { seen.add(m); fn(m, o); } }); };

export function disposeDiscoveryModel(root) {
  if (!root || root.userData.discoveryDisposed) return;
  root.userData.discoveryDisposed = true;
  const geometries = new Set(), materials = new Set(), textures = new Set(root.userData.discoveryOwnedTextures || []);
  root.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
  eachMaterial(root, m => {
    materials.add(m);
    for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    if (m.userData.hatInk?.texture) textures.add(m.userData.hatInk.texture);
    for (const u of Object.values(m.userData.decal || {})) if (u?.value?.isTexture) textures.add(u.value);
  });
  textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
}

function studioEnvironment(T, renderer) {
  const room = new T.Scene(); room.background = new T.Color(.24, .25, .28);
  const wall = new T.Mesh(new T.BoxGeometry(12, 10, 12), new T.MeshBasicMaterial({ color: 0x646871, side: T.BackSide })); room.add(wall);
  for (const [p, w, h, power] of [[[-3, 2, 4], 4, 6, 3], [[4, 1, 2], 3, 5, 2], [[0, 4, -1], 4, 4, 2.5]]) {
    const panel = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(power, power, power), side: T.DoubleSide, toneMapped: false }));
    panel.position.set(...p); panel.lookAt(0, 0, 0); room.add(panel);
  }
  const generator = new T.PMREMGenerator(renderer), target = generator.fromScene(room, .04, .1, 100);
  generator.dispose(); disposeDiscoveryModel(room); return target;
}

function mysteryBox(T) {
  const root = new T.Group(), body = new T.Group(); root.add(body);
  const labels = ['?', '?', 'EXPECT\nUNEXPECTED', 'BTR', 'BREAK\nTHY RULE', 'NO TWO\nTHE SAME'];
  const materials = labels.map((label, i) => {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    x.fillStyle = i % 2 ? '#d7ff58' : '#18191a'; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = i % 2 ? '#18191a' : '#d7ff58'; x.lineWidth = 3; x.strokeRect(27, 27, 458, 458);
    x.fillStyle = i % 2 ? '#18191a' : '#d7ff58'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `900 ${label === '?' ? 340 : 76}px Arial, sans-serif`;
    const lines = label.split('\n'); lines.forEach((line, n) => x.fillText(line, 256, 254 + (n - (lines.length - 1) / 2) * 86, 430));
    x.font = 'bold 18px Arial, sans-serif'; x.fillText('MYSTERY / BREAKTHYRULE', 256, 451, 390);
    const map = new T.CanvasTexture(c); map.colorSpace = T.SRGBColorSpace;
    return new T.MeshStandardMaterial({ map, roughness: .6, metalness: .02 });
  });
  body.add(new T.Mesh(new T.BoxGeometry(1.25, 1.25, 1.25), materials));
  const edges = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1.258, 1.258, 1.258)), new T.LineBasicMaterial({ color: 0xeaffad })); body.add(edges);
  return root;
}

function questionMarks(T) {
  const root = new T.Group(), curve = new T.CurvePath();
  curve.add(new T.CubicBezierCurve3(new T.Vector3(-.13, .19, 0), new T.Vector3(-.14, .43, 0), new T.Vector3(.24, .43, 0), new T.Vector3(.22, .20, 0)));
  curve.add(new T.CubicBezierCurve3(new T.Vector3(.22, .20, 0), new T.Vector3(.20, .08, 0), new T.Vector3(.01, .08, 0), new T.Vector3(.01, -.035, 0)));
  const hook = new T.TubeGeometry(curve, 34, .045, 8, false), dot = new T.SphereGeometry(.047, 12, 8);
  for (let i = 0; i < 5; i++) {
    const glyph = new T.Group(), material = new T.MeshStandardMaterial({ color: [0xd7ff58, 0xff77c7, 0xcdd6ff, 0xf5efdf, 0x84f0ff][i], roughness: .28, metalness: .28 });
    glyph.add(new T.Mesh(hook, material)); const point = new T.Mesh(dot, material); point.position.set(.01, -.18, 0); glyph.add(point); root.add(glyph);
  }
  return root;
}

const RAINBOW_SHADER = `
uniform float discoveryHue;
uniform float discoveryRainbow;
varying vec3 vDiscoveryPosition;
vec3 discoveryHueRGB(float h){return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);}
vec3 discoveryInk(vec3 c){
 float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo,h=0.0;
 if(d>.000001){if(hi==c.r)h=(c.g-c.b)/d;else if(hi==c.g)h=(c.b-c.r)/d+2.0;else h=(c.r-c.g)/d+4.0;h/=6.0;}
 float saturation=hi>.000001?d/hi:0.0;
 vec3 shifted=max(hi,.26)*mix(vec3(1.0),discoveryHueRGB(fract(h+discoveryHue+.43)),max(saturation,.72));
 return mix(c,shifted,discoveryRainbow);
}
`;

export function createDiscoveryStage(mount, { onTurn, onFrame, onInteraction, onError } = {}) {
  const T = window.THREE;
  if (!T || !window.showroomAssets?.model) throw new Error('The 3D renderer is not ready.');
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); canvas.className = 'discovery-canvas'; mount.append(canvas);
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (error) { canvas.remove(); throw error; }
  window.showroomEnableKTX2?.(renderer);
  const compact = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 1, .01, 100);
  scene.add(new T.HemisphereLight(0xffffff, 0x707887, 1.35));
  for (const [p, strength, color] of [[[-3, 5, 4], 2.8, 0xfff9f0], [[4, 1, 3], 1.1, 0xe5eaff], [[1, 4, -4], 1.8, 0xffffff]]) { const light = new T.DirectionalLight(color, strength); light.position.set(...p); scene.add(light); }
  window.showroomProductLights?.(scene);
  const environment = studioEnvironment(T, renderer); scene.environment = environment.texture;
  const questions = questionMarks(T); questions.visible = false; scene.add(questions);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rainbowUniforms = { discoveryHue: { value: 0 }, discoveryRainbow: { value: 0 } };
  const cache = new Map(), originals = new WeakMap();
  let active = null, preparing = null, activeDescriptor = null, pendingKey = null, preloadTask = null;
  let enabled = true, contextLost = false;
  let dead = false, token = 0, frame = 0, last = 0, elapsed = 0, auto = !reduced.matches, onScreen = true;
  let yaw = .15, pitch = 0, progress = 0, turn = 0, drag = null, resumeAt = 0, rainbow = false, mystery = false;
  let dimensions = { radius: 1, halfHeight: .9 }, elevation = 0, width = 0, height = 0;
  const now = () => performance.now();
  const pageActive = () => window.showroomPageActive?.() ?? !document.hidden;

  const keyFor = d => d.renderKind === 'mystery' && !d.model ? 'procedural:mystery-box' : d.model;
  function touch(key) { const value = cache.get(key); if (value) { cache.delete(key); cache.set(key, value); } return value; }
  function trim() {
    for (const [key, entry] of cache) {
      if (cache.size <= (compact ? 2 : 3)) break;
      if (entry.root === active || key === pendingKey || !entry.root) continue;
      cache.delete(key); disposeDiscoveryModel(entry.root);
    }
  }
  async function fetchRoot(descriptor, options) {
    const key = keyFor(descriptor); if (!key) throw new Error('This item has no 3D model.');
    const found = touch(key); if (found) return found.promise;
    const entry = { root: null, promise: null }; cache.set(key, entry);
    entry.promise = (async () => {
      let root;
      if (key === 'procedural:mystery-box') root = mysteryBox(T);
      else {
        const gltf = await window.showroomAssets.model(key,options), source = gltf.scene;
        const rawSize = new T.Box3().setFromObject(source).getSize(new T.Vector3());
        // Gloves are authored flat on the X/Z plane. Stand them up so their painted faces are readable.
        if (/glove/i.test(descriptor.sourceItem?.family || descriptor.sourceItem?.slug || descriptor.id || '') && rawSize.y < Math.max(rawSize.x, rawSize.z) * .2) source.rotation.x += Math.PI / 2;
        if (Array.isArray(descriptor.rotation)) source.rotation.set(...descriptor.rotation);
        source.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(source), size = bounds.getSize(new T.Vector3()); source.position.sub(bounds.getCenter(new T.Vector3()));
        root = new T.Group(); root.add(source); root.scale.setScalar(1.9 / Math.max(size.x, size.y, size.z, .001));
        const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const ownedTextures = new Set();
        eachMaterial(root, m => { m.userData.maxAnisotropy = anisotropy; for (const t of Object.values(m)) if (t?.isTexture) { t.anisotropy = anisotropy; ownedTextures.add(t); } });
        root.userData.discoveryOwnedTextures = ownedTextures;
      }
      entry.root = root;
      if (dead || cache.get(key) !== entry) { disposeDiscoveryModel(root); throw new Error('The 3D stage was closed.'); }
      trim(); return root;
    })().catch(error => { if (cache.get(key) === entry) cache.delete(key); throw error; });
    return entry.promise;
  }

  async function appearance(root, d) {
    const item = d.sourceItem || {}, colorway = d.colorway || {};
    if (d.renderKind === 'core' && window.BTRCoreCycle) {
      root.userData.discoveryCore ||= window.BTRCoreCycle.appearance(root, colorway.fabric || 'black');
      root.userData.discoveryCore.apply(colorway.fabric || 'black', colorway.graphicIndex || 0);
    }
    if (d.renderKind === 'hat' || item.family === 'trucker') {
      root.userData.hatInkArea = d.ink || window.BTR_HAT_STYLES?.find(s => s.id === item.hatStyle)?.ink;
      const colors = colorway.colors || { front: item.frontColor, brim: item.brimColor, mesh: item.meshColor };
      eachMaterial(root, m => { const key = m.name?.startsWith('Front panel / color') ? 'front' : /^(Brim|Topstitch) \/ color/.test(m.name) ? 'brim' : /^(Open mesh|Snapback) \/ color/.test(m.name) ? 'mesh' : null; if (key && colors[key]) m.color?.set(colors[key]); });
      await window.decorateAccessoryModel?.(root, item);
    }
    if (d.renderKind === 'belt' && colorway.value) root.traverse(o => { if (o.name === 'BTR_Strap') for (const m of [].concat(o.material)) m.color?.set(colorway.value); });
  }

  function installRainbow(root) {
    eachMaterial(root, m => {
      if (!m.color) return;
      if (!originals.has(m)) originals.set(m, m.color.clone());
      // The printer owns the decal shader; compose after it, preserving both front and back projection.
      if (!m.userData.decal || m.userData.discoveryRainbowHook === m.onBeforeCompile) return;
      const base = m.onBeforeCompile, cacheKey = m.customProgramCacheKey.bind(m);
      const hook = shader => {
        base.call(m, shader); Object.assign(shader.uniforms, rainbowUniforms);
        shader.vertexShader = 'varying vec3 vDiscoveryPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDiscoveryPosition=transformed;');
        shader.fragmentShader = RAINBOW_SHADER + shader.fragmentShader
          .replace('#include <map_fragment>', '#include <map_fragment>\nif(discoveryRainbow>.5){vec3 rainbowFabric=.12+.65*discoveryHueRGB(fract(discoveryHue+vDiscoveryPosition.y*.48+vDiscoveryPosition.x*.22));diffuseColor.rgb=rainbowFabric;}')
          .replace('mix(diffuseColor.rgb, d.rgb, d.a * .96)', 'mix(diffuseColor.rgb, discoveryInk(d.rgb), d.a * .96)');
      };
      m.onBeforeCompile = hook; m.userData.discoveryRainbowHook = hook; m.customProgramCacheKey = () => cacheKey() + '|discovery-rainbow-1'; m.needsUpdate = true;
    });
  }

  function fit() {
    const v = camera.fov * Math.PI / 360, h = Math.atan(Math.tan(v) * camera.aspect), effective = Math.min(1.4, Math.abs(elevation) + Math.abs(pitch)), c = Math.cos(effective), s = Math.sin(effective);
    let radius = dimensions.radius, halfHeight = dimensions.halfHeight;
    if (mystery) { radius = Math.max(radius, 1.42); halfHeight = Math.max(halfHeight, 1.16); }
    const horizontal = radius * Math.sqrt(1 / Math.tan(h) ** 2 + c * c) + halfHeight * s;
    const vertical = (radius * s + halfHeight * c) / Math.tan(v) + radius * c + halfHeight * s;
    const distance = Math.max(horizontal, vertical) * 1.14;
    camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation)); camera.lookAt(0, 0, 0);
  }
  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight; if (!w || !h || (w === width && h === height)) return;
    width = w; height = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fit(); request();
  }
  function request() { if (!dead && !frame && enabled && !contextLost && onScreen && pageActive()) frame = requestAnimationFrame(draw); }
  function moving() { return auto && !reduced.matches && !drag && now() >= resumeAt; }
  function draw(time) {
    frame = 0;
    if (!enabled || contextLost || !onScreen || !pageActive() || dead) { last = 0; return; }
    if (last && time - last < 32) { request(); return; }
    const dt = Math.min((time - (last || time)) / 1000, .15); last = time;
    const motion = moving();
    if (motion) {
      elapsed += dt; const delta = dt * TAU / 8; yaw += delta; progress += delta;
      pitch *= Math.exp(-dt * 3.8);
      if (active && progress >= TAU) { progress %= TAU; turn++; mount.dataset.completedTurns = String(turn); onTurn?.(turn); }
    }
    if (active) {
      active.rotation.set(pitch, yaw, motion ? Math.sin(elapsed * 1.05) * .018 : 0);
      active.position.y = motion ? Math.sin(elapsed * 1.5) * .028 : 0;
      if (rainbow) {
        rainbowUniforms.discoveryHue.value = elapsed * .14;
        eachMaterial(active, m => { if (m.color) m.color.setHSL((elapsed * .14) % 1, .78, /thread|topstitch/i.test(m.name) ? .22 : .5); });
      }
    }
    if (mystery) questions.children.forEach((q, i) => { const a = elapsed * .45 + i * TAU / 5; q.position.set(Math.cos(a) * 1.19, Math.sin(a * 1.6 + i) * .60, Math.sin(a) * 1.01); q.rotation.set(Math.sin(a) * .13, -a * .3, Math.cos(a + i) * .18); q.scale.setScalar(.78 + .09 * Math.sin(a + i)); });
    fit(); renderer.render(scene, camera); onFrame?.({ yaw, progress, dt: motion ? dt : 0, time: elapsed, model: active, auto: motion });
    if (auto && !reduced.matches && active) request(); else last = 0;
  }
  const pointerDown = e => {
    if (e.button !== 0 || e.isPrimary === false || drag || e.target.closest('button,a,input,select')) return;
    drag = { x: e.clientX, y: e.clientY, yaw, pitch, id: e.pointerId }; mount.setPointerCapture?.(e.pointerId); onInteraction?.('start'); request();
  };
  const pointerMove = e => { if (!drag || e.pointerId !== drag.id) return; yaw = drag.yaw + (e.clientX - drag.x) * .009; pitch = Math.max(-.5, Math.min(.5, drag.pitch + (e.clientY - drag.y) * .005)); request(); };
  const pointerUp = e => { if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return; drag = null; resumeAt = now() + 1700; onInteraction?.('end'); request(); };
  const keyDown = e => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); yaw += e.key === 'ArrowLeft' ? -.3 : e.key === 'ArrowRight' ? .3 : 0; pitch = Math.max(-.5, Math.min(.5, pitch + (e.key === 'ArrowUp' ? -.15 : e.key === 'ArrowDown' ? .15 : 0))); resumeAt = now() + 1700; onInteraction?.('end'); request(); };
  mount.addEventListener('pointerdown', pointerDown); mount.addEventListener('pointermove', pointerMove); mount.addEventListener('pointerup', pointerUp); mount.addEventListener('pointercancel', pointerUp); mount.addEventListener('lostpointercapture', pointerUp); mount.addEventListener('keydown', keyDown);
  function resume() {
    cancelAnimationFrame(frame); frame = 0; drag = null; resumeAt = 0; last = 0;
    const rect = mount.getBoundingClientRect(); onScreen = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    resize(); request();
  }
  const loseContext = event => { event.preventDefault(); contextLost = true; cancelAnimationFrame(frame); frame = 0; };
  const restoreContext = () => { contextLost = false; resume(); };
  canvas.addEventListener('webglcontextlost', loseContext); canvas.addEventListener('webglcontextrestored', restoreContext);
  window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerUp);
  window.addEventListener('pageshow', resume); window.addEventListener('orientationchange', resume);
  const ro = new ResizeObserver(resize); ro.observe(mount);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; last = 0; if (!onScreen) { cancelAnimationFrame(frame); frame = 0; } else request(); }); io.observe(mount);
  const visibility = () => { last = 0; if (!pageActive()) { cancelAnimationFrame(frame); frame = 0; } else resume(); };
  const motionChange = () => { last = 0; request(); };
  document.addEventListener('visibilitychange', visibility); document.addEventListener('btr:page-visibility', visibility); reduced.addEventListener?.('change', motionChange);

  const api = {
    async show(descriptor, { prepare } = {}) {
      const id = ++token; pendingKey = keyFor(descriptor);
      try {
        const root = await fetchRoot(descriptor); if (dead || id !== token) return false;
        preparing = root;
        await appearance(root, descriptor); if (dead || id !== token) return false;
        if (prepare) await prepare(root, api); if (dead || id !== token) return false;
        api.setRainbow(false);
        if (active) scene.remove(active);
        active = root; preparing = null; activeDescriptor = descriptor; active.rotation.set(0, 0, 0); active.position.set(0, 0, 0); active.updateMatrixWorld(true);
        const size = new T.Box3().setFromObject(active).getSize(new T.Vector3()); dimensions = { radius: Math.hypot(size.x, size.z) / 2, halfHeight: size.y / 2 };
        elevation = (descriptor.cameraElevationDegrees ?? (descriptor.renderKind === 'belt' ? 18 : descriptor.renderKind === 'hat' ? 18 : descriptor.renderKind === 'mystery' ? 10 : 0)) * Math.PI / 180;
        yaw = .12; pitch = progress = 0; resumeAt = 0; scene.add(active); pendingKey = null;
        api.setMystery(!!descriptor.mystery?.questionMarks); if (descriptor.rainbow) api.setRainbow(true);
        trim(); resize(); fit(); request(); return true;
      } catch (error) { if (!dead && id === token) { onError?.(error, descriptor); throw error; } return false; }
      finally { if (id === token) { preparing = null; pendingKey = null; trim(); } }
    },
    preload(descriptor) {
      if (dead || !keyFor(descriptor)) return Promise.resolve(null);
      if (preloadTask) return preloadTask;
      preloadTask = fetchRoot(descriptor,{priority:'low'}).catch(() => null).finally(() => { preloadTask = null; trim(); }); return preloadTask;
    },
    resume,
    setVisible(value) { enabled = !!value; if (!enabled) { drag = null; cancelAnimationFrame(frame); frame = 0; last = 0; } else resume(); },
    model: () => preparing || active,
    redraw: request,
    setAuto(value) { auto = !!value; last = 0; request(); return auto && !reduced.matches; },
    isAuto: () => auto && !reduced.matches,
    view(side) { yaw = side === 'back' ? Math.PI : 0; pitch = 0; resumeAt = now() + 2400; progress = 0; request(); },
    yaw: () => yaw,
    setRainbow(value) {
      rainbow = !!value; rainbowUniforms.discoveryRainbow.value = rainbow ? 1 : 0;
      if (rainbow && active) installRainbow(active);
      else eachMaterial(active, m => { if (originals.has(m)) m.color.copy(originals.get(m)); });
      request();
    },
    setMystery(value) { mystery = !!value; questions.visible = mystery; fit(); request(); },
    destroy() {
      if (dead) return; dead = true; token++;
      canvas.removeEventListener('webglcontextlost', loseContext); canvas.removeEventListener('webglcontextrestored', restoreContext);
      window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', pointerUp);
      window.removeEventListener('pageshow', resume); window.removeEventListener('orientationchange', resume); cancelAnimationFrame(frame); ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('btr:page-visibility', visibility); reduced.removeEventListener?.('change', motionChange);
      mount.removeEventListener('pointerdown', pointerDown); mount.removeEventListener('pointermove', pointerMove); mount.removeEventListener('pointerup', pointerUp); mount.removeEventListener('pointercancel', pointerUp); mount.removeEventListener('lostpointercapture', pointerUp); mount.removeEventListener('keydown', keyDown);
      for (const entry of cache.values()) if (entry.root) disposeDiscoveryModel(entry.root); cache.clear(); disposeDiscoveryModel(questions); environment.dispose(); renderer.dispose(); canvas.remove(); active = preparing = null;
    }
  };
  resize(); return api;
}
