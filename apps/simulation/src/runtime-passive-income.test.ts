import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime/runtime.js";

const testRuntimePlayer = (id: string, isAi: boolean) => ({
  id,
  isAi,
  points: 100,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
});

const goldTownTile = (ownerId: string) => ({
  x: 5,
  y: 5,
  terrain: "LAND" as const,
  ownerId,
  ownershipState: "SETTLED" as const,
  town: { type: "FARMING" as const, populationTier: "SETTLEMENT" as const, name: "Gold Town" }
});

describe("applyPassiveIncome AI inactivity-cap exemption", () => {
  it("does NOT skip AI players beyond the inactivity cap", () => {
    // Regression test: AI empires only submit a command (which refreshes
    // lastActiveAt) when their planner produces something other than WAIT
    // (see ai-command-producer.ts). An AI stuck at WAIT — e.g. because it's
    // broke — would otherwise never refresh lastActiveAt, cross the
    // inactivity cap, and have income permanently switched off: a one-way
    // trap confirmed on staging via /admin/players (5 AI players frozen at
    // sub-1 gold indefinitely, bit-for-bit identical across polls while a
    // human player in the same world kept earning). AI players must keep
    // earning regardless of how long they've been "inactive" by the
    // human-AFK definition this cap exists for.
    const startMs = 1_000_000;
    const inactivityCapMs = 60_000; // 1 minute cap for this test
    const runtime = new SimulationRuntime({
      now: () => startMs,
      initialPlayers: new Map([["ai-1", testRuntimePlayer("ai-1", true)]]),
      seedTiles: new Map(),
      initialState: { tiles: [goldTownTile("ai-1")], activeLocks: [] }
    });
    // Note: updatePlayerLastActive is deliberately never called for this
    // player — it has never submitted a command, exactly like an AI stuck
    // permanently at WAIT.
    runtime.applyPassiveIncome(startMs - 2 * inactivityCapMs, inactivityCapMs);
    const playerBefore = runtime.exportState().players.find((entry) => entry.id === "ai-1");
    const pointsBefore = playerBefore?.points ?? 0;
    runtime.applyPassiveIncome(startMs, inactivityCapMs);
    const playerAfter = runtime.exportState().players.find((entry) => entry.id === "ai-1");
    expect(playerAfter?.points ?? 0).toBeGreaterThan(pointsBefore);
  });

  it("still skips human players beyond the inactivity cap (unchanged behavior)", () => {
    const startMs = 1_000_000;
    const inactivityCapMs = 60_000;
    const runtime = new SimulationRuntime({
      now: () => startMs,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1", false)]]),
      seedTiles: new Map(),
      initialState: { tiles: [goldTownTile("player-1")], activeLocks: [] }
    });
    runtime.updatePlayerLastActive("player-1", startMs - 2 * inactivityCapMs);
    runtime.applyPassiveIncome(startMs - 60_000, inactivityCapMs);
    const playerBefore = runtime.exportState().players.find((entry) => entry.id === "player-1");
    const pointsBefore = playerBefore?.points ?? 0;
    runtime.applyPassiveIncome(startMs, inactivityCapMs);
    const playerAfter = runtime.exportState().players.find((entry) => entry.id === "player-1");
    expect(playerAfter?.points ?? 0).toBe(pointsBefore);
  });
});
