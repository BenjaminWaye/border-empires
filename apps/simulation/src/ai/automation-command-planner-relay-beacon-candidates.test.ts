import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA";
    ownerId: string;
    ownershipState: "SETTLED" | "FRONTIER";
    resource: string;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation relay beacon candidates", () => {
  it("considers a plain settled edge tile absent from the incremental build index", () => {
    const indexedResourceTile = makeTile(10, 10, {
      ownerId: "ai-1",
      ownershipState: "SETTLED",
      resource: "FARM"
    });
    const plainSettledEdgeTile = makeTile(100, 100, {
      ownerId: "ai-1",
      ownershipState: "SETTLED"
    });
    const tilesByKey = new Map<string, ReturnType<typeof makeTile>>([
      ["10,10", indexedResourceTile],
      ["100,100", plainSettledEdgeTile]
    ]);

    // The indexed resource tile deliberately has no new coverage. The plain
    // edge tile does: its surrounding fog represents the next reach band.
    for (let y = 5; y <= 15; y += 1) {
      for (let x = 5; x <= 15; x += 1) {
        if (x === 10 && y === 10) continue;
        tilesByKey.set(`${x},${y}`, makeTile(x, y, { terrain: "SEA" }));
      }
    }

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 500,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      // This mirrors the runtime's incremental build index: its nonempty
      // value omits the ordinary settled tile that is the useful beacon site.
      buildCandidateTiles: [indexedResourceTile],
      ownedTiles: [indexedResourceTile, plainSettledEdgeTile],
      tilesByKey,
      ownedStructureCounts: { RELAY_BEACON: 5 },
      beaconBoostActive: true,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command).toMatchObject({
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 100, y: 100, structureType: "RELAY_BEACON" })
    });
    expect(result.diagnostic.relayBeaconBuildCandidate).toBe("100,100");
  });
});
