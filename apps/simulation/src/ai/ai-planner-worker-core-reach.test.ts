import { describe, expect, it } from "vitest";

import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./planner-world-view.js";

/**
 * Regression cover for the live staging deadlock: the AI-planner worker
 * thread (ai-planner-worker.ts / combined-producer-worker.ts, the path
 * actually running whenever SIMULATION_AI_WORKER=1 — staging and prod) never
 * received reach data at all, so it proposed EXPAND targets with zero reach
 * awareness. The server's authoritative OUT_OF_REACH check then rejected
 * those commands every single tick, forever, while the AI sat frozen a few
 * tiles past its starting town despite plenty of legitimately-reachable land
 * nearby. Confirmed live: sim_ai_command_rejected_code_total{code="OUT_OF_REACH"}
 * tracked almost exactly the accepted EXPAND count, and reach-locked AIs'
 * owned tile counts didn't move for 5+ minutes on a freshly-reset season.
 *
 * Fix: PlannerPlayerView now carries reachTileKeys, synced from the runtime's
 * authoritative reachBorder (runtime.ts's reachTileKeysForPlayer), and the
 * worker core builds a reachLookup from it before calling
 * planAutomationCommand — mirroring what the (rarely used) direct in-process
 * path in runtime.ts already did.
 */

const tile = (over: Partial<PlannerTileView> & { x: number; y: number }): PlannerTileView => ({
  terrain: "LAND",
  ...over
});

describe("ai-planner-worker-core reach awareness", () => {
  it("picks the in-reach resource tile over the out-of-reach dock, even though the dock scores just as high", () => {
    const townKey = "10,10";
    const originKey = "11,10"; // owned FRONTIER tile, adjacent to every candidate below
    const dockKey = "12,10"; // unowned neutral, economic (dockId) — OUT of reach
    const resourceKey = "12,9"; // unowned neutral, economic (resource) — IN reach
    // Remaining 8-neighbors: plain, in-reach, present only so the planner has
    // full neighbor data and doesn't veto on missing-tile info.
    const plainNeighborKeys = ["10,9", "11,9", "10,11", "11,11", "12,11"];

    const tiles: PlannerTileView[] = [
      tile({ x: 10, y: 10, ownerId: "ai-1", ownershipState: "SETTLED", town: { populationTier: "SETTLEMENT" } }),
      tile({ x: 11, y: 10, ownerId: "ai-1", ownershipState: "FRONTIER" }),
      tile({ x: 12, y: 10, dockId: "dock-1" }),
      tile({ x: 12, y: 9, resource: "IRON" }),
      ...plainNeighborKeys.map((key) => {
        const [x, y] = key.split(",").map(Number);
        return tile({ x: x!, y: y! });
      })
    ];

    const player: PlannerPlayerView = {
      id: "ai-1",
      points: 100,
      manpower: 500,
      hasActiveLock: false,
      tileCollectionVersion: 1,
      topologyVersion: 1,
      topologyDirtyTileKeys: [],
      territoryTileKeys: [townKey, originKey],
      // The reach fix: the dock is deliberately excluded here, even though
      // it scores identically to the resource tile in
      // strategicFrontierTargetScore/classifyNeutralOpportunity (both
      // "economic"). Everything else is in reach.
      reachTileKeys: [townKey, originKey, resourceKey, ...plainNeighborKeys],
      frontierTileKeys: [originKey],
      hotFrontierTileKeys: [],
      strategicFrontierTileKeys: [],
      buildCandidateTileKeys: [],
      pendingSettlementTileKeys: [],
      townTileKeys: [townKey],
      activeDevelopmentProcessCount: 0,
      settledTileCount: 1,
      townCount: 1,
      ownedTileCount: 2,
      frontierTileCount: 1
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
    expect(targetKey).not.toBe(dockKey);
    expect(targetKey).toBe(resourceKey);
  });
});
