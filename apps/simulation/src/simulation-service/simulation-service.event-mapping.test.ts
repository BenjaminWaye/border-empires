import { describe, expect, it } from "vitest";

import { isWireInternalEvent, toProtoEvent } from "./proto-serialization.js";

describe("toProtoEvent", () => {
  it("serializes cancelled frontier command ids on COMBAT_CANCELLED events", () => {
    expect(
      toProtoEvent({
        eventType: "COMBAT_CANCELLED",
        commandId: "cancel-capture-1",
        playerId: "player-1",
        count: 2,
        cancelledCommandIds: ["expand-cmd-1", "attack-cmd-1"]
      })
    ).toMatchObject({
      event_type: "COMBAT_CANCELLED",
      command_id: "cancel-capture-1",
      player_id: "player-1",
      count: 2,
      cancelled_command_ids: ["expand-cmd-1", "attack-cmd-1"]
    });
  });
});

describe("isWireInternalEvent", () => {
  it("flags TILE_YIELD_ANCHOR_UPDATED so it never reaches the gateway stream", () => {
    expect(
      isWireInternalEvent({
        eventType: "TILE_YIELD_ANCHOR_UPDATED",
        commandId: "accrual:upkeep:human-1:1700000000000",
        playerId: "human-1",
        tileKey: "12,34",
        collectedAt: 1700000000000
      })
    ).toBe(true);
  });

  it("flags SETTLEMENT_STARTED so replay bookkeeping never reaches the gateway stream", () => {
    expect(
      isWireInternalEvent({
        eventType: "SETTLEMENT_STARTED",
        commandId: "territory-auto:settle:human-1:12,34:1700000000000:1",
        playerId: "human-1",
        tileKey: "12,34",
        startedAt: 1700000000000,
        resolvesAt: 1700000060000,
        goldCost: 4
      })
    ).toBe(true);
  });

  it("does not flag client-bound rejection events", () => {
    expect(
      isWireInternalEvent({
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "human-1",
        code: "ATTACK_COOLDOWN",
        message: "origin tile is still on attack cooldown"
      })
    ).toBe(false);
  });

  it("does not flag TILE_DELTA_BATCH (which must broadcast to every subscriber)", () => {
    expect(
      isWireInternalEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId: "cmd-2",
        playerId: "human-1",
        tileDeltas: []
      })
    ).toBe(false);
  });
});
