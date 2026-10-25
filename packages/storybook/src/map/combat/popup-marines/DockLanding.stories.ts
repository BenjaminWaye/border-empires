import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { createPopupMarineOverlayFx, APPROACH_MS, CLASH_MS, ROUT_MS } from "@client/client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import type { BattleOverlaySkirmishEntry } from "@client/client-dock-landing/client-battle-render-types.js";
import { createDockOverlay } from "@client/client-map-3d-dock-overlay.js";
import { createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

type Args = { seconds: number; play: boolean; attackerWon: boolean };

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: 3.8, width: 900, height: 620, background: "#9ebbc6" });
  stage.camera.position.set(2.5, 2.7, -3); stage.camera.lookAt(-0.4, 0, 0);
  const fx = createPopupMarineOverlayFx(stage.scene);
  const meshes: Mesh[] = [];
  const plane = (x: number, z: number, w: number, d: number, color: string): void => {
    const mesh = new Mesh(new PlaneGeometry(w, d), new MeshStandardMaterial({ color, roughness: 0.85 }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, -0.012, z); stage.scene.add(mesh); meshes.push(mesh);
  };
  plane(-1.6, 0, 2.2, 3, "#326e86"); plane(1, 0, 3, 3, "#cab785");
  const dock = createDockOverlay(stage.scene, 1);
  dock.addInstance(0, 0, 0, -Math.PI / 2, 5, 1); dock.commit();
  const b: BattleOverlaySkirmishEntry = {
    srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
    attackerColor: "#378ff2", defenderColor: "#e45749", startAt: 0, hashSeed: 100,
    landing: { startAt: 0, inwardX: 1, inwardZ: 0, route: [{ x: -2.3, z: 0 }, { x: -0.72, z: -0.45 }] }
  };
  const resolvedAt = 8000; const endAt = resolvedAt + CLASH_MS + ROUT_MS;
  const label = document.createElement("div");
  label.style.cssText = "position:absolute;bottom:12px;left:12px;padding:8px 12px;background:#15212bdd;color:white;font:14px system-ui";
  const startedAt = performance.now(); let raf = 0;
  const animate = (): void => {
    const elapsed = args.play ? (performance.now() - startedAt) % (endAt + 1800) : args.seconds * 1000;
    if (elapsed < resolvedAt) fx.tick(elapsed, [], [b]);
    else if (elapsed < endAt) fx.tick(elapsed, [{ ...b, startAt: resolvedAt - APPROACH_MS,
      clashAt: resolvedAt, endAt, attackerWon: args.attackerWon, fromSkirmish: true }]);
    else fx.clear();
    label.textContent = elapsed < 1300 ? "Carrier approaching" : elapsed < 1800 ? "Bow ramp lowering" :
      elapsed < APPROACH_MS ? "Infantry disembarking" : elapsed < endAt ? "Carrier holds the beach during combat" : "Battle over";
    raf = requestAnimationFrame(animate);
  };
  animate();
  const element = wrapWithCleanup(stage, [() => {
    cancelAnimationFrame(raf); fx.dispose(); dock.dispose();
    for (const mesh of meshes) { mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); }
  }]);
  element.append(label); return element;
};
const meta: Meta<Args> = {
  title: "Map/Combat/Popup Marines/Dock Landing", render,
  args: { seconds: 2.9, play: true, attackerWon: true },
  argTypes: { seconds: { control: { type: "range", min: 0, max: 12, step: 0.05 } },
    play: { control: "boolean" }, attackerWon: { control: "boolean" } }
};
export default meta;
type Story = StoryObj<Args>;
export const Landing: Story = {};
export const RampUnloading: Story = { args: { play: false, seconds: 2.9 } };
export const BeachedDuringBattle: Story = { args: { play: false, seconds: 6 } };
