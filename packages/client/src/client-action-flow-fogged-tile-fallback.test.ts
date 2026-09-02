import { describe, expect, it } from "vitest";
import { persistedFoggedTileFallback } from "./client-action-flow-fogged-tile-fallback.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("persistedFoggedTileFallback", () => {
  it("returns the already-cached tile unchanged when one exists, without touching state.tiles", () => {
    const cached: Tile = { x: 5, y: 5, terrain: "LAND", ownerId: "me" };
    const state: Pick<ClientState, "tiles"> = { tiles: new Map([["5,5", cached]]) };

    const result = persistedFoggedTileFallback(state, 5, 5, cached, "LAND", keyFor);

    expect(result).toBe(cached);
    expect(state.tiles.get("5,5")).toBe(cached);
    expect(state.tiles.size).toBe(1);
  });

  it("builds and persists a terrain-only placeholder when nothing is cached, so later lookups by key find it too", () => {
    // Regression: without persisting into state.tiles, the tile-menu
    // tab-click handler's own state.tiles.get(currentTileKey) lookup would
    // return undefined for this exact case, silently no-oping a tab switch.
    const state: Pick<ClientState, "tiles"> = { tiles: new Map() };

    const result = persistedFoggedTileFallback(state, 9, 12, undefined, "SEA", keyFor);

    expect(result).toEqual({ x: 9, y: 12, terrain: "SEA", fogged: true });
    expect(state.tiles.get("9,12")).toEqual({ x: 9, y: 12, terrain: "SEA", fogged: true });
  });
});
