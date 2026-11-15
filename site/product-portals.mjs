// Four decorative destinations share one WebGL context. The links remain native links.
const APPLE_URL = 'https://apple-cover-assets--breakthyrule-eden-showroom.netlify.app/closed-back-apple-back-reveal.glb';
const GARMENT_SLUGS = ['war-witnesses-tee', 'god-loves-you-tee', 'illuminati-crewneck', 'eternal-thermal', 'kiss-rosary-tee', 'jesus-health-insurance-hoodie'];
const mounted = new WeakMap();

export function setupProductPortals(section = document.getElementById('product-portals')) {
  if (!section) return null;
  if (mounted.has(section)) return mounted.get(section);
  const T = window.THREE;
  const toggle = section.querySelector('#portal-motion-toggle');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const cards = [...section.querySelectorAll('[data-portal]')].map(link => {
    const stage = link.querySelector('[data-portal-stage]');
    const canvas = stage?.querySelector('[data-portal-canvas]');
    return stage && canvas ? { link, stage, canvas, kind: link.dataset.portal, ctx: canvas.getContext('2d'), visible: false, model: null, time: 0, yaw: -.35, dirty: true, loading: false, failed: false, next: null, changeAt: 2.5 } : null;
  }).filter(card => card?.ctx);
  let playing = !media.matches, userChoice = false, destroyed = false, failed = false;
  let renderer = null, scene = null, camera = null, frame = 0, last = 0;
  let renderWidth = 0, renderHeight = 0;
  const roots = new Map(), loadedRoots = new Set();
  const garments = GARMENT_SLUGS.map(slug => (window.showroomCollection || []).find(item => item.slug === slug && item.rackModel)).filter(Boolean);
  let bag = [];
  const visible = () => cards.some(card => card.visible);
  const running = () => playing && !document.hidden && visible() && !destroyed && !failed;

  function updateControl() {
    section.dataset.motion = playing ? 'playing' : 'paused';
    if (toggle) {
      toggle.hidden = false;
      toggle.disabled = failed;
      toggle.setAttribute('aria-pressed', String(playing));
      toggle.textContent = failed ? '—' : playing ? 'Ⅱ' : '▶';
      toggle.setAttribute('aria-label', failed ? 'Portal animations unavailable' : playing ? 'Pause portal animations' : 'Play portal animations');
    }
  }

  function material(color, metalness = 0, roughness = .6) {
    return new T.MeshStandardMaterial({ color, metalness, roughness });
  }
  function box(parent, width, height, depth, mat, x = 0, y = 0, z = 0) {
    const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function cylinder(parent, radius, depth, mat, x, y, z, segments = 40) {
    const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, depth, segments), mat);
    mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function labelTexture(lines, background, color) {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 384, 512);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(25, 25, 334, 462); ctx.strokeRect(34, 34, 316, 444);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = 'bold 44px Georgia, serif';
    lines.forEach((line, i) => ctx.fillText(line, 192, 178 + i * 58));
    ctx.font = '60px Georgia, serif'; ctx.fillText('✦', 192, 374);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
  }
  function makeBook() {
    const group = new T.Group();
    const oxblood = material(0x691d22, .08, .6), brass = material(0xba9250, .6, .35), paper = material(0xe8d9b9, 0, .95);
    box(group, 1.12, 1.54, .075, oxblood, 0, 0, -.16);
    box(group, 1.03, 1.43, .24, paper, .025, 0, 0);
    box(group, .09, 1.54, .38, oxblood, -.56, 0, 0);
    // Fine edges retain actual thickness as the book turns.
    const edge = material(0xb9a78a, 0, 1);
    for (let i = 0; i < 8; i++) box(group, 1.03, .007, .002, edge, .025, -.60 + i * .17, .122);
    for (const y of [-.55, .55]) box(group, .12, .045, .39, brass, -.56, y, 0);
    const hinge = new T.Group(); hinge.position.set(-.56, 0, .16); group.add(hinge);
    const coverTexture = labelTexture(['BREAK', 'THY RULE'], '#691d22', '#dfc287');
    const front = new T.MeshStandardMaterial({ map: coverTexture, roughness: .65, metalness: .08 });
    box(hinge, 1.12, 1.54, .075, [oxblood, oxblood, oxblood, oxblood, front, oxblood], .56, 0, 0);
    // A few independent leaves lift with the cover, making the opening readable in 3D.
    const leaves = [];
    for (let i = 0; i < 3; i++) {
      const leaf = new T.Group(); leaf.position.set(-.51, 0, .125 + i * .008); group.add(leaf);
      box(leaf, 1.01, 1.41, .008, paper, .505, 0, 0); leaves.push(leaf);
    }
    group.userData.update = time => {
      const opening = .5 - .5 * Math.cos(time * 1.2);
      hinge.rotation.y = -.08 - opening * 1.64;
      leaves.forEach((leaf, i) => { leaf.rotation.y = -opening * (.24 + i * .16); });
    };
    group.rotation.x = -.16;
    return group;
  }
  function makeCamera() {
    const group = new T.Group();
    const leather = material(0x25251f, .15, .7), metal = material(0xb3ac96, .75, .32), dark = material(0x111611, .2, .28);
    box(group, 1.64, 1.00, .57, leather);
    box(group, 1.68, .12, .61, metal, 0, .48, 0);
    box(group, 1.68, .10, .61, metal, 0, -.48, 0);
    box(group, .42, .30, .52, leather, -.02, .62, .005);
    box(group, .23, .14, .03, dark, -.02, .62, -.273);
    box(group, .24, .16, .025, material(0x94b3a6, .45, .18), -.51, .23, .30);
    cylinder(group, .43, .15, metal, .12, -.04, .35);
    const lens = new T.Group(); lens.position.set(.12, -.04, .44); group.add(lens);
    cylinder(lens, .37, .29, leather, 0, 0, .07);
    cylinder(lens, .32, .035, metal, 0, 0, .23);
    cylinder(lens, .278, .04, dark, 0, 0, .255);
    cylinder(lens, .208, .045, material(0x244b48, .5, .18), 0, 0, .28);
    const glint = new T.Mesh(new T.CircleGeometry(.072, 24), new T.MeshBasicMaterial({ color: 0xa3cac2, transparent: true, opacity: .45 }));
    glint.position.set(-.07, .075, .307); lens.add(glint);
    for (let i = 0; i < 18; i++) {
      const angle = i * Math.PI / 9;
      const grip = box(lens, .02, .045, .19, metal, Math.cos(angle) * .369, Math.sin(angle) * .369, .07);
      grip.rotation.z = angle - Math.PI / 2;
    }
    const dial = new T.Mesh(new T.CylinderGeometry(.17, .17, .10, 24), metal); dial.position.set(-.53, .59, 0); group.add(dial);
    const shutter = new T.Mesh(new T.CylinderGeometry(.09, .09, .07, 24), material(0x8e2925, .3, .45)); shutter.position.set(.57, .58, 0); group.add(shutter);
    box(group, 1.32, .70, .025, dark, 0, -.015, -.30);
    const strap = new T.Mesh(new T.TorusGeometry(.13, .025, 8, 24), metal); strap.position.set(-.90, .23, 0); strap.rotation.y = Math.PI / 2; group.add(strap);
    const strapRight = strap.clone(); strapRight.position.x = .90; group.add(strapRight);
    group.rotation.x = -.10;
    group.userData.update = time => {
      // A mechanical press and lens breath, without a flashing screen or strobe.
      const press = Math.pow(Math.max(0, Math.sin(time * 1.8)), 12);
      shutter.position.y = .58 - press * .035;
      lens.position.z = .44 + Math.sin(time * 1.8) * .025;
      dial.rotation.y = time * .25;
    };
    return group;
  }
  function centre(object) {
    object.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(object), size = bounds.getSize(new T.Vector3());
    if (!Number.isFinite(size.length()) || size.length() === 0) throw Error('Empty portal model');
    object.position.sub(bounds.getCenter(new T.Vector3()));
    const root = new T.Group(); root.add(object);
    root.scale.setScalar(Math.min(1.85 / size.y, 1.75 / Math.hypot(size.x, size.z)));
    return root;
  }
  function disposeObject(root) {
    const resources = new Set();
    root.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
        for (const value of Object.values(mat)) if (value?.isTexture) resources.add(value);
        resources.add(mat);
      }
    });
    resources.forEach(resource => resource.dispose());
  }
  async function loadModel(url) {
    if (!roots.has(url)) roots.set(url, window.showroomAssets.model(url).then(gltf => {
      let root;
      try { root = centre(gltf.scene); } catch (error) { disposeObject(gltf.scene); throw error; }
      if (destroyed) { disposeObject(root); throw Error('Portal removed'); }
      loadedRoots.add(root); return root;
    }));
    return roots.get(url);
  }
  function chooseGarment(current) {
    if (!bag.length) {
      bag = [...garments];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag.at(-1)?.slug === current?.slug && bag.length > 1) [bag[0], bag[bag.length - 1]] = [bag.at(-1), bag[0]];
    }
    return bag.pop();
  }
  function setGarment(card, item, model) {
    card.item = item; card.model = model; card.dirty = true;
    card.link.dataset.currentName = item.name;
    const label = card.link.querySelector('[data-portal-name]'); if (label) label.textContent = item.name;
  }
  function preloadNext(card) {
    if (card.next || card.loading || garments.length < 2 || !running() || !card.visible) return;
    const item = chooseGarment(card.item); card.loading = true;
    loadModel(item.rackModel).then(model => { if (!destroyed) card.next = { item, model }; }).catch(() => {}).finally(() => { card.loading = false; });
  }
  function initializeCard(card) {
    if (card.model || card.loading || card.failed || destroyed) return;
    if (card.kind === 'gallery' || card.kind === 'archive') {
      card.model = card.kind === 'gallery' ? makeCamera() : makeBook(); loadedRoots.add(card.model); card.dirty = true; return;
    }
    const item = garments[0];
    if (!window.showroomAssets?.model || (card.kind === 'lab' && !item)) { card.failed = true; return; }
    card.loading = true;
    loadModel(card.kind === 'eden' ? APPLE_URL : item.rackModel).then(model => {
      if (destroyed) return;
      if (card.kind === 'lab') setGarment(card, item, model); else { card.model = model; card.dirty = true; }
      request();
    }).catch(() => { card.failed = true; }).finally(() => { card.loading = false; });
  }
  function contextLost(event) {
    event.preventDefault(); failed = true; cancelAnimationFrame(frame); frame = 0;
    for (const card of cards) card.stage.classList.remove('is-ready');
    playing = false; updateControl();
  }
  function ensureRenderer() {
    if (renderer || failed || destroyed) return Boolean(renderer);
    if (!T || !window.ShowroomGLTFLoader) { failed = true; playing = false; updateControl(); return false; }
    try {
      renderer = new T.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
      window.showroomEnableKTX2?.(renderer);
      renderer.domElement.addEventListener('webglcontextlost', contextLost);
      scene = new T.Scene();
      scene.add(new T.HemisphereLight(0xfff4df, 0x6f766d, 2.4));
      const key = new T.DirectionalLight(0xffffff, 3.0); key.position.set(-3, 5, 5); scene.add(key);
      const rim = new T.DirectionalLight(0xffd5a1, 1.4); rim.position.set(4, 2, -4); scene.add(rim);
      camera = new T.PerspectiveCamera(31, 1, .05, 40); camera.position.set(0, .08, 4.5); camera.lookAt(0, 0, 0);
      return true;
    } catch {
      renderer?.dispose(); renderer = null; failed = true; playing = false; updateControl(); return false;
    }
  }
  function request() {
    if (destroyed || failed || document.hidden || !visible()) return;
    if (!ensureRenderer()) return;
    for (const card of cards) if (card.visible) initializeCard(card);
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function draw(time) {
    frame = 0;
    if (destroyed || failed || document.hidden || !visible()) { last = 0; return; }
    if (last && time - last < 1000 / 30) { frame = requestAnimationFrame(draw); return; }
    const dt = last ? Math.min((time - last) / 1000, .08) : 0; last = time;
    for (const card of cards) {
      if (!card.visible || !card.model || (!playing && !card.dirty)) continue;
      if (playing) {
        card.time += dt;
        card.yaw += dt * (card.kind === 'lab' ? 3.05 : card.kind === 'eden' ? .85 : .55);
        if (card.kind === 'lab') {
          if (card.time >= card.changeAt && card.next) {
            setGarment(card, card.next.item, card.next.model); card.next = null; card.changeAt = card.time + 2.5;
          }
          preloadNext(card);
        }
      }
      card.model.rotation.y = card.yaw;
      card.model.userData.update?.(card.time);
      const rect = card.stage.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = Math.min(dpr, 480 / Math.max(rect.width, rect.height));
      const width = Math.max(1, Math.round(rect.width * scale)), height = Math.max(1, Math.round(rect.height * scale));
      if (card.canvas.width !== width || card.canvas.height !== height) { card.canvas.width = width; card.canvas.height = height; }
      if (renderWidth !== width || renderHeight !== height) { renderer.setSize(width, height, false); renderWidth = width; renderHeight = height; }
      camera.aspect = width / height;
      camera.position.z = Math.max(4.5, 3.4 / camera.aspect); camera.updateProjectionMatrix();
      scene.add(card.model); renderer.render(scene, camera); scene.remove(card.model);
      card.ctx.clearRect(0, 0, width, height); card.ctx.drawImage(renderer.domElement, 0, 0);
      card.stage.classList.add('is-ready'); card.dirty = false;
    }
    if (running() && cards.some(card => card.visible && card.model)) frame = requestAnimationFrame(draw); else last = 0;
  }
  function sync() { last = 0; cancelAnimationFrame(frame); frame = 0; request(); }
  function clickToggle() { userChoice = true; playing = !playing; updateControl(); sync(); }
  function reducedChanged() { if (media.matches) playing = false; else if (!userChoice) playing = true; updateControl(); sync(); }
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = cards.find(item => item.stage === entry.target); if (!card) continue;
      card.visible = entry.isIntersecting; if (card.visible) card.dirty = true;
    }
    sync();
  }, { threshold: .01 });
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) { const card = cards.find(item => item.stage === entry.target); if (card) card.dirty = true; }
    request();
  });
  cards.forEach(card => { io.observe(card.stage); ro.observe(card.stage); });
  toggle?.addEventListener('click', clickToggle);
  document.addEventListener('visibilitychange', sync);
  media.addEventListener('change', reducedChanged);
  updateControl();
  const api = {
    destroy() {
      if (destroyed) return; destroyed = true; cancelAnimationFrame(frame);
      io.disconnect(); ro.disconnect(); toggle?.removeEventListener('click', clickToggle);
      document.removeEventListener('visibilitychange', sync); media.removeEventListener('change', reducedChanged);
      renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
      loadedRoots.forEach(disposeObject); loadedRoots.clear(); roots.clear();
      renderer?.dispose(); renderer?.forceContextLoss();
      for (const card of cards) { card.ctx.clearRect(0, 0, card.canvas.width, card.canvas.height); card.stage.classList.remove('is-ready'); }
      section.dataset.motion = 'paused'; if (toggle) toggle.hidden = true;
      mounted.delete(section);
    }
  };
  mounted.set(section, api); return api;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setupProductPortals(), { once: true });
else setupProductPortals();
