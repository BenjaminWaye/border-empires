import type { Camera, Object3D, Scene, WebGLRenderer } from "three";
import { updateVisibleMatrixWorld } from "./client-map-3d-visible-matrix-world.js";

// Startup-cost helpers for the 3D renderer, driven by the login probe's
// measurements (scripts/login-experience-probe.mjs): the first frame used to
// be the single longest main-thread block of the whole login.

/**
 * Renders one frame with every visible InstancedMesh that has zero instances
 * temporarily hidden. Most overlays preallocate a full tile-budget of
 * instances and set frustumCulled = false, so without this three.js uploads
 * (and compiles shaders for) every empty overlay's whole buffer on the first
 * frame. An overlay's buffers are uploaded when it first gets an instance.
 *
 * World matrices are updated here for visible subtrees only (see
 * client-map-3d-visible-matrix-world.ts), and the renderer's own whole-scene
 * update is switched off for the call, so the large hidden pools are not
 * walked every frame.
 */
export const renderSkippingEmptyInstances = (renderer: Pick<WebGLRenderer, "render">, scene: Scene, camera: Camera): void => {
  const hidden: Object3D[] = [];
  updateVisibleMatrixWorld(scene, false, hidden);
  for (const object of hidden) object.visible = false;
  const sceneAutoUpdate = scene.matrixWorldAutoUpdate;
  scene.matrixWorldAutoUpdate = false;
  try {
    renderer.render(scene, camera);
  } finally {
    scene.matrixWorldAutoUpdate = sceneAutoUpdate;
    for (const object of hidden) object.visible = true;
  }
};

/**
 * Compiles the scene's shader programs before the first frame, so the first
 * render doesn't stall compiling them all synchronously. compileAsync lets the
 * driver compile in parallel where KHR_parallel_shader_compile exists;
 * elsewhere it is still its own announced step. Deliberately includes empty
 * overlays (compiling uploads no buffers): skipping them would move each
 * one's compile stall to mid-game, the first time it gets an instance.
 * Not fatal on failure: the first render compiles whatever is left.
 */
export const compileSceneShaders = async (renderer: WebGLRenderer, scene: Scene, camera: Camera): Promise<void> => {
  try {
    await renderer.compileAsync(scene, camera);
  } catch (error) {
    console.warn("[renderer-3d-precompile-failed]", error);
  }
};

/**
 * Resolves after the render loop's first completed frame — the one that
 * uploads every buffer to the GPU. Resolves early if the loop never gets
 * there (context lost), so the build can't hang the login overlay.
 */
export const createFirstFrameSignal = (fallbackMs = 30_000): { readonly rendered: Promise<void>; readonly markRendered: () => void } => {
  let resolve: (() => void) | undefined;
  const rendered = new Promise<void>((done) => {
    resolve = done;
  });
  const timer = setTimeout(() => resolve?.(), fallbackMs);
  return {
    rendered,
    markRendered: () => {
      if (!resolve) return;
      clearTimeout(timer);
      resolve();
      resolve = undefined;
    }
  };
};
