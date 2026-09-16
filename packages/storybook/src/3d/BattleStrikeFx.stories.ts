import type { Meta, StoryObj } from "@storybook/html-vite";
import { Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { createBattleStrikeFxLayer } from "@client/client-map-3d-popup-marine/popup-marine-strike-fx.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

// The opening "warning shot" that lands on a battle tile right before a
// squad's firefight begins — see popup-marine-strike-fx.ts and
// popup-marine-overlay-fx.ts's maybeFireStrike wiring for where this fires
// automatically during a real approach. This story isolates the beam alone
// (repeatable on demand) so its color, descent, and impact timing can be
// judged without racing the real ~2.75s approach window.

type Args = {
  cameraDistance: number;
  autoReplay: boolean;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.35, background: "#0a0c10" });
  const fx = createBattleStrikeFxLayer(stage.scene);

  const tile = new Mesh(
    new PlaneGeometry(2, 2),
    new MeshStandardMaterial({ color: "#241a33", roughness: 0.95, metalness: 0 })
  );
  tile.rotation.x = -Math.PI / 2;
  stage.scene.add(tile);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Replay strike";
  button.style.position = "absolute";
  button.style.top = "12px";
  button.style.left = "12px";
  button.style.padding = "8px 12px";
  button.style.border = "1px solid rgba(139,92,255,0.6)";
  button.style.background = "rgba(10,12,16,0.9)";
  button.style.color = "#e6dcff";
  button.style.cursor = "pointer";
  button.style.borderRadius = "4px";

  const spawn = (): void => fx.spawn(0, 0, 0, performance.now());
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
    intervalId = window.setInterval(spawn, 1600);
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
  title: "3D Library/BattleStrikeFx",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1.5, max: 8, step: 0.5 } },
    autoReplay: { control: "boolean" }
  },
  args: { cameraDistance: 3, autoReplay: true },
  render
};

export default meta;
type Story = StoryObj<Args>;

/** The beam alone, replaying every 1.6s — descent, impact flash, expanding ring. */
export const Strike: Story = {};

/** Same beam, camera pulled back to see the full descent from above. */
export const StrikeWide: Story = { args: { cameraDistance: 6 } };
