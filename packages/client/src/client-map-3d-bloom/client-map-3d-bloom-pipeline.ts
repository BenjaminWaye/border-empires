// Wires the selective-bloom technique documented in client-map-3d-bloom-layer.ts
// into an actual render pipeline. This file constructs a live WebGLRenderer's
// EffectComposer graph, so — like client-map-3d-render-target.ts — it can't be
// meaningfully unit-tested: `new WebGLRenderer(...)` itself needs a real WebGL
// context the vitest/happy-dom environment doesn't provide. The testable parts
// (the device gate, which meshes opt into BLOOM_LAYER, and the darken/restore
// material-swap logic) live in client-map-3d-bloom-gating.ts,
// client-map-3d-bloom-darken.ts, and each tagged overlay module instead —
// none of those need a live GPU context to test.
//
// Two EffectComposers, following the pattern from three.js's own
// webgl_postprocessing_unreal_bloom_selective example:
//   bloomComposer  — renders only BLOOM_LAYER-tagged objects (everything else
//                    is swapped to solid black immediately beforehand — see
//                    client-map-3d-bloom-darken.ts), then blurs that into a glow.
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

import { Camera, Scene, UnsignedByteType, Vector2, WebGLRenderer, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createDarkenController } from "./client-map-3d-bloom-darken.js";

// UnrealBloomPass halves whatever resolution it's given as its own first mip
// level internally, regardless of what's passed in. This divisor is an
// *additional* halving applied to the bloomComposer's own render targets
// (which hold the full-resolution scene render before UnrealBloomPass's own
// downsampling ever runs) — bloom is inherently a soft, low-frequency effect,
// so the extra quarter-the-pixel-count saving on those buffers costs nothing
// visible in the final blurred result.
const BLOOM_RESOLUTION_DIVISOR = 2;

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

  const darken = createDarkenController();

  const render = (): void => {
    scene.traverse(darken.darkenNonBloomed);
    bloomComposer.render();
    scene.traverse(darken.restoreMaterial);
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
    darken.dispose();
  };

  return { render, resize, dispose };
};
