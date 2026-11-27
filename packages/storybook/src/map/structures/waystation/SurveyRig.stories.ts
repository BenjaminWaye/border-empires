import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawWaystation2D } from "@client/client-map-2d-waystation-overlay.js";
import { Vector3 } from "three";
import { createWaystationOverlay } from "@client/client-map-3d-waystation-overlay.js";
import { createWaystationReadyToasts } from "@client/client-waystation-site/client-waystation-ready-toasts.js";
import { isTrue3DRendererActive, setTrue3DRendererActive } from "@client/client-renderer-mode.js";
import type { Tile } from "@client/client-types.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

/** Uses the real rig and prompt. Activate simulates the server's consumed tile delta. */
const render = (): HTMLElement => {
  const wasThree = isTrue3DRendererActive();
  setTrue3DRendererActive(true);
  const stage = createStage({ cameraDistance: 3, background: "#171b20" });
  stage.camera.position.set(1.5, 1.8, 2.3);
  stage.camera.lookAt(0, 0.3, 0);
  stage.camera.updateMatrixWorld();
  const ground = createGrassGround(3);
  stage.scene.add(ground.group);
  const rig = createWaystationOverlay(stage.scene, 1);
  rig.addInstance(0, 0, 0.01, 10, 10, { activated: false });
  rig.commit();
  const tile: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", waystation: { activated: false } };
  let raf = 0;
  let toasts: ReturnType<typeof createWaystationReadyToasts> | undefined;
  const root = wrapWithCleanup(stage, [() => cancelAnimationFrame(raf), rig.dispose, ground.dispose,
    () => { toasts?.dispose(); setTrue3DRendererActive(wasThree); }]);
  root.style.width = "960px";
  root.style.maxWidth = "100%";
  toasts = createWaystationReadyToasts(stage.canvas, { me: "me", authSessionReady: true, profileSetupRequired: false }, () => {
    tile.waystation = { activated: true };
    rig.clear(); rig.commit();
    root.dataset.collected = "true";
    return true;
  });
  const project = (): { sx: number; sy: number } => {
    const at = new Vector3(0, 0, 0).project(stage.camera);
    return { sx: (at.x + 1) * stage.canvas.width / 2, sy: (1 - at.y) * stage.canvas.height / 2 };
  };
  const tick = (): void => {
    rig.update(performance.now());
    toasts?.render([{ wx: 10, wy: 10, wk: "10,10", px: 0, py: 0, vis: "visible", t: tile }], { size: 128, project });
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return root;
};
const meta: Meta = { title: "Map/Structures/Waystation/Survey Rig", render };
export default meta;
type Story = StoryObj;
export const Collect: Story = {};

export const CanvasFallback: Story = {
  render: () => {
    setTrue3DRendererActive(false);
    const root = document.createElement("div");
    root.style.cssText = "position:relative;width:960px;max-width:100%";
    const canvas = document.createElement("canvas");
    canvas.width = 960; canvas.height = 540;
    canvas.style.cssText = "width:100%;display:block";
    root.append(canvas);
    const tile: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", waystation: { activated: false } };
    const toasts = createWaystationReadyToasts(canvas, { me: "me", authSessionReady: true, profileSetupRequired: false }, () => {
      tile.waystation = { activated: true };
      paint();
      root.dataset.collected = "true";
      return true;
    });
    const paint = (): void => {
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#5e7c30"; ctx.fillRect(0, 0, 960, 540);
      ctx.strokeStyle = "#778e42";
      for (let x = 0; x < 960; x += 144) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 540); ctx.stroke(); }
      for (let y = 0; y < 540; y += 144) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(960, y); ctx.stroke(); }
      if (!tile.waystation?.activated) drawWaystation2D(ctx, tile, 408, 280, 144, 0);
      toasts.render([{ wx: 10, wy: 10, wk: "10,10", px: 408, py: 280, vis: "visible", t: tile }], { size: 144, project: () => ({ sx: 0, sy: 0 }) });
    };
    // The story mounts after render, so its canvas bounds become available next frame.
    requestAnimationFrame(paint);
    return root;
  }
};
