import type { Camera, InstancedMesh, Object3D, Scene, WebGLRenderer } from "three";

// Startup-cost helpers for the 3D renderer, driven by the login probe's
// measurements (scripts/login-experience-probe.mjs): the first frame used to
// be the single longest main-thread block of the whole login.

/**
 * Runs `work` with every visible InstancedMesh that has zero instances
 * temporarily hidden. Most overlays preallocate a full tile-budget of
 * instances and set frustumCulled = false, so without this three.js uploads
 * (and compiles shaders for) every empty overlay's whole buffer on the first
 * frame. An overlay's buffers are uploaded when it first gets an instance.
 */
export const withEmptyInstancedMeshesHidden = <T>(scene: Scene, work: () => T): T => {
  const hidden: Object3D[] = [];
  scene.traverseVisible((object) => {
    const mesh = object as InstancedMesh;
    if (mesh.isInstancedMesh && mesh.count === 0) hidden.push(object);
  });
  for (const object of hidden) object.visible = false;
  try {
    return work();
  } finally {
    for (const object of hidden) object.visible = true;
  }
};

export const renderSkippingEmptyInstances = (renderer: WebGLRenderer, scene: Scene, camera: Camera): void =>
  withEmptyInstancedMeshesHidden(scene, () => renderer.render(scene, camera));

/**
 * Compiles the scene's shader programs before the first frame, so the first
 * render doesn't stall compiling them all synchronously. compileAsync lets the
 * driver compile in parallel where KHR_parallel_shader_compile exists;
 * elsewhere it is still its own announced step. Not fatal on failure: the
 * first render compiles whatever is left.
 */
export const compileSceneShaders = async (renderer: WebGLRenderer, scene: Scene, camera: Camera): Promise<void> => {
  try {
    await withEmptyInstancedMeshesHidden(scene, () => renderer.compileAsync(scene, camera));
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
