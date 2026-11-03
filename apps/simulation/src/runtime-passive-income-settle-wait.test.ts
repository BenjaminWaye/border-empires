import { describe, expect, it, vi } from "vitest";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { applyPassiveIncomeForPlayer, type RuntimePassiveIncomeContext } from "./runtime-passive-income.js";
import type { RuntimePlayer } from "./runtime-types.js";

const player = { id: "p1", isAi: false } as RuntimePlayer;

const makeContext = (queued: "awaiting" | "continuation" | "none", lastActiveAtMs: number) => {
  const summary = createEmptyPlayerRuntimeSummary();
  if (queued === "awaiting") summary.devQueue = [{ tileKey: "1,1", x: 1, y: 1, kind: "SETTLE", queuedAt: 0, awaitingManpower: true }];
  // A claim-continuation SETTLE: unreserved, but not waiting for manpower.
  if (queued === "continuation") summary.devQueue = [{ tileKey: "1,1", x: 1, y: 1, kind: "SETTLE", queuedAt: 0 }];
  const tick = vi.fn();
  const ctx: RuntimePassiveIncomeContext = {
    players: new Map([[player.id, player]]),
    lastActiveAtMsByPlayer: new Map([[player.id, lastActiveAtMs]]),
    lastIncomeTickAtMsByPlayer: new Map(),
    cachedEconomySnapshot: () => { throw new Error("not reached on a first tick"); },
    summaryForPlayer: () => summary,
    addStrategicResource: () => {},
    emitPlayerStateUpdate: () => {},
    tickAwaitingSettleEntries: tick
  };
  return { ctx, tick };
};

describe("applyPassiveIncomeForPlayer: queued garrisons waiting for manpower", () => {
  it("runs the waiting-garrison tick when the queue holds an unreserved garrison", () => {
    const { ctx, tick } = makeContext("awaiting", 1_000);
    applyPassiveIncomeForPlayer(ctx, player, 1_000, 60_000);
    expect(tick).toHaveBeenCalledWith(player, 1_000);
  });

  it("still runs it for a player whose income is paused for inactivity -- manpower keeps refilling", () => {
    const { ctx, tick } = makeContext("awaiting", 0);
    applyPassiveIncomeForPlayer(ctx, player, 10_000_000, 60_000);
    expect(tick).toHaveBeenCalledOnce();
  });

  it("skips it with nothing waiting, for continuation garrisons, and on silent pre-change settles", () => {
    const idle = makeContext("none", 1_000);
    applyPassiveIncomeForPlayer(idle.ctx, player, 1_000, 60_000);
    expect(idle.tick).not.toHaveBeenCalled();

    // An online player's continuation SETTLE sits in the queue for the whole
    // settle timer; it must not pull them into a manpower settle every 15 s.
    const continuation = makeContext("continuation", 1_000);
    applyPassiveIncomeForPlayer(continuation.ctx, player, 1_000, 60_000);
    expect(continuation.tick).not.toHaveBeenCalled();

    const silent = makeContext("awaiting", 1_000);
    applyPassiveIncomeForPlayer(silent.ctx, player, 1_000, 60_000, false);
    expect(silent.tick).not.toHaveBeenCalled();
  });
});
