// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { InstancedMesh, PlaneGeometry, RingGeometry, Scene } from "three";
import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { renderBuildingPlacementPreview2D } from "../client-placement-preview-2d/client-placement-preview-2d.js";
import { createPlacementRangeOverlay } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";

const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

const placingBeacon = () => {
  const state = createInitialState();
  state.me = "me";
  const tiles: Tile[] = [
    { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", townType: "FARMING", townPopulationTier: "TOWN" },
    { x: 13, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }
  ];
  for (const tile of tiles) state.tiles.set(tileKey(tile.x, tile.y), tile);
  state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 13, y: 10 };
  return state;
};

it("shows the new reach a Relay Beacon would add in 2D and true-3D while placing, without recommended-spot rings, then clears", () => {
  const state = placingBeacon();
  const isPlacementValidForTile = (tile: Tile | undefined): boolean => tile?.ownerId === "me";

  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(),
    globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1
  };
  renderBuildingPlacementPreview2D(
    state,
    {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      keyFor: tileKey,
      wrapX,
      wrapY,
      worldToScreen: (wx, wy) => ({ sx: wx * 10, sy: wy * 10 }),
      tileVisibilityStateAt: () => "visible",
      isPlacementValidForTile
    },
    20,
    0,
    0
  );
  expect(ctx.fillRect).toHaveBeenCalled(); // newly reachable tiles shaded
  expect(ctx.strokeRect).toHaveBeenCalledTimes(1); // the radius-5 range ring
  expect(ctx.arc).not.toHaveBeenCalled(); // no recommended-spot rings

  const scene = new Scene();
  const overlay = createPlacementRangeOverlay(scene);
  const deps = {
    state,
    sceneOrigin: { camX: 0, camY: 0 },
    keyFor: tileKey,
    wrapX,
    wrapY,
    tileVisibilityStateAt: () => "visible" as const,
    isPlacementValidForTile,
    cornerYAt: () => 0
  };
  overlay.sync(deps);
  const instanced = scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
  expect(instanced.some((mesh) => mesh.geometry instanceof RingGeometry)).toBe(false);
  const newReach = instanced.find((mesh) => mesh.geometry instanceof PlaneGeometry && mesh.count > 0);
  expect(newReach?.visible).toBe(true);

  state.buildingPlacement = { active: false, structureType: "", x: 0, y: 0 };
  overlay.sync(deps);
  expect(instanced.every((mesh) => !mesh.visible)).toBe(true);
});
