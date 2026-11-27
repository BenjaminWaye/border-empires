import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { drawTileIntelOverlays2D } from "../client-map-2d-tile-intel/client-map-2d-tile-intel.js";
import { openPanelFromCaptureAlert } from "../client-ui-controls/client-ui-controls.js";
import { nearestOwnFrontierTile, openGarrisonManyFromIntegrity } from "./client-integrity-garrison-entry.js";

const addInstance = vi.fn();
vi.mock("../client-map-3d-defensibility-overlay.js", () => ({
  createDefensibilityOverlay: () => ({ group: {}, clear: vi.fn(), addInstance, commit: vi.fn(), dispose: vi.fn() })
}));
const { createTileIntelOverlays3D } = await import("../client-map-3d-tile-intel/client-map-3d-tile-intel.js");

const keyFor = (x: number, y: number): string => `${x},${y}`;
const ringWithHole = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) {
    const mine = !(x === 1 && y === 1);
    tiles.set(keyFor(x, y), { x, y, terrain: "LAND", ...(mine ? { ownerId: "me", ownershipState: "SETTLED" } : {}) } as Tile);
  }
  return tiles;
};
const geometry = { keyFor, wrapX: (x: number) => x, wrapY: (y: number) => y, terrainAt: (): Tile["terrain"] => "LAND" };

// Owner request 2026-11-27: tapping the Integrity drop notice highlights the weak tiles or holes, in 2D and 3D.
describe("integrity holes on the map", () => {
  it("2D outlines a hole while weak tiles are shown", () => {
    const tiles = ringWithHole();
    const ctx = { fillRect: vi.fn(), strokeRect: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn() } as unknown as CanvasRenderingContext2D;
    const hole = tiles.get("1,1");
    drawTileIntelOverlays2D(ctx, hole, "visible", 0, 0, 20, { state: { tiles, me: "me", showWeakDefensibility: false }, ...geometry });
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    drawTileIntelOverlays2D(ctx, hole, "visible", 0, 0, 20, { state: { tiles, me: "me", showWeakDefensibility: true }, ...geometry });
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
  });

  it("3D marks a hole as critical while weak tiles are shown", () => {
    const tiles = ringWithHole();
    const overlays = createTileIntelOverlays3D({} as never, 10, geometry);
    overlays.begin({ tiles, me: "me", showWeakDefensibility: true });
    addInstance.mockClear();
    overlays.addTile(tiles.get("1,1"), "visible", 4, 5, 0.2);
    expect(addInstance).toHaveBeenCalledWith(4, 5, 0.2, "critical");
  });

  it("the alert's Fix opens the Integrity panel with weak tiles on and redraws the map", () => {
    const state = { activePanel: null, captureAlert: { title: "t", detail: "d", until: 1, tone: "warn" as const }, showWeakDefensibility: false } as Parameters<typeof openPanelFromCaptureAlert>[0];
    const deps = { setActivePanel: vi.fn(), renderCaptureProgress: vi.fn(), renderHud: vi.fn(), requestViewRefresh: vi.fn() };
    expect(openPanelFromCaptureAlert(state, "integrity", deps)).toBe(true);
    expect(deps.setActivePanel).toHaveBeenCalledWith("defensibility");
    expect(state.showWeakDefensibility).toBe(true);
    expect(deps.requestViewRefresh).toHaveBeenCalled();
    expect(state.captureAlert).toBeUndefined();
  });

  it("Garrison Many opens the nearest frontier tile's menu on Actions", () => {
    const tiles = ringWithHole();
    tiles.set("9,9", { x: 9, y: 9, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile);
    tiles.set("2,5", { x: 2, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile);
    expect(nearestOwnFrontierTile(tiles, "me", 0, 0)?.y).toBe(5);
    const state = { tiles, me: "me", camX: 0, camY: 0, camSubX: 0, camSubY: 0, selected: undefined, activePanel: "defensibility", tileActionMenu: { visible: false, x: 0, y: 0, mode: "single", bulkKeys: [], currentTileKey: "", activeTab: "overview", scrollTopByTab: {}, renderSignature: "" } } as unknown as Parameters<typeof openGarrisonManyFromIntegrity>[0];
    expect(openGarrisonManyFromIntegrity(state, { ...geometry, requestViewRefresh: vi.fn(), viewport: { width: 400, height: 800 } })).toBe(true);
    expect(state.tileActionMenu).toMatchObject({ visible: true, currentTileKey: "2,5", activeTab: "actions" });
    expect(state.activePanel).toBeNull();
    expect(state.selected).toEqual({ x: 2, y: 5 });
  });
});
