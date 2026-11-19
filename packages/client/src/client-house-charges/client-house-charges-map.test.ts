// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Matrix4, Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { createMapGuideOverlay } from "../client-map-3d-map-guide-overlay.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { houseChargeMarkerTiles, houseChargeTintTiles } from "./client-house-charges-map.js";
import { houseChargeSearchGuide } from "./client-house-charges-search-guide.js";
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
const { areaTileKeys: _desertArea, areaTiles: _desertTiles, ...pointCharge } = desert;
const seat: HouseChargeView = { ...pointCharge, id: "SEAT:town:8,15", kind: "SEAT", title: "Seat of Vell", targets: [{ key: "town:8,15", name: "Vell", x: 8, y: 15 }] };

const mapState = (tiles: Array<[string, Tile]>, charge: HouseChargeView | undefined = desert) => ({
  onboardingHighlightTiles: [] as Array<{ x: number; y: number }>,
  houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [desert, seat] },
  houseChargeFocusId: charge?.id,
  tiles: new Map(tiles),
  me: "p1"
});

describe("what Show on map highlights", () => {
  it("marks no target and no ring of markers until a target has been explored", () => {
    expect(houseChargeMarkerTiles(mapState([]))).toEqual([]);
    expect(houseChargeTintTiles(mapState([]))).toEqual([]);
  });

  it("marks a Charter's towns only once each has been scouted", () => {
    const road: HouseChargeView = { ...pointCharge, id: "CHARTER:a|b", kind: "CHARTER", title: "Road", searchCircle: { x: 19, y: 17, radius: 14 }, targets: [{ key: "town:8,15", name: "Vell", x: 8, y: 15 }, { key: "town:30,20", name: "Harrowmere", x: 30, y: 20 }] };
    const state = { ...mapState([["8,15", { x: 8, y: 15, terrain: "LAND" }]], road), houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [road] } };
    expect(houseChargeMarkerTiles(state)).toEqual([{ x: 8, y: 15 }]);
    state.tiles.set("30,20", { x: 30, y: 20, terrain: "LAND" });
    expect(houseChargeMarkerTiles(state)).toEqual([{ x: 8, y: 15 }, { x: 30, y: 20 }]);
  });

  it("shades the explored part of a region instead, garrisoned tiles apart from open ones", () => {
    const state = mapState([
      ["25,2", { x: 25, y: 2, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }],
      ["26,2", { x: 26, y: 2, terrain: "LAND" }]
    ]);
    expect(houseChargeMarkerTiles(state)).toEqual([]);
    expect(houseChargeTintTiles(state)).toEqual([{ x: 25, y: 2, garrisoned: true }, { x: 26, y: 2, garrisoned: false }]);
  });

  it("marks a point target once its tile is explored, and nothing without a focus", () => {
    expect(houseChargeMarkerTiles(mapState([["8,15", { x: 8, y: 15, terrain: "LAND" }]], seat))).toEqual([{ x: 8, y: 15 }]);
    expect(houseChargeMarkerTiles({ ...mapState([]), houseChargeFocusId: undefined })).toEqual([]);
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
      globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1, rect: vi.fn(), clip: vi.fn(),
      fillRect(...args: number[]) { fills.push({ style: this.fillStyle, args }); }
    };
    drawMapGuideOverlays(state, { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: (x, y) => ({ sx: x * 10, sy: y * 10 }), size: 10, halfW: 0, halfH: 0, nowMs: 0 });
    expect(fills).toEqual([{ style: CHARGE_TINT_GARRISONED, args: [245, 15, 10, 10] }, { style: CHARGE_TINT_OPEN, args: [255, 15, 10, 10] }]);
    // Only the tile still to take is hatched (clipped to its own square).
    expect(context.rect).toHaveBeenCalledTimes(1);
    expect(context.rect).toHaveBeenCalledWith(255, 15, 10, 10);

    const scene = new Scene();
    const overlay = createMapGuideOverlay(scene);
    overlay.sync(state, (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0.2 }), 0);
    const meshNamed = (name: string) => scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.name === name)!;
    const garrisoned = meshNamed("house-charge-area-garrisoned");
    const open = meshNamed("house-charge-area-open");
    expect([garrisoned.count, open.count]).toEqual([1, 1]);
    const matrix = new Matrix4();
    open.getMatrixAt(0, matrix);
    expect([matrix.elements[12], matrix.elements[14]]).toEqual([26, 2]);
    garrisoned.getMatrixAt(0, matrix);
    expect([matrix.elements[12], matrix.elements[14]]).toEqual([25, 2]);
    // Outline: the two shaded tiles side by side have 6 outer sides (2 vertices each).
    const outlineMesh = scene.children.find((child) => child.name === "house-charge-area-outline") as unknown as { geometry: { drawRange: { count: number } }; visible: boolean };
    expect(outlineMesh.visible).toBe(true);
    expect(outlineMesh.geometry.drawRange.count).toBe(12);

    // Unexplored: both renderers draw the same dotted search circle instead, and no ring markers.
    const unexplored = mapState([]);
    const dotCount = houseChargeSearchGuide(unexplored, WORLD_WIDTH, WORLD_HEIGHT).ringDots.length;
    expect(dotCount).toBeGreaterThan(12);
    context.arc.mockClear();
    drawMapGuideOverlays(unexplored, { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: (x, y) => ({ sx: x, sy: y }), size: 10, halfW: 0, halfH: 0, nowMs: 0 });
    expect(context.arc).toHaveBeenCalledTimes(dotCount);
    overlay.sync(unexplored, (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0.2 }), 0);
    expect([garrisoned.count, open.count]).toEqual([0, 0]);
    expect(scene.children.find((child) => child.name === "house-charge-area-outline")!.visible).toBe(false);
    expect(meshNamed("house-charge-search-ring").count).toBe(dotCount);
    const rings = scene.children.find((child) => child.name === "onboarding-checklist-highlight-overlay")!;
    expect((rings.children[0] as InstancedMesh).count).toBe(0);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

// Owner 2026-11-19: in true-3D the unexplored storm clouds hid the charge's dotted circles, which mark
// exactly that unexplored ground. Three.js paints transparent meshes in renderOrder, so the circles and link
// must come after the storm and the fogged mist; the explored-only shading sits over the ownership fill and
// fog wash but under the inked names (it was at 0, under the ownership fill).
describe("true-3D charge guide over the storm", () => {
  const layerOrder = (name: string): number => {
    const scene = new Scene();
    createMapGuideOverlay(scene);
    const layer = scene.children.find((child) => child.name === name);
    expect(layer, name).toBeDefined();
    return layer!.renderOrder;
  };

  it("draws the dotted circles and link after the unexplored storm and the fogged mist", () => {
    for (const name of ["house-charge-search-ring", "house-charge-search-link"]) {
      expect(layerOrder(name), name).toBeGreaterThan(RENDER_ORDER.unexploredStorm);
      expect(layerOrder(name), name).toBeGreaterThan(RENDER_ORDER.foggedMist);
    }
  });

  it("draws the shaded area over the ownership fill and fog wash, under the map names", () => {
    for (const name of ["house-charge-area-garrisoned", "house-charge-area-open", "house-charge-area-outline"]) {
      expect(layerOrder(name), name).toBeGreaterThan(RENDER_ORDER.fogDarkenFrontier);
      expect(layerOrder(name), name).toBeLessThan(RENDER_ORDER.groundNames);
    }
  });
});
