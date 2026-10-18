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
  const calls: Array<{ edges: unknown; band: number; veil: readonly string[] }> = [];
  addReachTileOverlays3D(
    {
      addDormantFrontierTile: () => undefined,
      addRivalReachTile: () => undefined,
      addIncursionTile: (_x, _z, _y, _hatch, _edgeColor, edges, breach) =>
        calls.push({ edges, band: breach?.layout.band.length ?? 0, veil: breach?.layout.veilSides ?? [] })
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
    expect(addFor("straight")).toEqual([{ edges: { north: true, east: false, south: true, west: true }, band: 0, veil: [] }]);
  });

  it("swaps the strip for the breach look only on the sides facing my land", () => {
    const [ember] = addFor("ember");
    expect(ember!.edges).toEqual({ north: false, east: false, south: true, west: false });
    expect(ember!.band).toBeGreaterThan(0);
    expect(addFor("veil")[0]!.veil).toEqual(["north", "west"]);
  });
});

describe("addReachTileOverlays3D rival reach over my tiles", () => {
  const run = (target: Tile) => {
    const calls = { rival: [] as string[], incursion: 0, dormant: 0 };
    addReachTileOverlays3D(
      {
        addDormantFrontierTile: () => void (calls.dormant += 1),
        addRivalReachTile: (_x, _z, _y, color) => void calls.rival.push(color),
        addIncursionTile: () => void (calls.incursion += 1)
      },
      target,
      target.x,
      target.y,
      { x: 0, z: 0, y: 0 },
      new Set<string>(),
      { tiles, keyFor, wrapX: (x) => x, wrapY: (y) => y, me: "me", ownerColor: (ownerId) => (ownerId === "rival" ? "#ff0000" : "#0000ff") }
    );
    return calls;
  };

  it("marks my own tile inside a rival's reach in the rival's colour, with no incursion hatch", () => {
    expect(run({ ...tile(9, 9, "me"), reachOwnerId: "rival" } as Tile)).toEqual({ rival: ["#ff0000"], incursion: 0, dormant: 0 });
  });

  it("leaves my tiles inside my own reach unmarked", () => {
    expect(run({ ...tile(9, 9, "me"), reachOwnerId: "me" } as Tile).rival).toEqual([]);
  });

  it("keeps the dormant-frontier tint alongside the rival-reach mark", () => {
    const dormant = { ...tile(9, 9, "me"), ownershipState: "FRONTIER", fort: {}, reachOwnerId: "rival" } as unknown as Tile;
    expect(run(dormant)).toEqual({ rival: ["#ff0000"], incursion: 0, dormant: 1 });
  });
});
