// Wires the selective-bloom technique documented in client-map-3d-bloom-layer.ts
// into an actual render pipeline. This file constructs a live WebGLRenderer's
// EffectComposer graph, so — like client-map-3d-render-target.ts — it can't be
// meaningfully unit-tested: `new WebGLRenderer(...)` itself needs a real WebGL
// context the vitest/happy-dom environment doesn't provide. The testable parts
// (the device gate, and which meshes opt into BLOOM_LAYER) live in
// client-map-3d-bloom-gating.ts and each tagged overlay module instead.
//
// Two EffectComposers, following the pattern from three.js's own
// webgl_postprocessing_unreal_bloom_selective example:
//   bloomComposer  — renders only BLOOM_LAYER-tagged objects (everything else
//                    is swapped to solid black immediately beforehand — see
//                    darkenNonBloomed below), then blurs that into a glow.
//   finalComposer  — renders the *real*, full scene normally, additively mixes
//                    the blurred bloom texture on top, then applies the
//                    renderer's tone mapping / color space via OutputPass.
//
// Both composers use UnsignedByteType render targets instead of the default
// HalfFloatType, and the bloom composer runs at half the canvas's CSS-pixel
// dimensions (on top of UnrealBloomPass's own internal downsampling — see the
// comment on BLOOM_RESOLUTION_DIVISOR) — deliberate memory choices given how
// tight the existing overlay-buffer budget already runs on constrained
// devices (client-map-3d-tile-budget.ts). Whether bloom runs at all is decided
// by the caller via client-map-3d-bloom-gating.ts before this module is ever
// touched, so a device that shouldn't pay for any of this never allocates it.

import {
  Camera,
  Color,
  Material,
  MeshBasicMaterial,
  Object3D,
  Scene,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BLOOM_LAYER } from "./client-map-3d-bloom-layer.js";

// UnrealBloomPass halves whatever resolution it's given as its own first mip
// level internally, regardless of what's passed in. This divisor is an
// *additional* halving applied to the bloomComposer's own render targets
// (which hold the full-resolution scene render before UnrealBloomPass's own
// downsampling ever runs) — bloom is inherently a soft, low-frequency effect,
// so the extra quarter-the-pixel-count saving on those buffers costs nothing
// visible in the final blurred result.
const BLOOM_RESOLUTION_DIVISOR = 2;

const BLOOM_LAYER_MASK = 1 << BLOOM_LAYER;

const BLOOM_STRENGTH = 0.85;
const BLOOM_RADIUS = 0.35;
// Left deliberately low rather than tuned against the scene's actual light
// levels the way client-map-3d-atmosphere.ts's sun intensity was reasoned
// about: every object that reaches this pass already opted in via
// BLOOM_LAYER, so the threshold is a soft floor on top of an already-curated
// set, not the only thing standing between "everything blooms" and not.
const BLOOM_THRESHOLD = 0.15;

const MIX_SHADER = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv);
    }
  `
};

type MaterialBearer = Object3D & { material: Material | Material[] };

// Meshes and Sprites both carry `.material`; Line/LineSegments objects
// (selection ring outlines, gridlines, targeting reticle borders) are
// deliberately not handled here — their ~1px screen footprint means even an
// undarkened bright line contributes negligible area to the bloom buffer,
// unlike a filled badge, pennant, or targeting-reticle fill. If a future
// addition puts a large or bright Line-based element in the scene, this
// assumption needs revisiting.
const isMaterialBearer = (obj: Object3D): obj is MaterialBearer =>
  (obj as { isMesh?: boolean }).isMesh === true || (obj as { isSprite?: boolean }).isSprite === true;

export type BloomPipeline = {
  readonly render: () => void;
  readonly resize: (width: number, height: number) => void;
  readonly dispose: () => void;
};

export const createBloomPipeline = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera
): BloomPipeline => {
  const rtOptions = { type: UnsignedByteType } as const;

  const bloomComposer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, rtOptions));
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new Vector2(1, 1), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  bloomComposer.addPass(bloomPass);

  const finalComposer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, rtOptions));
  finalComposer.addPass(new RenderPass(scene, camera));
  const mixPass = new ShaderPass(MIX_SHADER, "baseTexture");
  mixPass.uniforms.bloomTexture!.value = bloomComposer.renderTarget2.texture;
  // ShaderPass defaults needsSwap true, which would try to swap finalComposer's
  // buffers using this pass's own output as if it were the sole authority on
  // the frame — correct here since it *is* the last content pass before
  // OutputPass, but called out because getting this wrong silently blanks the
  // screen rather than erroring.
  finalComposer.addPass(mixPass);
  finalComposer.addPass(new OutputPass());

  // toneMapped: false — see client-map-3d-render-target.ts's tone-mapping
  // comment. This is pure black; ACES(0) = 0 regardless, but every unlit
  // MeshBasicMaterial construction in this codebase sets the flag so the
  // source-scanning regression guard (client-map-3d-tone-mapping-regression
  // .test.ts) can trust the invariant holds everywhere without exceptions.
  const darkMaterial = new MeshBasicMaterial({ toneMapped: false, color: new Color(0x000000) });
  const materialCache = new Map<Object3D, Material | Material[]>();

  const darkenNonBloomed = (obj: Object3D): void => {
    if (!isMaterialBearer(obj)) return;
    if ((obj.layers.mask & BLOOM_LAYER_MASK) !== 0) return;
    materialCache.set(obj, obj.material);
    obj.material = darkMaterial;
  };

  const restoreMaterial = (obj: Object3D): void => {
    const cached = materialCache.get(obj);
    if (cached === undefined) return;
    (obj as MaterialBearer).material = cached;
    materialCache.delete(obj);
  };

  const render = (): void => {
    scene.traverse(darkenNonBloomed);
    bloomComposer.render();
    scene.traverse(restoreMaterial);
    finalComposer.render();
  };

  const resize = (width: number, height: number): void => {
    const bloomWidth = Math.max(1, Math.round(width / BLOOM_RESOLUTION_DIVISOR));
    const bloomHeight = Math.max(1, Math.round(height / BLOOM_RESOLUTION_DIVISOR));
    bloomComposer.setSize(bloomWidth, bloomHeight);
    finalComposer.setSize(width, height);
  };

  const dispose = (): void => {
    // EffectComposer.dispose() only frees its own two render targets and
    // copyPass — it does not walk `passes` disposing each one (confirmed by
    // reading the installed three@0.179.1 source directly rather than
    // assuming), so every pass holding its own GPU resources is disposed
    // explicitly here.
    bloomPass.dispose();
    mixPass.dispose();
    bloomComposer.dispose();
    finalComposer.dispose();
    darkMaterial.dispose();
    materialCache.clear();
  };

  return { render, resize, dispose };
};
