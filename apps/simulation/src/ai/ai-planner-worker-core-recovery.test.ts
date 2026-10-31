import { describe, expect, it } from "vitest";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

const town = (x: number): PlannerTileView => ({
  x, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED",
  town: { populationTier: "TOWN", population: 400 }
});

const setup = (tiles: PlannerTileView[], foodDeficit: boolean) => {
  const keys = tiles.map(t => `${t.x},${t.y}`);
  const player: PlannerPlayerView = {
    id: "ai-1", points: 2500, manpower: 0, hasActiveLock: false,
    tileCollectionVersion: 1, topologyVersion: 1, topologyDirtyTileKeys: [],
    territoryTileKeys: keys, reachTileKeys: keys, focusFrontTileKeys: [], frontierTileKeys: [],
    hotFrontierTileKeys: [], strategicFrontierTileKeys: [], buildCandidateTileKeys: keys,
    pendingSettlementTileKeys: [], townTileKeys: keys.filter(k => tiles.find(t => `${t.x},${t.y}` === k)?.town),
    activeDevelopmentProcessCount: 0, ownedTileCount: tiles.length, frontierTileCount: 0,
    settledTileCount: tiles.length, townCount: tiles.filter(t => t.town).length,
    strategicResources: { FOOD: foodDeficit ? 0 : 600 },
    slotSupplyByResource: { FOOD: foodDeficit ? 1 : 100 }, slotDemandByResource: { FOOD: 8 }
  };
  const posted: Record<string, unknown>[] = [];
  const core = createAiPlannerWorkerCore(msg => posted.push(msg));
  core.handleMessage({ type: "init", worldView: { tiles, players: [player] } });
  const plan = (skipPreplan: boolean) => {
    core.handleMessage({ type: "plan", playerId: player.id, clientSeq: posted.length + 1, issuedAt: Date.now(), skipPreplan });
    return posted.filter(msg => msg.type === "command").at(-1);
  };
  return { core, plan };
};

describe("worker recovery after a tile delta with unchanged collection version", () => {
  it("upgrades a town that matures after the tile arrays were cached", () => {
    const { core, plan } = setup([town(0), town(2)], false);
    plan(true);
    core.handleMessage({ type: "tile_deltas", tileDeltas: [
      { x: 2, y: 0, townJson: JSON.stringify({ populationTier: "TOWN", population: 150_000 }) }
    ] });
    expect(plan(false)).toMatchObject({ command: { type: "UPGRADE_TOWN_TIER", payloadJson: JSON.stringify({ x: 2, y: 0 }) } });
  });

  it("stops selecting a town for abandonment when an owned AFC arrives there", () => {
    const { core, plan } = setup([town(0), town(2)], true);
    expect(plan(true)).toMatchObject({ command: { type: "UNCAPTURE_TILE", payloadJson: JSON.stringify({ x: 0, y: 0 }) } });
    core.handleMessage({ type: "tile_deltas", tileDeltas: [
      { x: 0, y: 0, afcJson: JSON.stringify({ ownerId: "ai-1", status: "active" }) }
    ] });
    expect(plan(true)).toMatchObject({ command: { type: "UNCAPTURE_TILE", payloadJson: JSON.stringify({ x: 2, y: 0 }) } });
  });

  it("does not keep disabling the same structure after its manual-disable delta", () => {
    const consumer = (x: number): PlannerTileView => ({
      x, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "ai-1", type: "MINE", status: "active" }
    });
    const { core, plan } = setup([consumer(0), consumer(2)], true);
    expect(plan(true)).toMatchObject({ command: { type: "SET_CONVERTER_STRUCTURE_ENABLED", payloadJson: JSON.stringify({ x: 0, y: 0, enabled: false }) } });
    core.handleMessage({ type: "tile_deltas", tileDeltas: [
      { x: 0, y: 0, economicStructureJson: JSON.stringify({ ownerId: "ai-1", type: "MINE", status: "inactive", inactiveReason: "manual" }) }
    ] });
    expect(plan(true)).toMatchObject({ command: { type: "SET_CONVERTER_STRUCTURE_ENABLED", payloadJson: JSON.stringify({ x: 2, y: 0, enabled: false }) } });
  });
});
