// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { BufferAttribute, InstancedMesh, LineSegments, PlaneGeometry, RingGeometry, Scene } from "three";
import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { renderBuildingPlacementPreview2D } from "../client-placement-preview-2d/client-placement-preview-2d.js";
import { createPlacementRangeOverlay } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";
import { beaconExpansionElapsedMs, beaconExpansionOutline, beaconReachExpansion, resetBeaconExpansionClockForTests } from "../client-beacon-reach-expansion/client-beacon-reach-expansion.js";

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
  resetBeaconExpansionClockForTests();
  beaconExpansionElapsedMs(13, 10, 0); // the beacon went on this tile at 0 ms
  const state = placingBeacon();
  const isPlacementValidForTile = (tile: Tile | undefined): boolean => tile?.ownerId === "me";

  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
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
    0,
    5_000 // the reach has grown in full
  );
  expect(ctx.fillRect).toHaveBeenCalled(); // newly reachable tiles shaded
  expect(ctx.lineTo).toHaveBeenCalled(); // a solid outline around the new reach
  // Owner, First-15 round 1: the growing reach replaces the flat range square on a valid spot.
  expect(ctx.strokeRect).not.toHaveBeenCalled();
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
    cornerYAt: () => 0,
    nowMs: 5_000
  };
  overlay.sync(deps);
  const instanced = scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
  expect(instanced.some((mesh) => mesh.geometry instanceof RingGeometry)).toBe(false);
  const newReach = instanced.find((mesh) => mesh.geometry instanceof PlaneGeometry && mesh.count > 0);
  expect(newReach?.visible).toBe(true);
  const lines = scene.children.filter((child): child is LineSegments => child instanceof LineSegments);
  // The new reach's outline shows; the range square (the other line set) does not on a valid spot.
  expect(lines.filter((line) => line.visible)).toHaveLength(1);
  const edges = beaconExpansionOutline(beaconReachExpansion(state, 13, 10), tileKey, wrapX, wrapY);
  expect(edges.length).toBeGreaterThan(0);
  expect(lines.find((line) => line.visible)!.geometry.drawRange.count).toBe(edges.length * 2); // the same edges as 2D, 2 vertices each
  expect(ctx.lineTo).toHaveBeenCalledTimes(edges.length);

  state.buildingPlacement = { active: false, structureType: "", x: 0, y: 0 };
  overlay.sync(deps);
  expect(instanced.every((mesh) => !mesh.visible)).toBe(true);
  expect(lines.every((line) => !line.visible)).toBe(true);
});

it("true-3D: uploads the outline and a held full reach once, not every frame, and again when the scene origin moves", () => {
  resetBeaconExpansionClockForTests();
  beaconExpansionElapsedMs(13, 10, 0);
  const state = placingBeacon();
  const scene = new Scene();
  const overlay = createPlacementRangeOverlay(scene);
  const deps = {
    state,
    sceneOrigin: { camX: 0, camY: 0 },
    keyFor: tileKey,
    wrapX,
    wrapY,
    tileVisibilityStateAt: () => "visible" as const,
    isPlacementValidForTile: (tile: Tile | undefined): boolean => tile?.ownerId === "me",
    cornerYAt: () => 0,
    nowMs: 300 // mid-growth
  };
  overlay.sync(deps);
  const fill = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.geometry instanceof PlaneGeometry && child.count > 0)!;
  const outline = scene.children.find((child): child is LineSegments => child instanceof LineSegments && child.visible)!;
  const outlineVersion = () => (outline.geometry.getAttribute("position") as BufferAttribute).version;
  const firstOutline = outlineVersion();
  const growingFill = fill.instanceMatrix.version;
  overlay.sync({ ...deps, nowMs: 400 });
  expect(fill.instanceMatrix.version).toBeGreaterThan(growingFill); // the growth animates
  expect(outlineVersion()).toBe(firstOutline); // the outline does not
  overlay.sync({ ...deps, nowMs: 2_000 }); // grown in full: one more upload
  const heldFill = fill.instanceMatrix.version;
  overlay.sync({ ...deps, nowMs: 2_100 });
  overlay.sync({ ...deps, nowMs: 2_200 });
  expect(fill.instanceMatrix.version).toBe(heldFill);
  expect(fill.visible).toBe(true);
  expect(outlineVersion()).toBe(firstOutline);
  deps.sceneOrigin.camX = 4; // terrain rebuilt around a new origin
  overlay.sync({ ...deps, nowMs: 2_300 });
  expect(outlineVersion()).toBeGreaterThan(firstOutline);
  expect(fill.instanceMatrix.version).toBeGreaterThan(heldFill);
});
