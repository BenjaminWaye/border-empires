import { describe, expect, it } from "vitest";

import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./planner-world-view.js";

/**
 * Regression cover for the staging login-stall root cause: the spatial-focus
 * CPU cap (ai-spatial-focus.ts, AI_SPATIAL_FOCUS_MAX_OWNED_TILES) was fully
 * built and wired into runtime.ts's in-process path, but never wired into
 * ai-planner-worker-core.ts — the path SIMULATION_AI_WORKER=1 (staging/prod)
 * actually runs. Every worker-mode AI's frontier scan was therefore unbounded
 * by empire size, exactly the cost the cap exists to prevent (its own module
 * comment: "prod observed 30-45s synchronous stalls pre-fix, all inside
 * frontier-command-planner.ts candidate enumeration"). Confirmed live on
 * staging: an empire with a 6,908-tile frontier cost 391ms p99 per planner
 * pass vs. 4ms on a small empire, saturating the shared sim thread that also
 * serves player logins.
 *
 * Fix: PlannerPlayerView now carries focusFrontTileKeys, synced from the
 * runtime's authoritative spatial-focus state (runtime.ts's
 * spatialFocusFrontTileKeysForPlayer), and the worker core builds a
 * spatialFocusFront Set from it before calling planAutomationCommand —
 * mirroring the reachLookup fix in ai-planner-worker-core-reach.test.ts.
 *
 * This test proves the cap is actually enforced, not just wired: given two
 * expand origins where only one is in the synced focus front, and the
 * OTHER (excluded) origin's target scores unambiguously higher
 * (strategicFrontierTargetScore's +450 for dockId dominates any resource
 * tier), the worker must still pick the focus-front origin's lower-scoring
 * target — i.e. the excluded origin is never even scanned, not merely
 * deprioritized on a tie.
 */

const tile = (over: Partial<PlannerTileView> & { x: number; y: number }): PlannerTileView => ({
  terrain: "LAND",
  ...over
});

describe("ai-planner-worker-core spatial focus", () => {
  it("only considers origins inside the synced focus front, even though the excluded origin's target scores higher", () => {
    const townKey = "10,10";
    const originInFocusKey = "11,10"; // owned FRONTIER, inside focusFrontTileKeys
    const originOutOfFocusKey = "11,12"; // owned FRONTIER, outside focusFrontTileKeys
    const resourceTargetKey = "12,10"; // neutral, GEMS resource (lower score) — adjacent to originInFocusKey
    const dockTargetKey = "12,12"; // neutral, dockId (unambiguously higher score) — adjacent to originOutOfFocusKey

    const tiles: PlannerTileView[] = [
      tile({ x: 10, y: 10, ownerId: "ai-1", ownershipState: "SETTLED", town: { populationTier: "SETTLEMENT" } }),
      tile({ x: 11, y: 10, ownerId: "ai-1", ownershipState: "FRONTIER" }),
      tile({ x: 11, y: 12, ownerId: "ai-1", ownershipState: "FRONTIER" }),
      tile({ x: 12, y: 10, resource: "GEMS" }),
      tile({ x: 12, y: 12, dockId: "dock-1" })
    ];

    const player: PlannerPlayerView = {
      id: "ai-1",
      points: 100,
      manpower: 500,
      hasActiveLock: false,
      tileCollectionVersion: 1,
      topologyVersion: 1,
      topologyDirtyTileKeys: [],
      territoryTileKeys: [townKey, originInFocusKey, originOutOfFocusKey],
      // Reach must not be the limiting factor here — everything in play is reachable.
      reachTileKeys: [townKey, originInFocusKey, originOutOfFocusKey, resourceTargetKey, dockTargetKey],
      // The spatial-focus fix: without it, both origins are scanned (this is
      // the pre-fix behavior) and the higher-scoring dock tile wins.
      focusFrontTileKeys: [originInFocusKey],
      frontierTileKeys: [originInFocusKey, originOutOfFocusKey],
      hotFrontierTileKeys: [],
      strategicFrontierTileKeys: [],
      buildCandidateTileKeys: [],
      pendingSettlementTileKeys: [],
      townTileKeys: [townKey],
      activeDevelopmentProcessCount: 0,
      settledTileCount: 1,
      townCount: 1,
      ownedTileCount: 3,
      frontierTileCount: 2
    };

    const worldView: PlannerWorldView = { tiles, players: [player] };

    const posted: Record<string, unknown>[] = [];
    const core = createAiPlannerWorkerCore((msg) => posted.push(msg));

    core.handleMessage({ type: "init", worldView });
    core.handleMessage({ type: "plan", playerId: "ai-1", clientSeq: 1, issuedAt: Date.now(), skipPreplan: true });

    const commandMsg = posted.find((m) => m.type === "command");
    expect(commandMsg).toBeDefined();
    const command = commandMsg?.command as { type?: string; payloadJson?: string } | null | undefined;

    expect(command?.type).toBe("EXPAND");
    const payload = JSON.parse(command!.payloadJson!) as { toX: number; toY: number };
    const targetKey = `${payload.toX},${payload.toY}`;
    expect(targetKey).not.toBe(dockTargetKey);
    expect(targetKey).toBe(resourceTargetKey);
  });
});
