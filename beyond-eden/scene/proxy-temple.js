import * as THREE from 'three/webgpu';

const addMesh = (group, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0], name = '') => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
};

function addVertexAO(geometry, bottom = .45, top = 1) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox.min.y;
  const maxY = geometry.boundingBox.max.y;
  const span = Math.max(.001, maxY - minY);
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - minY) / span;
    const value = THREE.MathUtils.lerp(bottom, top, Math.pow(t, .65));
    colors[i * 3] = value;
    colors[i * 3 + 1] = value;
    colors[i * 3 + 2] = value * .98;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function createReliefInstances(material, lod) {
  const group = new THREE.Group();
  group.name = 'Relief panel bays';
  const count = 8;
  const panelGeometry = addVertexAO(new THREE.BoxGeometry(5.7, 9.4, lod === 0 ? .55 : .3, 1, lod === 0 ? 3 : 1, 1), .52, .92);
  const panels = new THREE.InstancedMesh(panelGeometry, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const side = i < 4 ? -1 : 1;
    const index = i % 4;
    dummy.position.set(side * (14.6 + index * 6.35), 9.7, -38.68);
    dummy.updateMatrix();
    panels.setMatrixAt(i, dummy.matrix);
  }
  panels.instanceMatrix.needsUpdate = true;
  panels.receiveShadow = true;
  group.add(panels);

  if (lod === 0) {
    const motifGeometry = addVertexAO(new THREE.CylinderGeometry(.35, 1.55, 6.2, 4, 1, false), .4, .95);
    motifGeometry.rotateZ(Math.PI / 4);
    const motifs = new THREE.InstancedMesh(motifGeometry, material, count);
    for (let i = 0; i < count; i += 1) {
      const side = i < 4 ? -1 : 1;
      const index = i % 4;
      dummy.position.set(side * (14.6 + index * 6.35), 9.6, -38.28);
      dummy.scale.set(.7, .7, .22);
      dummy.updateMatrix();
      motifs.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(1, 1, 1);
    }
    motifs.instanceMatrix.needsUpdate = true;
    motifs.receiveShadow = true;
    group.add(motifs);
  }
  return group;
}

function createLampInstances(material, positions) {
  const group = new THREE.Group();
  const poleGeometry = new THREE.CylinderGeometry(.08, .12, 3.7, 8);
  const headGeometry = new THREE.BoxGeometry(.55, .32, .35);
  const poles = new THREE.InstancedMesh(poleGeometry, material, positions.length);
  const heads = new THREE.InstancedMesh(headGeometry, material, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    dummy.position.set(x, 1.85, z);
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
    dummy.position.set(x, 3.74, z);
    dummy.rotation.x = -.18;
    dummy.updateMatrix();
    heads.setMatrixAt(index, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
  });
  poles.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  group.add(poles, heads);
  return group;
}

export function registerTempleColliders(world) {
  world.addBox(-36, 36, -58, -40.5, { id: 'temple:body', minY: 0, maxY: 24 });
  world.addBox(-48, -36, -55, -32, { id: 'temple:left-wing', minY: 0, maxY: 18 });
  world.addBox(36, 48, -55, -32, { id: 'temple:right-wing', minY: 0, maxY: 18 });
  world.addBox(-8.3, 8.3, -41.6, -39.1, { id: 'temple:sealed-door', minY: 2.7, maxY: 11 });
  const covers = [
    [-27, -22, -14, -8], [22, 27, -14, -8], [-39, -33, 2, 9], [33, 39, 2, 9],
    [-20, -14, 17, 23], [14, 20, 17, 23], [-52, -46, -11, -5], [46, 52, -11, -5],
  ];
  covers.forEach(([minX, maxX, minZ, maxZ], index) => world.addBox(minX, maxX, minZ, maxZ, { id: `plaza:cover-${index}`, minY: 0, maxY: 1.25 }));
}

export function createTempleSectorFactory({ materials, assetLoader, assetRoot, pbr = null }) {
  const loadModelOrProxy = async (assetName, lod, proxyFactory) => {
    const url = `${assetRoot}${assetName}-lod${lod}.glb`;
    const result = await assetLoader.loadOptional(url);
    if (result) {
      const scene = result.scene;
      scene.name = `${assetName} LOD ${lod}`;
      scene.userData.ownsMaterials = true;
      pbr?.apply(scene);
      return scene;
    }
    const proxy = proxyFactory(lod);
    proxy.userData.proxyFallback = true;
    proxy.userData.ownsMaterials = false;
    pbr?.apply(proxy);
    return proxy;
  };

  const templeCore = lod => {
    const group = new THREE.Group();
    group.name = `Temple core proxy LOD ${lod}`;
    const bodyGeometry = addVertexAO(new THREE.BoxGeometry(72, 20, 19, 1, lod === 0 ? 4 : 1, 1), .38, .96);
    addMesh(group, bodyGeometry, materials.stone, [0, 10, -48.5], [1, 1, 1], [0, 0, 0], 'Main windowless mass');
    addMesh(group, addVertexAO(new THREE.BoxGeometry(18, 15, 24), .4, .94), materials.stoneDark, [-42, 7.5, -45], [1, 1, 1], [0, 0, 0], 'West auditorium wing');
    addMesh(group, addVertexAO(new THREE.BoxGeometry(18, 15, 24), .4, .94), materials.stoneDark, [42, 7.5, -45], [1, 1, 1], [0, 0, 0], 'East auditorium wing');
    addMesh(group, new THREE.BoxGeometry(88, 1.18, .45), materials.mosaic, [0, 15.25, -38.83], [1, 1, 1], [0, 0, 0], 'Mosaic band');
    addMesh(group, addVertexAO(new THREE.BoxGeometry(24, 12.5, 3.1), .42, .96), materials.stoneDark, [0, 8.7, -38.2], [1, 1, 1], [0, 0, 0], 'Raised entrance block');
    group.add(createReliefInstances(materials.stoneDark, lod));

    if (lod < 2) {
      const capGeometry = addVertexAO(new THREE.BoxGeometry(76, .8, 21), .7, 1);
      addMesh(group, capGeometry, materials.stone, [0, 20.3, -48.3], [1, 1, 1], [0, 0, 0], 'Temple coping');
      const buttressGeometry = addVertexAO(new THREE.BoxGeometry(1.8, 18, 3.7), .38, .95);
      const buttresses = new THREE.InstancedMesh(buttressGeometry, materials.stoneDark, 10);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < 10; i += 1) {
        dummy.position.set(-32 + i * 7.1, 9, -38.1);
        dummy.updateMatrix();
        buttresses.setMatrixAt(i, dummy.matrix);
      }
      buttresses.instanceMatrix.needsUpdate = true;
      group.add(buttresses);
    }
    return group;
  };

  const plaza = lod => {
    const group = new THREE.Group();
    group.name = `Central plaza proxy LOD ${lod}`;
    addMesh(group, new THREE.BoxGeometry(112, .28, 72), materials.paving, [0, -.14, -2], [1, 1, 1], [0, 0, 0], 'Plaza paving');
    const stepCount = lod === 2 ? 7 : 14;
    for (let i = 0; i < stepCount; i += 1) {
      const normalized = i / stepCount;
      const height = (i + 1) * (3.25 / stepCount);
      const depth = 11.5 / stepCount;
      addMesh(group, new THREE.BoxGeometry(22 - normalized * 4, height, depth + .05), materials.stone, [0, height / 2, -28 - i * depth - depth / 2], [1, 1, 1], [0, 0, 0], `Entrance step ${i + 1}`);
    }
    addMesh(group, new THREE.BoxGeometry(25, .35, 6), materials.stone, [0, 3.08, -42], [1, 1, 1], [0, 0, 0], 'Entrance landing');

    const coverGeometry = addVertexAO(new THREE.BoxGeometry(5, 1.1, 6), .45, .9);
    const soilGeometry = new THREE.BoxGeometry(4.45, .16, 5.45);
    const positions = [[-24.5,-11],[24.5,-11],[-36,5.5],[36,5.5],[-17,20],[17,20],[-49,-8],[49,-8]];
    const covers = new THREE.InstancedMesh(coverGeometry, materials.planter, positions.length);
    const soils = new THREE.InstancedMesh(soilGeometry, materials.soil, positions.length);
    const dummy = new THREE.Object3D();
    positions.forEach(([x, z], index) => {
      dummy.position.set(x, .55, z); dummy.updateMatrix(); covers.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x, 1.04, z); dummy.updateMatrix(); soils.setMatrixAt(index, dummy.matrix);
    });
    covers.instanceMatrix.needsUpdate = soils.instanceMatrix.needsUpdate = true;
    group.add(covers, soils);
    group.add(createLampInstances(materials.bronze, [[-30, -23], [30, -23], [-48, 16], [48, 16], [-20, 35], [20, 35]]));
    return group;
  };

  const approachSouth = lod => {
    const group = new THREE.Group();
    group.name = `South approach proxy LOD ${lod}`;
    addMesh(group, new THREE.BoxGeometry(22, .22, 80), materials.paving, [0, -.11, 65], [1, 1, 1], [0, 0, 0], 'South processional approach');
    const wallGeometry = addVertexAO(new THREE.BoxGeometry(1.2, 1.2, 76), .5, .95);
    addMesh(group, wallGeometry, materials.stoneDark, [-12.4, .6, 65]);
    addMesh(group, wallGeometry.clone(), materials.stoneDark, [12.4, .6, 65]);
    if (lod < 2) group.add(createLampInstances(materials.bronze, [[-10, 35], [10, 35], [-10, 61], [10, 61], [-10, 86], [10, 86]]));
    return group;
  };

  const approachSide = (side, lod) => {
    const group = new THREE.Group();
    const x = side * 56;
    group.name = `${side < 0 ? 'West' : 'East'} approach proxy LOD ${lod}`;
    addMesh(group, new THREE.BoxGeometry(42, .22, 15), materials.paving, [x, -.11, 7], [1, 1, 1], [0, 0, 0], 'Side approach paving');
    addMesh(group, addVertexAO(new THREE.BoxGeometry(30, 2.4, 1.1), .5, .92), materials.stoneDark, [x + side * 4, 1.2, -1.5]);
    addMesh(group, addVertexAO(new THREE.BoxGeometry(20, 1.1, 2.2), .5, .92), materials.planter, [x - side * 5, .55, 15.5]);
    if (lod === 0) {
      const arch = new THREE.TorusGeometry(5.3, .72, 10, 28, Math.PI);
      arch.rotateZ(Math.PI);
      addMesh(group, arch, materials.stone, [x, 5.2, 2.4], [1, 1, 1], [0, 0, 0], 'Side ceremonial arch');
    }
    return group;
  };

  return [
    { id: 'temple-core', anchor: [0, 0, -48], alwaysLoaded: true, lodDistances: [56, 106], load: lod => loadModelOrProxy('temple-core', lod, templeCore) },
    { id: 'plaza-center', anchor: [0, 0, -3], lodDistances: [48, 92], load: lod => loadModelOrProxy('plaza-center', lod, plaza) },
    { id: 'approach-south', anchor: [0, 0, 62], lodDistances: [50, 90], load: lod => loadModelOrProxy('approach-south', lod, approachSouth) },
    { id: 'approach-west', anchor: [-56, 0, 7], lodDistances: [46, 84], load: lod => loadModelOrProxy('approach-west', lod, value => approachSide(-1, value)) },
    { id: 'approach-east', anchor: [56, 0, 7], lodDistances: [46, 84], load: lod => loadModelOrProxy('approach-east', lod, value => approachSide(1, value)) },
  ];
}

export function disposeSector(object) {
  const ownsMaterials = Boolean(object?.userData?.ownsMaterials);
  const materials = new Set();
  object.traverse(child => {
    child.geometry?.dispose?.();
    if (!ownsMaterials || !child.material) return;
    if (Array.isArray(child.material)) child.material.forEach(material => materials.add(material));
    else materials.add(child.material);
    for (const material of materials) if (material.userData?.shared) materials.delete(material); // shared photographic stone
  });
  if (ownsMaterials) {
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose?.();
      material.dispose?.();
    }
  }
}
