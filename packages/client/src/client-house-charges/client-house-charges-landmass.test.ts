// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, Scene } from "three";
import type { HouseChargeView, Terrain } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createMapGuideOverlay } from "../client-map-3d-map-guide-overlay.js";
import { resetMetropolisHighlightCache, walkLandmass } from "./client-house-charges-landmass.js";
import { houseChargeMarkerTiles, houseChargeTintTiles } from "./client-house-charges-map.js";
import { houseChargeSearchGuide } from "./client-house-charges-search-guide.js";
import { CHARGE_TINT_PLAIN, drawMapGuideOverlays } from "./client-map-guide-overlays-2d.js";

// Seeded worldgen stand-in: one landmass, a 6x3 block at x 10..15, y 20..22, plus a separate islet at 30,20.
const LAND = new Set<string>(["30,20"]);
for (let x = 10; x <= 15; x += 1) for (let y = 20; y <= 22; y += 1) LAND.add(`${x},${y}`);
vi.mock("@border-empires/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@border-empires/shared")>()),
  terrainAt: (x: number, y: number): Terrain => (LAND.has(`${x},${y}`) ? "LAND" : "SEA")
}));

const seats: HouseChargeView = {
  id: "METROPOLIS:metropolis:10,20",
  kind: "METROPOLIS",
  title: "Three Metropolises of Aldmoor",
  rarity: "RARE",
  renown: 3,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 13, y: 21, radius: 9 },
  targets: [{ key: "metropolis:10,20", name: "Aldmoor", x: 13, y: 21 }],
  areaTowns: 3
};

const land = (x: number, y: number, extra: Partial<Tile> = {}): [string, Tile] => [`${x},${y}`, { x, y, terrain: "LAND", ...extra }];
const town = { name: "Vell", populationTier: "CITY" } as unknown as NonNullable<Tile["town"]>;

const stateWith = (tiles: Array<[string, Tile]>, tilesRevision = 1) => ({
  onboardingHighlightTiles: [] as Array<{ x: number; y: number }>,
  houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [seats] },
  houseChargeFocusId: seats.id,
  tiles: new Map(tiles),
  tilesRevision,
  me: "p1"
});

beforeEach(() => resetMetropolisHighlightCache());

describe("Three Metropolises on the map", () => {
  it("walks the whole landmass from its id, not the islet across the water", () => {
    const keys = walkLandmass("10,20", (x, y) => (LAND.has(`${x},${y}`) ? "LAND" : "SEA"));
    expect(keys.size).toBe(18);
    expect(keys.has("30,20")).toBe(false);
  });

  it("shades only the explored part of the landmass and rings its explored towns", () => {
    const state = stateWith([
      land(10, 20),
      land(11, 20, { town }),
      land(15, 22, { town, ownerId: "p2" }),
      land(30, 20, { town }), // the islet: not this landmass
      ["9,20", { x: 9, y: 20, terrain: "SEA" }]
    ]);
    const tint = houseChargeTintTiles(state);
    expect(tint.map(({ x, y }) => `${x},${y}`).sort()).toEqual(["10,20", "11,20", "15,22"]);
    expect(tint.every((tile) => tile.plain && !tile.garrisoned)).toBe(true);
    expect(houseChargeMarkerTiles(state).map(({ x, y }) => `${x},${y}`).sort()).toEqual(["11,20", "15,22"]);
    // Once part of it is seen, the shading replaces the rough circle.
    expect(houseChargeSearchGuide(state, 450, 450).circles).toEqual([]);
  });

  it("keeps the rough circle while none of the landmass is explored", () => {
    const state = stateWith([land(30, 20, { town })]);
    expect(houseChargeTintTiles(state)).toEqual([]);
    expect(houseChargeMarkerTiles(state)).toEqual([]);
    expect(houseChargeSearchGuide(state, 450, 450).circles).toEqual([seats.searchCircle]);
  });

  it("picks up newly explored tiles on the next tiles revision", () => {
    const state = stateWith([land(10, 20)]);
    expect(houseChargeTintTiles(state)).toHaveLength(1);
    state.tiles.set("12,21", { x: 12, y: 21, terrain: "LAND" });
    state.tilesRevision = 2;
    expect(houseChargeTintTiles(state)).toHaveLength(2);
  });

  it("draws the landmass as a plain gold wash in 2D and on its own mesh in true 3D", () => {
    const state = stateWith([land(10, 20), land(11, 20, { town })]);
    const fills: string[] = [];
    const context = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1, rect: vi.fn(), clip: vi.fn(),
      fillRect() { fills.push(this.fillStyle); }
    };
    drawMapGuideOverlays(state, { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: (wx, wy, size) => ({ sx: wx * size, sy: wy * size }), size: 10, halfW: 0, halfH: 0, nowMs: 0 });
    // Plain wash only: no "still to take" hatching (which clips per tile).
    expect(context.clip).not.toHaveBeenCalled();
    expect(fills).toEqual([CHARGE_TINT_PLAIN, CHARGE_TINT_PLAIN]);

    const scene = new Scene();
    const overlay = createMapGuideOverlay(scene);
    overlay.sync(state, (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0 }), 0);
    const plain = scene.children.find((child) => child.name === "house-charge-area-plain") as InstancedMesh;
    expect(plain.count).toBe(2);
    overlay.dispose();
  });
});
