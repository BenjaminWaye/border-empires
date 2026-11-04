import { describe, expect, it } from "vitest";
import { MANPOWER_REFILL_WINDOW_MS, SETTLE_MANPOWER_COST } from "@border-empires/shared";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

/**
 * A queued garrison an online client sends itself: the client follows its
 * SETTLE with DEV_QUEUE_CANCEL, but the cancel rides the non-interactive lane
 * and can land after the SETTLE. handleSettleCommand must release the entry's
 * own hold before charging, or the garrison is refused short on manpower its
 * queue entry is holding -- or, near the cap, paid for twice.
 */
const setup = (manpower: number) => {
  let nowMs = 1_000_000;
  const runtime = new SimulationRuntime({
    now: () => nowMs,
    scheduleAfter: () => {},
    // Online: the client owns dispatch of its queued entries, so the server
    // holds the reservation instead of draining it on enqueue.
    isPlayerSubscribed: () => true,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower, landingReserveGranted: true, manpowerUpdatedAt: 1_000_000 })]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
      ],
      docks: [],
      activeLocks: []
    }
  });
  const seen = collectEvents(runtime);
  let seq = 0;
  const submit = async (type: string, payload: Record<string, unknown>): Promise<void> => {
    seq += 1;
    runtime.submitCommand({
      commandId: `cmd-${seq}`,
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: seq,
      issuedAt: nowMs,
      type,
      payloadJson: JSON.stringify(payload)
    } as unknown as CommandEnvelope);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  const player = () => runtime.exportState().players.find((entry) => entry.id === "player-1")!;
  return { runtime, seen, submit, player, advance: (ms: number) => { nowMs += ms; } };
};

const rejections = (seen: SimulationEvent[]) => seen.filter((event) => event.eventType === "COMMAND_REJECTED");
const settleStarted = (seen: SimulationEvent[]) => seen.some((event) => event.eventType === "SETTLEMENT_STARTED");

describe("SETTLE for a garrison the dev queue is holding manpower for", () => {
  it("is charged once from its own hold when the pool alone couldn't cover it", async () => {
    const { seen, submit, player } = setup(SETTLE_MANPOWER_COST + SETTLE_MANPOWER_COST / 2);
    await submit("DEV_QUEUE_ENQUEUE", { x: 11, y: 10, tileKey: "11,10", kind: "SETTLE" });
    expect(player().manpower).toBe(SETTLE_MANPOWER_COST / 2);

    await submit("SETTLE", { x: 11, y: 10 }); // DEV_QUEUE_CANCEL hasn't landed yet
    expect(rejections(seen)).toEqual([]);
    expect(settleStarted(seen)).toBe(true);
    expect(player().manpower).toBe(SETTLE_MANPOWER_COST / 2);
    expect(player().devQueue ?? []).toEqual([]);
  });

  it("is not charged twice after regen refilled the pool to the cap during the hold", async () => {
    const { seen, submit, player, advance } = setup(10_000);
    await submit("DEV_QUEUE_ENQUEUE", { x: 11, y: 10, tileKey: "11,10", kind: "SETTLE" });
    const cap = player().manpowerCap;
    expect(player().manpower).toBe(cap - SETTLE_MANPOWER_COST);

    advance(4 * MANPOWER_REFILL_WINDOW_MS);
    expect(player().manpower).toBe(cap); // refilled while the hold sits outside the pool

    await submit("SETTLE", { x: 11, y: 10 });
    expect(rejections(seen)).toEqual([]);
    expect(settleStarted(seen)).toBe(true);
    expect(player().manpower).toBe(cap);
  });
});
