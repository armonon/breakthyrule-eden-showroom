import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class SliceAssetLoader {
  constructor({ renderer, ktx2TranscoderPath }) {
    this.renderer = renderer;
    this.ktx2TranscoderPath = ktx2TranscoderPath;
    this.ktx2 = null;
    this.gltf = null;
    this.inflight = new Map();
    this.missing = new Set();
    this.ready = false;
  }

  async init() {
    if (this.ready) return this;
    this.ktx2 = new KTX2Loader().setTranscoderPath(this.ktx2TranscoderPath);
    await this.ktx2.detectSupport(this.renderer);
    this.gltf = new GLTFLoader();
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.ready = true;
    return this;
  }

  async load(url) {
    if (!this.ready || !this.gltf) throw new Error('SliceAssetLoader.init() must complete before loading assets.');
    if (this.inflight.has(url)) return this.inflight.get(url);
    const task = this.gltf.loadAsync(url).then(result => {
      result.scene.traverse(object => {
        if (!object.isMesh) return;
        object.frustumCulled = true;
        object.castShadow = false;
        object.receiveShadow = true;
      });
      return result;
    }).finally(() => this.inflight.delete(url));
    this.inflight.set(url, task);
    return task;
  }

  async loadOptional(url) {
    if (this.missing.has(url)) return null;
    try {
      return await this.load(url);
    } catch (error) {
      const status = error?.target?.status ?? error?.response?.status;
      if (status === 404 || /404|not found/i.test(String(error?.message))) {
        this.missing.add(url);
        return null;
      }
      console.warn(`[Beyond Eden] Optional asset failed: ${url}`, error);
      return null;
    }
  }

  dispose() {
    this.ktx2?.dispose();
    this.inflight.clear();
    this.missing.clear();
    this.ready = false;
  }
}
