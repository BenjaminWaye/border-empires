import { describe, expect, it } from "vitest";

import { toProtoEvent } from "./simulation-service.js";

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
