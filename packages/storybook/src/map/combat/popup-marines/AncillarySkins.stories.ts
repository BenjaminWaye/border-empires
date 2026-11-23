import type { Meta, StoryObj } from "@storybook/html-vite";
import { AnimationMixer, Box3, PerspectiveCamera, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AncillarySkin } from "@client/client-cosmetics/client-cosmetics.js";
import { ACTIVE_POPUP_MARINE_MODEL_URL, HEAVY_POPUP_MARINE_MODEL_URL, firstSkinnedMesh } from "@client/client-map-3d-popup-marine/popup-marine-asset.js";
import { createMarineMaterial, setMarineSkin } from "@client/client-map-3d-popup-marine/popup-marine-material.js";
import { drawAncillaryDotHelmet2D } from "@client/client-cosmetics/ancillary-skin-2d.js";
import { drawCaptureHoldGarrison2D } from "@client/client-map-2d-capture-hold-overlay.js";
import type { Tile } from "@client/client-types.js";
import { createBuildingEnvironmentTexture } from "@client/client-map-3d-atmosphere.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

// Ancillary skin cosmetics (docs/gdd.md §8) on the shipped soldier models.
// Each House colour stands twice: the standard paint scheme on the left of
// the pair, the Ivory-trim plate on the right. Back row: the heavy armour a
// Titanium Weapons Factory unlocks, which keeps its own meaning under a skin.
const MODEL_URLS = { standard: ACTIVE_POPUP_MARINE_MODEL_URL, heavy: HEAVY_POPUP_MARINE_MODEL_URL } as const;
type ModelChoice = keyof typeof MODEL_URLS;
const EMPIRE_COLORS = ["#d23c3c", "#3a7bd5", "#e0b030", "#46a35a", "#9b59b6"];
const SKINS: AncillarySkin[] = ["default", "ancillary-ivory"];
const PAIR_GAP = 0.034;
const HOUSE_GAP = 0.09;
const ROW_GAP = 0.12;

type Args = { rows: "both" | ModelChoice; clip: "PistolIdle" | "PistolWalk" | "PistolKneelingIdle" };

const render = (args: Args): HTMLElement => {
  const stage = createStage({ height: 520, cameraDistance: 0.3, cameraTilt: 0.45, background: "#12210f" });
  const camera = stage.camera as PerspectiveCamera;
  camera.near = 0.001; // the rig is ~0.052 units tall (see TitanRig.stories.ts)
  camera.far = 10;
  camera.updateProjectionMatrix();
  const controls = new OrbitControls(camera, stage.canvas);
  const envMap = createBuildingEnvironmentTexture(stage.renderer);
  const loader = new GLTFLoader();
  const mixers: AnimationMixer[] = [];
  const models: ModelChoice[] = args.rows === "both" ? ["standard", "heavy"] : [args.rows];

  const loadOne = (model: ModelChoice, row: number, house: number, skin: AncillarySkin): Promise<void> =>
    new Promise((resolve, reject) => {
      loader.load(MODEL_URLS[model], (gltf) => {
        const root = gltf.scene;
        const mesh = firstSkinnedMesh(root);
        const material = createMarineMaterial(model === "heavy", envMap);
        material.color.set(EMPIRE_COLORS[house]!);
        setMarineSkin(material, skin);
        mesh.material = material;
        mesh.frustumCulled = false;
        const pairX = (house - (EMPIRE_COLORS.length - 1) / 2) * HOUSE_GAP;
        root.position.set(pairX + (SKINS.indexOf(skin) - 0.5) * PAIR_GAP, 0, -row * ROW_GAP);
        stage.scene.add(root);
        const mixer = new AnimationMixer(root);
        const clip = gltf.animations.find((c) => c.name === args.clip);
        if (clip) mixer.clipAction(clip).play();
        mixers.push(mixer);
        resolve();
      }, undefined, reject);
    });

  const loads: Array<Promise<void>> = [];
  models.forEach((model, row) => EMPIRE_COLORS.forEach((_, house) => SKINS.forEach((skin) => loads.push(loadOne(model, row, house, skin)))));
  void Promise.all(loads).then(() => {
    stage.scene.updateMatrixWorld(true);
    const bb = new Box3();
    const boneWorld = new Vector3();
    stage.scene.traverse((o) => {
      if (o instanceof SkinnedMesh) for (const bone of o.skeleton.bones) bb.expandByPoint(bone.getWorldPosition(boneWorld));
    });
    const size = bb.getSize(new Vector3());
    const center = bb.getCenter(new Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    controls.target.copy(center);
    camera.position.set(center.x, center.y + radius * 0.75, center.z + radius * 1.55);
    controls.update();
  });

  let lastT = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const now = performance.now();
    for (const mixer of mixers) mixer.update((now - lastT) / 1000);
    lastT = now;
    controls.update();
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return wrapWithCleanup(stage, [() => { cancelAnimationFrame(rafId); controls.dispose(); envMap.dispose(); }]);
};

// The 2D map's soldiers: the three figures of a capture-hold garrison, and
// the seven-dot squads of a battle or dock landing (drawn here at the size
// client-battle-overlay-2d.ts uses, one squad per tile).
const render2D = (): HTMLElement => {
  const tile = 96;
  const root = document.createElement("div");
  root.style.cssText = "display:grid;gap:12px;padding:16px;background:#12210f;color:#e9f2ff;font:13px system-ui;width:max-content;";
  const now = Date.now();
  const rows: Array<[string, (ctx: CanvasRenderingContext2D, color: string, px: number, skin: AncillarySkin) => void]> = [
    ["Garrison", (ctx, color, px, skin) => {
      const held = { x: 0, y: 0, terrain: "LAND", ownerId: "house", ownershipState: "FRONTIER", captureHoldUntil: now + 40_000 } as unknown as Tile;
      drawCaptureHoldGarrison2D(ctx, held, color, px, 0, tile, now, skin);
    }],
    ["Battle squad", (ctx, color, px, skin) => {
      const radius = Math.max(0.5, tile * 0.035);
      for (let i = 0; i < 7; i++) {
        const x = px + tile * (0.3 + (i % 2) * 0.12);
        const y = tile * (0.2 + i * 0.1);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        drawAncillaryDotHelmet2D(ctx, x, y, radius, skin);
      }
    }]
  ];
  for (const [title, draw] of rows) {
    for (const skin of SKINS) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:12px;";
      const label = document.createElement("span");
      label.textContent = `${title}: ${skin === "default" ? "standard" : "Ivory-trim plate"}`;
      label.style.width = "210px";
      row.appendChild(label);
      const canvas = document.createElement("canvas");
      canvas.width = tile * EMPIRE_COLORS.length;
      canvas.height = tile;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        EMPIRE_COLORS.forEach((color, i) => {
          ctx.fillStyle = i % 2 === 0 ? "#3d6b34" : "#35602d";
          ctx.fillRect(i * tile, 0, tile, tile);
          draw(ctx, color, i * tile, skin);
        });
      }
      row.appendChild(canvas);
      root.appendChild(row);
    }
  }
  return root;
};

const meta: Meta<Args> = {
  title: "Map/Combat/Popup Marines/Ancillary Skins",
  parameters: {
    docs: {
      description: {
        component: [
          "Ancillary soldier cosmetics. In each pair the left soldier wears the standard paint scheme and the right one the",
          "Ivory-trim plate. A skin repaints only the parts the standard scheme shows as a dark shade of the House colour",
          "(helmet, gloves and boots; on the heavy armour, its graphite); the House-coloured plates, the model, its size and its animation are untouched,",
          "so a rival reads whose soldiers they are, how many, and whether they wear titanium plate exactly as before."
        ].join("\n")
      }
    }
  },
  args: { rows: "both", clip: "PistolIdle" },
  argTypes: {
    rows: { control: "inline-radio", options: ["both", "standard", "heavy"] },
    clip: { control: "inline-radio", options: ["PistolIdle", "PistolWalk", "PistolKneelingIdle"] }
  },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const SideBySide: Story = {};
export const StandardCloseUp: Story = { args: { rows: "standard" } };
export const HeavyCloseUp: Story = { args: { rows: "heavy" } };
export const Figures2D: Story = { render: render2D };
