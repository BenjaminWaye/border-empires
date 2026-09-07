// Optional bloom post-processing on planet glow / star points, via
// UnrealBloomPass from three/examples. Isolated in its own module so the
// main scene assembler can fall back to a plain renderer.render() call with
// a one-line change if bloom ever needs to be disabled.
import { Scene, PerspectiveCamera, WebGLRenderer, Vector2 } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type SpaceBloomPipeline = {
  render: () => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
};

export const createSpaceBloomPipeline = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  width: number,
  height: number
): SpaceBloomPipeline => {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new Vector2(width, height), 0.85, 0.4, 0.15);
  composer.addPass(bloomPass);

  return {
    render: () => composer.render(),
    setSize: (w: number, h: number) => composer.setSize(w, h),
    dispose: () => composer.dispose()
  };
};
