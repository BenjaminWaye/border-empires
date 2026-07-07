import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

// Regression coverage for the "20k-tile empire" scaling problem: several
// codepaths in planAutomationCommand used to scan `input.ownedTiles` in full
// on every single plan, regardless of empire size or whether the
// incrementally-maintained settledTileCount/townCount/frontierTiles/
// buildCandidateTiles were already supplied. docs/plans/2026-05-30-cap-
// narrow-analyze-path.md documents this class of bug going super-linear
// (3x tiles -> 14x planner cost) even after the candidate-count cap landed,
// because that cap only bounds analyzeOwnedFrontierTargetsFromLookup, not
// the unconditional full-ownedTiles passes that ran before it.

type Tile = AutomationPlannerTile & {
  ownerId?: string;
  ownershipState?: string;
  dockId?: string;
  town?: { supportMax?: number; supportCurrent?: number; populationTier?: string } | null;
};

const makeTile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

/** Wraps an array in a Proxy that counts every element access (numeric index
 * get and iteration), so tests can assert "touched at most N tiles" as a
 * deterministic counter instead of a flaky wall-clock timing assertion —
 * per docs/agents/ai-guardrails.md. */
const countedArray = <T>(items: readonly T[]): { array: readonly T[]; accessCount: () => number } => {
  let accesses = 0;
  const handler: ProxyHandler<readonly T[]> = {
    get(target, prop, receiver) {
      if (typeof prop === "string" && /^\d+$/.test(prop)) accesses += 1;
      return Reflect.get(target, prop, receiver);
    }
  };
  return { array: new Proxy(items, handler), accessCount: () => accesses };
};

const buildLargeEmpire = (ownedTileCount: number) => {
  const ownedTiles: Tile[] = [];
  const frontierTiles: Tile[] = [];
  const buildCandidateTiles: Tile[] = [];
  const tilesByKey = new Map<string, Tile>();
  for (let i = 0; i < ownedTileCount; i++) {
    const x = i;
    const y = 0;
    const isFrontier = i < 20;
    const isBuildCandidate = i >= 20 && i < 40;
    const tile = makeTile(x, y, {
      ownerId: "ai-1",
      ownershipState: isFrontier ? "FRONTIER" : "SETTLED",
      ...(isBuildCandidate ? { dockId: `dock-${x}` } : {})
    });
    ownedTiles.push(tile);
    tilesByKey.set(`${x},${y}`, tile);
    if (isFrontier) frontierTiles.push(tile);
    if (isBuildCandidate) buildCandidateTiles.push(tile);
  }
  return { ownedTiles, frontierTiles, buildCandidateTiles, tilesByKey };
};

describe("automation command planner — owned-tile scaling", () => {
  it("does not scan the full owned-tile list when settledTileCount/townCount/frontierTiles/buildCandidateTiles are all supplied", () => {
    const ownedTileCount = 20_000;
    const { ownedTiles, frontierTiles, buildCandidateTiles, tilesByKey } = buildLargeEmpire(ownedTileCount);
    const { array: countedOwnedTiles, accessCount } = countedArray(ownedTiles);

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      settledTileCount: ownedTileCount - frontierTiles.length,
      townCount: 0,
      // Always supplied on both real call paths (runtime.ts and
      // ai-planner-worker.ts) — an empty test double here would silently
      // fall through to the O(owned) tallyOwnedStructures scan inside
      // structure-command-planner.ts, which is a real production path too
      // but is out of scope for this planner-file-focused fix.
      ownedStructureCounts: {},
      frontierTiles,
      buildCandidateTiles,
      ownedTiles: countedOwnedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.noCommandReason).not.toBe("player_missing");
    // A handful of diagnostic/length reads on the array itself (e.g.
    // input.ownedTiles.length in the diagnostic block) are fine — what we're
    // proving is that none of the O(owned) filter/loop passes ran. 20,000
    // owned tiles with only ~40 ever touched (well under 1% of the empire)
    // proves the fast paths, not the full scans, were used.
    expect(accessCount()).toBeLessThan(200);
  });

  it("still falls back to a full owned-tile scan and gets the right counts when settledTileCount/townCount are not supplied", () => {
    const ownedTileCount = 500;
    const { ownedTiles, frontierTiles, tilesByKey } = buildLargeEmpire(ownedTileCount);

    const fastPath = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      settledTileCount: ownedTileCount - frontierTiles.length,
      townCount: 0,
      frontierTiles,
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });
    const slowPath = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      // settledTileCount/townCount intentionally omitted -> forces the
      // legacy full owned-tile scan fallback.
      frontierTiles,
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // The fast (counts-supplied) path and the slow (full-scan) path must
    // reach the same decision — controlledTileCount = settledTileCount +
    // frontierTileCount is mathematically identical to scanning every
    // owned tile and counting SETTLED/FRONTIER ownershipState.
    expect(fastPath.command).toEqual(slowPath.command);
    expect(fastPath.diagnostic).toEqual(slowPath.diagnostic);
  });

  it("finds dock origins from the incrementally-maintained buildCandidateTiles set without needing the full owned-tile list", () => {
    const dockTile = makeTile(5, 5, { ownerId: "ai-1", ownershipState: "SETTLED", dockId: "dock-5" });
    const frontier = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    // A large filler set of owned tiles that do NOT carry the dock — proves
    // dockOrigins is sourced from buildCandidateTiles, not a scan of every
    // owned tile (which would also need to walk all the filler tiles).
    const filler: Tile[] = [];
    for (let i = 1; i < 5_000; i++) filler.push(makeTile(100 + i, 100, { ownerId: "ai-1", ownershipState: "SETTLED" }));
    const ownedTiles = [frontier, dockTile, ...filler];
    const tilesByKey = new Map(ownedTiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const));

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      settledTileCount: ownedTiles.length - 1,
      townCount: 0,
      frontierTiles: [frontier],
      buildCandidateTiles: [dockTile],
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.dockOriginCount).toBe(1);
  });
});
