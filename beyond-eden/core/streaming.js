import * as THREE from 'three/webgpu';

export class DistrictStreamer extends EventTarget {
  constructor({ scene, camera, config, enabled = true }) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.config = config;
    this.enabled = enabled;
    this.sectors = new Map();
    this.lastUpdate = 0;
    this.lodDistanceScale = 1;
  }

  register(definition) {
    this.sectors.set(definition.id, {
      ...definition,
      anchor: new THREE.Vector3(...definition.anchor),
      state: 'unloaded',
      object: null,
      lod: null,
      token: 0,
      lastWanted: 0,
      requestedLod: null,
    });
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) for (const sector of this.sectors.values()) this._ensureLoaded(sector, 0);
  }

  applyQuality(preset) {
    this.lodDistanceScale = Number(preset?.lodDistanceScale) || 1;
    this.lastUpdate = 0;
  }

  _wantedLod(sector, distance) {
    const distances = (sector.lodDistances || [42, 84]).map(value => value * this.lodDistanceScale);
    if (distance < distances[0]) return 0;
    if (distance < distances[1]) return 1;
    return 2;
  }

  async _ensureLoaded(sector, lod) {
    sector.lastWanted = performance.now();
    if (sector.state === 'loaded' && sector.lod === lod) return;
    if (sector.state === 'loading' && sector.requestedLod === lod) return;
    const token = ++sector.token;
    sector.state = 'loading';
    sector.requestedLod = lod;
    try {
      const next = await sector.load(lod);
      if (token !== sector.token) {
        sector.dispose?.(next);
        return;
      }
      if (sector.object) {
        this.scene.remove(sector.object);
        sector.dispose?.(sector.object);
      }
      sector.object = next;
      sector.lod = lod;
      sector.state = 'loaded';
      sector.requestedLod = null;
      this.scene.add(next);
      this.dispatchEvent(new CustomEvent('sectorload', { detail: { id: sector.id, lod } }));
    } catch (error) {
      sector.state = 'error';
      sector.requestedLod = null;
      console.error(`[Beyond Eden] Failed to load sector ${sector.id}`, error);
    }
  }

  _unload(sector) {
    sector.token += 1;
    if (sector.object) {
      this.scene.remove(sector.object);
      sector.dispose?.(sector.object);
    }
    sector.object = null;
    sector.lod = null;
    sector.state = 'unloaded';
    sector.requestedLod = null;
    this.dispatchEvent(new CustomEvent('sectorunload', { detail: { id: sector.id } }));
  }

  update(now = performance.now()) {
    if (now - this.lastUpdate < 260) return;
    this.lastUpdate = now;
    const cameraPosition = this.camera.position;
    const forward = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();

    for (const sector of this.sectors.values()) {
      const delta = sector.anchor.clone().sub(cameraPosition);
      const distance = delta.length();
      const direction = delta.setY(0).normalize();
      const behind = direction.dot(forward) < this.config.rearCullDot;
      const shouldLoad = !this.enabled || sector.alwaysLoaded || distance <= this.config.preloadRadius || (!behind && distance <= this.config.unloadRadius);

      if (shouldLoad) {
        const lod = this._wantedLod(sector, distance);
        this._ensureLoaded(sector, lod);
      } else if (sector.state === 'loaded' && now - sector.lastWanted > this.config.unloadDelayMs) {
        this._unload(sector);
      }
    }
  }

  inspect() {
    return [...this.sectors.values()].map(({ id, state, lod, object }) => ({ id, state, lod, visible: Boolean(object?.visible) }));
  }

  dispose() {
    for (const sector of this.sectors.values()) this._unload(sector);
    this.sectors.clear();
  }
}
