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
        strategicResources: { FOOD: 0, TITANIUM: 100, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
        ],
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

  it("upgrades FORT → TITANIUM_BASTION", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["masonry", "fortified-walls"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 200, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" }, fort: { ownerId: "player-1", status: "active", variant: "FORT" as const } },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
        ],
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
    expect(tile?.fortJson).toContain('"variant":"TITANIUM_BASTION"');
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
          strategicResources: { FOOD: 0, TITANIUM: 100, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        }]]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" }, economicStructure: { ownerId: "player-1", type: "WOODEN_FORT" as const, status: "active" as const } },
            { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 12, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
          ],
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

  // Step 5 item 3 (Slice A): UMBRITE/TITANIUM stockpile amounts no longer gate a
  // build at all -- hasFreeResourceSlots (slot supply/demand) is the real
  // gate now, and stripRetiredStockpileCost means spendStrategicCost never
  // even sees FOOD/TITANIUM/CRYSTAL/UMBRITE. This test used to prove the atomic
  // check-then-spend pre-check prevented a partial stockpile spend when TITANIUM
  // succeeded but UMBRITE failed; that scenario can no longer occur for these
  // four keys since nothing is spent from the stockpile for them any more.
  // Rewritten to prove the inverse: an upgrade with plenty of slot supply
  // succeeds despite near-empty legacy stockpile balances, and those balances
  // are left completely untouched (proving they were never read as a gate).
  it("SIEGE_TOWER upgrade succeeds on slot supply alone, ignoring near-empty legacy UMBRITE/TITANIUM stockpile balances", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["leatherworking", "siegecraft"]),
        domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        // SIEGE_TOWER's old stockpile cost was UMBRITE 90 + TITANIUM 60 -- far more
        // than these balances. The build must succeed anyway: slots, not
        // stockpile, are the real gate now.
        strategicResources: { FOOD: 0, TITANIUM: 100, CRYSTAL: 0, UMBRITE: 10, SHARD: 0 },
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

    const events: Array<{ code: string }> = [];
    runtime.onEvent((e) => { if (e.eventType === "COMMAND_REJECTED") events.push({ code: e.code }); });
    runtime.submitCommand({
      commandId: "atom1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "SIEGE_OUTPOST" }),
    });
    await Promise.resolve();

    expect(events).toEqual([]);
    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.siegeOutpostJson).toContain('"variant":"SIEGE_TOWER"');
    const player = runtime.exportState().players.find((p) => p.id === "player-1");
    // Legacy stockpile balances must be completely untouched -- nothing is
    // spent from them for this build any more.
    expect(player?.strategicResources?.TITANIUM).toBe(100);
    expect(player?.strategicResources?.UMBRITE).toBe(10);
  });
});


describe("BUILD_STRUCTURE parity — economic family", () => {
  it("builds MINTWORKS (same-tile, uncapped per town)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["trade"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "TOWN" } },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          // §5.3: town draws 4 FOOD, MINTWORKS 1 more — 2 FISH (2 each) + 1 FARM = 5.
          { x: 10, y: 12, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
          { x: 10, y: 13, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 10, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "m1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 11, structureType: "MINTWORKS" }),
    });
    await Promise.resolve();

    // Mintworks stays same_tile placement (tech-tree redesign: per-town cap
    // removed, stacks additively) -- targeted directly at the open support
    // tile, it lands there without any redirect or singleton rejection.
    const builtTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
    expect(builtTile?.economicStructureJson).toContain('"type":"MINTWORKS"');
  });

  it("redirects MINTWORKS targeted at the town tile itself onto its open support tile", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["trade"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "TOWN" } },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 12, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
          { x: 10, y: 13, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 10, y: 14, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "m1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      // Targets the town tile itself -- only a Fort belongs directly on it.
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "MINTWORKS" }),
    });
    await Promise.resolve();

    const townTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(townTile?.economicStructureJson).toBeUndefined();
    const supportTile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
    expect(supportTile?.economicStructureJson).toContain('"type":"MINTWORKS"');
  });

  it("upgrades UMBRITE_SYNTHESIZER → ADVANCED", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["workshops", "advanced-synthetication"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 100, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "UMBRITE_SYNTHESIZER" as const, status: "active" as const } }
        ],
        activeLocks: [],
      },
    });

    runtime.submitCommand({
      commandId: "afs1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "ADVANCED_UMBRITE_SYNTHESIZER" }),
    });
    await Promise.resolve();

    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.economicStructureJson).toContain('"type":"ADVANCED_UMBRITE_SYNTHESIZER"');
  });

  // converter-mode-flip plan §Cap removal: the 1-per-empire synthesizer cap
  // is gone. Regression test against the removed rule (used to assert the opposite).
  it("allows a second UMBRITE_SYNTHESIZER in a different town when one is already owned (cap removed)", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["workshops"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 100, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub A", type: "MARKET", populationTier: "CITY" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructure: { ownerId: "player-1", type: "UMBRITE_SYNTHESIZER" as const, status: "active" as const } },
          { x: 20, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub B", type: "MARKET", populationTier: "CITY" } },
          { x: 20, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        ],
        activeLocks: [],
      },
    });

    const rejections: Array<{ code: string; message: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code, message: event.message });
    });
    runtime.submitCommand({
      commandId: "fs-dupe-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 20, y: 9, structureType: "UMBRITE_SYNTHESIZER" }),
    });
    await Promise.resolve();

    expect(rejections).toEqual([]);
    const secondTile = runtime.exportState().tiles.find((t) => t.x === 20 && t.y === 10);
    expect(secondTile?.economicStructureJson).toBeDefined();
  });

  it("allows a fresh UMBRITE_SYNTHESIZER build when none is owned yet", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", {
        id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
        techIds: new Set<string>(["workshops"]), domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        techRootId: "rewrite-local", allies: new Set<string>(),
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 100, SHARD: 0 },
      }]]),
      initialState: {
        tiles: [
          { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "MARKET", populationTier: "CITY" } },
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        ],
        activeLocks: [],
      },
    });

    const rejections: Array<{ code: string }> = [];
    runtime.onEvent((event) => {
      if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code });
    });
    runtime.submitCommand({
      commandId: "fs-fresh-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "BUILD_STRUCTURE" as any,
      payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "UMBRITE_SYNTHESIZER" }),
    });
    await Promise.resolve();

    expect(rejections).toEqual([]);
    const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10);
    expect(tile?.economicStructureJson).toContain('"type":"UMBRITE_SYNTHESIZER"');
  });
});

// §5.1: "occupies a slot for as long as it exists" — demand is derived live
// from tile state (resource-slot-view.ts has no persisted "occupied slot"
// record), so removing a structure should free its slot automatically with
// no extra removal-side code. Verifies that claim end-to-end rather than by
// inspection only.
describe("BUILD_STRUCTURE parity — resource slots free on removal", () => {
  it("a slot occupied by a removed Fort becomes free again once removal completes", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", {
          id: "player-1", isAi: false, points: 50_000, manpower: 10_000,
          techIds: new Set<string>(["masonry"]), domainIds: new Set<string>(),
          mods: { attack: 1, defense: 1, income: 1, vision: 1 },
          techRootId: "rewrite-local", allies: new Set<string>(),
          strategicResources: { FOOD: 0, TITANIUM: 200, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        }]]),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub A", type: "MARKET", populationTier: "CITY" } },
            { x: 20, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub B", type: "MARKET", populationTier: "CITY" } },
            // Only 1 TITANIUM slot in the whole empire — exactly enough for one Fort.
            { x: 30, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
          ],
          activeLocks: [],
        },
      });

      const rejections: Array<{ code: string }> = [];
      runtime.onEvent((event) => {
        if (event.eventType === "COMMAND_REJECTED") rejections.push({ code: event.code });
      });

      runtime.submitCommand({
        commandId: "slot-free-1a", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "BUILD_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 10, y: 10, structureType: "FORT" }),
      });
      await Promise.resolve();
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson).toContain('"status":"under_construction"');

      // The one TITANIUM slot is already spoken for (by the under_construction
      // Fort — occupation starts at build time, not completion) — a second
      // Fort elsewhere must be rejected.
      runtime.submitCommand({
        commandId: "slot-free-2a", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1_000,
        type: "BUILD_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 20, y: 10, structureType: "FORT" }),
      });
      await Promise.resolve();
      expect(rejections).toEqual([{ code: "INSUFFICIENT_SLOT" }]);
      expect(runtime.exportState().tiles.find((t) => t.x === 20 && t.y === 10)?.fortJson).toBeUndefined();

      // Finish building the first Fort, then remove it entirely.
      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));
      await Promise.resolve();
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson).toContain('"status":"active"');

      runtime.submitCommand({
        commandId: "slot-free-3a", sessionId: "session-1", playerId: "player-1", clientSeq: 3, issuedAt: 1_000,
        type: "REMOVE_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 10, y: 10 }),
      });
      await Promise.resolve();
      vi.advanceTimersByTime(structureBuildDurationMs("FORT"));
      await Promise.resolve();
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson).toBeUndefined();

      // The TITANIUM slot is free again with no removal-side slot bookkeeping at
      // all — the second Fort build should now succeed.
      runtime.submitCommand({
        commandId: "slot-free-2b", sessionId: "session-1", playerId: "player-1", clientSeq: 4, issuedAt: 1_000,
        type: "BUILD_STRUCTURE" as any,
        payloadJson: JSON.stringify({ x: 20, y: 10, structureType: "FORT" }),
      });
      await Promise.resolve();
      expect(runtime.exportState().tiles.find((t) => t.x === 20 && t.y === 10)?.fortJson).toContain('"status":"under_construction"');
    } finally {
      vi.useRealTimers();
    }
  });
});
