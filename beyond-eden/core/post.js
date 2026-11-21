import * as THREE from 'three/webgpu';
import {
  Fn, Loop, If, float, vec2, vec3, vec4, uniform, uniformArray, pass, screenUV, screenSize, select, step, exp, abs, length, mix, dot,
  perspectiveDepthToViewZ, cameraNear, cameraFar,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';

// Lens effects for the night plaza, as one RenderPipeline over an HDR scene pass (tone mapping and sRGB happen at
// the pipeline's output, so bloom thresholds and glare work in linear light):
//   bloom            soft glow around anything brighter than ~white (lamp globes, the flashlight hotspot, the moon)
//   lens ghosts      bloom reflected through the lens centre, blurred (high only)
//   glare            a core, a horizontal streak and a four-point star on each practical lamp and the moon, dimmed
//                    by whatever stands in front of it (sampled from the depth buffer)
//   vignette, grain  the last touches of a camera
// Presets choose a level: 'full' (everything), 'lite' (bloom, glare, vignette, grain) or 'none' (plain render).
const SOURCES = 8;
const TAPS = [[0, 0], [.7, 0], [-.7, 0], [0, .7], [0, -.7]];

export function createPostProcessing({ renderer, scene, camera, preset, enabled = true }) {
  const pipeline = new THREE.RenderPipeline(renderer);
  // Per source: screen uv (top-left origin) + glare weight + size; depth-test disc: uv + distance + radius; tint.
  const glareSources = Array.from({ length: SOURCES }, () => new THREE.Vector4());
  const occluders = Array.from({ length: SOURCES }, () => new THREE.Vector4());
  const tints = Array.from({ length: SOURCES }, () => new THREE.Vector3(1, 1, 1));
  const glareNode = uniformArray(glareSources, 'vec4'), occluderNode = uniformArray(occluders, 'vec4'), tintNode = uniformArray(tints, 'vec3');
  const glareStrength = uniform(3.5), vignette = uniform(.3), grain = uniform(.1);
  const settings = { level: 'none', bloom: .55, bloomRadius: .45, bloomThreshold: .85, ghosts: .22 };
  let scenePass = null, bloomPass = null, samples = -1;
  const lights = [];
  const tmp = new THREE.Vector3(), toCamera = new THREE.Vector3(), cameraPosition = new THREE.Vector3();

  function glare(depth) {
    return Fn(() => {
      const aspect = screenSize.x.div(screenSize.y);
      const total = vec3(0).toVar();
      Loop(SOURCES, ({ i }) => {
        const s = glareNode.element(i);
        If(s.z.greaterThan(0), () => {
          // Unoccluded fraction: taps in a disc the size of the source, counted where nothing is nearer than it.
          const o = occluderNode.element(i);
          let visible = float(0);
          for (const [x, y] of TAPS) {
            const q = o.xy.add(vec2(x, y).mul(o.w).mul(vec2(aspect.reciprocal(), 1)));
            const dist = perspectiveDepthToViewZ(depth.sample(q).r, cameraNear, cameraFar).negate();
            const inside = q.x.greaterThan(0).and(q.x.lessThan(1)).and(q.y.greaterThan(0)).and(q.y.lessThan(1));
            visible = visible.add(select(inside, step(o.z, dist), 0));
          }
          const d2 = abs(screenUV.sub(s.xy).mul(vec2(aspect, 1))).div(s.w);
          const d = length(d2);
          const tint = tintNode.element(i), pale = mix(tint, vec3(1), .4);
          const core = tint.mul(exp(d.mul(-10)).mul(.35).add(exp(d.mul(-38)).mul(.6)));
          const streak = pale.mul(exp(d2.y.mul(-110).sub(d2.x.mul(4))).mul(.3));
          const star = pale.mul(exp(d2.x.mul(-190).sub(d2.y.mul(11))).add(exp(d2.y.mul(-190).sub(d2.x.mul(11)))).mul(.12));
          total.addAssign(core.add(streak).add(star).mul(visible.div(TAPS.length)).mul(s.z));
        });
      });
      return total.mul(glareStrength);
    })();
  }

  function build() {
    const level = enabled ? preset.post || 'none' : 'none';
    settings.level = level;
    if (level === 'none') { pipeline.outputNode = vec4(0, 0, 0, 1); pipeline.needsUpdate = true; return; }
    // The scene pass replaces the canvas's own antialiasing, so it carries the preset's MSAA samples.
    if (!scenePass || samples !== preset.samples) {
      scenePass?.dispose?.();
      samples = preset.samples;
      scenePass = pass(scene, camera, { samples: preset.samples > 1 ? preset.samples : 0 });
    }
    const color = scenePass.getTextureNode('output'), depth = scenePass.getTextureNode('depth');
    bloomPass = bloom(color, settings.bloom, settings.bloomRadius, settings.bloomThreshold);
    let out = color.rgb.add(bloomPass.rgb);
    if (level === 'full') {
      const ghosts = lensflare(bloomPass, { threshold: float(.25), ghostSamples: float(4), ghostSpacing: float(.24), ghostAttenuationFactor: float(30), ghostTint: vec3(.85, .92, 1) });
      out = out.add(gaussianBlur(ghosts, null, 6, { resolutionScale: .5 }).rgb.mul(settings.ghosts));
    }
    out = out.add(glare(depth));
    const centred = screenUV.sub(.5);
    out = out.mul(float(1).sub(dot(centred, centred).mul(2).mul(vignette)));
    pipeline.outputNode = film(vec4(out, 1), grain);
    pipeline.needsUpdate = true;
  }

  // Screen uv (top-left origin) and distance along the view axis of a world point; 0 when behind the camera.
  const uv = new THREE.Vector2();
  function project(world) {
    tmp.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const dist = -tmp.z;
    if (dist < .1) return 0;
    tmp.applyMatrix4(camera.projectionMatrix);
    uv.set(tmp.x * .5 + .5, .5 - tmp.y * .5);
    return dist;
  }

  // Per frame: project each light, weight it by distance (and, for directional lights, by how directly it points at
  // the camera), keep the strongest SOURCES and hand them to the glare shader.
  const picked = [];
  function updateSources() {
    picked.length = 0;
    const projScale = camera.projectionMatrix.elements[5];
    camera.getWorldPosition(cameraPosition);
    for (const light of lights) {
      if (light.visible && !light.visible()) continue;
      const position = light.position();
      let dist = project(position);
      if (!dist || uv.x < -.1 || uv.x > 1.1 || uv.y < -.1 || uv.y > 1.1) continue;
      let weight = light.strength ?? 1;
      if (light.direction) {
        toCamera.copy(cameraPosition).sub(position).normalize();
        const facing = THREE.MathUtils.smoothstep(light.direction().dot(toCamera), .8, .985);
        weight *= facing * (.6 + 2.4 * facing * facing);
      }
      if (light.distant) dist = camera.far * .999; // the moon: visible wherever the depth buffer holds nothing
      else weight /= 1 + dist * dist / 500;
      if (weight <= .002) continue;
      const near = light.distant ? 0 : dist;
      picked.push({ u: uv.x, v: uv.y, weight, size: (light.size ?? 1) * (light.distant ? 1 : .55 + .6 / (1 + near / 8)),
        dist: light.distant ? dist : dist - light.radius * 2.5, radius: light.radius * projScale * .5 / (light.distant ? 60 : dist), tint: light.tint });
    }
    picked.sort((a, b) => b.weight - a.weight);
    for (let i = 0; i < SOURCES; i += 1) {
      const p = picked[i];
      if (!p) { glareSources[i].set(0, 0, 0, 1); occluders[i].set(0, 0, 0, 0); continue; }
      glareSources[i].set(p.u, p.v, p.weight, p.size);
      occluders[i].set(p.u, p.v, p.dist, p.radius);
      tints[i].copy(p.tint);
    }
  }

  build();

  return {
    // A light: { position: () => Vector3, radius (m), tint: Vector3 (linear), strength?, size?, visible?: () => bool,
    //   direction?: () => unit Vector3 (a flashlight: glare only when it points at the camera), distant?: true (sky) }.
    addLight(light) { lights.push(light); return light; },
    get enabled() { return settings.level !== 'none'; },
    // Quality changes also fire for adaptive pixel-ratio steps; rebuild (a shader compile) only when the level or MSAA changes.
    applyQuality(next) { const rebuild = next.post !== preset.post || next.samples !== preset.samples; preset = next; if (rebuild) build(); },
    render() {
      if (settings.level === 'none') { renderer.render(scene, camera); return; }
      updateSources();
      pipeline.render();
    },
    set(next = {}) {
      if ('glare' in next) glareStrength.value = next.glare;
      if ('vignette' in next) vignette.value = next.vignette;
      if ('grain' in next) grain.value = next.grain;
      if (bloomPass) {
        if ('bloom' in next) bloomPass.strength.value = settings.bloom = next.bloom;
        if ('bloomThreshold' in next) bloomPass.threshold.value = settings.bloomThreshold = next.bloomThreshold;
        if ('bloomRadius' in next) bloomPass.radius.value = settings.bloomRadius = next.bloomRadius;
      }
    },
    inspect: () => ({ ...settings, glare: glareStrength.value, vignette: vignette.value, grain: grain.value, sources: picked.length, glaring: picked.slice(0, SOURCES).map(p => +p.weight.toFixed(2)) }),
    dispose() { pipeline.dispose(); scenePass?.dispose?.(); },
  };
}
