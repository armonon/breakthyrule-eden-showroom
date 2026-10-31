import * as THREE from 'three/webgpu';
import { color, exponentialHeightFogFactor, fog, renderGroup, uniform } from 'three/tsl';

export function createNightAtmosphere({ scene, preset }) {
  const fogDensity = uniform(preset.fogDensity).setGroup(renderGroup);
  const fogHeight = uniform(preset.fogHeight).setGroup(renderGroup);
  const fogColor = color(0x102426);
  scene.fogNode = fog(fogColor, exponentialHeightFogFactor(fogDensity, fogHeight));
  scene.backgroundNode = color(0x03090c);
  scene.fog = new THREE.FogExp2(0x102426, preset.fogDensity * .34);

  const skyFill = new THREE.HemisphereLight(0x6e918d, 0x07100d, .42);
  skyFill.name = 'Static moon/sky fill';
  scene.add(skyFill);

  const starPositions = [];
  let seed = 98127;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 440; i += 1) {
    const azimuth = random() * Math.PI * 2;
    const elevation = .2 + random() * .78;
    const radius = 170;
    const ring = Math.sqrt(1 - elevation * elevation);
    starPositions.push(Math.cos(azimuth) * ring * radius, elevation * radius, Math.sin(azimuth) * ring * radius);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xbad7d2, size: .18, sizeAttenuation: true, transparent: true, opacity: .72, depthWrite: false, fog: false }));
  stars.name = 'Night sky stars';
  scene.add(stars);

  const mistMaterial = new THREE.MeshBasicMaterial({ color: 0x718f89, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const mistGeometry = new THREE.PlaneGeometry(36, 9);
  const mist = [];
  for (let i = 0; i < 8; i += 1) {
    const layer = new THREE.Mesh(mistGeometry, mistMaterial.clone());
    layer.rotation.x = -Math.PI / 2;
    layer.position.set(-55 + i * 16, .25 + (i % 3) * .18, -12 + (i % 4) * 24);
    layer.scale.set(1.8, 1.8, 1.8);
    scene.add(layer);
    mist.push(layer);
  }

  return {
    update(time) {
      for (let i = 0; i < mist.length; i += 1) {
        mist[i].position.x += Math.sin(time * .07 + i) * .002;
        mist[i].material.opacity = .025 + Math.sin(time * .19 + i * 1.7) * .008;
      }
    },
    applyQuality(next) {
      fogDensity.value = next.fogDensity;
      fogHeight.value = next.fogHeight;
      if (scene.fog) scene.fog.density = next.fogDensity * .34;
      for (let i = 0; i < mist.length; i += 1) mist[i].visible = i < Math.ceil(8 * next.vegetationScale);
    },
    dispose() {
      scene.remove(skyFill, stars, ...mist);
      starGeometry.dispose();
      stars.material.dispose();
      mistGeometry.dispose();
      mist.forEach(layer => layer.material.dispose());
    },
  };
}
