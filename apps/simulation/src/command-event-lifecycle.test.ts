import { describe, expect, it } from "vitest";
import { isTerminalCommandEvent } from "./command-event-lifecycle.js";

describe("isTerminalCommandEvent", () => {
  it("treats COMMAND_REJECTED, COMBAT_RESOLVED, COMBAT_CANCELLED, and COMMAND_RESOLVED as terminal", () => {
    expect(isTerminalCommandEvent({ eventType: "COMMAND_REJECTED", commandId: "c1", playerId: "p1", code: "X", message: "m" })).toBe(true);
    expect(
      isTerminalCommandEvent({
        eventType: "COMBAT_RESOLVED",
        commandId: "c1",
        playerId: "p1",
        actionType: "ATTACK",
        originX: 0,
        originY: 0,
        targetX: 1,
        targetY: 0,
        attackerWon: true
      })
    ).toBe(true);
    expect(isTerminalCommandEvent({ eventType: "COMBAT_CANCELLED", commandId: "c1", playerId: "p1", count: 1 })).toBe(true);
    // Regression: instant commands (SET_MUSTER etc.) only had TILE_DELTA_BATCH
    // as a success signal, which is NOT terminal (many commands emit multiple
    // TILE_DELTA_BATCH over their lifetime) — without COMMAND_RESOLVED being
    // recognized here, these commands stayed non-terminal in the replay cache
    // forever, in addition to staying QUEUED in the persisted store.
    expect(isTerminalCommandEvent({ eventType: "COMMAND_RESOLVED", commandId: "c1", playerId: "p1" })).toBe(true);
  });

  it("does not treat TILE_DELTA_BATCH or COMMAND_ACCEPTED as terminal", () => {
    expect(isTerminalCommandEvent({ eventType: "TILE_DELTA_BATCH", commandId: "c1", playerId: "p1", tileDeltas: [] })).toBe(false);
    expect(
      isTerminalCommandEvent({
        eventType: "COMMAND_ACCEPTED",
        commandId: "c1",
        playerId: "p1",
        actionType: "ATTACK",
        originX: 0,
        originY: 0,
        targetX: 1,
        targetY: 0,
        resolvesAt: 1000
      })
    ).toBe(false);
  });
});
