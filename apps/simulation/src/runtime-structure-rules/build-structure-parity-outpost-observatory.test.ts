import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";

/**
 * Parity tests for BUILD_STRUCTURE — outpost and observatory families.
 * Split out of build-structure-parity.test.ts (500-line cap).
 */

describe("BUILD_STRUCTURE parity — outpost family", () => {
  it("builds SIEGE_OUTPOST via BUILD_STRUCTURE", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 100, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 8, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "s1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_OUTPOST" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.siegeOutpostJson).toContain('"status":"under_construction"');
  });

  it("upgrades SIEGE_OUTPOST → SIEGE_TOWER", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking", "siegecraft"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 200, CRYSTAL: 0, UMBRITE: 200, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 8, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
          { x: 7, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
          { x: 6, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", siegeOutpost: { ownerId: "player-1", status: "active", variant: "SIEGE_OUTPOST" as const } }
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "st1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_OUTPOST" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.siegeOutpostJson).toContain('"variant":"SIEGE_TOWER"');
  });

  it("rejects SIEGE_OUTPOST when the tile already has a fort", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 100, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 8, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
        ],
        activeLocks: [],
      },
    });

    const rejections: Array<{ code: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code });
    });
    runtime.submitCommand({
      commandId: "siege-fort-block-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_OUTPOST" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(rejections.map((r) => r.code)).toEqual(["BUILD_INVALID"]);
    expect(tile?.siegeOutpostJson).toBeUndefined();
  });

  it("builds SIEGE_TOWER on a resource tile", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking", "siegecraft"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 200, CRYSTAL: 0, UMBRITE: 200, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
        ],
        activeLocks: [],
      },
    });

    const rejections: Array<{ code: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code });
    });
    runtime.submitCommand({
      commandId: "siege-tower-resource-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_TOWER" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(rejections).toEqual([]);
    expect(tile?.siegeOutpostJson).toContain('"variant":"SIEGE_TOWER"');
  });
});

describe("BUILD_STRUCTURE parity — observatory", () => {
  it("builds OBSERVATORY", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["crystal-lattices"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 100, UMBRITE: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "o1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "OBSERVATORY" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.observatoryJson).toBeDefined();
    expect(tile?.observatoryJson).toContain('"status":"under_construction"');
  });

  it("builds OBSERVATORY on a tile that already has a fort", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["crystal-lattices"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 100, UMBRITE: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
        ],
        activeLocks: [],
      },
    });

    const rejections: Array<{ code: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code });
    });
    runtime.submitCommand({
      commandId: "o2", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "OBSERVATORY" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(rejections).toEqual([]);
    expect(tile?.observatoryJson).toBeDefined();
    expect(tile?.observatoryJson).toContain('"status":"under_construction"');
    expect(tile?.fortJson).toBeDefined();
  });
});
