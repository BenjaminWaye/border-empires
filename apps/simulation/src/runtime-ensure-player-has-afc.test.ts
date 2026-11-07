// Reconnect repairs modules, but never grants a free replacement AFC.
import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime/runtime.js";

// AI and human players use the same paid replacement rules.
const makePlayer = (id: string) => ({
  id,
  isAi: true,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// A generous grid of plain, unowned LAND around the anchor, so the neutral
// fallback always has somewhere to land when the test forces it.
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
  it("does not grant a free AFC to an AI on reconnect", () => {
    const runtime = new SimulationRuntime({ now: () => 1000, scheduleAfter: () => undefined,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles: [{ x: 15, y: 15, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }], activeLocks: [] } });
    expect(runtime.ensurePlayerHasAfc("player-1")).toBe(false);
    expect(runtime.exportState().tiles.some(tile => tile.afcJson)).toBe(false);
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

  it("calls down researched AFC modules missing from an existing AFC on reconnect", () => {
    const afcTile: DomainTileState = {
      x: 15,
      y: 15,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      afc: { ownerId: "player-1", status: "active", activatedAt: 0, modules: ["masonry"], houseModules: ["masonry"] }
    };
    const player = makePlayer("player-1");
    player.techIds = new Set(["masonry", "crystal-lattices", "agriculture"]);
    let now = 1_000;
    const timers: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => now,
      scheduleAfter: (delayMs, task) => { if (delayMs > 0) timers.push(task); else task(); },
      initialPlayers: new Map([["player-1", player]]),
      initialState: { tiles: [afcTile, ...emptyLandGrid(new Set(["15,15"]))], activeLocks: [] }
    });
    const afcState = () => JSON.parse(runtime.exportState().tiles.find((tile) => tile.ownerId === "player-1" && tile.afcJson)!.afcJson!);

    expect(runtime.ensurePlayerHasAfc("player-1")).toBe(true);
    expect(afcState().incomingModules).toEqual([{ techId: "crystal-lattices", arrivesAt: 61_000 }]);
    expect(runtime.ensurePlayerHasAfc("player-1")).toBe(false); // already on its way
    now = 61_000;
    timers.splice(0).forEach((task) => task());
    expect(afcState().houseModules).toEqual(["masonry", "crystal-lattices"]);
    expect(afcState().incomingModules).toBeUndefined();
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

  it("never takes another player's tile, even when that leaves no valid site", () => {
    const anchor = { x: 15, y: 15 };
    const settledTile: DomainTileState = { x: anchor.x, y: anchor.y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } };
    // player-2 owns every tile around player-1's only (town) tile, so there is
    // no empty owned tile and no neutral tile touching the territory.
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

    expect(runtime.ensurePlayerHasAfc("player-1")).toBe(false);
    const tiles = runtime.exportState().tiles;
    expect(tiles.some((tile) => tile.afcJson)).toBe(false);
    expect(tiles.filter((tile) => tile.ownerId === "player-2")).toHaveLength(player2Ring.length);
  });

  // Regression test: the nearest neutral fallback candidate is often an
  // ownerless FRONTIER tile (terrain LAND, no owner) -- exactly the tile a
  // nearby MARCH/EXPAND would organically claim next. Without excluding
  // those, the grant would race a live expansion for the same land (caught by apps/realtime-gateway's
  // rewrite-stack-muster-march-expand-transit.integration.test.ts, whose tiny
  // fixture world has only one nearby free tile, which is FRONTIER).
  it("never places an AFC for a human: they commission their own", () => {
    const settledTile: DomainTileState = { x: 15, y: 15, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", { ...makePlayer("player-1"), isAi: false }]]),
      initialState: { tiles: [settledTile, ...emptyLandGrid(new Set(["15,15"]))], activeLocks: [] }
    });

    expect(runtime.ensurePlayerHasAfc("player-1")).toBe(false);
    expect(runtime.exportState().tiles.some((tile) => tile.afcJson)).toBe(false);
  });
});
