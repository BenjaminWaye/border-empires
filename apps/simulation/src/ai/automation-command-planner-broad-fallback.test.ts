// Extracted from automation-command-planner.test.ts (already at the repo's
// 500-line file-growth cap) to make room for the D12/D23 free-beacon-count
// fixture pins landed alongside it -- same makeTile helper, copied rather
// than shared, to keep this file independently readable.
import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST } from "@border-empires/shared";

import { planAutomationCommand } from "./automation-command-planner.js";

const makeTile = (
  x: number,
  y: number,
  overrides: Partial<{
    terrain: "LAND" | "SEA" | "MOUNTAIN";
    ownerId: string;
    ownershipState: string;
    resource: string;
    dockId: string;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation command planner", () => {
  it("runs the broad fallback (and finds a real target) when the narrow scan sees only a waste-classified neutral", () => {
    // Regression test for the gate bug where hasActionableFrontierAnalysis()
    // counted ANY neutral (even a fully-boxed-in "waste" one with nothing to
    // scout) as actionable, which suppressed the broad fallback entirely and
    // left the AI stuck ignoring a real economic opportunity elsewhere on
    // its own frontier.
    const f1 = makeTile(4, 5, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    // Waste neutral: its only owned neighbor is f1, and its other neighbors
    // are unmodeled (fog) rather than owned/resource tiles, so it has no
    // resource/dock/town, doesn't qualify as a settlement scaffold, and has
    // no fog left nearby to justify a scout move (scoutScore <= 0).
    const waste = makeTile(5, 5, {});
    // A second, unrelated frontier elsewhere in the empire with a genuine
    // economic neutral next to it - only reachable via the broad fallback's
    // ownedFrontierTiles() sweep, since it's not in the narrow frontierTiles.
    const f2 = makeTile(20, 20, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const economicNeutral = makeTile(21, 20, { resource: "TITANIUM" });

    const ownedTiles = [f1, f2];
    const tilesByKey = new Map(
      [...ownedTiles, waste, economicNeutral].map((t) => [`${t.x},${t.y}`, t])
    );

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 4, // SETTLE_COST — canExpand now also reserves gold for the eventual SETTLE step
      manpower: EXPAND_MANPOWER_COST, // enough to EXPAND, still below ATTACK_MANPOWER_MIN
      settledTileCount: 0,
      townCount: 0,
      incomePerMinute: 4,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [f1],
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.broadFallbackSkipped).toBeFalsy();
    expect(result.diagnostic.frontierOpportunityWaste).toBe(1);
    expect(result.diagnostic.frontierOpportunityEconomic).toBe(1);
    expect(result.diagnostic.scanFoundActionableCandidate).toBe(true);
    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 20, fromY: 20, toX: 21, toY: 20 })
    });
  });
});
