import { describe, expect, it, vi } from "vitest";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { applyPassiveIncomeForPlayer, type RuntimePassiveIncomeContext } from "./runtime-passive-income.js";
import type { RuntimePlayer } from "./runtime-types.js";

const player = { id: "p1", isAi: false } as RuntimePlayer;

const makeContext = (hasUnreservedSettle: boolean, lastActiveAtMs: number) => {
  const summary = createEmptyPlayerRuntimeSummary();
  if (hasUnreservedSettle) summary.devQueue = [{ tileKey: "1,1", x: 1, y: 1, kind: "SETTLE", queuedAt: 0, awaitingManpower: true }];
  const tick = vi.fn();
  const ctx: RuntimePassiveIncomeContext = {
    players: new Map([[player.id, player]]),
    lastActiveAtMsByPlayer: new Map([[player.id, lastActiveAtMs]]),
    lastIncomeTickAtMsByPlayer: new Map(),
    cachedEconomySnapshot: () => { throw new Error("not reached on a first tick"); },
    summaryForPlayer: () => summary,
    addStrategicResource: () => {},
    emitPlayerStateUpdate: () => {},
    tickUnreservedSettleEntries: tick
  };
  return { ctx, tick };
};

describe("applyPassiveIncomeForPlayer: queued garrisons waiting for manpower", () => {
  it("runs the waiting-garrison tick when the queue holds an unreserved garrison", () => {
    const { ctx, tick } = makeContext(true, 1_000);
    applyPassiveIncomeForPlayer(ctx, player, 1_000, 60_000);
    expect(tick).toHaveBeenCalledWith(player, 1_000);
  });

  it("still runs it for a player whose income is paused for inactivity -- manpower keeps refilling", () => {
    const { ctx, tick } = makeContext(true, 0);
    applyPassiveIncomeForPlayer(ctx, player, 10_000_000, 60_000);
    expect(tick).toHaveBeenCalledOnce();
  });

  it("skips it with nothing waiting, and on silent pre-change settles", () => {
    const idle = makeContext(false, 1_000);
    applyPassiveIncomeForPlayer(idle.ctx, player, 1_000, 60_000);
    expect(idle.tick).not.toHaveBeenCalled();

    const silent = makeContext(true, 1_000);
    applyPassiveIncomeForPlayer(silent.ctx, player, 1_000, 60_000, false);
    expect(silent.tick).not.toHaveBeenCalled();
  });
});
