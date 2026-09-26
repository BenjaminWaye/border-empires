import { aiWarReserveManpower, EXPAND_MANPOWER_COST } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./planner-world-view.js";

/**
 * Wiring cover for the muster-staged war reserve: the number is computed on the
 * main thread (runtime-state-export.ts) and must survive the hop into the
 * planner worker's per-player input, or spendableManpowerForPlanner silently
 * keeps the old full reserve and builds stay unaffordable (staging ai-2).
 */
const CAP = 1_044;
const tile = (over: Partial<PlannerTileView> & { x: number; y: number }): PlannerTileView => ({ terrain: "LAND", ...over });

const planFor = (musterStagedManpower: number | undefined): string | undefined => {
  const tiles: PlannerTileView[] = [
    tile({ x: 10, y: 10, ownerId: "ai-1", ownershipState: "SETTLED", town: { populationTier: "SETTLEMENT" } }),
    tile({ x: 11, y: 10, ownerId: "ai-1", ownershipState: "FRONTIER" }),
    tile({ x: 12, y: 9, resource: "IRON" }),
    ...["10,9", "11,9", "10,11", "11,11", "12,11", "12,10"].map((key) => {
      const [x, y] = key.split(",").map(Number);
      return tile({ x: x!, y: y! });
    })
  ];
  const keys = ["10,10", "11,10", "12,9", "10,9", "11,9", "10,11", "11,11", "12,11", "12,10"];
  const player: PlannerPlayerView = {
    id: "ai-1",
    points: 500,
    // Bare EXPAND cost only: affordable solely if the flag covers the war reserve.
    manpower: EXPAND_MANPOWER_COST,
    manpowerCapacity: CAP,
    ...(musterStagedManpower === undefined ? {} : { musterStagedManpower }),
    hasActiveLock: false,
    tileCollectionVersion: 1,
    topologyVersion: 1,
    topologyDirtyTileKeys: [],
    territoryTileKeys: ["10,10", "11,10"],
    reachTileKeys: keys,
    frontierTileKeys: ["11,10"],
    hotFrontierTileKeys: [],
    strategicFrontierTileKeys: [],
    buildCandidateTileKeys: [],
    pendingSettlementTileKeys: [],
    townTileKeys: ["10,10"],
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
  const command = posted.find((m) => m.type === "command")?.command as { type?: string } | null | undefined;
  return command?.type;
};

describe("ai-planner-worker-core muster-staged reserve", () => {
  it("does not spend the pool when the flags hold none of the war reserve", () => {
    expect(planFor(undefined)).not.toBe("EXPAND");
    expect(planFor(0)).not.toBe("EXPAND");
  });

  it("spends the pool once the view reports the flags hold the full war reserve", () => {
    expect(planFor(aiWarReserveManpower(CAP))).toBe("EXPAND");
  });
});
