import { describe, expect, it } from "vitest";
import { createBarbarianPlanner, BARBARIAN_PLAYER_ID } from "./system-job-barbarian-planner.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

// A barbarian dock (10,10) ringed by sea, linked to a far harbour (30,10).
// The far dock tile is a mountain, so the only way ashore is a beach landing:
// the coastal tile (30,11), which has sea to its south. The other land around
// the far dock is inland (no water on a cardinal side) and must not be offered.
const DOCK_LINKS = new Map<string, readonly string[]>([
  ["10,10", ["30,10"]],
  ["30,10", ["10,10"]]
]);

const world = (beachOwnerId?: string): Map<string, PlannerTileView> => {
  const tiles = new Map<string, PlannerTileView>();
  const put = (tile: PlannerTileView) => tiles.set(`${tile.x},${tile.y}`, tile);
  for (let y = 9; y <= 11; y += 1) {
    for (let x = 9; x <= 11; x += 1) put({ x, y, terrain: "SEA" });
  }
  put({ x: 10, y: 10, terrain: "LAND", ownerId: BARBARIAN_PLAYER_ID, ownershipState: "FRONTIER", dockId: "dock-a" });
  for (let y = 9; y <= 11; y += 1) {
    for (let x = 29; x <= 31; x += 1) put({ x, y, terrain: "LAND" });
  }
  put({ x: 30, y: 10, terrain: "MOUNTAIN", dockId: "dock-b" });
  put({ x: 30, y: 12, terrain: "SEA" });
  if (beachOwnerId) put({ x: 30, y: 11, terrain: "LAND", ownerId: beachOwnerId, ownershipState: "SETTLED" });
  return tiles;
};

const barbPlayer: PlannerPlayerView = {
  id: BARBARIAN_PLAYER_ID,
  points: 9999,
  manpower: 9999,
  tileCollectionVersion: 1,
  topologyVersion: 1,
  topologyDirtyTileKeys: [],
  hasActiveLock: false,
  territoryTileKeys: ["10,10"],
  frontierTileKeys: ["10,10"],
  hotFrontierTileKeys: [],
  strategicFrontierTileKeys: [],
  buildCandidateTileKeys: [],
  pendingSettlementTileKeys: [],
  activeDevelopmentProcessCount: 0
};

const chooseFor = (tilesByKey: Map<string, PlannerTileView>) => {
  const planner = createBarbarianPlanner({
    tilesByKey,
    resolveOwnedTiles: (p) => p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
    getDockLinksByDockTileKey: () => DOCK_LINKS,
    getVisibleToAnyNonBarbPlayer: () => new Set(["10,10"]),
    now: () => 1_000
  });
  return planner.choose(barbPlayer, 1, 1_000);
};

const targetOf = (command: { payloadJson: string }): string => {
  const payload = JSON.parse(command.payloadJson) as { toX: number; toY: number };
  return `${payload.toX},${payload.toY}`;
};

describe("barbarian planner — beach landings", () => {
  it("lands on the coastal tile beside a linked dock", () => {
    const command = chooseFor(world());
    expect(command?.type).toBe("EXPAND");
    expect(targetOf(command!)).toBe("30,11");
  });

  it("attacks a player holding the beach", () => {
    const command = chooseFor(world("player-1"));
    expect(command?.type).toBe("ATTACK");
    expect(targetOf(command!)).toBe("30,11");
  });

  it("other planners still only cross to the linked dock tile", () => {
    const tiles = world();
    const command = chooseNextOwnedFrontierCommandFromLookup(tiles, [tiles.get("10,10")!], BARBARIAN_PLAYER_ID, 1, 1_000, "test", {
      dockLinksByDockTileKey: DOCK_LINKS
    });
    expect(command).toBeUndefined();
  });
});
