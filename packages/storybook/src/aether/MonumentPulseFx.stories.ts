import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { createMonumentPulseFxLayer } from "@client/client-map-3d-monument-pulse-fx/client-map-3d-monument-pulse-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  color: string;
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0a0c10" });
  const fx = createMonumentPulseFxLayer(stage.scene, args.color, "monument-pulse-fx-story");

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

  const spawn = (): void => fx.spawn(0, 0, 0);
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
    intervalId = window.setInterval(spawn, 1800);
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
  title: "Monument Abilities/Monument Pulse FX (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    color: { control: "color" },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 5, color: "#ff5533", autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const WorldEngineStrike: Story = { args: { color: "#ff5533" } };
export const ImperialExchangeLevy: Story = { args: { color: "#ffd166" } };
