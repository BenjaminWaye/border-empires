import { describe, expect, it } from "vitest";
import { resetFrontierActionStateAfterError } from "./client-frontier-error-reset.js";
import type { ClientState } from "../client-state/client-state.js";

const stateWithFiredMusterAttack = (): ClientState =>
  ({
    capture: { startAt: 0, resolvesAt: 1, target: { x: 156, y: 12 } },
    pendingCombatReveal: undefined,
    actionInFlight: true,
    actionAcceptedAck: false,
    combatStartAck: false,
    actionAcceptTimeoutHandledAt: 0,
    actionStartedAt: 1,
    actionTargetKey: "156,12",
    actionCurrent: { x: 156, y: 12, retries: 0, actionType: "ATTACK", commandId: "c-1", clientSeq: 2 },
    // Fired ("locked" phase): transit entry with no deferred send left.
    musterTransitByCommand: new Map([
      ["c-1", { musterX: 156, musterY: 11, marchToX: 156, marchToY: 11, targetX: 156, targetY: 12, transitStartAt: 0, transitEndsAt: 2_000, manpower: 30 }],
      // An earlier attack on the same tile, already locked: the rejection of
      // c-1 (LOCKED, the tile is taken) must not free its reservation.
      ["c-0", { musterX: 150, musterY: 11, marchToX: 156, marchToY: 11, targetX: 156, targetY: 12, transitStartAt: 0, transitEndsAt: 2_000, manpower: 30 }]
    ]),
    deferredAttackByCommand: new Map(),
    frontierSyncWaitUntilByTarget: new Map()
  }) as unknown as ClientState;

describe("resetFrontierActionStateAfterError", () => {
  // Regression: a LOCKED rejection of a muster-funded attack left the flag's
  // transit entry behind, so the flag read as busy for 30s and the next
  // attack parked as "mustering" while the flag over-filled (60 -> 150).
  it("frees the funding flag's transit entry when the server rejects the attack", () => {
    const state = stateWithFiredMusterAttack();
    resetFrontierActionStateAfterError(state, {
      errorCode: "LOCKED",
      cooldownRemainingMs: undefined,
      failedCurrentKey: "156,12",
      failedTargetKey: "156,12",
      clearLateFrontierAck: () => {}
    });
    expect(state.musterTransitByCommand.has("c-1")).toBe(false);
    expect(state.musterTransitByCommand.has("c-0")).toBe(true);
    expect(state.actionInFlight).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.frontierSyncWaitUntilByTarget.has("156,12")).toBe(true);
  });
});
