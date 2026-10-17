import { describe, expect, it, vi } from "vitest";
import { PASSIVE_INCOME_INACTIVITY_CAP_MS } from "@border-empires/game-domain";
import { applyEconomyAccrual, offsetGoldUpkeepWhileIncomePaused, type RuntimeUpkeepAccrualContext } from "./runtime-upkeep-accrual.js";
import type { RuntimePlayer, UpkeepNeed } from "./runtime-types.js";
import type { PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import { createEmptyPlayerRuntimeSummary, type PlayerRuntimeSummary } from "./player-runtime-summary.js";

const testPlayer = (id: string, overrides: Partial<RuntimePlayer> = {}): RuntimePlayer => ({
  id,
  isAi: false,
  points: 100,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
  ...overrides
});

type HarnessOptions = {
  upkeep?: { gold?: number; food?: number; titanium?: number; crystal?: number; umbrite?: number };
  incomePerMinute?: number;
};

const createHarness = (options: HarnessOptions = {}) => {
  const lastEconomyAccrualAtByPlayer = new Map<string, number>();
  const lastActiveAtMsByPlayer = new Map<string, number>();
  const playerSummaries = new Map<string, PlayerRuntimeSummary>();
  const cachedEconomySnapshot = vi.fn(
    () => ({ incomePerMinute: options.incomePerMinute ?? 0 }) as unknown as PlayerUpdateEconomySnapshot
  );

  const ctx: RuntimeUpkeepAccrualContext = {
    tiles: new Map(),
    dockLinksByDockTileKey: new Map(),
    lastEconomyAccrualAtByPlayer,
    lastActiveAtMsByPlayer,
    playerSummaries,
    cachedUpkeepAccrual: () => ({
      gold: options.upkeep?.gold ?? 0,
      food: options.upkeep?.food ?? 0,
      titanium: options.upkeep?.titanium ?? 0,
      crystal: options.upkeep?.crystal ?? 0,
      umbrite: options.upkeep?.umbrite ?? 0
    }),
    cachedEconomySnapshot,
    summaryForPlayer: (playerId) => playerSummaries.get(playerId) ?? createEmptyPlayerRuntimeSummary()
  };

  return { ctx, lastEconomyAccrualAtByPlayer, lastActiveAtMsByPlayer, playerSummaries, cachedEconomySnapshot };
};

const goldNeed = (gold: number): UpkeepNeed => ({ gold, FOOD: 1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });

describe("offsetGoldUpkeepWhileIncomePaused", () => {
  const nowMs = 10 * PASSIVE_INCOME_INACTIVITY_CAP_MS;
  const longInactive = nowMs - PASSIVE_INCOME_INACTIVITY_CAP_MS - 1;

  it("leaves gold need untouched for an active human (income is credited to the treasury separately)", () => {
    const { ctx, lastActiveAtMsByPlayer, cachedEconomySnapshot } = createHarness({ incomePerMinute: 10 });
    const onNetted = vi.fn();
    ctx.onUpkeepNettedWhileIncomePaused = onNetted;
    lastActiveAtMsByPlayer.set("player-1", nowMs - 60_000);
    const need = goldNeed(2);

    offsetGoldUpkeepWhileIncomePaused(ctx, testPlayer("player-1"), need, 1, nowMs);

    expect(need.gold).toBe(2);
    expect(cachedEconomySnapshot).not.toHaveBeenCalled();
    expect(onNetted).not.toHaveBeenCalled();
  });

  it("nets gold need against income while a human's passive income is paused for inactivity", () => {
    const { ctx, lastActiveAtMsByPlayer } = createHarness({ incomePerMinute: 1.5 });
    const onNetted = vi.fn();
    ctx.onUpkeepNettedWhileIncomePaused = onNetted;
    lastActiveAtMsByPlayer.set("player-1", longInactive);
    const need = goldNeed(2);

    offsetGoldUpkeepWhileIncomePaused(ctx, testPlayer("player-1"), need, 1, nowMs);

    expect(need.gold).toBeCloseTo(0.5, 6);
    expect(need.FOOD).toBe(1);
    // The counter is the only production signal that this offset ever engages.
    expect(onNetted).toHaveBeenCalledWith("player-1");
  });

  it("clamps at zero when income covers the whole upkeep", () => {
    const { ctx, lastActiveAtMsByPlayer } = createHarness({ incomePerMinute: 10 });
    lastActiveAtMsByPlayer.set("player-1", longInactive);
    const need = goldNeed(2);

    offsetGoldUpkeepWhileIncomePaused(ctx, testPlayer("player-1"), need, 1, nowMs);

    expect(need.gold).toBe(0);
  });

  it("never nets for an AI player — AI is exempt from the inactivity pause", () => {
    const { ctx, cachedEconomySnapshot } = createHarness({ incomePerMinute: 10 });
    const need = goldNeed(2);

    offsetGoldUpkeepWhileIncomePaused(ctx, testPlayer("ai-1", { isAi: true }), need, 1, nowMs);

    expect(need.gold).toBe(2);
    expect(cachedEconomySnapshot).not.toHaveBeenCalled();
  });
});

describe("applyEconomyAccrual", () => {
  it("records the first-seen timestamp without applying any upkeep", () => {
    const player = testPlayer("player-1");
    const { ctx, lastEconomyAccrualAtByPlayer } = createHarness({ upkeep: { gold: 10 } });

    applyEconomyAccrual(ctx, player, 1_000);

    expect(lastEconomyAccrualAtByPlayer.get("player-1")).toBe(1_000);
    expect(player.points).toBe(100);
  });

  it("is a no-op while under the 15s rate-limit window, and does not move the anchor", () => {
    const player = testPlayer("player-1");
    const { ctx, playerSummaries, lastEconomyAccrualAtByPlayer } = createHarness({ upkeep: { gold: 10 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 14_999);

    expect(lastEconomyAccrualAtByPlayer.get("player-1")).toBe(1_000);
    expect(player.points).toBe(100);
  });

  it("skips upkeep work but still advances the anchor when the player has no summary yet", () => {
    const player = testPlayer("player-1");
    const cachedUpkeepAccrual = vi.fn();
    const { ctx, lastEconomyAccrualAtByPlayer } = createHarness();
    ctx.cachedUpkeepAccrual = cachedUpkeepAccrual;
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    expect(cachedUpkeepAccrual).not.toHaveBeenCalled();
    expect(lastEconomyAccrualAtByPlayer.get("player-1")).toBe(16_000);
  });

  it("drains gold and strategic upkeep from points/stockpile once 15s have elapsed", () => {
    const player = testPlayer("player-1", { points: 100, strategicResources: { FOOD: 10, TITANIUM: 10, CRYSTAL: 10, UMBRITE: 10, SHARD: 0 } });
    const { ctx, playerSummaries, lastActiveAtMsByPlayer } = createHarness({ upkeep: { gold: 2, food: 1, titanium: 1, crystal: 1, umbrite: 1 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    lastActiveAtMsByPlayer.set("player-1", 1_000);
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    // 15s = 0.25 minutes of upkeep at the configured per-minute rates.
    expect(player.points).toBeCloseTo(100 - 0.5, 6);
    expect(player.strategicResources?.FOOD).toBeCloseTo(10 - 0.25, 6);
    expect(player.strategicResources?.TITANIUM).toBeCloseTo(10 - 0.25, 6);
    expect(player.strategicResources?.CRYSTAL).toBeCloseTo(10 - 0.25, 6);
    expect(player.strategicResources?.UMBRITE).toBeCloseTo(10 - 0.25, 6);
  });

  it("never drops points/stockpiles below zero", () => {
    const player = testPlayer("player-1", { points: 0.1, strategicResources: { FOOD: 0.1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } });
    const { ctx, playerSummaries, lastActiveAtMsByPlayer } = createHarness({ upkeep: { gold: 100, food: 100 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    lastActiveAtMsByPlayer.set("player-1", 1_000);
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    expect(player.points).toBe(0);
    expect(player.strategicResources?.FOOD).toBe(0);
  });

  // Regression: upkeep used to be drained first from a phantom per-tile yield
  // buffer — gold the passive-income tick ALSO credited to the treasury — so
  // an active player's converter upkeep was partly or wholly never charged.
  it("charges an active player's full gold upkeep even when their income would cover it", () => {
    const player = testPlayer("player-1", { points: 100 });
    const { ctx, playerSummaries, lastActiveAtMsByPlayer } = createHarness({ upkeep: { gold: 2 }, incomePerMinute: 50 });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    lastActiveAtMsByPlayer.set("player-1", 1_000);
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    expect(player.points).toBeCloseTo(100 - 0.5, 6);
  });

  it("keeps a long-offline player's treasury intact when their income covers gold upkeep", () => {
    const start = PASSIVE_INCOME_INACTIVITY_CAP_MS + 10_000;
    const player = testPlayer("player-1", { points: 100 });
    const { ctx, playerSummaries, lastActiveAtMsByPlayer } = createHarness({ upkeep: { gold: 2 }, incomePerMinute: 3 });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    lastActiveAtMsByPlayer.set("player-1", 0);
    applyEconomyAccrual(ctx, player, start);

    applyEconomyAccrual(ctx, player, start + 15_000);

    expect(player.points).toBe(100);
  });

  it("charges a long-offline player only the shortfall when gold upkeep exceeds income", () => {
    const start = PASSIVE_INCOME_INACTIVITY_CAP_MS + 10_000;
    const player = testPlayer("player-1", { points: 100 });
    const { ctx, playerSummaries, lastActiveAtMsByPlayer } = createHarness({ upkeep: { gold: 4 }, incomePerMinute: 1 });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    lastActiveAtMsByPlayer.set("player-1", 0);
    applyEconomyAccrual(ctx, player, start);

    applyEconomyAccrual(ctx, player, start + 15_000);

    // (4 - 1) gold/min * 0.25 min.
    expect(player.points).toBeCloseTo(100 - 0.75, 6);
  });

  it("runs the accrual work through trackSyncMainThreadTask when provided", () => {
    const player = testPlayer("player-1");
    const { ctx, playerSummaries, lastActiveAtMsByPlayer } = createHarness({ upkeep: { gold: 4 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    lastActiveAtMsByPlayer.set("player-1", 1_000);
    const trackSyncMainThreadTask = vi.fn((_label: string, _meta: unknown, run: () => void) => run());
    ctx.trackSyncMainThreadTask = trackSyncMainThreadTask;
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    expect(trackSyncMainThreadTask).toHaveBeenCalledTimes(1);
    expect(trackSyncMainThreadTask.mock.calls[0]?.[0]).toBe("apply_economy_accrual");
    expect(trackSyncMainThreadTask.mock.calls[0]?.[1]).toEqual({ playerId: "player-1" });
    expect(player.points).toBeCloseTo(100 - 1, 6);
  });
});
