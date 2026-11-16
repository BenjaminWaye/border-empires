import { describe, expect, it, vi } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { renderSelectedStructureReachHighlight } from "./client-reach-overlay-structure-highlight.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Regression (playtest): after building a Relay Beacon or taking a town the
// still-selected anchor tinted its whole reach square -- across the sea and
// into the fog -- instead of the land it actually reaches.
describe("renderSelectedStructureReachHighlight", () => {
  it("tints only visible land inside the reach, never sea, fog or unexplored tiles", () => {
    const tiles = new Map<string, Tile>();
    const put = (tile: Tile) => tiles.set(keyFor(tile.x, tile.y), tile);
    // Town at (20,20), radius 3. Column x=21 is sea; (19,20) is fogged land;
    // (20,19) is visible land; (20,21) is never seen.
    put({ x: 20, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", townType: "FARMING" } as Tile);
    for (let y = 17; y <= 23; y += 1) put({ x: 21, y, terrain: "SEA" });
    put({ x: 19, y: 20, terrain: "LAND", fogged: true });
    put({ x: 20, y: 19, terrain: "LAND" });
    const visibility = (x: number, y: number, tile?: Tile): TileVisibilityState => (!tile ? "unexplored" : tile.fogged ? "fogged" : "visible");
    const filled: Array<[number, number]> = [];
    const ctx = { save: vi.fn(), restore: vi.fn(), fillStyle: "", fillRect: (sx: number, sy: number) => filled.push([sx, sy]) } as unknown as CanvasRenderingContext2D;
    const state = { selected: { x: 20, y: 20 }, tiles } as unknown as ClientState;
    renderSelectedStructureReachHighlight(state, { ctx, keyFor, worldToScreen: (wx, wy) => ({ sx: wx, sy: wy }), tileVisibilityStateAt: visibility }, 2, 0, 0);
    // fillRect gets (sx - size/2 + 1) = sx, so the recorded points are tile coords.
    expect(filled.sort()).toEqual([
      [20, 19],
      [20, 20]
    ]);
  });
});
