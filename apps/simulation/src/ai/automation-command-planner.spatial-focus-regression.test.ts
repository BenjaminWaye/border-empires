import { describe, expect, it } from "vitest";

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
    town: {
      supportMax?: number;
      supportCurrent?: number;
      type?: "MARKET" | "FARMING";
      name?: string;
      populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    } | null;
    strategicResources: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    techIds: string[];
    settledTileCount: number;
    townCount: number;
    incomePerMinute: number;
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

// Regression for the production incident (staging AI-4/ai-1 pinned on the
// same dead spatial-focus front for 10+ minutes): scanFoundActionableCandidate
// must NOT report "productive" when the only found candidate was located
// outside the current focus front and only surfaced via restrictToFocus's
// unfiltered-fallback widening. Without this, ai-spatial-focus.ts's
// unproductive-streak rotation never engages, so a large empire's focus
// origin never rotates to a region with real (non-waste) opportunities.
describe("automation command planner — spatial focus regression", () => {
  it("does not report scanFoundActionableCandidate when a build candidate is found only via the focus fallback", () => {
    // Use a frontier scan scenario (simpler and known to work) to verify
    // the negative case: when the focus front covers a region with NO
    // actionable targets, but restrictToFocus widens to find a candidate
    // elsewhere in the empire, the signal must remain false for that front.
    const f1 = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const f2 = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const neutral = makeTile(0, 1, { ownerId: undefined }); // expandable
    const ownedTiles = [f1, f2];
    const tilesByKey = new Map([
      ["0,0", f1],
      ["1,0", f2],
      ["0,1", neutral]
    ]);
    // Focus front covers a completely different region than the actionable
    // frontier — forces restrictToFocus to widen.
    const spatialFocusFront = new Set(["50,50"]);

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 1000,
      manpower: 100,
      settledTileCount: 0,
      townCount: 0,
      incomePerMinute: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [f1, f2],
      ownedTiles: [f1, f2],
      tilesByKey,
      spatialFocusFront,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // The frontier scan found an actionable target (neutral at 0,1) via the
    // unfiltered fallback, so scanFoundActionableCandidate would be true
    // without the fix. With the fix, the signal must be false for this front.
    expect(result.diagnostic.scanFoundActionableCandidate).toBe(false);
  });

  it("reports scanFoundActionableCandidate when the frontier scan finds actionable targets within the focus front", () => {
    // Positive case: when the focus front actually contains actionable
    // frontier targets (economic neutral), the signal should be true.
    const f1 = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const f2 = makeTile(1, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const economicNeutral = makeTile(0, 1, { resource: "IRON" }); // economic opportunity
    const ownedTiles = [f1, f2];
    const tilesByKey = new Map([
      ["0,0", f1],
      ["1,0", f2],
      ["0,1", economicNeutral]
    ]);
    // Focus front covers the actionable frontier
    const spatialFocusFront = new Set(["0,0", "1,0", "0,1"]);

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 1000,
      manpower: 100,
      settledTileCount: 0,
      townCount: 0,
      incomePerMinute: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [f1, f2],
      ownedTiles: [f1, f2],
      tilesByKey: new Map([
        ["0,0", f1],
        ["1,0", f2],
        ["0,1", economicNeutral]
      ]),
      spatialFocusFront: new Set(["0,0", "1,0", "0,1"]),
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.scanFoundActionableCandidate).toBe(true);
  });
});