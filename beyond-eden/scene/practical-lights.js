import * as THREE from 'three/webgpu';

export function createPracticalLights({ scene, preset }) {
  const positions = [
    [-30, 3.55, -23], [30, 3.55, -23], [-48, 3.55, 16], [48, 3.55, 16], [-20, 3.55, 35], [20, 3.55, 35],
  ];
  const lights = positions.map(([x, y, z], index) => {
    const light = new THREE.PointLight(0xffd7a5, 15, 15, 2.25);
    light.name = `Practical plaza lamp ${index + 1}`;
    light.position.set(x, y, z);
    light.castShadow = false;
    scene.add(light);
    return light;
  });

  const glowGeometry = new THREE.SphereGeometry(.13, 10, 7);
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xffddb0, transparent: true, opacity: .9, depthWrite: false });
  const glows = positions.map(([x, y, z]) => {
    const mesh = new THREE.Mesh(glowGeometry, glowMaterial);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  });

  const applyQuality = next => {
    lights.forEach((light, index) => { light.visible = index < next.practicalLights; });
    glows.forEach((glow, index) => { glow.visible = index < next.practicalLights; });
  };
  applyQuality(preset);

  return {
    applyQuality,
    update(time) {
      lights.forEach((light, index) => {
        light.intensity = 13.5 + Math.sin(time * 1.7 + index * 2.2) * .8;
      });
    },
    dispose() {
      lights.forEach(light => { scene.remove(light); light.dispose?.(); });
      glows.forEach(glow => scene.remove(glow));
      glowGeometry.dispose();
      glowMaterial.dispose();
    },
  };
}
