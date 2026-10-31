import * as THREE from 'three/webgpu';

export async function createRenderer({ container, preset, forceWebGL = false }) {
  const renderer = new THREE.WebGPURenderer({
    antialias: preset.antialias,
    samples: preset.samples,
    forceWebGL,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight, false);
  renderer.domElement.setAttribute('aria-label', 'Beyond Eden realtime renderer');
  renderer.domElement.tabIndex = 0;
  container.append(renderer.domElement);

  await renderer.init();

  const backend = renderer.backend;
  const backendName = backend?.isWebGPUBackend
    ? 'WebGPU'
    : backend?.isWebGLBackend
      ? 'WebGL2 fallback'
      : backend?.constructor?.name || (forceWebGL ? 'WebGL2 fallback' : 'Unknown backend');

  return {
    renderer,
    backendName,
    resize(width = container.clientWidth, height = container.clientHeight) {
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
