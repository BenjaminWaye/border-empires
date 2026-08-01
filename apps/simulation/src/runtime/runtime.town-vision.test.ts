import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Owned SETTLED towns reveal one extra ring (radius+1) around themselves,
// while plain owned tiles reveal only the base radius. This pins the
// full-export visibility path (classifyVisibilityForPlayer +
// VisionExpansionCache) for the town +1 vision feature.

const makePlayer = (id: string, allies: string[] = []) => ({
  id,
  isAi: false,
  points: 100,
  manpower: 100,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(allies)
});

const visibleTileKeys = (runtime: SimulationRuntime, playerId: string): Set<string> =>
  new Set(runtime.exportVisibleStateForPlayer(playerId).tiles.map((t) => `${t.x},${t.y}`));

describe("SimulationRuntime town +1 vision reveal", () => {
  it("a plain owned tile reveals radius 1; a SETTLED town tile reveals radius 2", () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" }> = [];
    for (let x = 6; x <= 24; x += 1) {
      for (let y = 6; y <= 14; y += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    tiles.push({ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "TOWN" } });
    tiles.push({ x: 20, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles, activeLocks: [] }
    });

    const keys = visibleTileKeys(runtime, "player-1");
    // One tile away is within base radius for both.
    expect(keys.has("10,11")).toBe(true);
    expect(keys.has("20,11")).toBe(true);
    // Two tiles away is visible only around the town (+1 ring), not the plain tile.
    expect(keys.has("10,12")).toBe(true);
    expect(keys.has("20,12")).toBe(false);
    // Three tiles away is outside even the town reveal.
    expect(keys.has("10,13")).toBe(false);
  });

  it("a SETTLEMENT tile does not grant the +1 reveal", () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" }> = [];
    for (let x = 7; x <= 13; x += 1) {
      for (let y = 7; y <= 14; y += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    tiles.push({ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Outpost", type: "FARMING", populationTier: "SETTLEMENT" } });
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles, activeLocks: [] }
    });

    const keys = visibleTileKeys(runtime, "player-1");
    expect(keys.has("10,11")).toBe(true); // base radius
    expect(keys.has("10,12")).toBe(false); // no +1 ring for settlements
  });

  it("an ally's SETTLED town reveal is visible to the player", () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" }> = [];
    for (let x = 27; x <= 33; x += 1) {
      for (let y = 27; y <= 34; y += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    tiles.push({ x: 30, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { name: "Ally", type: "FARMING", populationTier: "TOWN" } });
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1", ["player-2"])],
        ["player-2", makePlayer("player-2")]
      ]),
      initialState: { tiles, activeLocks: [] }
    });

    const keys = visibleTileKeys(runtime, "player-1");
    expect(keys.has("30,32")).toBe(true);
  });

  it("upgrading a SETTLEMENT to a TOWN grants the +1 reveal on the streaming path", async () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED"; resource?: "FISH" }> = [];
    for (let x = 7; x <= 13; x += 1) {
      for (let y = 7; y <= 14; y += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    tiles.push({ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Outpost", type: "FARMING", populationTier: "SETTLEMENT" } });
    // FOOD slot supply (2 each) so upgrading to TOWN (4 demand) leaves a free slot.
    tiles.push({ x: 1, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" });
    tiles.push({ x: 2, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" });
    tiles.push({ x: 3, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" });

    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles, activeLocks: [] }
    });

    const inAreaKeys = () =>
      new Set(runtime.exportTilesInAreaForPlayer("player-1", 10, 10, 3).map((t) => `${t.x},${t.y}`));

    // Settlement reveals only base radius → the +1 ring is not visible yet.
    expect(inAreaKeys().has("10,12")).toBe(false);

    runtime.submitCommand({
      commandId: "upgrade-town", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "UPGRADE_TOWN_TIER", payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();

    // After the upgrade the town's +1 ring is visible on the streaming path.
    expect(inAreaKeys().has("10,12")).toBe(true);
    expect(inAreaKeys().has("10,13")).toBe(false);
  });

  it("forming/breaking an alliance shares/withdraws the ally's town +1 ring on the streaming path", async () => {
    const tiles: Array<{ x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" }> = [];
    for (let x = 27; x <= 33; x += 1) {
      for (let y = 27; y <= 34; y += 1) {
        tiles.push({ x, y, terrain: "LAND" });
      }
    }
    tiles.push({ x: 30, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { name: "Ally", type: "FARMING", populationTier: "TOWN" } });

    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      initialState: { tiles, activeLocks: [] }
    });

    const inAreaKeys = () =>
      new Set(runtime.exportTilesInAreaForPlayer("player-1", 30, 30, 4).map((t) => `${t.x},${t.y}`));

    // Not allied yet — player-1 shouldn't see any of player-2's territory.
    expect(inAreaKeys().has("30,31")).toBe(false);
    expect(inAreaKeys().has("30,32")).toBe(false);

    runtime.submitCommand({
      commandId: "sync-alliance-on", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "SYNC_ALLIANCE", payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: true })
    });
    await Promise.resolve();

    // Allied: base territory is visible, and so is the ally town's +1 ring —
    // this ring is stacked on top of the base footprint via a separate
    // per-source bonus map, so alliance sync must propagate it explicitly.
    expect(inAreaKeys().has("30,31")).toBe(true);
    expect(inAreaKeys().has("30,32")).toBe(true);

    runtime.submitCommand({
      commandId: "sync-alliance-off", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
      type: "SYNC_ALLIANCE", payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: false })
    });
    await Promise.resolve();

    // Alliance broken: both the base territory and the town's +1 ring withdraw.
    expect(inAreaKeys().has("30,31")).toBe(false);
    expect(inAreaKeys().has("30,32")).toBe(false);
  });
});
