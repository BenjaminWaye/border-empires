/**
 * Regression: season-13 prod AIs on saturated islands (ai-9, ai-15, ai-7…)
 * sat on WAIT with `BLOCKED_NO_REACHABLE_BEACON_SITE` while ~70% of the map
 * was unclaimed. Their whole island was owned, so every origin's neighbours
 * were own land or sea (`neighborCandidateTotal` 1,920, zero neutral/enemy),
 * and the only way off was a dock crossing. The runtime exempts dock
 * crossings from the reach gate (runtime-frontier-command.ts), but the
 * planner reach-gated every neutral candidate, so the linked far-side dock —
 * outside the reach of the island it leaves, by definition — was always
 * pruned. A second gap: with >150 origins the border prefilter dropped any
 * dock not 8-adjacent to unowned land, so crossings vanished there too.
 */
import { describe, expect, it } from "vitest";

import { buildDockLinksByDockTileKey } from "../dock-network/dock-network.js";
import { planAutomationCommand } from "./automation-command-planner.js";
import { analyzeOwnedFrontierTargetsFromLookup, type PlannerTile } from "./frontier-command-planner.js";

const dockLinksByDockTileKey = buildDockLinksByDockTileKey([
  { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
  { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
]);

type Tile = PlannerTile & { ownershipState?: string };

/** A 15x15 island (inside a 17x17 sea ring) fully owned by ai-1 (dock on its edge at 10,10), ringed by sea, plus a neutral far-side dock island. */
const buildSaturatedIsland = (): { tilesByKey: Map<string, Tile>; owned: Tile[]; reachKeys: Set<string> } => {
  const tilesByKey = new Map<string, Tile>();
  const owned: Tile[] = [];
  const reachKeys = new Set<string>();
  for (let y = 9; y <= 25; y += 1) {
    for (let x = 9; x <= 25; x += 1) {
      const ring = x === 9 || y === 9 || x === 25 || y === 25;
      if (ring) {
        tilesByKey.set(`${x},${y}`, { x, y, terrain: "SEA" });
        continue;
      }
      const tile: Tile = {
        x,
        y,
        terrain: "LAND",
        ownerId: "ai-1",
        ownershipState: x === 17 && y === 17 ? "SETTLED" : "FRONTIER",
        ...(x === 10 && y === 10 ? { dockId: "dock-a" } : {})
      };
      tilesByKey.set(`${x},${y}`, tile);
      owned.push(tile);
      reachKeys.add(`${x},${y}`);
    }
  }
  tilesByKey.set("50,50", { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" });
  tilesByKey.set("51,50", { x: 51, y: 50, terrain: "LAND", resource: "FARM" });
  return { tilesByKey, owned, reachKeys };
};

describe("frontier planner dock crossings vs reach", () => {
  it("targets the linked far-side dock even though it lies outside the island's reach", () => {
    const { tilesByKey, owned, reachKeys } = buildSaturatedIsland();
    const analysis = analyzeOwnedFrontierTargetsFromLookup(tilesByKey, owned, "ai-1", {
      dockLinksByDockTileKey,
      reachLookup: { isInReach: (_pid, x, y) => reachKeys.has(`${x},${y}`) },
      preferFogEfficientExpansion: true
    });
    expect(owned.length).toBeGreaterThan(150);
    expect(analysis.frontierNeutralTargetCount).toBe(1);
    expect(analysis.expand).toMatchObject({ from: { x: 10, y: 10 }, target: { x: 50, y: 50 } });
  });

  it("keeps the dock as an origin when the >150-origin border prefilter finds land elsewhere", () => {
    const { tilesByKey, owned, reachKeys } = buildSaturatedIsland();
    // Out-of-reach neutral land touching the far side of the island makes the
    // prefilter non-empty, which used to drop the interior-facing dock.
    tilesByKey.set("25,17", { x: 25, y: 17, terrain: "LAND" });
    const analysis = analyzeOwnedFrontierTargetsFromLookup(tilesByKey, owned, "ai-1", {
      dockLinksByDockTileKey,
      reachLookup: { isInReach: (_pid, x, y) => reachKeys.has(`${x},${y}`) },
      preferFogEfficientExpansion: true
    });
    expect(analysis.expand).toMatchObject({ target: { x: 50, y: 50 } });
  });

  it("still reach-gates ordinary adjacent neutral land, docks linked or not", () => {
    const { tilesByKey, owned, reachKeys } = buildSaturatedIsland();
    tilesByKey.set("25,17", { x: 25, y: 17, terrain: "LAND" });
    // 11,9 borders the dock origin at 10,10, so a dock-wide exemption would admit it.
    tilesByKey.set("11,9", { x: 11, y: 9, terrain: "LAND" });
    for (const links of [undefined, dockLinksByDockTileKey]) {
      const analysis = analyzeOwnedFrontierTargetsFromLookup(tilesByKey, owned, "ai-1", {
        ...(links ? { dockLinksByDockTileKey: links } : {}),
        reachLookup: { isInReach: (_pid, x, y) => reachKeys.has(`${x},${y}`) }
      });
      expect(analysis.expand?.target).not.toMatchObject({ x: 25, y: 17 });
      expect(analysis.expand?.target).not.toMatchObject({ x: 11, y: 9 });
    }
  });

  it("prefers in-reach neutral land over an out-of-reach dock crossing", () => {
    const { tilesByKey, owned, reachKeys } = buildSaturatedIsland();
    // Unclaimed in-reach land left on the home island: no dock hop yet.
    tilesByKey.set("17,9", { x: 17, y: 9, terrain: "LAND", resource: "FARM" });
    reachKeys.add("17,9");
    const analysis = analyzeOwnedFrontierTargetsFromLookup(tilesByKey, owned, "ai-1", {
      dockLinksByDockTileKey,
      reachLookup: { isInReach: (_pid, x, y) => reachKeys.has(`${x},${y}`) },
      preferFogEfficientExpansion: true
    });
    expect(analysis.frontierNeutralTargetCount).toBe(1);
    expect(analysis.expand).toMatchObject({ target: { x: 17, y: 9 } });
  });

  it("does not target a far-side dock owned by an ally", () => {
    const { tilesByKey, owned, reachKeys } = buildSaturatedIsland();
    tilesByKey.set("50,50", { x: 50, y: 50, terrain: "LAND", dockId: "dock-b", ownerId: "ai-2" });
    const analysis = analyzeOwnedFrontierTargetsFromLookup(tilesByKey, owned, "ai-1", {
      dockLinksByDockTileKey,
      nonHostilePlayerIds: new Set(["ai-2"]),
      reachLookup: { isInReach: (_pid, x, y) => reachKeys.has(`${x},${y}`) }
    });
    expect(analysis.expand).toBeUndefined();
    expect(analysis.attack).toBeUndefined();
  });

  it("emits the dock-crossing EXPAND instead of stalling with BLOCKED_NO_REACHABLE_BEACON_SITE", () => {
    const { tilesByKey, owned, reachKeys } = buildSaturatedIsland();
    const frontierTiles = owned.filter((tile) => tile.ownershipState === "FRONTIER");
    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 3_400,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles,
      ownedTiles: owned,
      tilesByKey,
      dockLinksByDockTileKey,
      reachLookup: { isInReach: (_pid, x, y) => reachKeys.has(`${x},${y}`) },
      settledTileCount: 1,
      townCount: 0,
      clientSeq: 7,
      issuedAt: 1_000,
      sessionPrefix: "ai-runtime"
    });
    expect(result.diagnostic.noCommandReason).not.toBe("BLOCKED_NO_REACHABLE_BEACON_SITE");
    expect(result.command).toMatchObject({
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
  });
});
