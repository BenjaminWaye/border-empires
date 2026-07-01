import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  BoxGeometry,
  ConeGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry
} from "three";
import { createRevealEmpireFxLayer } from "@client/client-map-3d-reveal-empire-fx/client-map-3d-reveal-empire-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.82, background: "#07131d" });
  stage.camera.position.set(0, 3.6, 6.8);
  stage.camera.lookAt(0, 1.35, 0);
  const fx = createRevealEmpireFxLayer(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: "#1f342d", roughness: 0.92, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const tower = new Mesh(
    new BoxGeometry(0.18, 0.42, 0.18),
    new MeshStandardMaterial({ color: "#826946", roughness: 0.72, metalness: 0.08, flatShading: true })
  );
  tower.position.y = 0.21;
  stage.scene.add(tower);

  const beaconCap = new Mesh(
    new ConeGeometry(0.18, 0.18, 5),
    new MeshStandardMaterial({ color: "#355a82", roughness: 0.62, metalness: 0.12, flatShading: true })
  );
  beaconCap.position.y = 0.51;
  beaconCap.rotation.y = Math.PI / 5;
  stage.scene.add(beaconCap);

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
      tower.geometry.dispose();
      (tower.material as MeshStandardMaterial).dispose();
      beaconCap.geometry.dispose();
      (beaconCap.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Reveal Empire FX (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 6.8, autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const AutoReplay: Story = { args: { autoReplay: true } };
