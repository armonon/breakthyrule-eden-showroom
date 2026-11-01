import * as THREE from 'three/webgpu';

export class Flashlight extends EventTarget {
  constructor({ camera, config, preset }) {
    super();
    this.camera = camera;
    this.config = config;
    this.preset = preset;
    this.enabled = true;
    this.mode = 'wide';
    this.battery = 100;
    this.flickerUntil = 0;
    this.flickerStrength = 0;
    this.randomState = 9427;
    this.lastTickDispatch = 0;

    this.light = new THREE.SpotLight(0xd8fff1, config.wide.intensity, config.wide.distance, config.wide.angle, .42, 1.5);
    this.light.name = 'Player flashlight';
    this.light.position.set(.08, -.07, 0);
    this.light.castShadow = preset.flashlightShadows;
    this.light.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.light.shadow.camera.near = .15;
    this.light.shadow.camera.far = config.focus.distance + 4;
    this.light.shadow.bias = -.00035;
    this.target = new THREE.Object3D();
    this.target.position.set(0, -.035, -1);
    this.light.target = this.target;
    camera.add(this.light, this.target);

    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xc9ffee,
      transparent: true,
      opacity: .055,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.beam = new THREE.Mesh();
    this.beam.name = 'Flashlight beam volume approximation';
    camera.add(this.beam);
    this._rebuildBeam();
    this._bind();
    this._applyMode();
  }

  _bind() {
    this.onKeyDown = event => {
      if (event.repeat || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.code === 'KeyF') this.setEnabled(!this.enabled);
      if (event.code === 'KeyQ') this.toggleMode();
      if (event.code === 'KeyR') this.triggerFlicker(1.8, .88);
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  _random() {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  _rebuildBeam() {
    this.beam.geometry?.dispose?.();
    const settings = this.config[this.mode];
    const radius = Math.tan(settings.angle) * settings.distance;
    const geometry = new THREE.CylinderGeometry(.025, radius, settings.distance, this.preset.beamSegments, 1, true);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -settings.distance / 2);
    this.beam.geometry = geometry;
    this.beam.material = this.beamMaterial;
  }

  _applyMode() {
    const settings = this.config[this.mode];
    this.light.distance = settings.distance;
    this.light.angle = settings.angle;
    this.light.intensity = settings.intensity;
    this.beamMaterial.opacity = this.mode === 'focus' ? .076 : .043;
    this._rebuildBeam();
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.light.visible = this.enabled;
    this.beam.visible = this.enabled;
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot() }));
  }

  toggleMode() {
    if (this.mode === 'wide' && this.battery < this.config.minimumFocusBattery) return;
    this.mode = this.mode === 'wide' ? 'focus' : 'wide';
    this._applyMode();
  }

  triggerFlicker(seconds = 1.25, strength = .7) {
    this.flickerUntil = performance.now() + seconds * 1000;
    this.flickerStrength = THREE.MathUtils.clamp(strength, 0, 1);
  }

  applyQuality(preset) {
    this.preset = preset;
    this.light.castShadow = preset.flashlightShadows;
    this.light.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.light.shadow.needsUpdate = true;
    this._rebuildBeam();
  }

  update(dt, now = performance.now()) {
    if (this.enabled && this.mode === 'focus') {
      this.battery = Math.max(0, this.battery - this.config.focus.batteryDrain * dt);
      if (this.battery <= 0) {
        this.mode = 'wide';
        this._applyMode();
      }
    } else if (this.mode === 'wide') {
      this.battery = Math.min(100, this.battery + this.config.rechargePerSecond * dt);
    }

    let modulation = 1;
    if (now < this.flickerUntil) {
      const noise = this._random();
      modulation = noise < this.flickerStrength * .22 ? .04 : THREE.MathUtils.lerp(.42, 1.08, noise);
    }
    const settings = this.config[this.mode];
    this.light.intensity = this.enabled ? settings.intensity * modulation : 0;
    this.beamMaterial.opacity = this.enabled ? (this.mode === 'focus' ? .076 : .043) * modulation : 0;
    if (now - this.lastTickDispatch >= 100) {
      this.lastTickDispatch = now;
      this.dispatchEvent(new CustomEvent('tick', { detail: this.snapshot() }));
    }
  }

  snapshot() {
    return { enabled: this.enabled, mode: this.mode, battery: this.battery, flickering: performance.now() < this.flickerUntil };
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.camera.remove(this.light, this.target, this.beam);
    this.light.dispose?.();
    this.beam.geometry.dispose();
    this.beamMaterial.dispose();
  }
}
