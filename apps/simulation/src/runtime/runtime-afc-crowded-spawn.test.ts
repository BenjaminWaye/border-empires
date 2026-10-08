import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { AFC_VISION_RADIUS, TOWN_REACH_RADIUS } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Regression for "I spawned next to another player and landed in a black
// hole": territory vision only reaches one tile past owned ground (and one
// past the player's own reach border), so an AFC whose reach disk a rival
// already covered -- and therefore never auto-claimed -- saw almost nothing.
// The AFC now always sees AFC_VISION_RADIUS around itself, the same view an
// unobstructed spawn gets from owning its full disk.
const AFC = { x: 12, y: 10 };
const chebyshev = (x: number, y: number) => Math.max(Math.abs(x - AFC.x), Math.abs(y - AFC.y));

const buildWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y <= 20; y += 1) {
    for (let x = 0; x <= 24; x += 1) tiles.push({ x, y, terrain: "LAND" });
  }
  // The rival's two towns flank the AFC so their radius-3 reach disks cover
  // every tile of the AFC's own radius-3 disk except the AFC tile itself.
  const rivalTown = (x: number): DomainTileState => ({
    x,
    y: AFC.y,
    terrain: "LAND",
    ownerId: "rival",
    ownershipState: "SETTLED",
    town: { name: `Rival ${x}`, type: "FARMING", populationTier: "TOWN" }
  });
  const set = (tile: DomainTileState) => tiles.splice(tiles.findIndex((t) => t.x === tile.x && t.y === tile.y), 1, tile);
  set(rivalTown(AFC.x - 2));
  set(rivalTown(AFC.x + 2));
  set({ ...AFC, terrain: "LAND", ownerId: "newcomer", ownershipState: "SETTLED", afc: { ownerId: "newcomer", status: "active", activatedAt: 0 } });
  return tiles;
};

describe("AFC starting vision", () => {
  it("sees AFC_VISION_RADIUS around the AFC even when a rival's reach covers its whole disk", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      // Rival first, so its towns' reach is granted before the AFC's and keeps every contested tile.
      initialPlayers: new Map([["rival", buildPlayer("rival")], ["newcomer", buildPlayer("newcomer")]]),
      seedTiles: new Map(),
      initialState: { tiles: buildWorld(), activeLocks: [] }
    });

    // Precondition: the rival really does hold the disk, so the newcomer owns
    // and reaches only its AFC tile.
    expect(runtime.exportState().tiles.filter((tile) => tile.ownerId === "newcomer")).toHaveLength(1);
    expect([...runtime.reachTileKeysForPlayer("newcomer")]).toEqual([`${AFC.x},${AFC.y}`]);

    // One ring past the disk the AFC would own on open ground.
    expect(AFC_VISION_RADIUS).toBe(TOWN_REACH_RADIUS + 1);
    const visible = new Set(runtime.exportVisibleStateForPlayer("newcomer").tiles.map((tile) => `${tile.x},${tile.y}`));
    const ring = (radius: number) => [...Array(21).keys()].flatMap((y) => [...Array(25).keys()].filter((x) => chebyshev(x, y) === radius).map((x) => `${x},${y}`));
    expect(ring(AFC_VISION_RADIUS)).toHaveLength(8 * AFC_VISION_RADIUS);
    expect(ring(AFC_VISION_RADIUS).filter((key) => !visible.has(key))).toEqual([]);
    expect(ring(AFC_VISION_RADIUS + 1).some((key) => visible.has(key))).toBe(false);
  });
});

// Regression for "their reach eats up all my reach": reach is first-come, so a
// spawn that could only be placed inside a rival's reach used to own nothing
// but its AFC tile. A landed AFC now always keeps its own 3x3 footprint.
describe("AFC landing inside a rival's reach", () => {
  // Every tile sits inside the two rival towns' radius-3 reach, which the
  // boot reseed grants without auto-claiming it -- the unclaimed rival reach
  // a crowded-map spawn lands on.
  const buildCrowdedWorld = (): DomainTileState[] => {
    const tiles: DomainTileState[] = [];
    for (let y = 7; y <= 13; y += 1) {
      for (let x = 8; x <= 16; x += 1) {
        const isTown = y === 10 && (x === 10 || x === 14);
        tiles.push(
          isTown
            ? { x, y, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", town: { name: `Rival ${x}`, type: "FARMING", populationTier: "TOWN" } }
            : { x, y, terrain: "LAND" }
        );
      }
    }
    return tiles;
  };

  // The restarted world: the original tiles with the newcomer's land (AFC included) overlaid.
  const withNewcomerLand = (world: DomainTileState[], runtime: SimulationRuntime): DomainTileState[] => {
    const newcomerTiles = new Map(
      runtime
        .exportState()
        .tiles.filter((tile) => tile.ownerId === "newcomer")
        .map((tile) => [`${tile.x},${tile.y}`, tile] as const)
    );
    return world.map((tile) => {
      const owned = newcomerTiles.get(`${tile.x},${tile.y}`);
      if (!owned) return tile;
      return { ...tile, ownerId: "newcomer", ownershipState: owned.ownershipState, ...(owned.afcJson ? { afc: JSON.parse(owned.afcJson) } : {}) };
    });
  };

  it("grants the AFC's whole 3x3 footprint, and keeps it across a restart", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["rival", buildPlayer("rival")]]),
      seedTiles: new Map(),
      initialState: { tiles: buildCrowdedWorld(), activeLocks: [] }
    });
    expect(runtime.ensurePlayerHasSpawnTerritory("newcomer")).toBe(true);

    const afcTile = runtime.exportState().tiles.find((tile) => tile.afcJson !== undefined && tile.ownerId === "newcomer");
    expect(afcTile).toBeDefined();
    const footprint = runtime
      .exportState()
      .tiles.filter((tile) => Math.max(Math.abs(tile.x - afcTile!.x), Math.abs(tile.y - afcTile!.y)) <= 1)
      .map((tile) => `${tile.x},${tile.y}`)
      .sort();
    expect(footprint.length).toBeGreaterThan(1);
    // The test world is a small patch of a full-size map, so the reach set is
    // compared only over tiles that exist.
    const worldKeys = new Set(runtime.exportState().tiles.map((tile) => `${tile.x},${tile.y}`));
    const reachInWorld = (rt: SimulationRuntime) => rt.reachTileKeysForPlayer("newcomer").filter((key) => worldKeys.has(key)).sort();
    expect(reachInWorld(runtime)).toEqual(footprint);
    const ownedKeys = runtime.exportState().tiles.filter((tile) => tile.ownerId === "newcomer").map((tile) => `${tile.x},${tile.y}`).sort();
    expect(ownedKeys).toEqual(footprint);

    // A restart rebuilds the border from every anchor in turn; the footprint
    // must survive whichever order that replays them in.
    const restarted = new SimulationRuntime({
      now: () => 2_000,
      initialPlayers: new Map([["rival", buildPlayer("rival")], ["newcomer", buildPlayer("newcomer")]]),
      seedTiles: new Map(),
      initialState: { tiles: withNewcomerLand(buildCrowdedWorld(), runtime), activeLocks: [] }
    });
    expect(reachInWorld(restarted)).toEqual(footprint);
  });
});
