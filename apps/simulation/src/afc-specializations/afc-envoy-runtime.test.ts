import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";
import { yieldToEventLoop } from "../event-loop-yield.js";

function fixture(upgrades: readonly string[], production = false) {
  let now = 1000;
  const players = ["p", "a"].map(id => buildPlayer(id, { points: 0, manpower: 0, manpowerUpdatedAt: now,
    landingReserveGranted: true, afcUpgradeRuleset: "afc-v1", allies: new Set([id === "p" ? "a" : "p"]),
    domainIds: new Set(upgrades.includes(id) ? ["afc-chancery-1"] : []) }));
  const tiles: DomainTileState[] = players.map((p, i) => ({ x: 5 + i * 20, y: 5, terrain: "LAND", ownerId: p.id,
    ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "SETTLEMENT", isFed: true, population: 1000, maxPopulation: 5000 } }));
  if (production) {
    tiles[1]!.town = { type: "MARKET", populationTier: "TOWN", isFed: true, population: 10_000, maxPopulation: 25_000 };
    tiles.push(
    { x: 24, y: 5, terrain: "LAND", ownerId: "a", ownershipState: "SETTLED", economicStructure: { ownerId: "a", type: "MANUFACTORY", status: "active" } },
    { x: 26, y: 5, terrain: "LAND", ownerId: "a", ownershipState: "SETTLED", economicStructure: { ownerId: "a", type: "ANCILLARY_FACTORY", status: "active" } },
    { x: 25, y: 6, terrain: "LAND", ownerId: "a", ownershipState: "SETTLED", resource: "FISH" },
    { x: 24, y: 6, terrain: "LAND", ownerId: "a", ownershipState: "SETTLED", resource: "FISH" },
    { x: 26, y: 6, terrain: "LAND", ownerId: "a", ownershipState: "SETTLED", resource: "FISH" }
    );
  }
  const scheduled: Array<() => void> = [];
  const rebuilds: string[] = [];
  const runtime = new SimulationRuntime({ now: () => now, initialPlayers: new Map(players.map(p => [p.id, p])),
    initialState: { tiles, activeLocks: [] }, scheduleAfter: (_delay, task) => { scheduled.push(task); }, trackSyncMainThreadTask: (phase, details, task) => {
      if (phase === "cached_economy_snapshot_rebuild") rebuilds.push(details?.playerId ?? "");
      return task();
    } });
  return { runtime, players, rebuilds, scheduled, setNow: (value: number) => { now = value; }, advance: () => { now += 60_000; runtime.applyPassiveIncome(now, Number.MAX_SAFE_INTEGER); } };
}

describe("Envoy percentage benefits through accrual and reconnect", () => {
  it("adds an ally's domestic rates without deducting from them or compounding mutual upgrades", async () => {
    const base = fixture([]), shared = fixture(["p", "a"]), one = fixture(["p"]);
    const baseline = base.runtime.exportState();
    const updated = shared.runtime.exportState();
    for (const id of ["p", "a"]) {
      const before = baseline.players.find(p => p.id === id)!;
      const after = updated.players.find(p => p.id === id)!;
      expect(after.incomePerMinute).toBeCloseTo(before.incomePerMinute! * 1.1, 8);
      expect(after.manpowerCap).toBeCloseTo(before.manpowerCap! * 1.1, 8);
      expect(after.manpowerRegenPerMinute).toBeCloseTo(before.manpowerRegenPerMinute! * 1.1, 8);
    }
    expect(one.runtime.exportState().players.find(p => p.id === "a")?.incomePerMinute).toBe(baseline.players.find(p => p.id === "a")?.incomePerMinute);
    const projected = await shared.runtime.exportVisibleStateForPlayerAsync("p", yieldToEventLoop);
    for (const state of [updated, projected]) {
      const login = buildPlayerSubscriptionSnapshot("p", state, { tilesAlreadyVisible: true }).player!;
      const actual = updated.players.find(p => p.id === "p")!;
      expect(login.manpowerCap).toBeCloseTo(actual.manpowerCap!, 8);
      expect(login.manpowerRegenPerMinute).toBeCloseTo(actual.manpowerRegenPerMinute!, 8);
      const source = login.economyBreakdown?.GOLD.sources.find(row => row.label === "Envoy Accreditation");
      expect(source?.amountPerMinute).toBeCloseTo(baseline.players[1]!.incomePerMinute! * 0.1, 8);
      expect(login.incomePerMinute).toBeCloseTo(actual.incomePerMinute!, 8);
    }
    shared.runtime.applyPassiveIncome(1000, Number.MAX_SAFE_INTEGER);
    shared.advance();
    const paid = shared.runtime.exportState().players.find(p => p.id === "p")!;
    expect(paid.points).toBeCloseTo(updated.players.find(p => p.id === "p")!.incomePerMinute!, 8);
    const warmRebuilds = shared.rebuilds.length;
    for (let i = 0; i < 5; i++) shared.runtime.exportState();
    expect(shared.rebuilds.length).toBe(warmRebuilds);
    expect(shared.runtime.exportState().players.find(p => p.id === "p")!.incomePerMinute).toBe(updated.players.find(p => p.id === "p")!.incomePerMinute);
  });

  it("updates a warm recipient when allied production changes and settles its old manpower rate", async () => {
    const game = fixture(["p"], true);
    const before = game.runtime.exportState().players;
    const ownerBefore = before.find(p => p.id === "a")!;
    const recipientBefore = before.find(p => p.id === "p")!;
    const domestic = fixture([]).runtime.exportState().players.find(p => p.id === "p")!;
    expect(recipientBefore.manpowerRegenPerMinute).toBeGreaterThan(domestic.manpowerRegenPerMinute! * 1.1);
    game.setNow(61_000);
    for (const [seq, x] of [[1, 24], [2, 26]] as const) {
      game.runtime.submitCommand({ commandId: `remove-${seq}`, sessionId: "test", playerId: "a", clientSeq: seq,
        issuedAt: 61_000, type: "REMOVE_STRUCTURE", payloadJson: JSON.stringify({ x, y: 5 }) });
      await Promise.resolve();
    }
    const stored = game.runtime.exportSnapshotSections().initialState.players!.find(p => p.id === "p")!;
    expect(stored.manpowerBanked).toBeCloseTo(recipientBefore.manpowerRegenPerMinute!, 8);
    expect(game.scheduled).toHaveLength(2);
    for (const task of game.scheduled.splice(0)) task();
    const after = game.runtime.exportState().players;
    const ownerAfter = after.find(p => p.id === "a")!;
    const recipientAfter = after.find(p => p.id === "p")!;
    expect(ownerAfter.incomePerMinute).toBeLessThan(ownerBefore.incomePerMinute!);
    expect(recipientAfter.incomePerMinute! - domestic.incomePerMinute!).toBeCloseTo(ownerAfter.incomePerMinute! * 0.1, 8);
    expect(recipientAfter.manpowerRegenPerMinute! - domestic.manpowerRegenPerMinute!).toBeCloseTo(ownerAfter.manpowerRegenPerMinute! * 0.1, 8);
  });

  it("removes benefits when an alliance ends and cannot mint manpower by re-forming it", async () => {
    const game = fixture(["p"]);
    const initial = game.runtime.exportState().players.find(p => p.id === "p")!;
    for (const [seq, allied] of [[1, false], [2, true], [3, false], [4, true]] as const) {
      game.runtime.submitCommand({ commandId: `alliance-${seq}`, sessionId: "system-runtime:social", playerId: "p", clientSeq: 0,
        issuedAt: 1000, type: "SYNC_ALLIANCE", payloadJson: JSON.stringify({ targetPlayerId: "a", allied }) });
      await Promise.resolve();
      const state = game.runtime.exportState().players.find(p => p.id === "p")!;
      expect(state.manpower).toBe(initial.manpower);
      expect(state.manpowerCap).toBeCloseTo(allied ? initial.manpowerCap! : initial.manpowerCap! / 1.1, 8);
      expect(state.incomePerMinute).toBeCloseTo(allied ? initial.incomePerMinute! : initial.incomePerMinute! / 1.1, 8);
    }
    const saved = game.runtime.exportSnapshotSections().initialState;
    expect(saved.players![0]).not.toHaveProperty("afcEnvoyIncomePerMinute");
    const restarted = new SimulationRuntime({ now: () => 1000, initialState: saved,
      initialPlayers: createPlayersFromRecoveredState(saved), scheduleAfter: () => {} });
    const restored = restarted.exportState().players.find(p => p.id === "p")!;
    expect(restored.manpower).toBe(initial.manpower);
    expect(restored.manpowerCap).toBeCloseTo(initial.manpowerCap!, 8);
    expect(restored.incomePerMinute).toBeCloseTo(initial.incomePerMinute!, 8);
  });

});
