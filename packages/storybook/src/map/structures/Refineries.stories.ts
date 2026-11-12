import { DirectionalLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PlaneGeometry, PMREMGenerator } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createDistrictOverlay } from "@client/client-town-district/district-overlay.js";
import type { DistrictVisualKind } from "@client/client-town-district/district-catalog.js";
import { REFINERY_MODEL_KINDS } from "@client/client-town-district/support-model-refinery.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

// Proposal review (docs/territory-development-plan.md, Phase 2): refineries in
// the back row, their boosters in front, on the production district kit.
// The kinds are not structure types yet, so they are cast for the overlay.

const LABELS: Record<string, string> = {
  TITANIUM_REFINERY: "Titanium Refinery", UMBRITE_REFINERY: "Umbrite Refinery", CRYSTAL_REFINERY: "Crystal Refinery",
  TITANIUM_SMELTER: "Titanium Smelter (booster)", UMBRITE_DISTILLERY: "Umbrite Distillery (booster)", CRYSTAL_CUTTER: "Crystal Cutter (booster)"
};

type Args = { zoom: number; only: number };
const render = (args: Args): HTMLElement => {
  const stage = createStage({ width: 1200, height: 620, camera: "orthographic", orthoHalfHeight: 0.95 / args.zoom, background: "#18232b", bloom: true });
  stage.camera.position.set(1.4, 1.5, 2.4); stage.camera.lookAt(0, args.only >= 0 ? 0.18 : 0.12, 0);
  stage.renderer.shadowMap.enabled = true; stage.renderer.shadowMap.type = PCFSoftShadowMap;
  const sun = stage.scene.children.find((object): object is DirectionalLight => object instanceof DirectionalLight);
  if (sun) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 40 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.002;
  }
  const room = new RoomEnvironment(), pmrem = new PMREMGenerator(stage.renderer);
  const environment = pmrem.fromScene(room); pmrem.dispose(); room.dispose();
  const groundGeometry = new PlaneGeometry(200, 200).rotateX(-Math.PI / 2);
  const groundMaterial = new MeshStandardMaterial({ color: "#263a36", roughness: 0.92 });
  const ground = new Mesh(groundGeometry, groundMaterial); ground.position.y = -0.105; ground.receiveShadow = true; stage.scene.add(ground);
  const overlay = createDistrictOverlay(stage.scene, REFINERY_MODEL_KINDS.length, environment.texture);
  REFINERY_MODEL_KINDS.forEach((kind, index) => {
    if (args.only >= 0 && index !== args.only) return;
    const x = args.only >= 0 ? 0 : ((index % 3) - 1) * 0.95, z = args.only >= 0 ? 0 : index < 3 ? -0.5 : 0.5;
    overlay.add({ kind: kind as unknown as DistrictVisualKind, x, z, y: 0, foundation: true, operational: true });
  });
  overlay.commit();
  let raf = 0;
  const tick = (): void => { overlay.update(performance.now()); raf = requestAnimationFrame(tick); }; tick();
  const root = wrapWithCleanup(stage, [overlay.dispose, () => environment.dispose(), () => groundGeometry.dispose(), () => groundMaterial.dispose(), () => cancelAnimationFrame(raf)]);
  const legend = document.createElement("p");
  legend.style.cssText = "margin:0;padding:12px 16px;background:#18232b;color:#e3d7ba;font:14px system-ui";
  legend.textContent = args.only >= 0 ? LABELS[REFINERY_MODEL_KINDS[args.only] ?? ""] ?? "" : `Back row: ${REFINERY_MODEL_KINDS.slice(0, 3).map(kind => LABELS[kind]).join(" · ")}. Front row: ${REFINERY_MODEL_KINDS.slice(3).map(kind => LABELS[kind]).join(" · ")}.`;
  root.append(legend);
  return root;
};

const meta: Meta<Args> = {
  title: "Map/Structures/Refineries (proposal)",
  argTypes: {
    zoom: { control: { type: "range", min: 0.6, max: 4, step: 0.1 } },
    only: { control: { type: "range", min: -1, max: 5, step: 1 }, description: "-1 shows all six" }
  },
  args: { zoom: 1, only: -1 },
  render
};
export default meta;
export const Lineup: StoryObj<Args> = {};
export const Close: StoryObj<Args> = { args: { zoom: 1.8 } };
export const Single: StoryObj<Args> = { args: { zoom: 2.6, only: 0 } };
