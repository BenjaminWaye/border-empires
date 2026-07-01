import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry
} from "three";
import { createSurveySweepFxLayer } from "@client/client-map-3d-survey-sweep-fx/client-map-3d-survey-sweep-fx.js";
import { createSurveySweepPingOverlay } from "@client/client-map-3d-survey-sweep-ping-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#08151a" });
  const fx = createSurveySweepFxLayer(stage.scene);
  const pingOverlay = createSurveySweepPingOverlay(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: "#20332c", roughness: 0.9, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const tower = new Mesh(
    new CylinderGeometry(0.08, 0.12, 0.48, 6),
    new MeshStandardMaterial({ color: "#4c5f65", roughness: 0.62, metalness: 0.08, flatShading: true })
  );
  tower.position.y = 0.24;
  stage.scene.add(tower);

  const lens = new Mesh(
    new BoxGeometry(0.34, 0.07, 0.1),
    new MeshStandardMaterial({ color: "#91eaff", roughness: 0.32, metalness: 0.18, flatShading: true })
  );
  lens.position.y = 0.52;
  lens.rotation.y = -0.35;
  stage.scene.add(lens);

  const spire = new Mesh(
    new ConeGeometry(0.11, 0.22, 5),
    new MeshStandardMaterial({ color: "#d7c57a", roughness: 0.55, metalness: 0.12, flatShading: true })
  );
  spire.position.y = 0.71;
  spire.rotation.y = Math.PI / 5;
  stage.scene.add(spire);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(160,245,255,0.55)";
  button.style.background = "rgba(6,18,22,0.88)";
  button.style.color = "#e4fcff";
  button.style.cursor = "pointer";
  button.style.borderRadius = "4px";

  const demoPings = [
    { kind: "resource" as const, x: -1.25, z: -0.55, delayMs: 900 },
    { kind: "town" as const, x: 1.05, z: -0.85, delayMs: 1_050 },
    { kind: "resource" as const, x: 0.55, z: 1.15, delayMs: 1_220 },
    { kind: "town" as const, x: -0.85, z: 1.25, delayMs: 1_380 }
  ];
  let spawnedAt = performance.now();
  const spawn = (): void => {
    spawnedAt = performance.now();
    fx.spawn(0, 0, 0);
  };
  button.addEventListener("click", spawn);
  spawn();

  let rafId = 0;
  const animateFx = (): void => {
    const nowMs = performance.now();
    fx.update(nowMs);
    pingOverlay.beginFrame();
    for (const ping of demoPings) {
      const createdAt = spawnedAt + ping.delayMs;
      if (nowMs < createdAt) continue;
      pingOverlay.addPing(ping.kind, ping.x, ping.z, 0, nowMs, createdAt, createdAt + 5_200);
    }
    pingOverlay.commit();
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
      pingOverlay.dispose();
      tile.geometry.dispose();
      (tile.material as MeshStandardMaterial).dispose();
      tower.geometry.dispose();
      (tower.material as MeshStandardMaterial).dispose();
      lens.geometry.dispose();
      (lens.material as MeshStandardMaterial).dispose();
      spire.geometry.dispose();
      (spire.material as MeshStandardMaterial).dispose();
    }
  ]);
  stageEl.appendChild(button);
  return stageEl;
};

const meta: Meta<Args> = {
  title: "Aether Abilities/Survey Sweep FX (3D)",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 5.5, autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
