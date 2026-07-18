import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";

// Regression coverage for townLost accuracy on the onOwnershipChange sample.
// Bug: capturing a neutral (ownerless) town whose town survives the capture
// used to report hadTown:true with previousOwnerId:undefined, which
// simulation-service.ts treated as a genuine "Town Lost" event and fired a
// Slack alert reading "Previous Owner: undefined". townLost must reflect
// whether the tile actually lost its town, independent of ownerId changes.
describe("onOwnershipChange townLost signal", () => {
  it("does not report townLost when capturing a neutral town whose town survives", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const samples: Array<{ previousOwnerId?: string; nextOwnerId?: string; hadTown: boolean; townLost: boolean }> = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        onOwnershipChange: (sample) => samples.push(sample),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            // Neutral town: has a town but no owner, matching worldgen-seeded
            // neutral towns. A TOWN-tier town survives capture (only
            // SETTLEMENT tier is razed), so this must NOT be townLost.
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownershipState: "SETTLED",
              town: { name: "Neutral Town", type: "FARMING", populationTier: "TOWN" }
            },
            { x: 9, y: 11, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "cmd-neutral-town-capture",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 9,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const captureSample = samples.find((sample) => sample.previousOwnerId === undefined && sample.nextOwnerId === "player-1");
      expect(captureSample).toBeDefined();
      expect(captureSample?.hadTown).toBe(true);
      expect(captureSample?.townLost).toBe(false);

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 11);
      expect(capturedTile).toEqual(expect.objectContaining({ ownerId: "player-1", townName: "Neutral Town" }));
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("still reports townLost when an attacker razes a defender's SETTLEMENT-tier town on capture, tagged for the alert to skip", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const samples: Array<{
        previousOwnerId?: string;
        nextOwnerId?: string;
        townLost: boolean;
        previousTownPopulationTier?: string;
      }> = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        onOwnershipChange: (sample) => samples.push(sample),
        initialState: {
          tiles: [
            { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            // Player-owned SETTLEMENT-tier town: capturedTownAftermath razes
            // SETTLEMENT-tier towns on capture, so townLost is still true here
            // (the tile genuinely lost its town structure). simulation-service.ts
            // reads previousTownPopulationTier separately to skip the Slack
            // alert for this tier — routine population absorption, not a
            // defensive loss worth paging on.
            {
              x: 20,
              y: 21,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "SETTLED",
              town: { name: "Defender Settlement", type: "FARMING", populationTier: "SETTLEMENT" }
            },
            { x: 19, y: 21, terrain: "LAND" }
          ],
          activeLocks: []
        }
      });

      runtime.submitCommand({
        commandId: "cmd-settlement-capture",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 9,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 20, toY: 21 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const captureSample = samples.find((sample) => sample.previousOwnerId === "player-2" && sample.nextOwnerId === "player-1");
      expect(captureSample).toBeDefined();
      expect(captureSample?.townLost).toBe(true);
      expect(captureSample?.previousTownPopulationTier).toBe("SETTLEMENT");

      const capturedTile = runtime.exportState().tiles.find((tile) => tile.x === 20 && tile.y === 21);
      expect(capturedTile?.townName).toBeUndefined();
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
