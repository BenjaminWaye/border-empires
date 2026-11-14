// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene } from "three";
import type { HouseChargeView } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createMapGuideOverlay } from "../client-map-3d-map-guide-overlay.js";
import { houseChargeMarkerTiles, houseChargeTintTiles } from "./client-house-charges-map.js";
import { CHARGE_TINT_GARRISONED, CHARGE_TINT_OPEN, drawMapGuideOverlays } from "./client-map-guide-overlays-2d.js";

const desert: HouseChargeView = {
  id: "DESERT:region:25,2",
  kind: "DESERT",
  title: "The Ashen Reach",
  rarity: "COMMON",
  renown: 2,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 28, y: 4, radius: 9 },
  targets: [{ key: "region:25,2", name: "The Ashen Reach", x: 28, y: 4 }],
  areaTileKeys: ["25,2", "26,2", "27,2"],
  areaTiles: 3
};
const seat: HouseChargeView = { ...desert, id: "SEAT:town:8,15", kind: "SEAT", title: "Seat of Vell", targets: [{ key: "town:8,15", name: "Vell", x: 8, y: 15 }], areaTileKeys: undefined } as HouseChargeView;

const mapState = (tiles: Array<[string, Tile]>, charge: HouseChargeView | undefined = desert) => ({
  onboardingHighlightTiles: [] as Array<{ x: number; y: number }>,
  houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [desert, seat] },
  houseChargeFocusId: charge?.id,
  tiles: new Map(tiles),
  me: "p1"
});

describe("what Show on map highlights", () => {
  it("rings the search circle until any of the target has been explored", () => {
    const markers = houseChargeMarkerTiles(mapState([]), 640, 320);
    expect(markers).toHaveLength(12);
    expect(markers).toContainEqual({ x: 37, y: 4 });
    expect(houseChargeTintTiles(mapState([]))).toEqual([]);
  });

  it("shades the explored part of a region instead, garrisoned tiles apart from open ones", () => {
    const state = mapState([
      ["25,2", { x: 25, y: 2, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }],
      ["26,2", { x: 26, y: 2, terrain: "LAND" }]
    ]);
    expect(houseChargeMarkerTiles(state, 640, 320)).toEqual([]);
    expect(houseChargeTintTiles(state)).toEqual([{ x: 25, y: 2, garrisoned: true }, { x: 26, y: 2, garrisoned: false }]);
  });

  it("marks a point target once its tile is explored, and nothing without a focus", () => {
    expect(houseChargeMarkerTiles(mapState([["8,15", { x: 8, y: 15, terrain: "LAND" }]], seat), 640, 320)).toEqual([{ x: 8, y: 15 }]);
    expect(houseChargeMarkerTiles({ ...mapState([]), houseChargeFocusId: undefined }, 640, 320)).toEqual([]);
  });
});

describe("renderer parity", () => {
  it("draws the same focused-charge shading and markers in 2D and true-3D", () => {
    const state = mapState([
      ["25,2", { x: 25, y: 2, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }],
      ["26,2", { x: 26, y: 2, terrain: "LAND" }]
    ]);
    const fills: Array<{ style: string; args: number[] }> = [];
    const context = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
      globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1,
      fillRect(...args: number[]) { fills.push({ style: this.fillStyle, args }); }
    };
    drawMapGuideOverlays(state, { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: (x, y) => ({ sx: x * 10, sy: y * 10 }), size: 10, halfW: 0, halfH: 0, nowMs: 0 });
    expect(fills).toEqual([{ style: CHARGE_TINT_GARRISONED, args: [245, 15, 10, 10] }, { style: CHARGE_TINT_OPEN, args: [255, 15, 10, 10] }]);

    const scene = new Scene();
    const overlay = createMapGuideOverlay(scene);
    overlay.sync(state, (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0.2 }), 0);
    const tint = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.name === "house-charge-area-tint")!;
    expect(tint.count).toBe(2);
    const matrix = new Matrix4();
    tint.getMatrixAt(1, matrix);
    expect([matrix.elements[12], matrix.elements[14]]).toEqual([26, 2]);

    // Unexplored: both renderers ring the search circle instead.
    const unexplored = mapState([]);
    context.arc.mockClear();
    drawMapGuideOverlays(unexplored, { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: (x, y) => ({ sx: x, sy: y }), size: 10, halfW: 0, halfH: 0, nowMs: 0 });
    expect(context.arc).toHaveBeenCalledTimes(24); // halo + ring per marker
    overlay.sync(unexplored, (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0.2 }), 0);
    expect(tint.count).toBe(0);
    const rings = scene.children.find((child) => child.name === "onboarding-checklist-highlight-overlay")!;
    expect((rings.children[0] as InstancedMesh).count).toBe(12);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
