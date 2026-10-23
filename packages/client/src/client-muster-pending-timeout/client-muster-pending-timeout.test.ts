import { describe, expect, it } from "vitest";
import { ATTACK_COMMIT_TTL_MS, attackCommitForTarget, setAttackCommit } from "../client-attack-commit/client-attack-commit.js";
import type { Tile } from "../client-types.js";
import { MUSTER_PENDING_STALL_TIMEOUT_MS, pendingMusterAttackStalled } from "./client-muster-pending-timeout.js";

const settledEnemy: Tile = { x: 5, y: 0, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" };
const makeState = () => ({ attackCommitByTargetKey: new Map(), tiles: new Map([["5,0", settledEnemy]]) });
const MINUTE = 60_000;

describe("pendingMusterAttackStalled", () => {
  // Regression: the backstop used to fire 5 minutes after the attack was
  // parked, so a commitment bigger than the flag's cap -- which expands the
  // flag and fills at ~180/min -- was cancelled while still filling.
  it("keeps an attack whose flag is still filling past the old 5-minute cap", () => {
    const state = makeState();
    const entry = { targetX: 5, targetY: 0, queuedAt: 0 };
    for (let minute = 0; minute <= 12; minute += 1) {
      expect(pendingMusterAttackStalled(state, entry, 300 + minute * 180, minute * MINUTE)).toBe(false);
    }
  });

  it("drops it once the flag has made no progress for the stall timeout", () => {
    const state = makeState();
    const entry = { targetX: 5, targetY: 0, queuedAt: 0 };
    expect(pendingMusterAttackStalled(state, entry, 300, 2 * MINUTE)).toBe(false);
    expect(pendingMusterAttackStalled(state, entry, 300, 2 * MINUTE + MUSTER_PENDING_STALL_TIMEOUT_MS)).toBe(false);
    expect(pendingMusterAttackStalled(state, entry, 300, 2 * MINUTE + MUSTER_PENDING_STALL_TIMEOUT_MS + 1)).toBe(true);
  });

  it("times out from queuedAt when there is no own flag to watch", () => {
    const entry = { targetX: 5, targetY: 0, queuedAt: 0 };
    expect(pendingMusterAttackStalled(makeState(), entry, undefined, MUSTER_PENDING_STALL_TIMEOUT_MS + 1)).toBe(true);
  });

  it("keeps the chosen commitment alive while the flag fills", () => {
    const state = makeState();
    setAttackCommit(state, 5, 0, 2_000, 0);
    const entry = { targetX: 5, targetY: 0, queuedAt: 0 };
    for (let minute = 1; minute <= 15; minute += 1) pendingMusterAttackStalled(state, entry, minute * 180, minute * MINUTE);
    expect(15 * MINUTE).toBeGreaterThan(ATTACK_COMMIT_TTL_MS);
    expect(attackCommitForTarget(state, 5, 0, 15 * MINUTE)).toBe(2_000);
  });
});
