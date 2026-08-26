import { describe, expect, it } from "vitest";

import { refreshResourceSlotCachesForPlayer } from "./resource-slot-cache-refresh.js";

describe("refreshResourceSlotCachesForPlayer", () => {
  it("no-ops for a player the runtime doesn't know about", () => {
    const calls: string[] = [];
    refreshResourceSlotCachesForPlayer(
      {
        hasPlayer: () => false,
        refreshSupplyFresh: () => calls.push("supply"),
        refreshDemandFresh: () => calls.push("demand"),
        clearDormancyCache: () => calls.push("clear"),
        readDormancy: () => calls.push("read")
      },
      "ghost-player"
    );
    expect(calls).toEqual([]);
  });

  it("forces a fresh supply/demand recompute and re-reads dormancy after clearing its cache", () => {
    const calls: string[] = [];
    refreshResourceSlotCachesForPlayer(
      {
        hasPlayer: () => true,
        refreshSupplyFresh: (playerId) => calls.push(`supply:${playerId}`),
        refreshDemandFresh: (playerId) => calls.push(`demand:${playerId}`),
        clearDormancyCache: (playerId) => calls.push(`clear:${playerId}`),
        readDormancy: (playerId) => calls.push(`read:${playerId}`)
      },
      "player-1"
    );
    expect(calls).toEqual(["supply:player-1", "demand:player-1", "clear:player-1", "read:player-1"]);
  });
});
