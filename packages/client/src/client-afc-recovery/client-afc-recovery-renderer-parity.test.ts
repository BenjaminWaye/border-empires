// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { createPlacementRangeOverlay } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";
import { renderBuildingPlacementPreview2D } from "../client-placement-preview-2d/client-placement-preview-2d.js";

it("keeps a pending 3x3 landing footprint visible in 2D and 3D after placement controls close", () => {
  const state = createInitialState(); state.me = "me";
  state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
  state.afcRecovery = { globalLosses: 1, requiredSince: 1000, pending: { x: 10, y: 10, cost: 20, arrivesAt: 61000, commandId: "order" } };
  const ctx = { save: vi.fn(), restore: vi.fn(), strokeRect: vi.fn(), strokeStyle: "", lineWidth: 1 };
  const deps = { state, keyFor: tileKey, wrapX: (x: number) => (x + WORLD_WIDTH) % WORLD_WIDTH, wrapY: (y: number) => (y + WORLD_HEIGHT) % WORLD_HEIGHT,
    tileVisibilityStateAt: () => "visible" as const, isPlacementValidForTile: () => false, sceneOrigin: { camX: 0, camY: 0 }, cornerYAt: () => 0 };
  renderBuildingPlacementPreview2D(state, { ...deps, ctx: ctx as unknown as CanvasRenderingContext2D, worldToScreen: () => ({ sx: 100, sy: 100 }) }, 20, 0, 0);
  expect(ctx.strokeRect).toHaveBeenCalledWith(72, 72, 56, 56);
  expect(ctx.strokeStyle).toBe("rgba(102, 220, 255, 0.95)");
  const scene = new Scene(); const overlay = createPlacementRangeOverlay(scene);
  overlay.sync(deps);
  expect(scene.children.some(child => child.visible)).toBe(true);
  delete state.afcRecovery.pending;
  overlay.sync(deps);
  expect(scene.children.every(child => !child.visible)).toBe(true);
});
