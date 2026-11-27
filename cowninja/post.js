// The COWNinja picture, aimed at photoreal: one RenderPipeline over an HDR scene pass with several outputs
// (colour, view normals, metalness/roughness, motion vectors).
//   occlusion   ground-truth ambient occlusion (corners, contact under bodies and props), half resolution
//   reflections screen-space reflections: wet floors, steel, standing blood pick up the lamps and the room
//   bloom       lamps and tubes glow
//   camera      a real lens: slight barrel distortion and colour fringing towards the edges, vignette, fine grain
//   grade       a restrained cold grade that keeps colour (blood stays red, sodium stays orange); `wash` > 0 brings
//               back the old steel monochrome
//   anti-alias  temporal reprojection (TRAA): thin rails, chains and fences stop shimmering
// `hurt` (0..1) floods the frame edge red when you take a hit. `level` picks the cost: 0 everything, 1 no
// reflections, 2 no reflections or occlusion, 3 also no temporal AA.
import * as THREE from 'three/webgpu';
import { float, vec2, vec3, vec4, uniform, pass, mrt, output, normalView, metalness, roughness, velocity, packNormalToRGB, unpackRGBToNormal, sample,
  screenUV, dot, mix, max, min, smoothstep, pow, length, uv, abs, floor, clamp, screenSize, perspectiveDepthToViewZ, cameraNear, cameraFar, texture as sampleTexture } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { film } from 'three/addons/tsl/display/FilmNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';

export function createGrimPost({ renderer, scene, camera, level = 0, occlusion = true, style = 'photo' }) {
  const painted = style === 'painted';
  if (!occlusion) level = Math.max(level, 2);
  const pipeline = new THREE.RenderPipeline(renderer);
  const wash = uniform(.12), grain = uniform(.05), vignette = uniform(.3), hurt = uniform(0), crush = uniform(1.0), fringe = uniform(.0035), warp = uniform(.02);
  const scenePass = pass(scene, camera);
  const outputs = { output, normal: packNormalToRGB(normalView), metalrough: vec2(metalness, roughness) };
  if (level < 3) outputs.velocity = velocity;
  scenePass.setMRT(mrt(outputs));
  const color = scenePass.getTextureNode('output'), depth = scenePass.getTextureNode('depth');
  const normalTex = scenePass.getTextureNode('normal'), metalRough = scenePass.getTextureNode('metalrough');
  // A sampleable view-normal node (the effects read it at their own coordinates).
  const normal = sample(at => unpackRGBToNormal(normalTex.sample(at)));
  const extras = [];
  let lit = color.rgb;
  // Contact shadow.
  if (level < 2) {
    try { const aoPass = ao(depth, normal, camera); aoPass.resolutionScale = .5; aoPass.radius.value = .6; aoPass.samples.value = 10; aoPass.thickness.value = 1.2; extras.push(aoPass);
      lit = lit.mul(mix(float(1), aoPass.getTextureNode().r, .9)); } catch (error) { console.warn('[cowninja] occlusion off:', error?.message || error); }
  }
  // Reflections: added on top of the lit colour, weighted by the reflection pass's own alpha.
  if (level < 1 && !painted) {
    try {
      const reflect = ssr(color, depth, normal, { metalnessNode: metalRough.r, roughnessNode: metalRough.g, reflectNonMetals: true, camera });
      reflect.resolutionScale = .5; reflect.maxDistance.value = 14; reflect.thickness.value = .04; reflect.quality.value = .5; extras.push(reflect);
      const r = reflect.getTextureNode();
      lit = lit.add(r.rgb.mul(r.a).mul(.85));
    } catch (error) { console.warn('[cowninja] reflections off:', error?.message || error); }
  }
  // The painted style (an animated-film look): soft cel bands in the light, richer colour, warm highlights, and ink
  // outlines where depth jumps or surfaces turn sharply.
  if (painted) {
    const px = vec2(1).div(screenSize), viewZ = at => perspectiveDepthToViewZ(depth.sample(at).r, cameraNear, cameraFar);
    const z0 = viewZ(screenUV), nrm = at => unpackRGBToNormal(normalTex.sample(at).rgb), n0 = nrm(screenUV);
    let dz = float(0), dn = float(0);
    for (const o of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const at = screenUV.add(px.mul(vec2(o[0], o[1]))); dz = max(dz, abs(viewZ(at).sub(z0)).div(abs(z0).add(.5))); dn = max(dn, float(1).sub(dot(nrm(at), n0))); }
    const far = smoothstep(float(25), float(70), abs(z0));   // lines fade out with distance, like a painted background
    const ink = max(smoothstep(float(.12), float(.3), dz), smoothstep(float(.5), float(.9), dn)).mul(float(1).sub(far)).mul(.75);
    const l = dot(lit, vec3(.2126, .7152, .0722)), band = floor(l.mul(4).add(.35)).div(4).add(.06), cel = mix(float(1), band.div(max(l, float(.02))), .5);
    lit = lit.mul(clamp(cel, float(.6), float(1.6)));
    lit = mix(vec3(dot(lit, vec3(.2126, .7152, .0722))), lit, 1.32);
    lit = new URLSearchParams(location.search).has('inkdebug') ? mix(lit, vec3(4, 0, 0), ink) : lit.mul(float(1).sub(ink)).add(vec3(.02, .015, .03).mul(ink));   // ink darkens what is under it
  }
  const glow = bloom(vec4(lit, 1), painted ? .55 : .32, painted ? .6 : .5, painted ? .8 : .95);
  let out = lit.add(glow.rgb);
  // Grade: a little cooler in the shadows, warmer in the highlights, colour kept; optional monochrome wash.
  const luma = dot(out, vec3(.2126, .7152, .0722));
  out = mix(out, vec3(luma).mul(vec3(.9, .99, 1.04)), painted ? float(0) : wash);
  out = out.mul(mix(vec3(.94, .98, 1.04), vec3(1.04, 1.0, .95), smoothstep(.05, .6, luma)));
  out = pow(max(out, vec3(0)), vec3(crush));
  let image = vec4(out, 1);
  // Temporal anti-aliasing works on the scene image; lens effects come after it.
  if (level < 3) {
    try { const aa = traa(image, depth, scenePass.getTextureNode('velocity'), camera); extras.push(aa); image = aa.getTextureNode(); } catch (error) { console.warn('[cowninja] TRAA off:', error?.message || error); }
  }
  // Lens: barrel distortion and channel fringing towards the edges, sampled from the anti-aliased image.
  const tex = image.isTextureNode ? image : null;
  let final;
  const centred = screenUV.sub(.5), r2 = dot(centred, centred);
  if (tex) {
    const warped = centred.mul(float(1).add(r2.mul(warp))).add(.5), dir = centred.mul(fringe.mul(length(centred)).mul(2));   // at most ~0.25% of the screen at the corners
    final = vec3(tex.sample(warped.add(dir)).r, tex.sample(warped).g, tex.sample(warped.sub(dir)).b);
  } else final = image.rgb;
  final = final.mul(float(1).sub(r2.mul(2).mul(vignette)));
  final = mix(final, vec3(.55, .02, .01), smoothstep(.08, .5, r2).mul(hurt));
  pipeline.outputNode = film(vec4(final, 1), grain);
  return {
    level,
    render() { pipeline.render(); },
    set(next = {}) { for (const [k, u] of Object.entries({ wash, grain, vignette, hurt, crush, fringe, warp })) if (k in next) u.value = next[k]; },
    dispose() { pipeline.dispose(); scenePass.dispose?.(); for (const e of extras) e.dispose?.(); },
  };
}
