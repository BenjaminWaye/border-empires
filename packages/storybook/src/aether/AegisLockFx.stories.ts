import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { createAegisLockFxLayer } from "@client/client-map-3d-aegis-lock-fx/client-map-3d-aegis-lock-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  radiusInTiles: number;
  previewDurationMs: number;
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0a0c10" });
  const fx = createAegisLockFxLayer(stage.scene);

  const ground = new Mesh(
    new PlaneGeometry(args.radiusInTiles * 2.4, args.radiusInTiles * 2.4),
    new MeshStandardMaterial({ color: "#1c2a22", roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  stage.scene.add(ground);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(120,220,255,0.55)";
  button.style.background = "rgba(10,12,16,0.9)";
  button.style.color = "#eafcff";
  button.style.cursor = "pointer";
  button.style.borderRadius = "4px";

  // The real ability lasts 15 minutes; previewDurationMs compresses the
  // fade-in/fade-out envelope so reviewers see the full lifecycle quickly.
  const spawn = (): void => fx.spawn(0, 0, 0, args.radiusInTiles, args.previewDurationMs);
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
    intervalId = window.setInterval(spawn, args.previewDurationMs + 500);
  }

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
      button.removeEventListener("click", spawn);
      fx.dispose();
      ground.geometry.dispose();
      (ground.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Monument Abilities/Aegis Lock Stasis Field (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } },
    radiusInTiles: { control: { type: "range", min: 5, max: 30, step: 1 } },
    previewDurationMs: { control: { type: "range", min: 1000, max: 8000, step: 250 } },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 22, radiusInTiles: 30, previewDurationMs: 3500, autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const FullRadius: Story = {};
export const SmallPreviewRadius: Story = { args: { radiusInTiles: 8, cameraDistance: 8 } };
