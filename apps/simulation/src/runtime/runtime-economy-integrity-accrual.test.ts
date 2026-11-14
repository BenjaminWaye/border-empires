import { describe, expect, it, vi } from "vitest";
import { empireIntegrity, integrityEconomyMult } from "@border-empires/shared";
import type { RuntimePlayer } from "../runtime-types.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { PlayerDefensibilityMetrics } from "../player-defensibility-metrics.js";
import type { PlayerUpdateEconomySnapshot } from "../player-update-economy/player-update-economy.js";
import { cachedEconomySnapshot, type RuntimeEconomyCacheContext as Ctx } from "./runtime-economy.js";

// Production runs with EMPIRE_INTEGRITY_ENABLED=true (deploy/env/*.env); the
// default test env does not, so pin it here.
vi.mock("@border-empires/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@border-empires/shared")>()),
  EMPIRE_INTEGRITY_ENABLED: true
}));

// A compact 3x3 empire's exposure, and one far below 100% integrity.
const METRICS: PlayerDefensibilityMetrics = { T: 9, E: 12, Ts: 9, Es: 12 };
const RAW_INCOME_PER_MINUTE = 0.025;

vi.mock("../player-defensibility-metrics.js", () => ({
  buildPlayerDefensibilityMetrics: () => METRICS
}));
vi.mock("../player-update-economy/player-update-economy.js", () => ({
  buildPlayerUpdateEconomySnapshot: (_p: unknown, _s: unknown, _t: unknown, _d: unknown, integrityEconMult = 1) => ({
    incomePerMinute: RAW_INCOME_PER_MINUTE * integrityEconMult,
    integrityEconMult,
    strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
    upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
    upkeepLastTick: { foodCoverage: 1, gold: { contributors: [] }, food: { contributors: [] }, titanium: { contributors: [] }, crystal: { contributors: [] }, umbrite: { contributors: [] } },
    economyBreakdown: { GOLD: { sources: [], sinks: [] }, FOOD: { sources: [], sinks: [] }, TITANIUM: { sources: [], sinks: [] }, CRYSTAL: { sources: [], sinks: [] }, UMBRITE: { sources: [], sinks: [] } }
  })
}));


const player = { id: "p1", isAi: false, allies: new Set<string>(), truces: new Set<string>(), techIds: new Set<string>() } as unknown as RuntimePlayer;

const makeCtx = (): Ctx => ({
  now: () => 1_000,
  tiles: new Map(),
  dockLinksByDockTileKey: new Map(),
  players: new Map([[player.id, player]]),
  economySnapshotCacheByPlayer: new Map<string, PlayerUpdateEconomySnapshot>(),
  economySnapshotDirtyPlayerIds: new Set(),
  economySnapshotLastRebuiltAtMsByPlayer: new Map(),
  defensibilityMetricsCacheByPlayer: new Map(),
  defensibilityMetricsDirtyPlayerIds: new Set(),
  defensibilityMetricsLastRebuiltAtMsByPlayer: new Map(),
  upkeepAccrualReadCountByPlayer: new Map(),
  upkeepAccrualCacheByPlayer: new Map(),
  settledTilesForPlayer: () => [],
  cachedTownNetworkForPlayer: () => new Map(),
  foodDormantTownKeysForPlayer: () => new Set(),
  dormantEconomicStructureKeysForPlayer: () => new Set(),
  summaryForPlayer: () => ({ territoryTileKeys: new Set<string>() }) as unknown as PlayerRuntimeSummary,
  runtimeLogInfo: () => undefined
});

const expectedMult = integrityEconomyMult(empireIntegrity(METRICS.Ts, METRICS.Es));

describe("cachedEconomySnapshot applies the Empire Integrity income multiplier on every path", () => {
  it("guards the fixture: this empire's integrity changes income", () => {
    expect(expectedMult).not.toBe(1);
  });

  // Regression: passive income (and login snapshots) read the economy cache
  // before any player update warmed the defensibility cache, so the snapshot
  // was built — and cached — at 1x. Accrual then paid the unbonused rate
  // while the Integrity panel promised the bonus (playtest: 36.4/day accrued
  // vs 40.8/day promised).
  it("credits the bonused rate when the accrual path reads a cold cache first", () => {
    const ctx = makeCtx();
    const snapshot = cachedEconomySnapshot(ctx, player);
    expect(snapshot.integrityEconMult).toBe(expectedMult);
    expect(snapshot.incomePerMinute).toBeCloseTo(RAW_INCOME_PER_MINUTE * expectedMult, 9);
  });

  it("rebuilds a snapshot cached at a stale multiplier instead of serving it", () => {
    const ctx = makeCtx();
    ctx.economySnapshotCacheByPlayer.set(player.id, { incomePerMinute: RAW_INCOME_PER_MINUTE, integrityEconMult: 1 } as PlayerUpdateEconomySnapshot);
    expect(cachedEconomySnapshot(ctx, player).incomePerMinute).toBeCloseTo(RAW_INCOME_PER_MINUTE * expectedMult, 9);
  });

  it("still serves a clean snapshot built at the current multiplier from cache", () => {
    const ctx = makeCtx();
    const first = cachedEconomySnapshot(ctx, player);
    expect(cachedEconomySnapshot(ctx, player)).toBe(first);
  });
});
