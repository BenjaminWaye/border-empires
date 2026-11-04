import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { createPlayersFromRecoveredState } from "../runtime-hydration.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { buildPlayerSubscriptionSnapshot } from "../player-snapshot/player-snapshot.js";
import { yieldToEventLoop } from "../event-loop-yield.js";

function fixture(upgrades: readonly string[], production = false, relation: "ally" | "truce" = "ally") {
  let now = 1000;
  const players = ["p", "a"].map(id => buildPlayer(id, { points: 0, manpower: 0, manpowerUpdatedAt: now,
    landingReserveGranted: true, afcUpgradeRuleset: "afc-v1",
    ...(relation === "ally" ? { allies: new Set([id === "p" ? "a" : "p"]) } : { truces: new Set([id === "p" ? "a" : "p"]) }),
    domainIds: new Set(id === "p" ? upgrades : []) }));
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

describe("Envoy Accreditation and Allied Levies through accrual and reconnect", () => {
  it("adds 10% of the House's own Coin per active truce, without touching the partner", async () => {
    const base = fixture([], false, "truce"), envoy = fixture(["afc-chancery-1"], false, "truce");
    const before = base.runtime.exportState().players;
    const after = envoy.runtime.exportState();
    const own = after.players.find(p => p.id === "p")!;
    expect(own.incomePerMinute).toBeCloseTo(before.find(p => p.id === "p")!.incomePerMinute! * 1.1, 8);
    expect(after.players.find(p => p.id === "a")!.incomePerMinute).toBeCloseTo(before.find(p => p.id === "a")!.incomePerMinute!, 8);
    const projected = await envoy.runtime.exportVisibleStateForPlayerAsync("p", yieldToEventLoop);
    for (const state of [after, projected]) {
      const login = buildPlayerSubscriptionSnapshot("p", state, { tilesAlreadyVisible: true }).player!;
      const source = login.economyBreakdown?.GOLD.sources.find(row => row.label === "Envoy Accreditation");
      expect(source?.amountPerMinute).toBeCloseTo(before.find(p => p.id === "p")!.incomePerMinute! * 0.1, 8);
      expect(login.incomePerMinute).toBeCloseTo(own.incomePerMinute!, 8);
    }
  });

  it("raises the House's manpower cap and refill by 15% per mutual ally with Allied Levies", () => {
    const base = fixture([], true), levies = fixture(["afc-chancery-3"], true);
    const before = base.runtime.exportState().players.find(p => p.id === "p")!;
    const after = levies.runtime.exportState().players.find(p => p.id === "p")!;
    expect(after.manpowerCap).toBeCloseTo(before.manpowerCap! * 1.15, 8);
    expect(after.manpowerRegenPerMinute).toBeCloseTo(before.manpowerRegenPerMinute! * 1.15, 8);
    expect(levies.runtime.exportState().players.find(p => p.id === "a")!.manpowerCap).toBeCloseTo(base.runtime.exportState().players.find(p => p.id === "a")!.manpowerCap!, 8);
  });
});
