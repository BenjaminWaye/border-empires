// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createClientActionFlow } from "../client-action-flow.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Drives the real map-tap handler: a tap on an own AFC's arm tile must select
// the AFC centre and open its menu with that arm's socket spotlighted.
const flowFor = (tiles: Tile[]) => {
  const state = createInitialState();
  state.me = "me";
  state.authSessionReady = true;
  for (const tile of tiles) state.tiles.set(`${tile.x},${tile.y}`, tile);
  const real: Record<string, unknown> = {
    state,
    ws: { readyState: 1, send: vi.fn() },
    wsUrl: "ws://test",
    canvas: document.createElement("canvas"),
    techPickEl: document.createElement("select"),
    tileActionMenuEl: document.createElement("div"),
    placementOverlayEl: document.createElement("div"),
    placementLabelEl: document.createElement("div"),
    keyFor: (x: number, y: number) => `${x},${y}`,
    parseKey: (key: string) => { const [x, y] = key.split(",").map(Number); return { x: x!, y: y! }; },
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    terrainAt: () => "LAND",
    tileVisibilityStateAt: () => "visible",
    pickOriginForTarget: () => undefined,
    isAdjacent: () => false,
    viewportSize: () => ({ width: 800, height: 600 }),
    supportedOwnedTownsForTile: () => [],
    supportedOwnedDocksForTile: () => [],
    tileHistoryLines: () => []
  };
  // Every other dependency is an inert stub: this test only checks selection and menu routing.
  const deps = new Proxy(real, { get: (target, key: string) => (key in target ? target[key] : (target[key] = vi.fn())) });
  return { state, flow: createClientActionFlow(deps as Parameters<typeof createClientActionFlow>[0]) };
};

const ownAfcWorld = (extra: Partial<Tile> = {}): Tile[] => {
  const tiles: Tile[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const centre = dx === 0 && dy === 0;
      tiles.push({ x: 20 + dx, y: 20 + dy, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...(centre ? { afc: { ownerId: "me", status: "active", modules: [] } } : dx === 0 && dy === 1 ? extra : {}) } as Tile);
    }
  }
  return tiles;
};

describe("tapping an own AFC's arm tile", () => {
  it("selects the AFC centre and spotlights the tapped arm's socket", () => {
    const { state, flow } = flowFor(ownAfcWorld());
    flow.handleTileSelection(20, 21, 10, 10); // south arm
    expect(state.selected).toEqual({ x: 20, y: 20 });
    expect(state.tileActionMenu.currentTileKey).toBe("20,20");
    expect(state.tileActionMenu.afcArmFocus?.socket).toBe(2);
  });

  it("opens the AFC itself without a spotlight when the centre is tapped", () => {
    const { state, flow } = flowFor(ownAfcWorld());
    flow.handleTileSelection(20, 20, 10, 10);
    expect(state.selected).toEqual({ x: 20, y: 20 });
    expect(state.tileActionMenu.afcArmFocus).toBeUndefined();
  });

  it("keeps a muster flag on an arm tile reachable", () => {
    const { state, flow } = flowFor(ownAfcWorld({ muster: { ownerId: "me" } } as Partial<Tile>));
    flow.handleTileSelection(20, 21, 10, 10);
    expect(state.selected).toEqual({ x: 20, y: 21 });
    expect(state.tileActionMenu.afcArmFocus).toBeUndefined();
  });
});
