import { describe, expect, it } from "vitest";
import { addReachTileOverlays3D } from "./client-map-3d-reach-tile-overlays.js";
import type { IncursionBreachStyle } from "../client-reach-incursion/client-incursion-breach-style.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const tile = (x: number, y: number, ownerId: string): Tile => ({ x, y, terrain: "LAND", ownerId }) as Tile;

// Rival tile at (5,5) inside my reach: my land to the north and west, unowned to the south, more rival land east.
const tiles = new Map<string, Tile>([
  [keyFor(5, 5), tile(5, 5, "rival")],
  [keyFor(6, 5), tile(6, 5, "rival")],
  [keyFor(5, 4), tile(5, 4, "me")],
  [keyFor(4, 5), tile(4, 5, "me")]
]);

const addFor = (breachStyle: IncursionBreachStyle) => {
  const calls: Array<{ edges: unknown; shapes: number }> = [];
  addReachTileOverlays3D(
    {
      addDormantFrontierTile: () => undefined,
      addIncursionTile: (_x, _z, _y, _hatch, _edgeColor, edges, breach) => calls.push({ edges, shapes: breach?.length ?? 0 })
    },
    tiles.get(keyFor(5, 5))!,
    5,
    5,
    { x: 0, z: 0, y: 0 },
    new Set([keyFor(5, 5), keyFor(6, 5)]),
    { tiles, keyFor, wrapX: (x) => x, wrapY: (y) => y, me: "me", ownerColor: () => "#7be05a", breachStyle }
  );
  return calls;
};

describe("addReachTileOverlays3D breach outline", () => {
  it("keeps the plain strip on every open side in the straight style", () => {
    expect(addFor("straight")).toEqual([{ edges: { north: true, east: false, south: true, west: true }, shapes: 0 }]);
  });

  it("swaps the strip for breach shapes only on the sides facing my land", () => {
    const [call] = addFor("spikes");
    expect(call!.edges).toEqual({ north: false, east: false, south: true, west: false });
    expect(call!.shapes).toBeGreaterThan(0);
  });
});
