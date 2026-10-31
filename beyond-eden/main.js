import * as THREE from 'three/webgpu';
import { CONFIG, QUALITY_PRESETS, THREE_REVISION, VERSION } from './config.js';
import { createRenderer } from './core/renderer.js';
import { QualityManager } from './core/quality.js';
import { SliceAssetLoader } from './core/asset-loader.js';
import { CollisionWorld } from './core/collisions.js';
import { FirstPersonController } from './core/controls.js';
import { DistrictStreamer } from './core/streaming.js';
import { BenchRunner } from './core/bench.js';
import { rendererCounters, estimateTextureMemory, measureTransferSize } from './core/resource-metrics.js';
import { createMaterialLibrary } from './scene/materials.js';
import { createPbrMaterialLibrary } from './scene/pbr-materials.js';
import { createTempleSectorFactory, disposeSector, registerTempleColliders } from './scene/proxy-temple.js';
import { createNightAtmosphere } from './scene/atmosphere.js';
import { Flashlight } from './scene/flashlight.js';
import { createRitualDoor } from './scene/ritual-door.js';
import { createPracticalLights } from './scene/practical-lights.js';
import { TreeSystem } from './scene/vegetation.js';

const $ = id => document.getElementById(id);
const sceneHost = $('scene');
const fatal = $('fatal');

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function showFatal(error) {
  console.error(error);
  fatal.hidden = false;
  fatal.dataset.shown = 'true';
  fatal.textContent = `Beyond Eden proof slice failed.\n\n${error?.stack || error}\n\nNo remote files were changed.`;
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function init() {
  const initialPreset = QUALITY_PRESETS[CONFIG.initialQuality];
  const { renderer, backendName, resize, dispose: disposeRenderer } = await createRenderer({
    container: sceneHost,
    preset: initialPreset,
    forceWebGL: CONFIG.forceWebGL,
  });
  $('backend-label').textContent = `${backendName} · three ${THREE_REVISION}`;
  $('backend-dot').classList.add('live');

  const scene = new THREE.Scene();
  scene.name = 'Beyond Eden Scottish Rite Temple proof slice';
  const camera = new THREE.PerspectiveCamera(63, sceneHost.clientWidth / sceneHost.clientHeight, .08, 240);
  camera.name = 'Player camera';
  scene.add(camera);

  const quality = new QualityManager(renderer, CONFIG.initialQuality);
  const collisionWorld = new CollisionWorld(CONFIG.bounds);
  registerTempleColliders(collisionWorld);
  const controls = new FirstPersonController({ camera, element: renderer.domElement, collisionWorld, spawn: CONFIG.spawn });
  const materials = createMaterialLibrary();
  const assets = await new SliceAssetLoader({ renderer, ktx2TranscoderPath: CONFIG.ktx2TranscoderPath }).init();
  const atmosphere = createNightAtmosphere({ scene, preset: quality.preset, camera });
  const practicalLights = createPracticalLights({ scene, preset: quality.preset });
  const ritualDoor = createRitualDoor({ scene, position: CONFIG.templeDoor });
  ritualDoor.setPages(0);
  const flashlight = new Flashlight({ camera, config: CONFIG.flashlight, preset: quality.preset });
  const trees = await new TreeSystem({ scene, camera, assetLoader: assets, preset: quality.preset }).init();

  const streamer = new DistrictStreamer({ scene, camera, config: CONFIG.streaming, enabled: true });
  const pbr = createPbrMaterialLibrary({ assetLoader: assets });
  const sectorDefinitions = createTempleSectorFactory({ materials, assetLoader: assets, assetRoot: CONFIG.assetRoot, pbr });
  sectorDefinitions.forEach(definition => streamer.register({ ...definition, dispose: disposeSector }));
  streamer.update(performance.now());

  const inspectScene = () => ({
    version: VERSION,
    backend: backendName,
    quality: quality.snapshot(),
    player: controls.pose(),
    streaming: streamer.inspect(),
    vegetation: trees.inspect(),
    flashlight: flashlight.snapshot(),
  });

  const bench = new BenchRunner({
    renderer,
    scene,
    quality,
    backendName,
    config: CONFIG.bench,
    inspect: inspectScene,
  });

  let benchmarkPathStart = 0;
  bench.addEventListener('measurestart', event => { benchmarkPathStart = event.detail.startedAt; });
  bench.addEventListener('complete', event => {
    $('bench-output').textContent = JSON.stringify(event.detail, null, 2);
    $('download-report').disabled = false;
    $('bench-dialog').showModal();
  });

  const applyQuality = snapshot => {
    atmosphere.applyQuality(snapshot);
    practicalLights.applyQuality(snapshot);
    flashlight.applyQuality(snapshot);
    trees.applyQuality(snapshot);
    streamer.applyQuality(snapshot);
    document.querySelectorAll('[data-quality]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.quality === snapshot.name)));
  };
  quality.addEventListener('change', event => applyQuality(event.detail));
  applyQuality(quality.snapshot());

  const updateFlashlightHud = state => {
    $('flashlight-mode').textContent = state.enabled ? state.mode.toUpperCase() : 'OFF';
    $('battery-value').textContent = `${Math.round(state.battery)}%`;
    $('battery-fill').style.width = `${state.battery}%`;
    $('battery-fill').parentElement.setAttribute('aria-valuenow', String(Math.round(state.battery)));
  };
  flashlight.addEventListener('change', event => updateFlashlightHud(event.detail));
  flashlight.addEventListener('tick', event => updateFlashlightHud(event.detail));
  updateFlashlightHud(flashlight.snapshot());

  controls.addEventListener('lockchange', event => {
    $('interaction-line').textContent = event.detail
      ? 'WASD move · Shift run · mouse look · F flashlight · Q focus · R flicker test · Esc release'
      : 'Click the scene to enter · WASD move · F flashlight · Q focus';
  });

  const qualityPanel = $('quality-panel');
  $('quality-open').onclick = () => { qualityPanel.hidden = false; };
  $('quality-close').onclick = () => { qualityPanel.hidden = true; };
  document.querySelectorAll('[data-quality]').forEach(button => {
    button.onclick = () => quality.setPreset(button.dataset.quality);
  });
  $('adaptive-toggle').onchange = event => quality.setAdaptive(event.target.checked);
  $('streaming-toggle').onchange = event => streamer.setEnabled(event.target.checked);

  const runBench = async () => {
    if (bench.running) return;
    document.exitPointerLock?.();
    controls.enabled = false;
    const panelWasVisible = !qualityPanel.hidden;
    qualityPanel.hidden = true;
    $('run-bench').disabled = true;
    $('run-bench').textContent = 'Benchmark running…';
    try {
      await bench.runSuite(['high', 'medium', 'low'], text => { $('status-line').textContent = text; });
    } finally {
      controls.enabled = true;
      if (panelWasVisible) qualityPanel.hidden = false;
      $('run-bench').disabled = false;
      $('run-bench').textContent = 'Run all quality presets';
    }
  };
  $('run-bench').onclick = runBench;
  $('download-report').onclick = () => bench.download();
  $('bench-download').onclick = event => { event.preventDefault(); bench.download(); };

  const captureScreenshot = async () => {
    const filename = `beyond-eden-${quality.name}-${backendName.toLowerCase().replace(/\W+/g, '-')}.png`;
    let target = null;
    try {
      const width = Math.max(1, renderer.domElement.width);
      const height = Math.max(1, renderer.domElement.height);

      // WebGPU canvases are not guaranteed to preserve their last presented frame.
      // Render once into a temporary RGBA8 target and read it back through the
      // renderer API so capture works on both WebGPU and the WebGL2 fallback.
      if (typeof renderer.readRenderTargetPixelsAsync === 'function') {
        target = new THREE.RenderTarget(width, height, {
          depthBuffer: true,
          stencilBuffer: false,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        });
        target.texture.colorSpace = THREE.SRGBColorSpace;

        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);

        const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        const flipped = new Uint8ClampedArray(width * height * 4);
        const rowBytes = width * 4;
        for (let sourceRow = 0; sourceRow < height; sourceRow += 1) {
          const destinationRow = height - sourceRow - 1;
          flipped.set(pixels.subarray(sourceRow * rowBytes, (sourceRow + 1) * rowBytes), destinationRow * rowBytes);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { alpha: false });
        context.putImageData(new ImageData(flipped, width, height), 0, 0);
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(value => value ? resolve(value) : reject(new Error('The screenshot canvas did not encode a PNG.')), 'image/png');
        });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
        $('status-line').textContent = `Saved ${filename}.`;
        return;
      }

      // Legacy fallback for unusual renderer builds that do not expose async
      // render-target readback. It may fail if the browser clears the canvas,
      // which is why the path above is preferred.
      renderer.render(scene, camera);
      const blob = await new Promise((resolve, reject) => {
        renderer.domElement.toBlob(value => value ? resolve(value) : reject(new Error('The renderer canvas did not encode a PNG.')), 'image/png');
      });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      $('status-line').textContent = `Saved ${filename}.`;
    } catch (error) {
      renderer.setRenderTarget?.(null);
      console.warn('[Beyond Eden] Screenshot capture failed.', error);
      $('status-line').textContent = 'Screenshot capture failed in this browser backend.';
    } finally {
      target?.dispose();
    }
  };
  $('capture-frame').onclick = () => { void captureScreenshot(); };

  let lastStatusUi = 0;
  let lastStatusText = '';
  const updateStatus = now => {
    if (bench.running || now - lastStatusUi < 240) return;
    lastStatusUi = now;
    const doorDistance = camera.position.distanceTo(ritualDoor.root.getWorldPosition(new THREE.Vector3()));
    const loadedSectors = streamer.inspect().filter(sector => sector.state === 'loaded').length;
    let next = `${loadedSectors} streamed districts active · approach the temple.`;
    if (doorDistance < 13) next = 'The door is sealed. Eight page sockets remain dark.';
    else if (camera.position.z < -20) next = 'The plaza narrows toward the ceremonial entrance.';
    else if (camera.position.x < -35) next = 'West approach · alternate flank remains open.';
    else if (camera.position.x > 35) next = 'East approach · no single line controls the plaza.';
    if (next !== lastStatusText) {
      lastStatusText = next;
      $('status-line').textContent = next;
    }
  };

  let lastTime = performance.now();
  let lastUi = 0;
  let smoothedFrameMs = 16.7;

  const benchmarkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.95, 72),
    new THREE.Vector3(-46, 2.15, 18),
    new THREE.Vector3(0, 2.05, 5),
    new THREE.Vector3(46, 2.15, 18),
    new THREE.Vector3(0, 5.05, -34),
  ], false, 'centripetal');
  const benchmarkPoint = new THREE.Vector3();
  const benchmarkAhead = new THREE.Vector3();

  function benchmarkTour(now) {
    const elapsed = Math.max(0, (now - benchmarkPathStart) / 1000);
    const duration = Math.max(1, CONFIG.bench.sampleSeconds + CONFIG.bench.settleSeconds);
    const phase = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
    benchmarkCurve.getPointAt(phase, benchmarkPoint);
    benchmarkCurve.getPointAt(Math.min(1, phase + .025), benchmarkAhead);
    camera.position.copy(benchmarkPoint);
    camera.lookAt(benchmarkAhead.x, Math.max(2.5, benchmarkAhead.y + .7), benchmarkAhead.z);
  }

  function updateLiveMetrics(now) {
    if (bench.running || now - lastUi < 420) return;
    lastUi = now;
    const counters = rendererCounters(renderer);
    const texture = estimateTextureMemory(scene);
    const transfer = measureTransferSize();
    const rows = [
      ['Backend', backendName],
      ['Frame', `${smoothedFrameMs.toFixed(1)} ms`],
      ['Approx. FPS', formatNumber(1000 / smoothedFrameMs)],
      ['Pixel ratio', quality.dynamicPixelRatio.toFixed(2)],
      ['Draw calls', formatNumber(counters.drawCalls)],
      ['Triangles', formatNumber(counters.triangles)],
      ['Texture memory', `${texture.mebibytes.toFixed(1)} MiB est.`],
      ['Slice transfer', `${transfer.transferMiB.toFixed(1)} MiB`],
      ['Tree source', trees.mode],
    ];
    $('live-metrics').replaceChildren(...rows.flatMap(([label, value]) => {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      return [dt, dd];
    }));
  }

  renderer.setAnimationLoop(now => {
    const frameMs = Math.min(100, now - lastTime || 16.7);
    const dt = Math.min(.05, frameMs / 1000);
    lastTime = now;
    const time = now / 1000;
    smoothedFrameMs = THREE.MathUtils.lerp(smoothedFrameMs, frameMs, .08);

    if (bench.running) benchmarkTour(now);
    else controls.update(dt, time);

    streamer.update(now);
    trees.update(false, now);
    atmosphere.update(time);
    practicalLights.update(time);
    ritualDoor.update(time);
    flashlight.update(dt, now);
    quality.observe(frameMs, now);
    updateStatus(now);

    renderer.render(scene, camera);
    bench.sample(frameMs);
    updateLiveMetrics(now);
  });

  const onResize = () => {
    const width = sceneHost.clientWidth;
    const height = sceneHost.clientHeight;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    resize(width, height);
  };
  window.addEventListener('resize', onResize);

  $('fade').classList.add('ready');
  $('status-line').textContent = trees.mode === 'licensed-asset'
    ? 'Licensed tree asset loaded. Enter the plaza.'
    : 'Proxy tree active pending asset approval. Enter the plaza.';

  window.__BEYOND_EDEN__ = {
    version: VERSION,
    renderer,
    scene,
    camera,
    quality,
    streamer,
    trees,
    flashlight,
    ritualDoor,
    controls,
    bench,
    inspect: inspectScene,
    exportSnapshot: () => downloadJson(inspectScene(), 'beyond-eden-scene-snapshot.json'),
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      streamer.dispose();
      trees.dispose();
      flashlight.dispose();
      ritualDoor.dispose();
      practicalLights.dispose();
      atmosphere.dispose();
      materials.dispose();
      pbr.dispose();
      assets.dispose();
      disposeRenderer();
    },
  };

  if (CONFIG.autoBench) setTimeout(runBench, 1400);
}

init().catch(showFatal);
