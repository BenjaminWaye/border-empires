import { describe, expect, it } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import {
  handleDevQueueCancelCommand,
  handleDevQueueEnqueueCommand,
  tryDrainDevQueue,
  type RuntimeDevQueueCommandContext
} from "./runtime-dev-queue-command-handlers.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { DevQueueBuildReservation } from "./runtime-dev-queue-build-reservation.js";

const MANPOWER_COST_BY_TYPE: Record<string, number> = { FORT: 300, MINTWORKS: 80 };

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
  let hasSlot = overrides.hasSlot ?? false;

  const context: RuntimeDevQueueCommandContext = {
    summaryForPlayer: () => summary,
    now: () => 1000,
    emitEvent: (event) => events.push(event),
    rejectCommand: (_command, code, message) => rejections.push({ code, message }),
    hasAvailableDevelopmentSlot: () => hasSlot,
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
    applyManpowerReservation: (_playerId, amount) => { manpower = Math.max(0, manpower - amount); },
    refundManpowerReservation: (_playerId, amount) => { manpower = Math.min(manpowerCap, manpower + amount); }
  };

  return { context, summary, events, rejections, dispatchedBuilds, getManpower: () => manpower, setHasSlot: (v: boolean) => { hasSlot = v; } };
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

  it("rejects a second slot-conflicting queue entry once an earlier queued entry already claims the slot", () => {
    const { context, summary, getManpower, rejections } = makeContext({ manpower: 1000 });
    handleDevQueueEnqueueCommand(context, enqueueCommand(1, 1, "FORT"));
    handleDevQueueEnqueueCommand(context, enqueueCommand(2, 2, "FORT"));
    expect(summary.devQueue).toHaveLength(1);
    expect(getManpower()).toBe(700);
    expect(rejections).toEqual([{ code: "INSUFFICIENT_SLOT", message: "no free TITANIUM slot" }]);
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
});
