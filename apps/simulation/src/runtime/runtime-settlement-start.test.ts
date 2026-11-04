import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { CAPTURE_HOLD_MS, INSTANT_GARRISON_COUNT, frontierClaimDurationMsAt } from "@border-empires/shared";
import { startSettlementProcess, type SettlementStartContext } from "./runtime-settlement-start.js";

const makePlayer = (domainIds: string[] = [], lifetimeGarrisons: number | null = INSTANT_GARRISON_COUNT): DomainPlayer => ({
  id: "p1", isAi: false, points: 1_000, manpower: 1_000, techIds: new Set(), domainIds: new Set(domainIds), allies: new Set(),
  autoSettle: { towns: true, docks: true, resources: true, townSupport: true } as DomainPlayer["autoSettle"],
  ...(lifetimeGarrisons === null ? {} : { lifetimeGarrisons })
});

const runFor = (player: DomainPlayer, target: DomainTileState) => {
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

// Defaults to a player past their instant garrisons, so the timer applies.
const run = (target: DomainTileState, domainIds: string[] = []) => runFor(makePlayer(domainIds), target);

const plainLand = { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" } as const;
const claimMs = frontierClaimDurationMsAt(plainLand.x, plainLand.y);

describe("startSettlementProcess duration", () => {
  it("takes exactly as long as a frontier claim on the same tile", () => {
    for (const [x, y] of [[0, 0], [3, 7], [12, 40], [55, 9]] as const) {
      expect(run({ ...plainLand, x, y }).resolvesAt).toBe(1_000 + frontierClaimDurationMsAt(x, y));
    }
  });

  it("makes a player's first 10 lifetime garrisons instant and counts each one", () => {
    const player = makePlayer([], null); // record predating the counter = 0
    for (let i = 0; i < INSTANT_GARRISON_COUNT; i += 1) {
      const result = runFor(player, plainLand);
      expect(result.resolvesAt).toBe(1_000);
      expect(result.delay).toBe(0);
      expect(player.lifetimeGarrisons).toBe(i + 1);
    }
    expect(runFor(player, plainLand).resolvesAt).toBe(1_000 + claimMs);
    expect(player.lifetimeGarrisons).toBe(INSTANT_GARRISON_COUNT + 1);
  });

  it("keeps an instant garrison behind a capture hold", () => {
    const held: DomainTileState = { ...plainLand, captureHoldUntil: 1_000 + 20_000 };
    expect(runFor(makePlayer([], 0), held).resolvesAt).toBe(1_000 + 20_000);
  });
});

describe("startSettlementProcess capture-hold floor", () => {
  it("can't finish garrisoning a captured tile before its hold ends", () => {
    // Frontier Doctrine's ×1.5 garrison speed shortens the timer, but the hold
    // still has 50s left, so the garrison waits for it.
    const held: DomainTileState = { ...plainLand, captureHoldUntil: 1_000 + 50_000 };
    expect(run(plainLand, ["frontier-doctrine"]).resolvesAt).toBe(1_000 + Math.round(claimMs / 1.5));
    const fastSettle = run(held, ["frontier-doctrine"]);
    expect(fastSettle.resolvesAt).toBe(1_000 + 50_000);
    expect(fastSettle.delay).toBe(fastSettle.resolvesAt! - 1_000);
  });

  it("keeps the normal garrison time when it already outlasts the hold", () => {
    const shortHold: DomainTileState = { ...plainLand, captureHoldUntil: 1_000 + 1_000 };
    expect(run(shortHold).resolvesAt).toBe(1_000 + claimMs);
    expect(run(plainLand).resolvesAt).toBe(1_000 + claimMs);
  });

  it("ignores an expired hold", () => {
    expect(run({ ...plainLand, captureHoldUntil: 500 }).resolvesAt).toBe(1_000 + claimMs);
  });

  it("waits out a hold longer than the garrison", () => {
    expect(run({ ...plainLand, captureHoldUntil: 1_000 + CAPTURE_HOLD_MS + 5_000 }).resolvesAt).toBe(1_000 + CAPTURE_HOLD_MS + 5_000);
  });
});
