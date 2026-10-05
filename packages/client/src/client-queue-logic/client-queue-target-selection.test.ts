import { describe, expect, it } from "vitest";
import { attackQueueFailureReason, queueSpecificTargets } from "./client-queue-target-selection.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const enemyOrigin = { x: 156, y: 12, terrain: "LAND", ownerId: "ai-5", ownershipState: "SETTLED" } as Tile;
const baseState = (): ClientState =>
  ({
    me: "me-1",
    gold: 100,
    tiles: new Map([["156,12", enemyOrigin]]),
    incomingAttacksByTile: new Map([
      ["155,12", { attackerName: "Edvin", attackerId: "ai-5", resolvesAt: Date.now() + 42_000, fromX: 156, fromY: 12 }]
    ])
  }) as unknown as ClientState;

// The tile an enemy attack launched from is not locked server-side (only the
// attacked tile is), so counter-attacking it must be queued like any other.
describe("attacking an enemy attack's origin tile", () => {
  it("is queued", () => {
    let enqueued = 0;
    const result = queueSpecificTargets(baseState(), ["156,12"], {
      parseKey: (key) => ({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]) }),
      keyFor: (x, y) => `${x},${y}`,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => enemyOrigin,
      enqueueTarget: () => { enqueued += 1; return true; },
      buildFrontierQueue: () => ({ queued: 0, skipped: 0, queuedKeys: [] })
    });
    expect(result.queued).toBe(1);
    expect(enqueued).toBe(1);
  });

  it("does not report the launch tile as locked when the attack can't be queued", () => {
    const reason = attackQueueFailureReason(baseState(), enemyOrigin, { ownerSpawnShieldActive: () => false, pickOriginForTarget: () => undefined });
    expect(reason).not.toContain("locks it in combat");
    expect(reason).toBe("Target must border your territory or a linked dock.");
  });
});
