import type { Meta, StoryObj } from "@storybook/html-vite";
import { AnimationMixer, Box3, type AnimationClip, PerspectiveCamera, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ACTIVE_POPUP_MARINE_MODEL_URL, HEAVY_POPUP_MARINE_MODEL_URL, firstSkinnedMesh } from "@client/client-map-3d-popup-marine/popup-marine-asset.js";
import { createMarineMaterial } from "@client/client-map-3d-popup-marine/popup-marine-material.js";
import { createBuildingEnvironmentTexture } from "@client/client-map-3d-atmosphere.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

// Every clip baked into the shipped 24-bone rigs -- the standard Titan
// Vanguard and the Titanium Weapons Factory heavy armour -- driven through a
// real AnimationMixer so each captured animation can be reviewed on its own,
// side by side. The heavy model ships only the Pistol* clips, so Walking /
// Running / Dead play on the standard marine alone.
const MODEL_URLS = { standard: ACTIVE_POPUP_MARINE_MODEL_URL, heavy: HEAVY_POPUP_MARINE_MODEL_URL } as const;
type ModelChoice = keyof typeof MODEL_URLS;
// Not a clip: no action plays, so each model shows the pose it was bound in.
const REST_POSE = "Rest pose";
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

type Args = { color: string; model: ModelChoice | "both" };

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

  const envMap = createBuildingEnvironmentTexture(stage.renderer);
  const choices: ModelChoice[] = args.model === "both" ? ["standard", "heavy"] : [args.model];
  const GAP = 0.04; // local units between side-by-side models (a marine is ~0.052 tall)
  type Loaded = { choice: ModelChoice; mixer: AnimationMixer; clips: Map<string, AnimationClip> };
  const loaded: Loaded[] = [];
  let activeName = "PistolIdle";
  const buttons = new Map<string, HTMLButtonElement>();
  const loader = new GLTFLoader();

  const playByName = (name: string): void => {
    activeName = name;
    for (const [n, btn] of buttons) styleButton(btn, n === name);
    for (const { mixer, clips } of loaded) {
      mixer.stopAllAction();
      const clip = clips.get(name);
      if (clip && name !== REST_POSE) mixer.clipAction(clip).reset().play();
      else mixer.setTime(0);
    }
  };

  const loadOne = (choice: ModelChoice, index: number): Promise<Loaded> =>
    new Promise((resolve, reject) => {
      loader.load(
        MODEL_URLS[choice],
        (gltf) => {
          const root = gltf.scene;
          // The same material the game puts on each model (heavy: surface
          // mask + env-map metal), not GLTFLoader's default.
          const mesh = firstSkinnedMesh(root);
          const material = createMarineMaterial(choice === "heavy", envMap);
          material.color.set(args.color);
          mesh.material = material;
          mesh.frustumCulled = false;
          root.position.x = (index - (choices.length - 1) / 2) * GAP;
          stage.scene.add(root);
          resolve({ choice, mixer: new AnimationMixer(root), clips: new Map(gltf.animations.map((c) => [c.name, c])) });
        },
        undefined,
        reject
      );
    });

  Promise.all(choices.map(loadOne))
    .then((models) => {
      loaded.push(...models);
      stage.scene.updateMatrixWorld(true);
      // Frame from the BONES' world positions, not from
      // geometry.boundingBox x mesh.matrixWorld. For a skinned mesh the
      // rendered position comes from the bone matrices; the mesh node's own
      // transform is not what places the vertices. Since these rigs carry
      // their scale on the root node, multiplying the (already final-scale)
      // geometry box by the mesh's world matrix double-applies that scale
      // and yields a ~16-micron box, which frames the camera inside its own
      // near plane and renders nothing. Bone world positions are correct in
      // both conventions.
      const bb = new Box3();
      const boneWorld = new Vector3();
      stage.scene.traverse((o) => {
        if (o instanceof SkinnedMesh) for (const bone of o.skeleton.bones) bb.expandByPoint(bone.getWorldPosition(boneWorld));
      });
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

      statusEl.textContent = models.map((m) => `${m.choice}: ${[...m.clips.keys()].join(", ")}`).join("  |  ");
      for (const name of [...CLIP_NAMES, REST_POSE]) {
        if (name !== REST_POSE && !models.some((m) => m.clips.has(name))) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = name;
        styleButton(btn, name === activeName);
        btn.addEventListener("click", () => playByName(name));
        buttons.set(name, btn);
        buttonsRow.appendChild(btn);
      }
      playByName(activeName);
    })
    .catch((err: unknown) => {
      statusEl.textContent = `failed to load: ${err instanceof Error ? err.message : String(err)}`;
    });

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
    for (const m of loaded) m.mixer.update(dt);
    controls.update();
    rafId = requestAnimationFrame(animate);
  };
  animate();

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      controls.dispose();
      envMap.dispose();
    }
  ]);
  stageEl.appendChild(panel);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Map/Combat/Popup Marines/Titan Rig",
  args: { color: "#4fb3ff", model: "both" },
  argTypes: { model: { control: "inline-radio", options: ["both", "standard", "heavy"] } },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const AnimationPreview: Story = {};
