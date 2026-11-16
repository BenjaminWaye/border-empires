import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { createEmptyPlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { DevQueueBuildReservation } from "../runtime-dev-queue-build-reservation.js";
import { type FortPerimeterGarrisonContext, queueFortPerimeterGarrisons } from "./runtime-fort-perimeter-garrison.js";

const SETTLE_COST = 20;

const tile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState =>
  ({ x, y, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", ...extra }) as DomainTileState;

const makeContext = (tiles: DomainTileState[], opts: { manpower?: number; slots?: number; blocked?: string[]; outOfReach?: string[] } = {}) => {
  const summary = createEmptyPlayerRuntimeSummary();
  let manpower = opts.manpower ?? 1_000;
  let slots = opts.slots ?? 99;
  const dispatched: CommandEnvelope[] = [];
  const context: FortPerimeterGarrisonContext = {
    tiles: new Map(tiles.map((t) => [`${t.x},${t.y}`, t])),
    isTileBlocked: (key) => (opts.blocked ?? []).includes(key),
    isPlayerTileInReach: (_playerId, x, y) => !(opts.outOfReach ?? []).includes(`${x},${y}`),
    summaryForPlayer: () => summary,
    now: () => 1_000,
    emitEvent: () => {},
    emitPlayerStateUpdate: () => {},
    rejectCommand: () => {},
    hasAvailableDevelopmentSlot: () => slots > 0,
    isPlayerOnline: () => true,
    nextDrainCommandId: (playerId, tileKey) => `drain:${playerId}:${tileKey}`,
    dispatchSettle: (command) => { dispatched.push(command); slots -= 1; },
    dispatchBuild: () => {},
    dispatchRemoveStructure: () => {},
    estimateBuildReservation: (): DevQueueBuildReservation => ({ ok: true, manpowerCost: 0, slotRequirements: [] }),
    estimateSettleReservation: (): DevQueueBuildReservation =>
      manpower < SETTLE_COST ? { ok: false, code: "INSUFFICIENT_MANPOWER", message: "short" } : { ok: true, manpowerCost: SETTLE_COST, slotRequirements: [] },
    applyManpowerReservation: (_playerId, amount) => { manpower -= amount; },
    refundManpowerReservation: (_playerId, amount) => { manpower += amount; },
    releaseManpowerReservationForCharge: (_playerId, amount) => { manpower += amount; }
  };
  return { context, summary, dispatched, manpower: () => manpower };
};

describe("queueFortPerimeterGarrisons", () => {
  it("garrisons the owner's frontier land within a Fort's radius 1 and nothing further out", () => {
    const tiles = [tile(10, 10, { ownershipState: "SETTLED" }), tile(11, 10), tile(9, 9), tile(12, 10), tile(11, 11, { ownershipState: "SETTLED" })];
    const { context, dispatched } = makeContext(tiles);
    expect(queueFortPerimeterGarrisons(context, "p1", 10, 10, "FORT").sort()).toEqual(["11,10", "9,9"]);
    expect(dispatched.map((c) => c.type)).toEqual(["SETTLE", "SETTLE"]);
  });

  it("covers radius 2 for a Bastion", () => {
    const { context } = makeContext([tile(12, 8)]);
    expect(queueFortPerimeterGarrisons(context, "p1", 10, 10, "TITANIUM_BASTION")).toEqual(["12,8"]);
  });

  it("skips other owners, water, blocked, encircled and out-of-reach tiles", () => {
    const tiles = [
      tile(11, 10, { ownerId: "p2" }),
      tile(9, 10, { terrain: "SEA" as DomainTileState["terrain"] }),
      tile(10, 11),
      tile(10, 9, { frontierDecayKind: "ENCIRCLEMENT" } as Partial<DomainTileState>),
      tile(11, 11)
    ];
    const { context } = makeContext(tiles, { blocked: ["10,11"], outOfReach: ["11,11"] });
    expect(queueFortPerimeterGarrisons(context, "p1", 10, 10, "FORT")).toEqual([]);
  });

  it("keeps garrisons past the free slots queued as server-origin entries holding their manpower", () => {
    const { context, summary, dispatched, manpower } = makeContext([tile(11, 10), tile(9, 10), tile(10, 11)], { slots: 1, manpower: 1_000 });
    queueFortPerimeterGarrisons(context, "p1", 10, 10, "FORT");
    expect(dispatched).toHaveLength(1);
    expect(summary.devQueue).toHaveLength(2);
    expect(summary.devQueue.every((e) => e.kind === "SETTLE" && e.origin === "server" && e.reservedManpower === SETTLE_COST)).toBe(true);
    expect(manpower()).toBe(1_000 - 2 * SETTLE_COST);
  });

  it("queues garrisons the pool can't cover yet as waiting for manpower", () => {
    const { context, summary, dispatched } = makeContext([tile(11, 10)], { manpower: 0 });
    queueFortPerimeterGarrisons(context, "p1", 10, 10, "FORT");
    expect(dispatched).toHaveLength(0);
    expect(summary.devQueue[0]).toEqual(expect.objectContaining({ tileKey: "11,10", awaitingManpower: true, origin: "server" }));
  });
});
