import type { Meta, StoryObj } from "@storybook/html-vite";
import { AnimationMixer, Box3, PerspectiveCamera, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// Preview of the real 24-bone Titan Vanguard rig (see
// packages/client/src/client-map-3d-popup-marine/popup-marine-asset.ts's
// header once this becomes the shipped model) with its real captured
// Walking/Running/Dead animations plus real Mixamo Pistol reference poses,
// all merged into one glb and driven here through a genuine
// AnimationMixer -- no hand-tuned procedural bone math. This is a staging
// asset (packages/client/public/models/popup-marine-titan-24bone.glb, NOT
// yet wired into the shipped battle overlay) for reviewing the real clips
// before the popup-marine-* rework lands.
const MODEL_URL = "/models/popup-marine-titan-24bone.glb";
const CLIP_NAMES = ["Walking", "Running", "Dead", "PistolIdle", "PistolKneelingIdle", "PistolRun"] as const;

const styleButton = (el: HTMLElement, active = false): void => {
  el.style.padding = "8px 12px";
  el.style.border = `1px solid ${active ? "#fff3d6" : "rgba(255,207,107,0.55)"}`;
  el.style.background = active ? "rgba(255,207,107,0.25)" : "rgba(13,15,22,0.9)";
  el.style.color = "#fff3d6";
  el.style.cursor = "pointer";
  el.style.borderRadius = "4px";
  el.style.font = "12px monospace";
};

type Args = { color: string };

const render = (args: Args): HTMLElement => {
  // Framed once from the model's own rest-pose bounding box (below) rather
  // than a guessed fixed distance -- a fixed guess reads fine for a
  // standing pose but crops out a kneeling one, since that pose's hips (and
  // so the whole rig, before any per-pose recentering) sit substantially
  // lower. cameraDistance here is just a placeholder until that box is
  // known.
  const stage = createStage({ height: 420, cameraDistance: 0.3, cameraTilt: 0.45, background: "#0d0f16" });
  const camera = stage.camera as PerspectiveCamera;
  // createStage's default near plane (0.1) is tuned for map-scale content
  // (units ~1-10) and clips straight through this rig -- the whole model is
  // only ~0.052 units tall, so the camera sits well inside a 0.1 near
  // plane once framed to it below.
  camera.near = 0.001;
  camera.far = 10; // a 0.001:4000 near:far ratio caused severe WebGL depth-precision loss at this scale
  camera.updateProjectionMatrix();
  const controls = new OrbitControls(camera, stage.canvas);
  controls.enableDamping = true;
  controls.update();

  const statusEl = document.createElement("div");
  statusEl.style.color = "#94a3b8";
  statusEl.style.font = "12px monospace";
  statusEl.textContent = "loading…";

  const buttonsRow = document.createElement("div");
  buttonsRow.style.display = "flex";
  buttonsRow.style.gap = "6px";
  buttonsRow.style.flexWrap = "wrap";

  let mixer: AnimationMixer | undefined;
  let activeName = "PistolIdle";
  const buttons = new Map<string, HTMLButtonElement>();

  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      const root = gltf.scene;
      stage.scene.add(root);
      mixer = new AnimationMixer(root);
      const clipsByName = new Map(gltf.animations.map((c) => [c.name, c]));
      statusEl.textContent = `loaded — clips: ${gltf.animations.map((c) => c.name).join(", ")}`;

      // Frame from the BONES' world positions, not from
      // geometry.boundingBox x mesh.matrixWorld. For a skinned mesh the
      // rendered position comes from the bone matrices; the mesh node's own
      // transform is not what places the vertices. Since this rig carries
      // its scale on the root node, multiplying the (already final-scale)
      // geometry box by the mesh's world matrix double-applies that scale
      // and yields a ~16-micron box, which frames the camera inside its own
      // near plane and renders nothing. Bone world positions are correct in
      // both conventions.
      let skinned: SkinnedMesh | undefined;
      root.traverse((o) => {
        if (!skinned && o instanceof SkinnedMesh) skinned = o;
      });
      if (!skinned) throw new Error("no SkinnedMesh found in loaded model");
      root.updateMatrixWorld(true);
      const bb = new Box3();
      const boneWorld = new Vector3();
      for (const bone of skinned.skeleton.bones) {
        bb.expandByPoint(bone.getWorldPosition(boneWorld));
      }
      const size = new Vector3();
      const center = new Vector3();
      bb.getSize(size);
      bb.getCenter(center);
      // Bones sit inside the silhouette, so pad out to cover the mesh.
      const radius = Math.max(size.x, size.y, size.z) * 0.5 * 1.35;
      controls.target.copy(center);
      camera.position.set(center.x, center.y + radius * 0.4, center.z + radius * 3.2);
      controls.minDistance = radius * 1.5;
      controls.maxDistance = radius * 10;
      controls.update();

      const playByName = (name: string): void => {
        const clip = clipsByName.get(name);
        if (!clip || !mixer) return;
        activeName = name;
        for (const [n, btn] of buttons) styleButton(btn, n === name);
        mixer.stopAllAction();
        mixer.clipAction(clip).reset().play();
      };

      for (const name of CLIP_NAMES) {
        if (!clipsByName.has(name)) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = name;
        styleButton(btn, name === activeName);
        btn.addEventListener("click", () => playByName(name));
        buttons.set(name, btn);
        buttonsRow.appendChild(btn);
      }
      playByName(activeName);
    },
    undefined,
    (err) => {
      statusEl.textContent = `failed to load: ${err instanceof Error ? err.message : String(err)}`;
    }
  );

  const panel = document.createElement("div");
  panel.style.padding = "10px 12px";
  panel.style.background = "rgba(13,15,22,0.85)";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = "8px";
  panel.appendChild(statusEl);
  panel.appendChild(buttonsRow);

  let lastT = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    lastT = now;
    mixer?.update(dt);
    controls.update();
    rafId = requestAnimationFrame(animate);
  };
  animate();

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      controls.dispose();
    }
  ]);
  stageEl.appendChild(panel);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "3D Library/PopupMarineTitanAnimationPreview",
  args: { color: "#4fb3ff" },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AnimationPreview: Story = {};
