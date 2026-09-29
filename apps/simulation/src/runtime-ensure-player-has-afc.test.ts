// Coverage for the AFC settlement-migration grant
// (docs/manifest-afc-settlement-migration-plan.md): an empire settled
// before Automated Fabrication Complexes existed gets one placed on free
// land near its existing settlement the next time it connects.
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime/runtime.js";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// A generous grid of plain, unowned LAND around the anchor -- large enough
// that chooseLegacySpawnPlacement's RALLY_SPAWN_RADIUS (24) always has
// somewhere to land, whatever pass in RALLY_SPAWN_SEARCH_ORDER succeeds.
const emptyLandGrid = (excludeKeys: ReadonlySet<string> = new Set()): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let x = 0; x < 40; x += 1) {
    for (let y = 0; y < 40; y += 1) {
      const key = `${x},${y}`;
      if (excludeKeys.has(key)) continue;
      tiles.push({ x, y, terrain: "LAND" });
    }
  }
  return tiles;
};

describe("ensurePlayerHasAfc — AFC settlement migration", () => {
  it("grants a nearby AFC to a player with a settled tile and no AFC", () => {
    const anchor = { x: 15, y: 15 };
    const settledTile: DomainTileState = { x: anchor.x, y: anchor.y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles: [settledTile, ...emptyLandGrid(new Set([`${anchor.x},${anchor.y}`]))], activeLocks: [] }
    });

    const granted = runtime.ensurePlayerHasAfc("player-1");
    expect(granted).toBe(true);

    const afcTiles = runtime.exportState().tiles.filter((tile) => tile.ownerId === "player-1" && tile.afcJson);
    expect(afcTiles).toHaveLength(1);
    const afcTile = afcTiles[0]!;
    expect(afcTile.x === anchor.x && afcTile.y === anchor.y).toBe(false); // a NEW tile, not the settlement itself
    expect(Math.max(Math.abs(afcTile.x - anchor.x), Math.abs(afcTile.y - anchor.y))).toBeLessThanOrEqual(24);
    expect(JSON.parse(afcTile.afcJson!)).toEqual(expect.objectContaining({ ownerId: "player-1", status: "active", activatedAt: 1_000 }));
  });

  it("is a no-op for a player who already has an AFC", () => {
    const anchor = { x: 15, y: 15 };
    const settledTile: DomainTileState = {
      x: anchor.x,
      y: anchor.y,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      afc: { ownerId: "player-1", status: "active", activatedAt: 0 }
    };
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles: [settledTile, ...emptyLandGrid(new Set([`${anchor.x},${anchor.y}`]))], activeLocks: [] }
    });

    const granted = runtime.ensurePlayerHasAfc("player-1");
    expect(granted).toBe(false);
    const afcTiles = runtime.exportState().tiles.filter((tile) => tile.ownerId === "player-1" && tile.afcJson);
    expect(afcTiles).toHaveLength(1); // still just the original
  });

  it("is a no-op for a player with zero territory", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles: emptyLandGrid(), activeLocks: [] }
    });

    const granted = runtime.ensurePlayerHasAfc("player-1");
    expect(granted).toBe(false);
    const afcTiles = runtime.exportState().tiles.filter((tile) => tile.ownerId === "player-1");
    expect(afcTiles).toHaveLength(0);
  });

  it("does not land on another player's tile", () => {
    const anchor = { x: 15, y: 15 };
    const settledTile: DomainTileState = { x: anchor.x, y: anchor.y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    // player-2 owns every tile within a tight ring around the anchor --
    // the migration grant must still land somewhere, but never on these.
    const player2Ring: DomainTileState[] = [];
    for (let x = anchor.x - 2; x <= anchor.x + 2; x += 1) {
      for (let y = anchor.y - 2; y <= anchor.y + 2; y += 1) {
        if (x === anchor.x && y === anchor.y) continue;
        player2Ring.push({ x, y, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
      }
    }
    const excluded = new Set([`${anchor.x},${anchor.y}`, ...player2Ring.map((t) => `${t.x},${t.y}`)]);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      initialState: { tiles: [settledTile, ...player2Ring, ...emptyLandGrid(excluded)], activeLocks: [] }
    });

    const granted = runtime.ensurePlayerHasAfc("player-1");
    expect(granted).toBe(true);
    const afcTile = runtime.exportState().tiles.find((tile) => tile.ownerId === "player-1" && tile.afcJson);
    expect(afcTile).toBeDefined();
    const withinPlayer2Ring = Math.abs(afcTile!.x - anchor.x) <= 2 && Math.abs(afcTile!.y - anchor.y) <= 2 && !(afcTile!.x === anchor.x && afcTile!.y === anchor.y);
    expect(withinPlayer2Ring).toBe(false);
  });

  // Regression test: the very first placement candidate chooseLegacySpawnPlacement
  // tries is often the nearest ownerless FRONTIER tile (terrain LAND, no owner) --
  // exactly the tile a nearby MARCH/EXPAND would organically claim next. Without
  // excluding those, this migration grant would race a live expansion for the
  // same land (caught by apps/realtime-gateway's
  // rewrite-stack-muster-march-expand-transit.integration.test.ts, whose tiny
  // fixture world has only one nearby free tile, which is FRONTIER).
  it("never lands on an ownerless FRONTIER tile", () => {
    const anchor = { x: 15, y: 15 };
    const settledTile: DomainTileState = { x: anchor.x, y: anchor.y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    const nearestFrontierTile: DomainTileState = { x: anchor.x, y: anchor.y + 1, terrain: "LAND", ownershipState: "FRONTIER" };
    const excluded = new Set([`${anchor.x},${anchor.y}`, `${nearestFrontierTile.x},${nearestFrontierTile.y}`]);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles: [settledTile, nearestFrontierTile, ...emptyLandGrid(excluded)], activeLocks: [] }
    });

    const granted = runtime.ensurePlayerHasAfc("player-1");
    expect(granted).toBe(true);
    const afcTile = runtime.exportState().tiles.find((tile) => tile.ownerId === "player-1" && tile.afcJson);
    expect(afcTile).toBeDefined();
    expect(afcTile!.x === nearestFrontierTile.x && afcTile!.y === nearestFrontierTile.y).toBe(false);
  });

  it("is idempotent across repeated calls", () => {
    const anchor = { x: 15, y: 15 };
    const settledTile: DomainTileState = { x: anchor.x, y: anchor.y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles: [settledTile, ...emptyLandGrid(new Set([`${anchor.x},${anchor.y}`]))], activeLocks: [] }
    });

    expect(runtime.ensurePlayerHasAfc("player-1")).toBe(true);
    expect(runtime.ensurePlayerHasAfc("player-1")).toBe(false);
    const afcTiles = runtime.exportState().tiles.filter((tile) => tile.ownerId === "player-1" && tile.afcJson);
    expect(afcTiles).toHaveLength(1);
  });
});
