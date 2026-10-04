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

// Regression: counter-attacking the tile an enemy attack was launched from
// was queued (mustering a flag for it) and then rejected server-side with a
// bare "tile locked in combat".
describe("attacking an enemy attack's origin tile", () => {
  it("is not queued", () => {
    let enqueued = 0;
    const result = queueSpecificTargets(baseState(), ["156,12"], {
      parseKey: (key) => ({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]) }),
      keyFor: (x, y) => `${x},${y}`,
      isTileOwnedByAlly: () => false,
      pickOriginForTarget: () => enemyOrigin,
      enqueueTarget: () => { enqueued += 1; return true; },
      buildFrontierQueue: () => ({ queued: 0, skipped: 0, queuedKeys: [] })
    });
    expect(result.queued).toBe(0);
    expect(enqueued).toBe(0);
  });

  it("explains who locked it and for how long", () => {
    const reason = attackQueueFailureReason(baseState(), enemyOrigin, { ownerSpawnShieldActive: () => false, pickOriginForTarget: () => enemyOrigin });
    expect(reason).toContain("Edvin is attacking you from this tile");
    expect(reason).toMatch(/Try again in 0:4[12]/);
  });
});
