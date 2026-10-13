// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, RingGeometry, Scene, PlaneGeometry } from "three";
import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { renderBuildingPlacementPreview2D } from "../client-placement-preview-2d/client-placement-preview-2d.js";
import { createPlacementRangeOverlay } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";
import { resetRelayBeaconPlacementSitesForTests } from "../client-relay-beacon-site/client-relay-beacon-placement-sites.js";

const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

// Town at (10,10) reaches radius 3. A beacon on (13,10) would newly reach the
// fish at (18,10); one on (7,10) only reaches plain/unknown ground.
const placingBeacon = () => {
  const state = createInitialState();
  state.me = "me";
  const tiles: Tile[] = [
    { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", townType: "FARMING", townPopulationTier: "TOWN" },
    { x: 7, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
    { x: 13, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" },
    { x: 18, y: 10, terrain: "LAND", resource: "FISH" }
  ];
  for (const tile of tiles) state.tiles.set(tileKey(tile.x, tile.y), tile);
  state.buildingPlacement = { active: true, structureType: "RELAY_BEACON", x: 7, y: 10 };
  return state;
};

beforeEach(() => resetRelayBeaconPlacementSitesForTests());

it("rings the recommended Relay Beacon spot in 2D and true-3D while placing, then clears both", () => {
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
  // Best site first: (13,10), the one that newly reaches the fish.
  expect(ctx.arc.mock.calls[0]?.slice(0, 2)).toEqual([130, 100]);

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
  const siteRings = instanced.find((mesh) => mesh.geometry instanceof RingGeometry);
  const newReach = instanced.find((mesh) => mesh.geometry instanceof PlaneGeometry && mesh.count > 0);
  if (!siteRings) throw new Error("missing recommended-site rings");
  expect(siteRings.visible).toBe(true);
  const matrix = new Matrix4();
  siteRings.getMatrixAt(0, matrix);
  expect([matrix.elements[12], matrix.elements[14]]).toEqual([13.5, 10.5]);
  // The ghost of new reach from the current placement tile (7,10) is drawn too.
  expect(newReach?.visible).toBe(true);

  state.buildingPlacement = { active: false, structureType: "", x: 0, y: 0 };
  overlay.sync(deps);
  expect(siteRings.visible).toBe(false);
  expect(instanced.every((mesh) => !mesh.visible)).toBe(true);
});
