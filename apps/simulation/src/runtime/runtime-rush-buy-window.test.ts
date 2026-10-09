/**
 * Regression: a structure rush-buy must be priced against the build's real
 * window (startedAt..completesAt), not the registry's pre-D9 flat buildMs.
 * Against the flat constant (10 min for a Fort, 60s for a Relay Beacon) any
 * multi-hour build read as "just started" and always cost the full price.
 */
import { describe, expect, it, vi } from "vitest";
import { FORT_TIER_LADDER } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, afcModuleFixtureTile } from "./runtime.test-helpers.js";

describe("RUSH_BUY structure pricing window", () => {
  it("charges about half price for a Fort rushed halfway through its build", async () => {
    vi.useFakeTimers();
    try {
      let nowMs = 1_000;
      const runtime = new SimulationRuntime({
        now: () => nowMs,
        initialPlayers: new Map([
          ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set(["masonry"]) })]
        ]),
        initialState: {
          tiles: [
            afcModuleFixtureTile("player-1"),
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "fort-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: nowMs,
        type: "BUILD_FORT", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();
      const fort = JSON.parse(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson ?? "{}") as {
        startedAt?: number;
        completesAt?: number;
      };
      expect(typeof fort.startedAt).toBe("number");
      const windowMs = (fort.completesAt ?? 0) - (fort.startedAt ?? 0);
      const halfway = Math.floor(windowMs / 2);
      vi.advanceTimersByTime(halfway);
      nowMs += halfway;

      const goldBeforeRush = runtime.exportState().players.find((p) => p.id === "player-1")?.points ?? 0;
      runtime.submitCommand({
        commandId: "rush-1", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: nowMs,
        type: "RUSH_BUY", payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
      await Promise.resolve();

      const spent = goldBeforeRush - (runtime.exportState().players.find((p) => p.id === "player-1")?.points ?? 0);
      const fullPrice = Math.ceil(FORT_TIER_LADDER.FORT.manpower * 0.5);
      expect(spent).toBeLessThan(fullPrice);
      expect(spent).toBe(Math.ceil((fullPrice * (windowMs - halfway)) / windowMs));
    } finally {
      vi.useRealTimers();
    }
  });
});
