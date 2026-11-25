// The COWNinja picture: realistic content, stylized image. One RenderPipeline over an HDR scene pass:
//   grade     everything is pulled toward a cold, washed steel-and-concrete monochrome, except red, which keeps its
//             full saturation (blood, the headband, the warning lamp read from across the yard)
//   bloom     lamps and tubes glow
//   crush     deeper blacks and a hard shoulder
//   vignette, heavy grain
// `hurt` (0..1) floods the frame edge red when the cow takes a hit.
import * as THREE from 'three/webgpu';
import { float, vec3, vec4, uniform, pass, screenUV, dot, mix, max, clamp, smoothstep, pow } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';

export function createGrimPost({ renderer, scene, camera, samples = 0, occlusion = true }) {
  const pipeline = new THREE.RenderPipeline(renderer);
  const wash = uniform(.6), grain = uniform(.16), vignette = uniform(.46), hurt = uniform(0), crush = uniform(1.07);
  const scenePass = pass(scene, camera, samples > 1 ? { samples } : {});
  const color = scenePass.getTextureNode('output');
  // Contact shadow in corners and under bodies (ground-truth ambient occlusion from the depth buffer, half size).
  let lit = color.rgb, aoPass = null;
  if (occlusion) {
    try { aoPass = ao(scenePass.getTextureNode('depth'), null, camera); aoPass.resolutionScale = .5; aoPass.radius.value = .55; aoPass.samples.value = 8; aoPass.thickness.value = 1.2;
      lit = lit.mul(mix(float(1), aoPass.getTextureNode().r, .85)); } catch (error) { console.warn('[cowninja] ambient occlusion off:', error?.message || error); aoPass = null; }
  }
  const glow = bloom(color, .4, .55, 1.0);
  let out = lit.add(glow.rgb);
  // How red is this pixel: red well above both other channels.
  const luma = dot(out, vec3(.2126, .7152, .0722));
  // True red only: red far above green (sodium-lamp orange, where green is about two thirds of red, does not pass).
  const redness = clamp(out.r.sub(max(out.g.mul(1.75), out.b.mul(1.75))).mul(4).div(max(luma, .04)), 0, 1);
  const steel = vec3(luma).mul(vec3(.9, .99, 1.04));                     // cold monochrome
  out = mix(mix(steel, out, float(1).sub(wash)), out.mul(vec3(1.12, .82, .8)), redness);
  out = pow(max(out, vec3(0)), vec3(crush));                             // crush the shadows
  const centred = screenUV.sub(.5), edge = dot(centred, centred);
  out = out.mul(float(1).sub(edge.mul(2).mul(vignette)));
  out = mix(out, vec3(.55, .02, .01), smoothstep(.08, .5, edge).mul(hurt));
  pipeline.outputNode = film(vec4(out, 1), grain);
  return {
    render() { pipeline.render(); },
    set(next = {}) { if ('wash' in next) wash.value = next.wash; if ('grain' in next) grain.value = next.grain; if ('vignette' in next) vignette.value = next.vignette; if ('hurt' in next) hurt.value = next.hurt; if ('crush' in next) crush.value = next.crush; },
    dispose() { pipeline.dispose(); scenePass.dispose?.(); },
  };
}
