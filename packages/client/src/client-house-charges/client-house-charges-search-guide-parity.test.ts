// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { InstancedMesh, Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import { createMapGuideOverlay } from "../client-map-3d-map-guide-overlay.js";
import { houseChargeFocusPoint } from "./client-house-charges-panel.js";
import { houseChargeSearchGuide, roughCircleFor } from "./client-house-charges-search-guide.js";
import { CHARGE_LINK_DOT, CHARGE_RING_DOT, drawMapGuideOverlays } from "./client-map-guide-overlays-2d.js";

const charter = (a: { x: number; y: number }, b: { x: number; y: number }): HouseChargeView => ({
  id: "CHARTER:close",
  kind: "CHARTER",
  title: "Road",
  rarity: "COMMON",
  renown: 1,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 103, y: 103, radius: 9 },
  targets: [{ key: `town:${a.x},${a.y}`, name: "A", ...a }, { key: `town:${b.x},${b.y}`, name: "B", ...b }]
});
const stateFor = (charge: HouseChargeView) => ({
  onboardingHighlightTiles: [] as Array<{ x: number; y: number }>,
  houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 0, choiceClosesAt: 0, charges: [charge] },
  houseChargeFocusId: charge.id,
  tiles: new Map(),
  me: "p1"
});

describe("Charter guide for close towns", () => {
  it("still joins two overlapping circles with a dotted line", () => {
    // 12 tiles apart by Manhattan distance (the closest pair a Charter is dealt): the radius-9 circles overlap.
    const guide = houseChargeSearchGuide(stateFor(charter({ x: 100, y: 100 }, { x: 106, y: 106 })), WORLD_WIDTH, WORLD_HEIGHT);
    expect(guide.circles).toHaveLength(2);
    expect(guide.linkDots.length).toBeGreaterThan(0);
  });
});

describe("Show on map with nothing scouted", () => {
  it("centres between the drawn rough circles, not on the server's circle or a town", () => {
    const charge = charter({ x: 100, y: 100 }, { x: 130, y: 110 });
    const [a, b] = charge.targets.map((target) => roughCircleFor(charge.id, target, WORLD_WIDTH, WORLD_HEIGHT));
    expect(houseChargeFocusPoint(charge, () => false)).toEqual({ x: Math.round((a!.x + b!.x) / 2), y: Math.round((a!.y + b!.y) / 2) });
  });
});

describe("renderer parity for a Charter", () => {
  it("draws the same rough-circle and link dots in 2D and true-3D", () => {
    const state = stateFor(charter({ x: 100, y: 100 }, { x: 130, y: 110 }));
    const guide = houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT);
    expect(guide.linkDots.length).toBeGreaterThan(0);
    const arcsByColour = new Map<string, number>();
    const context = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(),
      globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 1,
      arc() { arcsByColour.set(this.fillStyle, (arcsByColour.get(this.fillStyle) ?? 0) + 1); },
      fill: vi.fn()
    };
    drawMapGuideOverlays(state, { ctx: context as unknown as CanvasRenderingContext2D, worldToScreen: (x, y) => ({ sx: x, sy: y }), size: 10, halfW: 0, halfH: 0, nowMs: 0 });
    expect(arcsByColour.get(CHARGE_RING_DOT)).toBe(guide.ringDots.length);
    expect(arcsByColour.get(CHARGE_LINK_DOT)).toBe(guide.linkDots.length);

    const scene = new Scene();
    const overlay = createMapGuideOverlay(scene);
    overlay.sync(state, (x, y) => ({ sceneX: x, sceneZ: y, surfaceY: 0 }), 0);
    const mesh = (name: string) => scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh && child.name === name)!;
    expect(mesh("house-charge-search-ring").count).toBe(guide.ringDots.length);
    expect(mesh("house-charge-search-link").count).toBe(guide.linkDots.length);
    overlay.dispose();
  });
});
