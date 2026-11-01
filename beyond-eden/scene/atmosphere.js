import * as THREE from 'three/webgpu';
import { cameraPosition, color, exponentialHeightFogFactor, fog, mix, positionWorld, renderGroup, uniform } from 'three/tsl';

export function createNightAtmosphere({ scene, preset, camera = null }) {
  const fogDensity = uniform(preset.fogDensity).setGroup(renderGroup);
  const fogHeight = uniform(preset.fogHeight).setGroup(renderGroup);
  const fogColor = color(0x1c2b34); // moonlit blue-grey haze
  scene.fogNode = fog(fogColor, exponentialHeightFogFactor(fogDensity, fogHeight));
  scene.backgroundNode = color(0x03090c);
  scene.fog = new THREE.FogExp2(0x1c2b34, preset.fogDensity * .34);

  const skyFill = new THREE.HemisphereLight(0x8fa6b8, 0x1a211d, .85);
  skyFill.name = 'Static moon/sky fill';
  scene.add(skyFill);

  // Moonlight: the one shadowed key light (shadows on high/medium only); everything else stays baked or local.
  const moon = new THREE.DirectionalLight(0xb9c9e6, 1.7);
  moon.name = 'Moonlight';
  moon.position.set(-46, 72, 38);
  moon.target.position.set(0, 0, -18);
  moon.castShadow = preset.flashlightShadows;
  moon.shadow.mapSize.set(preset.shadowMapSize * 2, preset.shadowMapSize * 2);
  Object.assign(moon.shadow.camera, { left: -78, right: 78, top: 78, bottom: -78, near: 10, far: 220 });
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = .05;
  scene.add(moon, moon.target);

  // Warm sodium uplights wash the windowless temple face so its relief bays read at night.
  const uplights = [-21, 21].map(x => {
    const light = new THREE.SpotLight(0xffc285, 1500, 46, .62, .7, 2);
    light.name = 'Facade uplight';
    light.position.set(x, .35, -33.5);
    light.target.position.set(x * .6, 17, -39);
    scene.add(light, light.target);
    return light;
  });

  // Night sky dome: deep zenith, faint sodium city glow at the horizon, and a pale moon toward the moonlight.
  const horizon = color(0x2a2f33), zenith = color(0x04080d), glow = color(0x5a4734);
  const dir = positionWorld.sub(cameraPosition).normalize();
  const skyMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const up = dir.y.clamp(0, 1);
  const moonDir = moon.position.clone().normalize();
  const moonDot = dir.dot(uniform(moonDir)).clamp(0, 1);
  skyMaterial.colorNode = mix(horizon, zenith, up.pow(.45)).add(glow.mul(up.oneMinus().pow(8).mul(.35))).add(color(0xdfe7f2).mul(moonDot.pow(900).mul(2.2))).add(color(0x6d7f95).mul(moonDot.pow(24).mul(.18)));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMaterial);
  sky.name = 'Night sky dome'; sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

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
      if (camera) sky.position.copy(camera.position);
      for (let i = 0; i < mist.length; i += 1) {
        mist[i].position.x += Math.sin(time * .07 + i) * .002;
        mist[i].material.opacity = .025 + Math.sin(time * .19 + i * 1.7) * .008;
      }
    },
    applyQuality(next) {
      fogDensity.value = next.fogDensity;
      fogHeight.value = next.fogHeight;
      if (scene.fog) scene.fog.density = next.fogDensity * .34;
      moon.castShadow = next.flashlightShadows;
      for (const light of uplights) light.visible = next.practicalLights >= 4;
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
