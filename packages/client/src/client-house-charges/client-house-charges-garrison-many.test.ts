// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Scene } from "three";
import type { HouseChargeView } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createMapGuideOverlay } from "../client-map-3d-map-guide-overlay.js";
import { houseChargeTintTiles } from "./client-house-charges-map.js";
import { selectedTilesInRegionCharges } from "./client-house-charges-garrison-many.js";
import { CHARGE_TINT_GARRISONED, CHARGE_TINT_OPEN, drawMapGuideOverlays } from "./client-map-guide-overlays-2d.js";
import { garrisonManyHtml } from "../client-garrison-many/client-garrison-many-view.js";

const tundra: HouseChargeView = {
  id: "TUNDRA:region:25,2",
  kind: "TUNDRA",
  title: "Garrison 75% of Thramvault Waste",
  rarity: "COMMON",
  renown: 2,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 26, y: 2, radius: 9 },
  targets: [{ key: "region:25,2", name: "Thramvault Waste", x: 26, y: 2 }],
  areaTileKeys: ["25,2", "26,2"],
  areaTiles: 2
};
const dropped: HouseChargeView = { ...tundra, id: "DESERT:region:40,2", kind: "DESERT", kept: false, areaTileKeys: ["40,2"] };

const state = (active: boolean) => ({
  onboardingHighlightTiles: [] as Array<{ x: number; y: number }>,
  houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [tundra, dropped] },
  houseChargeFocusId: undefined,
  tiles: new Map<string, Tile>([
    ["25,2", { x: 25, y: 2, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }],
    ["26,2", { x: 26, y: 2, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }],
    ["27,2", { x: 27, y: 2, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }],
    ["40,2", { x: 40, y: 2, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }]
  ]),
  me: "p1",
  tilesRevision: 1,
  garrisonMany: { active, keys: ["26,2", "27,2"], invalidKeys: [] }
});

// Playtest 2026-11-27 (optimiser): with "Garrison 75% of Thramvault Waste" kept, Garrison Many gave no hint
// which tiles count toward it.
describe("Garrison Many shows which tiles count for a region charge", () => {
  it("shades only kept region charges, and only while Garrison Many is open", () => {
    expect(houseChargeTintTiles(state(true))).toEqual([{ x: 25, y: 2, garrisoned: true }, { x: 26, y: 2, garrisoned: false, owned: true }]);
    expect(houseChargeTintTiles(state(false))).toEqual([]);
  });

  it("draws the same shading in 2D and true-3D", () => {
    const fills: Array<{ style: string; args: number[] }> = [];
    const context = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1, rect: vi.fn(), clip: vi.fn(),
      fillRect(...args: number[]) { fills.push({ style: this.fillStyle, args }); }
    };
    drawMapGuideOverlays(state(true), { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: (x, y) => ({ sx: x * 10, sy: y * 10 }), size: 10, halfW: 0, halfH: 0, nowMs: 0 });
    expect(fills).toEqual([{ style: CHARGE_TINT_GARRISONED, args: [245, 15, 10, 10] }, { style: CHARGE_TINT_OPEN, args: [255, 15, 10, 10] }]);

    const scene = new Scene();
    const overlay = createMapGuideOverlay(scene);
    overlay.sync(state(true), (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0.2 }), 0);
    const meshNamed = (name: string) => scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.name === name)!;
    expect([meshNamed("house-charge-area-garrisoned").count, meshNamed("house-charge-area-open").count]).toEqual([1, 1]);
    overlay.sync(state(false), (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0.2 }), 0);
    expect([meshNamed("house-charge-area-garrisoned").count, meshNamed("house-charge-area-open").count]).toEqual([0, 0]);
    overlay.dispose();
  });

  it("counts the selected tiles inside a charge on the Garrison Many sheet", () => {
    const s = state(true);
    expect(selectedTilesInRegionCharges(s, s.garrisonMany.keys)).toBe(1);
    const plan = { tiles: [], excluded: [], manpower: 40, coin: 0, blocked: "" };
    expect(garrisonManyHtml(2, plan, "", 1)).toContain("Shaded tiles count for your charge · 1 selected");
    expect(garrisonManyHtml(2, plan, "")).not.toContain("garrison-many-charge");
  });
});
