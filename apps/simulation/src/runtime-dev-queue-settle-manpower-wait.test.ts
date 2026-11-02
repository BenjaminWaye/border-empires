import { describe, expect, it } from "vitest";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { createEmptyPlayerRuntimeSummary, type ServerDevQueueEntry } from "./player-runtime-summary.js";
import type { DevQueueBuildReservation } from "./runtime-dev-queue-build-reservation.js";
import {
  releaseQueuedSettleReservation,
  tickUnreservedSettleEntries,
  tryDrainDevQueue,
  type RuntimeDevQueueCommandContext
} from "./runtime-dev-queue-command-handlers.js";
import { reserveAwaitingSettleManpower } from "./runtime-dev-queue-settle-manpower-wait.js";

const SETTLE_COST = 10;

const makeContext = (startManpower: number, opts: { online?: boolean; hasSlot?: boolean } = {}) => {
  const summary = createEmptyPlayerRuntimeSummary();
  let manpower = startManpower;
  const dispatchedSettles: CommandEnvelope[] = [];
  const playerStateUpdates: string[] = [];
  const context: RuntimeDevQueueCommandContext = {
    summaryForPlayer: () => summary,
    now: () => 1000,
    emitEvent: () => {},
    emitPlayerStateUpdate: (command) => playerStateUpdates.push(command.commandId),
    rejectCommand: () => {},
    hasAvailableDevelopmentSlot: () => opts.hasSlot ?? true,
    isPlayerOnline: () => opts.online ?? false,
    nextDrainCommandId: (playerId, tileKey) => `drain:${playerId}:${tileKey}`,
    dispatchSettle: (command) => dispatchedSettles.push(command),
    dispatchBuild: () => {},
    dispatchRemoveStructure: () => {},
    estimateBuildReservation: (): DevQueueBuildReservation => ({ ok: true, manpowerCost: 0, slotRequirements: [] }),
    estimateSettleReservation: (): DevQueueBuildReservation =>
      manpower < SETTLE_COST
        ? { ok: false, code: "INSUFFICIENT_MANPOWER", message: "need 10 manpower to garrison" }
        : { ok: true, manpowerCost: SETTLE_COST, slotRequirements: [] },
    applyManpowerReservation: (_playerId, amount) => { manpower -= amount; },
    refundManpowerReservation: (_playerId, amount) => { manpower += amount; }
  };
  return {
    context,
    summary,
    dispatchedSettles,
    playerStateUpdates,
    getManpower: () => manpower,
    setManpower: (value: number) => { manpower = value; }
  };
};

const settleEntry = (tileKey: string, extra: Partial<ServerDevQueueEntry> = {}): ServerDevQueueEntry => {
  const [x, y] = tileKey.split(",").map(Number);
  return { tileKey, x: x!, y: y!, kind: "SETTLE", queuedAt: 0, ...extra };
};

describe("queued garrisons waiting for manpower", () => {
  it("reserves waiting garrisons in queue order once a refill batch covers them, stopping at the first it can't", () => {
    const { context, summary, getManpower } = makeContext(15);
    summary.devQueue = [settleEntry("1,1", { awaitingManpower: true }), settleEntry("2,2", { awaitingManpower: true })];

    expect(reserveAwaitingSettleManpower(context, "p1")).toBe(1);
    expect(getManpower()).toBe(5);
    expect(summary.devQueue[0]).toEqual(expect.objectContaining({ tileKey: "1,1", reservedManpower: SETTLE_COST }));
    expect(summary.devQueue[0]?.awaitingManpower).toBeUndefined();
    expect(summary.devQueue[1]).toEqual(expect.objectContaining({ tileKey: "2,2", awaitingManpower: true }));
  });

  it("leaves continuation garrisons (no awaiting flag) unreserved", () => {
    const { context, summary, getManpower } = makeContext(100);
    summary.devQueue = [settleEntry("1,1")];
    expect(reserveAwaitingSettleManpower(context, "p1")).toBe(0);
    expect(getManpower()).toBe(100);
  });

  it("does not drain an unreserved garrison the pool can't cover -- it waits instead of being dispatched and refused", () => {
    const { context, summary, dispatchedSettles, setManpower } = makeContext(0);
    summary.devQueue = [settleEntry("1,1")];
    tryDrainDevQueue(context, "p1");
    expect(dispatchedSettles).toHaveLength(0);
    expect(summary.devQueue.map((entry) => entry.tileKey)).toEqual(["1,1"]);

    setManpower(SETTLE_COST);
    tryDrainDevQueue(context, "p1");
    expect(dispatchedSettles).toHaveLength(1);
    expect(summary.devQueue).toEqual([]);
  });

  it("tick: reserves a waiting garrison once its batch lands, pushes a PLAYER_UPDATE, then drains it for an offline player", () => {
    const { context, summary, dispatchedSettles, playerStateUpdates, getManpower, setManpower } = makeContext(0);
    summary.devQueue = [settleEntry("1,1", { awaitingManpower: true })];

    tickUnreservedSettleEntries(context, "p1");
    expect(playerStateUpdates).toEqual([]);
    expect(dispatchedSettles).toHaveLength(0);

    setManpower(40); // a refill batch landed
    tickUnreservedSettleEntries(context, "p1");
    expect(playerStateUpdates).toHaveLength(1);
    expect(dispatchedSettles).toHaveLength(1);
    // Reserved, then refunded just before dispatch so the SETTLE handler charges it fresh.
    expect(getManpower()).toBe(40);
    expect(summary.devQueue).toEqual([]);
  });

  it("tick: reserves but leaves dispatch to an online client", () => {
    const { context, summary, dispatchedSettles, getManpower } = makeContext(40, { online: true });
    summary.devQueue = [settleEntry("1,1", { awaitingManpower: true })];
    tickUnreservedSettleEntries(context, "p1");
    expect(dispatchedSettles).toHaveLength(0);
    expect(getManpower()).toBe(30);
    expect(summary.devQueue[0]?.reservedManpower).toBe(SETTLE_COST);
  });
});

describe("releaseQueuedSettleReservation", () => {
  // Regression: an online client sends a reserved queued garrison itself and
  // follows it with DEV_QUEUE_CANCEL, but the cancel rides the non-interactive
  // lane and could land after the SETTLE -- which was then charged from a pool
  // already short the 10 its own queue entry held, and refused.
  it("hands back a reserved garrison's manpower and drops the entry before the SETTLE is charged", () => {
    const { context, summary, getManpower } = makeContext(5);
    summary.devQueue = [settleEntry("1,1", { reservedManpower: SETTLE_COST })];
    releaseQueuedSettleReservation(context, "p1", "1,1");
    expect(getManpower()).toBe(15);
    expect(summary.devQueue).toEqual([]);
  });

  it("drops a still-waiting entry so the tick can't reserve for a garrison already sent", () => {
    const { context, summary, getManpower } = makeContext(20);
    summary.devQueue = [settleEntry("1,1", { awaitingManpower: true })];
    releaseQueuedSettleReservation(context, "p1", "1,1");
    expect(getManpower()).toBe(20);
    expect(summary.devQueue).toEqual([]);
  });

  it("leaves continuation garrisons and other tiles alone", () => {
    const { context, summary } = makeContext(20);
    summary.devQueue = [settleEntry("1,1"), settleEntry("2,2", { reservedManpower: SETTLE_COST })];
    releaseQueuedSettleReservation(context, "p1", "1,1");
    expect(summary.devQueue.map((entry) => entry.tileKey)).toEqual(["1,1", "2,2"]);
  });
});
