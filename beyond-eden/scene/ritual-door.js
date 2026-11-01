import * as THREE from 'three/webgpu';

export function createRitualDoor({ scene, position }) {
  const root = new THREE.Group();
  root.name = 'Sealed ceremonial door';
  root.position.set(position.x, position.y, position.z);

  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x393d38, roughness: .72, metalness: .18 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x171713, roughness: .48, metalness: .72, emissive: 0x07140f, emissiveIntensity: .28 });
  const sealMaterial = new THREE.MeshStandardMaterial({ color: 0x6d6550, roughness: .42, metalness: .72, emissive: 0x183d31, emissiveIntensity: .38 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(18.2, 11.3, 1.15), frameMaterial);
  const door = new THREE.Mesh(new THREE.BoxGeometry(15.7, 9.5, .75), doorMaterial);
  door.position.z = .72;
  root.add(frame, door);

  const seals = [];
  const geometry = new THREE.TorusGeometry(.38, .09, 8, 20);
  for (let i = 0; i < 8; i += 1) {
    const seal = new THREE.Mesh(geometry, sealMaterial.clone());
    const angle = THREE.MathUtils.lerp(Math.PI * 1.12, Math.PI * 1.88, i / 7);
    seal.position.set(Math.cos(angle) * 6.35, 1.55 + Math.sin(angle) * 3.3, 1.18);
    root.add(seal);
    seals.push(seal);
  }

  const glow = new THREE.PointLight(0x75ffd0, 18, 21, 2);
  glow.position.set(0, 1.3, 4.2);
  glow.name = 'Ritual door glow';
  root.add(glow);
  scene.add(root);

  let pages = 0;
  return {
    root,
    setPages(count) {
      pages = THREE.MathUtils.clamp(Math.floor(count), 0, 8);
      seals.forEach((seal, index) => {
        seal.material.emissive.set(index < pages ? 0x75ffd0 : 0x183d31);
        seal.material.emissiveIntensity = index < pages ? 2.4 : .38;
      });
    },
    update(time) {
      const pulse = .5 + .5 * Math.sin(time * 1.17);
      glow.intensity = 12 + pulse * 10 + pages * 1.2;
      doorMaterial.emissiveIntensity = .18 + pulse * .18 + pages * .06;
      seals.forEach((seal, index) => {
        seal.rotation.z = time * (index % 2 ? -.16 : .16);
        if (index >= pages) seal.material.emissiveIntensity = .25 + pulse * .22;
      });
    },
    dispose() {
      scene.remove(root);
      root.traverse(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
        else child.material?.dispose?.();
      });
      glow.dispose?.();
    },
  };
}
