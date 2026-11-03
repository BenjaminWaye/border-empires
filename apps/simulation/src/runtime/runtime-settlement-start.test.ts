import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { CAPTURE_HOLD_MS, SETTLE_MS } from "@border-empires/shared";
import { startSettlementProcess, type SettlementStartContext } from "./runtime-settlement-start.js";

const run = (target: DomainTileState, domainIds: string[] = []) => {
  const player: DomainPlayer = { id: "p1", isAi: false, points: 1_000, manpower: 1_000, techIds: new Set(), domainIds: new Set(domainIds), allies: new Set() };
  const scheduled: number[] = [];
  const pending: { resolvesAt: number }[] = [];
  const context: SettlementStartContext = {
    players: new Map([["p1", player]]),
    addPendingSettlement: (record) => pending.push(record),
    scheduleAfter: (delayMs) => scheduled.push(delayMs),
    resolvePendingSettlement: () => undefined,
    emitEvent: () => undefined,
    emitPlayerStateUpdate: () => undefined
  };
  startSettlementProcess(context, { commandId: "c1", playerId: "p1", targetKey: `${target.x},${target.y}`, target, startedAt: 1_000 });
  return { delay: scheduled[0], resolvesAt: pending[0]?.resolvesAt };
};

const plainLand = { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" } as const;

describe("startSettlementProcess capture-hold floor", () => {
  it("can't finish garrisoning a captured tile before its hold ends", () => {
    // Settlement Assembly Line halves the garrison to 30s, but the hold still
    // has 50s left, so the garrison waits for it.
    const held: DomainTileState = { ...plainLand, captureHoldUntil: 1_000 + 50_000 };
    expect(run(plainLand, ["afc-dominion-4"]).resolvesAt).toBe(1_000 + SETTLE_MS / 2);
    const fastSettle = run(held, ["afc-dominion-4"]);
    expect(fastSettle.resolvesAt).toBe(1_000 + 50_000);
    expect(fastSettle.delay).toBe(fastSettle.resolvesAt! - 1_000);
  });

  it("keeps the normal garrison time when it already outlasts the hold", () => {
    const shortHold: DomainTileState = { ...plainLand, captureHoldUntil: 1_000 + 5_000 };
    expect(run(shortHold).resolvesAt).toBe(1_000 + SETTLE_MS);
    expect(run(plainLand).resolvesAt).toBe(1_000 + SETTLE_MS);
  });

  it("ignores an expired hold", () => {
    expect(run({ ...plainLand, captureHoldUntil: 500 }).resolvesAt).toBe(1_000 + SETTLE_MS);
  });

  it("waits out a hold longer than the garrison", () => {
    // The full hold (60s) outlasts this player's 60s garrison by nothing: it ends exactly at the hold's end.
    expect(run({ ...plainLand, captureHoldUntil: 1_000 + CAPTURE_HOLD_MS + 5_000 }).resolvesAt).toBe(1_000 + CAPTURE_HOLD_MS + 5_000);
  });
});
