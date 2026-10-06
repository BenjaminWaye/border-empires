import { describe, expect, it } from "vitest";
import { planAutomationCommand } from "./automation-command-planner.js";
import { createAiPlannerWorkerCore } from "./ai-planner-worker-core.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

type Path = "direct" | "worker";
const plan = (path: Path, site: PlannerTileView, tiles: PlannerTileView[]) => {
  const siteKey = `${site.x},${site.y}`;
  const owned = tiles.filter((tile) => tile.ownerId === "ai-1");
  const ownedKeys = owned.map((tile) => `${tile.x},${tile.y}`);
  const frontierKeys = owned.filter((tile) => tile.ownershipState === "FRONTIER").map((tile) => `${tile.x},${tile.y}`);
  const player: PlannerPlayerView = {
    id: "ai-1", points: 500, manpower: 500, hasActiveLock: false,
    tileCollectionVersion: 1, topologyVersion: 1, topologyDirtyTileKeys: [],
    territoryTileKeys: ownedKeys, reachTileKeys: ownedKeys,
    focusFrontTileKeys: [siteKey], frontierTileKeys: frontierKeys,
    hotFrontierTileKeys: [], strategicFrontierTileKeys: [],
    buildCandidateTileKeys: [siteKey], pendingSettlementTileKeys: [], townTileKeys: [],
    activeDevelopmentProcessCount: 0, ownedTileCount: owned.length,
    frontierTileCount: frontierKeys.length, settledTileCount: owned.length - frontierKeys.length,
    townCount: 0, ownedStructureCounts: { RELAY_BEACON: 5 }
  };
  if (path === "direct") {
    return planAutomationCommand({
      playerId: player.id, points: player.points, manpower: player.manpower,
      hasActiveLock: false, activeDevelopmentProcessCount: 0,
      ownedStructureCounts: player.ownedStructureCounts,
      frontierTiles: owned.filter((tile) => tile.ownershipState === "FRONTIER"),
      buildCandidateTiles: [site], ownedTiles: owned,
      spatialFocusFront: new Set([siteKey]),
      reachLookup: { isInReach: (_id, x, y) => ownedKeys.includes(`${x},${y}`) },
      tilesByKey: new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile])),
      clientSeq: 1, issuedAt: 1000, sessionPrefix: "ai-runtime"
    }).command;
  }
  const posted: Record<string, unknown>[] = [];
  const core = createAiPlannerWorkerCore((message) => posted.push(message));
  core.handleMessage({ type: "init", worldView: { players: [player], tiles } });
  core.handleMessage({ type: "plan", playerId: player.id, clientSeq: 1, issuedAt: 1000, skipPreplan: true });
  expect(posted.some((message) => message.type === "error")).toBe(false);
  return posted.find((message) => message.type === "command")?.command;
};

// Deliberately no worldgen seed or terrain overrides: unseen cells must remain
// viable exploration targets using the same data available in the worker.
describe.each<Path>(["direct", "worker"])("relay exploration progress through %s planner", (path) => {
  it("builds from a settled site with no visible neutral prize instead of waiting", () => {
    const site: PlannerTileView = { x: 100, y: 100, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" };
    expect(plan(path, site, [site])).toMatchObject({
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 100, y: 100, structureType: "RELAY_BEACON" })
    });
  });

  it("settles an in-reach frontier site, then builds its relay after settlement", () => {
    const site: PlannerTileView = { x: 100, y: 100, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" };
    expect(plan(path, site, [site])).toMatchObject({ type: "SETTLE", payloadJson: JSON.stringify({ x: 100, y: 100 }) });
    site.ownershipState = "SETTLED";
    expect(plan(path, site, [site])).toMatchObject({ type: "BUILD_ECONOMIC_STRUCTURE" });
  });

  it("continues inland exploration when water shadows the offshore fog", () => {
    const site: PlannerTileView = { x: 102, y: 100, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" };
    const existing: PlannerTileView = {
      x: 100, y: 102, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "ai-1", type: "RELAY_BEACON", status: "active" }
    };
    const tiles = [site, existing];
    for (let dy = -5; dy <= 5; dy += 1) {
      for (let dx = 1; dx <= 4; dx += 1) tiles.push({ x: site.x + dx, y: site.y + dy, terrain: "SEA" });
    }
    expect(plan(path, site, tiles)).toMatchObject({
      type: "BUILD_ECONOMIC_STRUCTURE",
      payloadJson: JSON.stringify({ x: 102, y: 100, structureType: "RELAY_BEACON" })
    });
  });
});
