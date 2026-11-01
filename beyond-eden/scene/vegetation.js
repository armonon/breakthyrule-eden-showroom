import * as THREE from 'three/webgpu';

function seededPositions() {
  let seed = 418219;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = [];
  for (let i = 0; i < 48; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = side * (24 + random() * 45);
    const z = -62 + random() * 152;
    const scale = .78 + random() * .68;
    const rotation = random() * Math.PI * 2;
    positions.push({ x, z, scale, rotation });
  }
  return positions;
}

function matrixFor(position, localMatrix = null, visibleScale = 1, target = new THREE.Matrix4()) {
  const placement = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), position.rotation);
  placement.compose(
    new THREE.Vector3(position.x, 0, position.z),
    quaternion,
    new THREE.Vector3(position.scale * visibleScale, position.scale * visibleScale, position.scale * visibleScale),
  );
  return localMatrix ? target.multiplyMatrices(placement, localMatrix) : target.copy(placement);
}

function createAssetInstances(sourceScene, positions, name) {
  sourceScene.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = name;
  const records = [];
  sourceScene.traverse(source => {
    if (!source.isMesh) return;
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, positions.length);
    mesh.name = `${name}: ${source.name || 'mesh'}`;
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const local = source.matrixWorld.clone();
    positions.forEach((position, index) => mesh.setMatrixAt(index, matrixFor(position, local)));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    records.push({ mesh, local });
  });
  return {
    group,
    records,
    dispose() {
      const geometries = new Set(records.map(record => record.mesh.geometry));
      const materials = new Set(records.flatMap(record => Array.isArray(record.mesh.material) ? record.mesh.material : [record.mesh.material]));
      geometries.forEach(geometry => geometry?.dispose?.());
      materials.forEach(material => {
        for (const value of Object.values(material || {})) if (value?.isTexture) value.dispose?.();
        material?.dispose?.();
      });
    },
  };
}

function createProxyInstances(positions) {
  const group = new THREE.Group();
  group.name = 'Proxy trees — replace after licensed asset approval';
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x3b3027, roughness: 1 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3c31, roughness: .96, alphaTest: .35, side: THREE.DoubleSide });
  const trunkGeometry = new THREE.CylinderGeometry(.22, .42, 6.8, 8);
  const crownGeometry = new THREE.IcosahedronGeometry(2.45, 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, positions.length);
  const crownsA = new THREE.InstancedMesh(crownGeometry, leafMaterial, positions.length);
  const crownsB = new THREE.InstancedMesh(crownGeometry, leafMaterial, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((position, index) => {
    dummy.position.set(position.x, 3.4 * position.scale, position.z);
    dummy.rotation.y = position.rotation;
    dummy.scale.set(position.scale, position.scale, position.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    dummy.position.set(position.x - .7 * position.scale, 7.2 * position.scale, position.z);
    dummy.scale.set(1.18 * position.scale, .88 * position.scale, 1.05 * position.scale);
    dummy.updateMatrix();
    crownsA.setMatrixAt(index, dummy.matrix);
    dummy.position.set(position.x + .95 * position.scale, 6.6 * position.scale, position.z + .32 * position.scale);
    dummy.scale.set(.95 * position.scale, .72 * position.scale, .86 * position.scale);
    dummy.updateMatrix();
    crownsB.setMatrixAt(index, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = crownsA.instanceMatrix.needsUpdate = crownsB.instanceMatrix.needsUpdate = true;
  group.add(trunks, crownsA, crownsB);
  return {
    group,
    records: [
      { mesh: trunks, type: 'trunk' },
      { mesh: crownsA, type: 'crownA' },
      { mesh: crownsB, type: 'crownB' },
    ],
    dispose() {
      trunkGeometry.dispose(); crownGeometry.dispose(); trunkMaterial.dispose(); leafMaterial.dispose();
    },
  };
}


function disposeLoadedAsset(result) {
  if (!result?.scene) return;
  const geometries = new Set();
  const materials = new Set();
  result.scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    list.forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose?.());
  materials.forEach(material => {
    for (const value of Object.values(material || {})) if (value?.isTexture) value.dispose?.();
    material?.dispose?.();
  });
}

function createBillboards(positions, texture = null) {
  const geometry = new THREE.PlaneGeometry(8.5, 10.5);
  geometry.translate(0, 5.25, 0);
  const material = new THREE.MeshBasicMaterial({
    color: texture ? 0xffffff : 0x18372d,
    map: texture,
    alphaMap: texture,
    transparent: Boolean(texture),
    alphaTest: texture ? .4 : 0,
    depthWrite: true,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  mesh.name = 'Tree billboard/impostor instances';
  mesh.frustumCulled = true;
  return { mesh, geometry, material };
}

export class TreeSystem {
  constructor({ scene, camera, assetLoader, preset, manifestUrl = '/beyond-eden/assets/tree-manifest.json' }) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.preset = preset;
    this.manifestUrl = manifestUrl;
    this.positions = seededPositions();
    this.root = new THREE.Group();
    this.root.name = 'Plaza vegetation test';
    this.scene.add(this.root);
    this.near = null;
    this.mid = null;
    this.billboards = null;
    this.lastUpdate = 0;
    this.mode = 'proxy';
    this.activeSourceCount = this.positions.length;
  }

  async init() {
    let manifest = null;
    try {
      const response = await fetch(this.manifestUrl, { cache: 'no-store' });
      if (response.ok) manifest = await response.json();
    } catch {}

    if (manifest?.approved && manifest.lod0 && manifest.lod1) {
      const [lod0, lod1, billboard] = await Promise.all([
        this.assetLoader.loadOptional(manifest.lod0),
        this.assetLoader.loadOptional(manifest.lod1),
        manifest.billboard ? this.assetLoader.ktx2.loadAsync(manifest.billboard).catch(() => null) : null,
      ]);
      if (lod0 && lod1) {
        this.mode = 'licensed-asset';
        this.near = createAssetInstances(lod0.scene, this.positions, 'Licensed tree LOD0');
        this.mid = createAssetInstances(lod1.scene, this.positions, 'Licensed tree LOD1');
        this.billboards = createBillboards(this.positions, billboard);
      } else {
        disposeLoadedAsset(lod0);
        disposeLoadedAsset(lod1);
        billboard?.dispose?.();
      }
    }

    if (!this.near) {
      this.near = createProxyInstances(this.positions);
      this.mid = createProxyInstances(this.positions);
      this.mid.group.scale.setScalar(.96);
      this.billboards = createBillboards(this.positions);
    }

    this.root.add(this.near.group, this.mid.group, this.billboards.mesh);
    this.applyQuality(this.preset);
    this.update(true);
    return this;
  }

  applyQuality(preset) {
    this.preset = preset;
    this.activeSourceCount = Math.max(8, Math.floor(this.positions.length * preset.vegetationScale));
    this.update(true);
  }

  _visibleForMode(distance, mode) {
    if (mode === 'near') return distance < this.preset.treeNearDistance;
    if (mode === 'mid') return distance >= this.preset.treeNearDistance && distance < this.preset.treeImpostorDistance;
    return distance >= this.preset.treeImpostorDistance && distance < this.preset.treeCullDistance;
  }

  _updateAssetRecord(record, mode, cameraPosition, cameraYaw = 0) {
    const matrix = new THREE.Matrix4();
    const billboardQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
    let writeIndex = 0;
    for (let index = 0; index < this.activeSourceCount; index += 1) {
      const position = this.positions[index];
      const distance = Math.hypot(position.x - cameraPosition.x, position.z - cameraPosition.z);
      if (!this._visibleForMode(distance, mode)) continue;
      if (mode === 'billboard') {
        matrix.compose(
          new THREE.Vector3(position.x, 0, position.z),
          billboardQuaternion,
          new THREE.Vector3(position.scale, position.scale, position.scale),
        );
      } else {
        matrixFor(position, record.local || null, 1, matrix);
      }
      record.mesh.setMatrixAt(writeIndex++, matrix);
    }
    record.mesh.count = writeIndex;
    record.mesh.instanceMatrix.needsUpdate = true;
  }

  _updateProxyRecords(container, mode, cameraPosition) {
    const dummy = new THREE.Object3D();
    for (const record of container.records) {
      let writeIndex = 0;
      for (let index = 0; index < this.activeSourceCount; index += 1) {
        const position = this.positions[index];
        const distance = Math.hypot(position.x - cameraPosition.x, position.z - cameraPosition.z);
        if (!this._visibleForMode(distance, mode)) continue;
        const s = position.scale;
        if (record.type === 'trunk') {
          dummy.position.set(position.x, 3.4 * s, position.z);
          dummy.scale.set(s, s, s);
        } else if (record.type === 'crownA') {
          dummy.position.set(position.x - .7 * s, 7.2 * s, position.z);
          dummy.scale.set(1.18 * s, .88 * s, 1.05 * s);
        } else {
          dummy.position.set(position.x + .95 * s, 6.6 * s, position.z + .32 * s);
          dummy.scale.set(.95 * s, .72 * s, .86 * s);
        }
        dummy.rotation.y = position.rotation;
        dummy.updateMatrix();
        record.mesh.setMatrixAt(writeIndex++, dummy.matrix);
      }
      record.mesh.count = writeIndex;
      record.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(force = false, now = performance.now()) {
    if (!force && now - this.lastUpdate < 230) return;
    this.lastUpdate = now;
    const cameraPosition = this.camera.position;
    const cameraYaw = this.camera.rotation.y;

    if (this.mode === 'licensed-asset') {
      this.near.records.forEach(record => this._updateAssetRecord(record, 'near', cameraPosition));
      this.mid.records.forEach(record => this._updateAssetRecord(record, 'mid', cameraPosition));
    } else {
      this._updateProxyRecords(this.near, 'near', cameraPosition);
      this._updateProxyRecords(this.mid, 'mid', cameraPosition);
    }
    this._updateAssetRecord({ mesh: this.billboards.mesh }, 'billboard', cameraPosition, cameraYaw);
  }

  inspect() {
    return {
      mode: this.mode,
      sourceInstances: this.positions.length,
      qualityBudgetInstances: this.activeSourceCount,
      nearInstances: this.near?.records?.[0]?.mesh.count || 0,
      midInstances: this.mid?.records?.[0]?.mesh.count || 0,
      billboardInstances: this.billboards?.mesh?.count || 0,
    };
  }

  dispose() {
    this.scene.remove(this.root);
    this.near?.dispose?.();
    this.mid?.dispose?.();
    this.billboards?.material?.map?.dispose?.();
    this.billboards?.geometry?.dispose?.();
    this.billboards?.material?.dispose?.();
  }
}
