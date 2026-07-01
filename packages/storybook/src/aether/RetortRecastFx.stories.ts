import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry
} from "three";
import { createRetortRecastFxLayer, type RetortRecastFxResource } from "@client/client-map-3d-retort-recast-fx/client-map-3d-retort-recast-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  targetResource: RetortRecastFxResource;
  autoReplay: boolean;
};

const resourceColor = (resource: RetortRecastFxResource): string => {
  if (resource === "FARM") return "#4c8f52";
  if (resource === "WOOD") return "#8b6232";
  if (resource === "IRON") return "#8b99a5";
  return "#39bfe0";
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#10130f" });
  const fx = createRetortRecastFxLayer(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: "#26311f", roughness: 0.9, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const vein = new Mesh(
    new BoxGeometry(0.45, 0.035, 0.16),
    new MeshStandardMaterial({ color: resourceColor(args.targetResource), roughness: 0.55, metalness: 0.15, flatShading: true })
  );
  vein.position.y = 0.04;
  vein.rotation.y = -0.45;
  stage.scene.add(vein);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(170,245,205,0.55)";
  button.style.background = "rgba(9,18,12,0.88)";
  button.style.color = "#e7fff0";
  button.style.cursor = "pointer";
  button.style.borderRadius = "4px";

  const spawn = (): void => fx.spawn(0, 0, 0, args.targetResource);
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
    intervalId = window.setInterval(spawn, 3000);
  }

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
      button.removeEventListener("click", spawn);
      fx.dispose();
      tile.geometry.dispose();
      (tile.material as MeshStandardMaterial).dispose();
      vein.geometry.dispose();
      (vein.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Retort Recast FX (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    targetResource: { control: "select", options: ["FARM", "WOOD", "IRON", "GEMS"] },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 5, targetResource: "GEMS", autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Food: Story = { args: { targetResource: "FARM" } };
export const Supply: Story = { args: { targetResource: "WOOD" } };
export const Iron: Story = { args: { targetResource: "IRON" } };
export const Crystal: Story = { args: { targetResource: "GEMS" } };
