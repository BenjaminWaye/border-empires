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
  }> = {}
) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

// Regression for the production incident where 4/5 staging AI players
// (501-1667 owned tiles) never issued a single EXPAND command: the broad
// fallback — the ONLY mechanism that lets the AI look past a narrow scan
// pinned on one "hot" origin tile — used to be skipped outright once
// ownedTiles exceeded 500, regardless of how much real, findable value
// (e.g. an adjacent resource tile) sat just outside the narrow window.
// Mirrors a real live case: ai-1 had 513 owned tiles, its narrow scan was
// pinned on a single distant hot-frontier origin with nothing nearby, and
// a GEMS resource tile sat 4 tiles from its actual frontier — completely
// unreachable because the broad fallback that should have searched the
// rest of its frontier never ran.
describe("automation command planner — broad fallback bound (not skipped) for large empires", () => {
  it("still runs the broad fallback (bounded, not skipped) for an empire well past the old 500-owned-tile threshold", () => {
    const tileCount = 501;
    const ownedTiles = Array.from({ length: tileCount }, (_, i) =>
      makeTile(0, i, { ownerId: "ai-1", ownershipState: "FRONTIER" })
    );
    // The narrow scan is pinned on this single "hot" origin (e.g. a distant
    // border skirmish elsewhere in the empire) — its own neighbors are all
    // fog/unmodeled, so the narrow scan alone finds nothing actionable.
    const hotOrigin = ownedTiles[0]!;
    // A real economic opportunity sits next to a DIFFERENT frontier tile,
    // far from the hot origin — only reachable via the broad fallback's
    // sweep of the player's full frontierTiles list.
    const economicNeutral = makeTile(1, 300, { resource: "IRON" });
    const tilesByKey = new Map([...ownedTiles, economicNeutral].map((t) => [`${t.x},${t.y}`, t]));

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 1000,
      manpower: 100,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      hotFrontierTiles: [hotOrigin],
      frontierTiles: ownedTiles,
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // The old size-based skip is gone — broadFallbackSkipped must never be true.
    expect(result.diagnostic.broadFallbackSkipped).toBeFalsy();
    expect(result.diagnostic.frontierOpportunityEconomic).toBeGreaterThan(0);
    expect(result.command).toMatchObject({ type: "EXPAND" });
  });

  it("marks broadFallbackSkipped when the narrow/hot scan alone is already actionable, even though a real target sits elsewhere on the frontier", () => {
    // The "tunnel vision" case docs/agents/topics/ai-planner.md flags as not
    // yet fixed: baseFrontierOrigins is winner-take-all, so a hot origin with
    // an enemy neighbor (actionable on its own, even unattackable this tick)
    // makes hasActionableFrontierAnalysis() true and the broad sweep of the
    // rest of the frontier never runs — even though a real economic
    // opportunity sits on a completely different, unscanned frontier tile.
    const hotOrigin = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemyNeighbor = makeTile(1, 0, { ownerId: "enemy-1" });
    const otherFrontier = makeTile(20, 20, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const economicNeutral = makeTile(21, 20, { resource: "IRON" });
    const ownedTiles = [hotOrigin, otherFrontier];
    const tilesByKey = new Map(
      [hotOrigin, enemyNeighbor, otherFrontier, economicNeutral].map((t) => [`${t.x},${t.y}`, t])
    );

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 1000,
      manpower: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      hotFrontierTiles: [hotOrigin],
      frontierTiles: ownedTiles,
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.frontierEnemyTargetCount).toBe(1);
    expect(result.diagnostic.broadFallbackSkipped).toBe(true);
  });

  it("forceBroadFrontierScan surfaces the distant economic target the narrow scan alone would hide", () => {
    // Same fixture as the tunnel-vision test above, but with the runtime-side
    // throttle (ai-hot-frontier-streak.ts) having decided this player's been
    // pinned on its hot origin too many consecutive ticks — this input is
    // what forces the broad sweep to run anyway.
    const hotOrigin = makeTile(0, 0, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const enemyNeighbor = makeTile(1, 0, { ownerId: "enemy-1" });
    const otherFrontier = makeTile(20, 20, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const economicNeutral = makeTile(21, 20, { resource: "IRON" });
    const ownedTiles = [hotOrigin, otherFrontier];
    const tilesByKey = new Map(
      [hotOrigin, enemyNeighbor, otherFrontier, economicNeutral].map((t) => [`${t.x},${t.y}`, t])
    );

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 1000,
      manpower: 0,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      hotFrontierTiles: [hotOrigin],
      frontierTiles: ownedTiles,
      ownedTiles,
      tilesByKey,
      forceBroadFrontierScan: true,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.diagnostic.broadFallbackSkipped).toBeFalsy();
    expect(result.diagnostic.frontierOpportunityEconomic).toBeGreaterThan(0);
  });

  it("bounds the broad fallback's frontierTiles contribution to a fixed sample regardless of empire size", () => {
    // Structural-complexity guard (per docs/agents/ai-guardrails.md: prove
    // hot-path bounds with deterministic counters, not wall-clock timing).
    // A 20,000-tile frontierTiles array must not be scanned in full by the
    // broad fallback — only BROAD_FALLBACK_FRONTIER_SAMPLE_CAP-ish tiles may
    // ever be touched, regardless of total empire size.
    const tileCount = 20_000;
    const ownedTiles = Array.from({ length: tileCount }, (_, i) =>
      makeTile(0, i, { ownerId: "ai-1", ownershipState: "FRONTIER" })
    );
    const hotOrigin = ownedTiles[0]!;
    const tilesByKey = new Map(ownedTiles.map((t) => [`${t.x},${t.y}`, t]));
    let accesses = 0;
    const countedFrontierTiles = new Proxy(ownedTiles, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && /^\d+$/.test(prop)) accesses += 1;
        return Reflect.get(target, prop, receiver);
      }
    });

    planAutomationCommand({
      playerId: "ai-1",
      points: 1000,
      manpower: 100,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      hotFrontierTiles: [hotOrigin],
      frontierTiles: countedFrontierTiles,
      ownedTiles,
      tilesByKey,
      clientSeq: 1,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // Sample cap (300) plus a handful of incidental length/iteration reads —
    // nowhere near the full 20,000-tile array.
    expect(accesses).toBeLessThan(1000);
  });
});
