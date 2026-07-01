import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry
} from "three";
import { createRevealEmpireStatsFxLayer } from "@client/client-map-3d-reveal-empire-stats-fx/client-map-3d-reveal-empire-stats-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#08111a" });
  const fx = createRevealEmpireStatsFxLayer(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: "#223042", roughness: 0.9, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const borderPost = new Mesh(
    new BoxGeometry(0.16, 0.28, 0.16),
    new MeshStandardMaterial({ color: "#b88a48", roughness: 0.64, metalness: 0.12, flatShading: true })
  );
  borderPost.position.y = 0.14;
  stage.scene.add(borderPost);

  const banner = new Mesh(
    new BoxGeometry(0.34, 0.12, 0.02),
    new MeshStandardMaterial({ color: "#3167a8", roughness: 0.58, metalness: 0.05, flatShading: true })
  );
  banner.position.set(0.16, 0.28, 0);
  stage.scene.add(banner);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(180,240,255,0.55)";
  button.style.background = "rgba(5,14,24,0.88)";
  button.style.color = "#e2faff";
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
    intervalId = window.setInterval(spawn, 2600);
  }

  const stageEl = wrapWithCleanup(stage, [
    () => {
      cancelAnimationFrame(rafId);
      if (intervalId) window.clearInterval(intervalId);
      button.removeEventListener("click", spawn);
      fx.dispose();
      tile.geometry.dispose();
      (tile.material as MeshStandardMaterial).dispose();
      borderPost.geometry.dispose();
      (borderPost.material as MeshStandardMaterial).dispose();
      banner.geometry.dispose();
      (banner.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Reveal Empire Stats FX (3D)",
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
