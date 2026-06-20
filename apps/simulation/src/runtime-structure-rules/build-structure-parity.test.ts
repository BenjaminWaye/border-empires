import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { structureBuildDurationMs } from "@border-empires/shared";

/**
 * Parity tests for BUILD_STRUCTURE — verifies the unified handler produces
 * the same tile state as the now-deleted legacy handlers.
 */

describe("BUILD_STRUCTURE parity — fort family", () => {
  it("builds FORT via BUILD_STRUCTURE", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["masonry"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, IRON: 100, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } }],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "f1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FORT" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.fortJson).toBeDefined();
    expect(tile?.fortJson).toContain('"status":"under_construction"');
  });

  it("upgrades FORT → IRON_BASTION", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["masonry", "fortified-walls"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, IRON: 200, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" }, fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } }],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "u1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FORT" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.fortJson).toContain('"variant":"IRON_BASTION"');
  });

  it("upgrades WOODEN_FORT → FORT", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", {
          id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
          techIds: new Set<string>(["masonry"]), domainIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          techRootId: "rewrite-local", allies: new Set<string>(),
          strategicResources: { FOOD: 0, IRON: 100, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
        }]]),
        initialState: {
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" }, economicStructure: { ownerId: "player-1", type: "WOODEN_FORT" as const, status: "active" as const } }],
          activeLocks: [],
        },
      });

      runtime.submitCommand({
        commandId: "w1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "BUILD_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FORT" }),
      });
      await Promise.resolve();

      const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(tile?.fortJson).toBeDefined();

      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));
      await Promise.resolve();
      const done = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
      expect(done?.fortJson).toContain('"status":"active"');
      expect(done?.economicStructureJson).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("BUILD_STRUCTURE parity — outpost family", () => {
  it("builds SIEGE_OUTPOST via BUILD_STRUCTURE", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 100, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
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
        strategicResources: { FOOD: 0, IRON: 200, CRYSTAL: 0, SUPPLY: 200, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
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

  it("builds SIEGE_TOWER on a resource tile", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking", "siegecraft"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, IRON: 200, CRYSTAL: 0, SUPPLY: 200, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "IRON" },
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

describe("BUILD_STRUCTURE parity — rejection paths", () => {
  it("rejects unknown structure type", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: {},
      }]]),
      initialState: { tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }], activeLocks: [] },
    });

    const events: Array<{ code: string }> = [];
    runtime.onEvent((e) => { if (e.eventType === "COMMAND_REJECTED") events.push({ code: e.code }); });
    runtime.submitCommand({
      commandId: "r1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "NONEXISTENT" }),
    });
    await Promise.resolve();
    expect(events[0]?.code).toBe("UNKNOWN_STRUCTURE");
  });

  // Atomic spend: alphabetic-first resource (IRON) succeeds, later (SUPPLY)
  // fails. Without atomic pre-check, IRON is silently stolen.
  it("preserves IRON when SUPPLY is insufficient for SIEGE_TOWER upgrade", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking", "siegecraft"]),
        domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        // SIEGE_TOWER costs: SUPPLY 90 + IRON 60
        // Alphabetically: [IRON, SUPPLY]. IRON is sufficient, SUPPLY is not.
        // Atomic path: IRON stays at 100. Broken path: IRON drops to 40.
        strategicResources: { FOOD: 0, IRON: 100, CRYSTAL: 0, SUPPLY: 10, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", siegeOutpost: { ownerId: "player-1", status: "active", variant: "SIEGE_OUTPOST" as const } }
        ],
        activeLocks: [],
      },
    });

    const events: Array<{ code: string }> = [];
    runtime.onEvent((e) => { if (e.eventType === "COMMAND_REJECTED") events.push({ code: e.code }); });
    runtime.submitCommand({
      commandId: "atom1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_OUTPOST" }),
    });
    await Promise.resolve();

    expect(events[0]?.code).toBe("BUILD_INVALID");
    const player = runtime.exportState().players.find((p) => p.id === "player-1");
    // IRON must still be 100 — atomic pre-check prevented the spend.
    expect(player?.strategicResources?.IRON).toBe(100);
  });
});

describe("BUILD_STRUCTURE parity — observatory", () => {
  it("builds OBSERVATORY", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["cartography"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 100, SUPPLY: 0, SHARD: 0 },
      }]]),
      initialState: { tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }], activeLocks: [] },
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
});

describe("BUILD_STRUCTURE parity — economic family", () => {
  it("builds MARKET (town-support)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["trade"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "TOWN" } },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "m1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "MARKET" }),
    });
    await Promise.resolve();

    const supportTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
    expect(supportTile?.economicStructureJson).toContain('"type":"MARKET"');
  });

  it("upgrades FUR_SYNTHESIZER → ADVANCED", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["workshops", "advanced-synthetication"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 100, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "FUR_SYNTHESIZER" as const, status: "active" as const } }
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "afs1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "ADVANCED_FUR_SYNTHESIZER" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.economicStructureJson).toContain('"type":"ADVANCED_FUR_SYNTHESIZER"');
  });
});
