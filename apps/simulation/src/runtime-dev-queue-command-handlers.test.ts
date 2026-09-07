import { describe, expect, it } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  handleDevQueueCancelCommand,
  handleDevQueueEnqueueCommand,
  handleDevQueueMoveToFrontCommand,
  tryDrainDevQueue,
  type RuntimeDevQueueCommandContext
} from "./runtime-dev-queue-command-handlers.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { DevQueueBuildReservation } from "./runtime-dev-queue-build-reservation.js";

const MANPOWER_COST_BY_TYPE: Record<string, number> = { FORT: 300, MINTWORKS: 80 };
const SETTLE_TEST_MANPOWER_COST = 150;

function makeContext(overrides: { manpower: number; hasSlot?: boolean }) {
  const summary: PlayerRuntimeSummary = {
    territoryTileKeys: new Set(),
    frontierTileKeys: new Set(),
    hotFrontierTileKeys: new Set(),
    strategicFrontierTileKeys: new Set(),
    buildCandidateTileKeys: new Set(),
    settledTileCount: 0,
    townCount: 0,
    ownedTownTierByTile: new Map(),
    goldIncomePerMinute: 0,
    strategicProductionPerMinute: { TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0, FOOD: 0 },
    activeDevelopmentProcessCount: 0,
    pendingSettlementsByTile: new Map(),
    fishFoodPerMinute: 0,
    lastActiveAtMs: 0,
    devQueue: [],
    waypointQueue: [],
    claimContinuations: new Map()
  };
  let manpower = overrides.manpower;
  const manpowerCap = 10_000;
  const events: SimulationEvent[] = [];
  const rejections: { code: string; message: string }[] = [];
  const dispatchedBuilds: CommandEnvelope[] = [];
  const playerStateUpdates: Array<{ commandId: string; playerId: string }> = [];
  let hasSlot = overrides.hasSlot ?? false;

  const context: RuntimeDevQueueCommandContext = {
    summaryForPlayer: () => summary,
    now: () => 1000,
    emitEvent: (event) => events.push(event),
    emitPlayerStateUpdate: (command) => playerStateUpdates.push({ commandId: command.commandId, playerId: command.playerId }),
    rejectCommand: (_command, code, message) => rejections.push({ code, message }),
    hasAvailableDevelopmentSlot: () => hasSlot,
    isPlayerOnline: () => false,
    nextDrainCommandId: (playerId, tileKey) => `drain:${playerId}:${tileKey}`,
    dispatchSettle: () => {},
    dispatchBuild: (command) => dispatchedBuilds.push(command),
    dispatchRemoveStructure: () => {},
    estimateBuildReservation: (_playerId, structureType, _x, _y, extraSlotDemand): DevQueueBuildReservation => {
      const manpowerCost = MANPOWER_COST_BY_TYPE[structureType] ?? 0;
      if (manpower < manpowerCost) {
        return { ok: false, code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerCost} manpower` };
      }
      // FORT reserves 1 TITANIUM slot for these tests -- exercises the "other queued entries net into the check" path.
      if (structureType === "FORT" && (extraSlotDemand.TITANIUM ?? 0) >= 1) {
        return { ok: false, code: "INSUFFICIENT_SLOT", message: "no free TITANIUM slot" };
      }
      return {
        ok: true,
        manpowerCost,
        slotRequirements: structureType === "FORT" ? [{ resource: "TITANIUM", count: 1 }] : []
      };
    },
    estimateSettleReservation: (): DevQueueBuildReservation => {
      if (manpower < SETTLE_TEST_MANPOWER_COST) {
        return { ok: false, code: "INSUFFICIENT_MANPOWER", message: `need ${SETTLE_TEST_MANPOWER_COST} manpower to settle` };
      }
      return { ok: true, manpowerCost: SETTLE_TEST_MANPOWER_COST, slotRequirements: [] };
    },
    applyManpowerReservation: (_playerId, amount) => { manpower = Math.max(0, manpower - amount); },
    refundManpowerReservation: (_playerId, amount) => { manpower = Math.min(manpowerCap, manpower + amount); }
  };

  return { context, summary, events, rejections, dispatchedBuilds, playerStateUpdates, getManpower: () => manpower, setHasSlot: (v: boolean) => { hasSlot = v; } };
}

function enqueueCommand(x: number, y: number, structureType: string): CommandEnvelope {
  return {
    commandId: `enqueue:${x},${y}`,
    sessionId: "s",
    playerId: "p1",
    clientSeq: 1,
    issuedAt: 0,
    type: "DEV_QUEUE_ENQUEUE",
    payloadJson: JSON.stringify({ x, y, tileKey: `${x},${y}`, kind: "BUILD", structureType })
  } as unknown as CommandEnvelope;
}

function enqueueSettleCommand(x: number, y: number): CommandEnvelope {
  return {
    commandId: `enqueue-settle:${x},${y}`,
    sessionId: "s",
    playerId: "p1",
    clientSeq: 1,
    issuedAt: 0,
    type: "DEV_QUEUE_ENQUEUE",
    payloadJson: JSON.stringify({ x, y, tileKey: `${x},${y}`, kind: "SETTLE" })
  } as unknown as CommandEnvelope;
}

describe("handleDevQueueEnqueueCommand -- MP/slot reservation", () => {
  it("reserves manpower immediately and stores it on the queued entry", () => {
    const { context, summary, getManpower } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    expect(getManpower()).toBe(700);
    expect(summary.devQueue).toEqual([expect.objectContaining({ tileKey: "1,1", reservedManpower: 300 })]);
  });

  it("rejects the enqueue (without touching manpower) when the player can't afford it", () => {
    const { context, summary, getManpower, rejections } = makeContext({ manpower: 100 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    expect(getManpower()).toBe(100);
    expect(summary.devQueue).toEqual([]);
    expect(rejections).toEqual([{ code: "INSUFFICIENT_MANPOWER", message: "need 300 manpower" }]);
  });

  it("pushes a live PLAYER_UPDATE on a successful enqueue, cancel, and move-to-front", () => {
    // Regression: same root cause and fix as the waypoint queue's identical
    // bug (PR #1633) -- enqueueing/cancelling/reordering only emitted
    // COMMAND_RESOLVED, which marks the durable command resolved but never
    // touches the gateway's per-player subscribe-snapshot cache. Since this
    // queue also reserves manpower up front, a stale cache misrepresents the
    // player's manpower too, not just devQueue, until some unrelated action
    // happens to push a fresh update.
    const { context, playerStateUpdates } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    handleDevQueueEnqueueCommand(context, enqueueCommand(2, 2, "MINTWORKS"));
    expect(playerStateUpdates).toEqual([
      { commandId: "enqueue:1,1", playerId: "p1" },
      { commandId: "enqueue:2,2", playerId: "p1" }
    ]);

    handleDevQueueMoveToFrontCommand(context, {
      commandId: "move",
      sessionId: "s",
      playerId: "p1",
      clientSeq: 3,
      issuedAt: 0,
      type: "DEV_QUEUE_MOVE_TO_FRONT",
      payloadJson: JSON.stringify({ tileKey: "2,2" })
    } as unknown as CommandEnvelope);
    handleDevQueueCancelCommand(context, {
      commandId: "cancel",
      sessionId: "s",
      playerId: "p1",
      clientSeq: 4,
      issuedAt: 0,
      type: "DEV_QUEUE_CANCEL",
      payloadJson: JSON.stringify({ tileKey: "1,1" })
    } as unknown as CommandEnvelope);
    expect(playerStateUpdates).toEqual([
      { commandId: "enqueue:1,1", playerId: "p1" },
      { commandId: "enqueue:2,2", playerId: "p1" },
      { commandId: "move", playerId: "p1" },
      { commandId: "cancel", playerId: "p1" }
    ]);
  });

  it("does not push a PLAYER_UPDATE when the enqueue is rejected", () => {
    const { context, playerStateUpdates } = makeContext({ manpower: 100 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    expect(playerStateUpdates).toHaveLength(0);
  });

  it("rejects a second slot-conflicting queue entry once an earlier queued entry already claims the slot", () => {
    const { context, summary, getManpower, rejections } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    handleDevQueueEnqueueCommand(context, enqueueCommand(2, 2, "FORT"));
    expect(summary.devQueue).toHaveLength(1);
    expect(getManpower()).toBe(700);
    expect(rejections).toEqual([{ code: "INSUFFICIENT_SLOT", message: "no free TITANIUM slot" }]);
  });

  it("refunds the reservation if anything throws between taking it and the entry owning it", () => {
    const { context, summary, getManpower } = makeContext({ manpower: 1000 });
    // now() is called while building the queue entry -- i.e. after the
    // manpower is debited but before the queue owns the refund obligation.
    context.now = () => { throw new Error("boom"); };
    expect(() => handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"))).toThrow("boom");
    expect(getManpower()).toBe(1000); // never stranded
    expect(summary.devQueue).toEqual([]);
  });

  it("does not double-refund when the entry was queued successfully but a later step throws", () => {
    const { context, summary, getManpower } = makeContext({ manpower: 1000 });
    // emitEvent runs after the entry owns the reservation -- the queued entry
    // still owes that refund, so it must NOT be handed back here too.
    context.emitEvent = () => { throw new Error("emit failed"); };
    expect(() => handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"))).toThrow("emit failed");
    expect(getManpower()).toBe(700);
    expect(summary.devQueue).toEqual([expect.objectContaining({ tileKey: "1,1", reservedManpower: 300 })]);
  });

  it("refunds the reservation on cancel", () => {
    const { context, summary, getManpower } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    expect(getManpower()).toBe(700);
    handleDevQueueCancelCommand(context, {
      commandId: "cancel",
      sessionId: "s",
      playerId: "p1",
      clientSeq: 2,
      issuedAt: 0,
      type: "DEV_QUEUE_CANCEL",
      payloadJson: JSON.stringify({ tileKey: "1,1" })
    } as unknown as CommandEnvelope);
    expect(getManpower()).toBe(1000);
    expect(summary.devQueue).toEqual([]);
  });

  it("refunds the reservation before dispatching the real build command on drain, so the build handler re-charges fresh", () => {
    const { context, summary, getManpower, dispatchedBuilds } = makeContext({ manpower: 1000, hasSlot: true });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    expect(getManpower()).toBe(1000); // refunded immediately post-enqueue since a slot was free -- that's the dispatched build handler's job now
    expect(summary.devQueue).toEqual([]);
    expect(dispatchedBuilds).toHaveLength(1);
    expect(dispatchedBuilds[0]?.type).toBe("BUILD_STRUCTURE");
  });

  it("holds the reservation while queued and refunds it right before draining once a slot frees up", () => {
    const { context, summary, getManpower, dispatchedBuilds } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    expect(getManpower()).toBe(700);
    expect(summary.devQueue).toHaveLength(1);
    context.hasAvailableDevelopmentSlot = () => true;
    tryDrainDevQueue(context, "p1");
    expect(getManpower()).toBe(1000);
    expect(summary.devQueue).toEqual([]);
    expect(dispatchedBuilds).toHaveLength(1);
  });

  // Regression: the server-side auto-drain used to fire on every slot-free
  // event regardless of whether the player's own client was connected and
  // already draining the same queue itself (client-queue-logic.ts's
  // processDevelopmentQueue). Both sides could dispatch the same queued
  // entry -- the loser hit a real BUILD_STRUCTURE handler rejection
  // (BUILD_INVALID "tile already has structure") since the structure the
  // winner just built is now sitting on the tile. The waypoint/expand queue
  // already had this exact guard (runtime-waypoint-drain.ts's isPlayerOnline
  // check, backed by WaypointDrainScheduler's offline grace period) -- the
  // dev queue never got the equivalent, so this pins the fix in place.
  it("does not drain while the player is online -- an online client owns dispatch itself", () => {
    const { context, summary, getManpower, dispatchedBuilds } = makeContext({ manpower: 1000, hasSlot: true });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    expect(dispatchedBuilds).toHaveLength(1); // enqueue itself drains once a slot's already free
    expect(summary.devQueue).toEqual([]);

    // Simulate the entry sitting queued behind a busy slot, with the player online.
    summary.devQueue = [{ kind: "BUILD", x: 2, y: 2, tileKey: "2,2", structureType: "MINTWORKS", queuedAt: 0 } as never];
    context.isPlayerOnline = () => true;
    tryDrainDevQueue(context, "p1");
    expect(summary.devQueue).toHaveLength(1); // untouched -- the drain stood down
    expect(dispatchedBuilds).toHaveLength(1); // no second dispatch
    expect(getManpower()).toBe(1000);
  });

  it("still drains once the player goes offline", () => {
    const { context, summary, dispatchedBuilds } = makeContext({ manpower: 1000, hasSlot: true });
    summary.devQueue = [{ kind: "BUILD", x: 2, y: 2, tileKey: "2,2", structureType: "MINTWORKS", queuedAt: 0 } as never];
    context.isPlayerOnline = () => false;
    tryDrainDevQueue(context, "p1");
    expect(summary.devQueue).toEqual([]);
    expect(dispatchedBuilds).toHaveLength(1);
  });
});

describe("handleDevQueueEnqueueCommand -- SETTLE manpower reservation", () => {
  // Regression for the "queued SETTLE doesn't deduct MP until it drains"
  // bug: SETTLE entries used to reserve nothing (isReservableBuildEntry only
  // matched BUILD), so a player could stack more queued settles than their
  // manpower could actually cover.
  it("reserves manpower immediately when a SETTLE is queued", () => {
    const { context, summary, getManpower } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueSettleCommand(1, 1));
    expect(getManpower()).toBe(1000 - SETTLE_TEST_MANPOWER_COST);
    expect(summary.devQueue).toEqual([expect.objectContaining({ tileKey: "1,1", kind: "SETTLE", reservedManpower: SETTLE_TEST_MANPOWER_COST })]);
  });

  it("rejects a queued SETTLE the player can't afford, without touching manpower", () => {
    const { context, summary, getManpower, rejections } = makeContext({ manpower: 100 });
    handleDevQueueEnqueueCommand(context, enqueueSettleCommand(1, 1));
    expect(getManpower()).toBe(100);
    expect(summary.devQueue).toEqual([]);
    expect(rejections).toEqual([{ code: "INSUFFICIENT_MANPOWER", message: `need ${SETTLE_TEST_MANPOWER_COST} manpower to settle` }]);
  });

  it("refunds the SETTLE reservation on cancel", () => {
    const { context, summary, getManpower } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueSettleCommand(1, 1));
    expect(getManpower()).toBe(1000 - SETTLE_TEST_MANPOWER_COST);
    handleDevQueueCancelCommand(context, {
      commandId: "cancel",
      sessionId: "s",
      playerId: "p1",
      clientSeq: 2,
      issuedAt: 0,
      type: "DEV_QUEUE_CANCEL",
      payloadJson: JSON.stringify({ tileKey: "1,1" })
    } as unknown as CommandEnvelope);
    expect(getManpower()).toBe(1000);
    expect(summary.devQueue).toEqual([]);
  });

  it("holds the SETTLE reservation while queued and refunds it right before draining, so the real SETTLE handler re-charges fresh", () => {
    const { context, summary, getManpower, dispatchedBuilds } = makeContext({ manpower: 1000 });
    const dispatchedSettles: CommandEnvelope[] = [];
    context.dispatchSettle = (command) => dispatchedSettles.push(command);
    handleDevQueueEnqueueCommand(context, enqueueSettleCommand(1, 1));
    expect(getManpower()).toBe(1000 - SETTLE_TEST_MANPOWER_COST);
    context.hasAvailableDevelopmentSlot = () => true;
    tryDrainDevQueue(context, "p1");
    expect(getManpower()).toBe(1000);
    expect(summary.devQueue).toEqual([]);
    expect(dispatchedSettles).toHaveLength(1);
    expect(dispatchedBuilds).toHaveLength(0);
  });
});
