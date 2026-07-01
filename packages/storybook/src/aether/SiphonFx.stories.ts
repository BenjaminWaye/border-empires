import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry
} from "three";
import { createSiphonFxLayer } from "@client/client-map-3d-siphon-fx/client-map-3d-siphon-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  target: "town" | "resource";
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#12080d" });
  const fx = createSiphonFxLayer(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: "#2a1b20", roughness: 0.92, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const targetMesh =
    args.target === "town"
      ? new Mesh(
          new CylinderGeometry(0.16, 0.22, 0.32, 6),
          new MeshStandardMaterial({ color: "#8b5b46", roughness: 0.78, metalness: 0.03, flatShading: true })
        )
      : new Mesh(
          new BoxGeometry(0.42, 0.08, 0.18),
          new MeshStandardMaterial({ color: "#73d7c8", roughness: 0.5, metalness: 0.18, flatShading: true })
        );
  targetMesh.position.y = args.target === "town" ? 0.16 : 0.05;
  targetMesh.rotation.y = args.target === "town" ? 0.5 : -0.45;
  stage.scene.add(targetMesh);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(255,109,115,0.55)";
  button.style.background = "rgba(24,8,13,0.9)";
  button.style.color = "#fff0f2";
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
      targetMesh.geometry.dispose();
      (targetMesh.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Siphon FX (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    target: { control: "select", options: ["town", "resource"] },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 5, target: "town", autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const Resource: Story = { args: { target: "resource" } };
