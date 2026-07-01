import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  BoxGeometry,
  ConeGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry
} from "three";
import { createAetherPurgeFxLayer } from "@client/client-map-3d-aether-purge-fx/client-map-3d-aether-purge-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0b1620" });
  const fx = createAetherPurgeFxLayer(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: "#203d32", roughness: 0.9, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const body = new Mesh(
    new BoxGeometry(0.28, 0.22, 0.28),
    new MeshStandardMaterial({ color: "#6f5240", roughness: 0.78, metalness: 0.08, flatShading: true })
  );
  body.position.y = 0.11;
  stage.scene.add(body);

  const roof = new Mesh(
    new ConeGeometry(0.22, 0.16, 4),
    new MeshStandardMaterial({ color: "#a94735", roughness: 0.72, metalness: 0.05, flatShading: true })
  );
  roof.position.y = 0.3;
  roof.rotation.y = Math.PI / 4;
  stage.scene.add(roof);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(180,240,255,0.55)";
  button.style.background = "rgba(6,16,24,0.86)";
  button.style.color = "#d9fbff";
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
    intervalId = window.setInterval(spawn, 2800);
  }

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
      button.removeEventListener("click", spawn);
      fx.dispose();
      tile.geometry.dispose();
      (tile.material as MeshStandardMaterial).dispose();
      body.geometry.dispose();
      (body.material as MeshStandardMaterial).dispose();
      roof.geometry.dispose();
      (roof.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Aether Purge FX (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 5, autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const AutoReplay: Story = { args: { autoReplay: true } };
