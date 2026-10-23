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

describe("addReachTileOverlays3D my tiles inside a rival's reach", () => {
  // My tile at (20,20) pushed into the rival's reach: more of the rival's land to the
  // east, my own land behind me to the west (outside their reach).
  const pushTiles = new Map<string, Tile>([
    [keyFor(20, 20), { ...tile(20, 20, "me"), reachOwnerId: "rival" } as Tile],
    [keyFor(21, 20), { ...tile(21, 20, "rival"), reachOwnerId: "rival" } as Tile],
    [keyFor(19, 20), { ...tile(19, 20, "me"), reachOwnerId: "me" } as Tile]
  ]);
  const run = (target: Tile) => {
    const calls: Array<{ hatch: { theirs: string; mine: string }; dormant: number; front: unknown }> = [];
    let dormant = 0;
    addReachTileOverlays3D(
      {
        addDormantFrontierTile: () => void (dormant += 1),
        addIncursionTile: (_x, _z, _y, hatch, _edgeColor, _edges, breach) => void calls.push({ hatch, dormant, front: breach?.layout.frontEdges })
      },
      target,
      target.x,
      target.y,
      { x: 0, z: 0, y: 0 },
      new Set<string>([keyFor(19, 20)]),
      { tiles: pushTiles, keyFor, wrapX: (x) => x, wrapY: (y) => y, me: "me", ownerColor: (ownerId) => (ownerId === "rival" ? "#ff0000" : "#0000ff"), breachStyle: "spikes" }
    );
    return { calls, dormant };
  };

  it("draws the same incursion hatch with the roles swapped: my colour pushing into theirs, front line facing their land", () => {
    const { calls } = run(pushTiles.get(keyFor(20, 20))!);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.hatch).toEqual({ theirs: "#0000ff", mine: "#ff0000" });
    expect(calls[0]!.front).toMatchObject({ east: true, west: false });
  });

  it("leaves my tiles inside my own reach unmarked", () => {
    expect(run(pushTiles.get(keyFor(19, 20))!).calls).toEqual([]);
  });

  it("keeps the dormant-frontier tint under the hatch", () => {
    const dormantTile = { ...pushTiles.get(keyFor(20, 20))!, ownershipState: "FRONTIER", fort: {} } as unknown as Tile;
    const { calls, dormant } = run(dormantTile);
    expect(dormant).toBe(1);
    expect(calls).toHaveLength(1);
  });
});

describe("addReachTileOverlays3D on a hill", () => {
  it("hands the incursion hatch the hill drape for its tile", () => {
    const drape = (): number => 0.3;
    const drapes: unknown[] = [];
    const asked: string[] = [];
    addReachTileOverlays3D(
      {
        addDormantFrontierTile: () => undefined,
        addIncursionTile: (_x, _z, _y, _hatch, _edgeColor, _edges, _breach, tileDrape) => drapes.push(tileDrape)
      },
      tiles.get(keyFor(5, 5))!,
      5,
      5,
      { x: 0, z: 0, y: 0 },
      new Set([keyFor(5, 5), keyFor(6, 5)]),
      { tiles, keyFor, wrapX: (x) => x, wrapY: (y) => y, me: "me", ownerColor: () => "#7be05a", hillDrapeAt: (wx, wy) => (asked.push(keyFor(wx, wy)), drape) }
    );
    expect(asked).toEqual([keyFor(5, 5)]);
    expect(drapes).toEqual([drape]);
  });
});
