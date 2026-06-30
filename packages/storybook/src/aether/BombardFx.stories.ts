import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { createBombardFxLayer, type BombardTileOutcome } from "@client/client-map-3d-bombard-fx/client-map-3d-bombard-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  pattern: "allHit" | "allMiss" | "mixed";
  autoReplay: boolean;
};

const patterns: Record<Args["pattern"], BombardTileOutcome[]> = {
  allHit: gridOutcomes(() => "hit"),
  allMiss: gridOutcomes(() => "miss"),
  mixed: gridOutcomes((dx, dy) => ((dx + dy * 2 + 4) % 3 === 0 ? "miss" : "hit"))
};

function gridOutcomes(pick: (dx: number, dy: number) => "hit" | "miss"): BombardTileOutcome[] {
  const tiles: BombardTileOutcome[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      tiles.push({ dx, dy, outcome: pick(dx, dy) });
    }
  }
  return tiles;
}

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0a0c10" });
  const fx = createBombardFxLayer(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(3, 3),
    new MeshStandardMaterial({ color: "#1c2a22", roughness: 0.95, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(255,140,60,0.55)";
  button.style.background = "rgba(10,12,16,0.9)";
  button.style.color = "#fff4ea";
  button.style.cursor = "pointer";
  button.style.borderRadius = "4px";

  const spawn = (): void => fx.spawn(0, 0, 0, patterns[args.pattern]);
  button.addEventListener("click", spawn);
  spawn();

  let rafId = 0;
  const animateFx = (): void => {
    fx.update(performance.now());
    rafId = requestAnimationFrame(animateFx);
  };
  animateFx();

  let intervalId = 0;
  if (args.autoReplay) {
    intervalId = window.setInterval(spawn, 2000);
  }

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
      button.removeEventListener("click", spawn);
      fx.dispose();
      tile.geometry.dispose();
      (tile.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Bombard FX (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    pattern: { control: "select", options: ["allHit", "allMiss", "mixed"] },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 5, pattern: "mixed", autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Mixed: Story = {};
export const AllHits: Story = { args: { pattern: "allHit" } };
export const AllMisses: Story = { args: { pattern: "allMiss", autoReplay: true } };
