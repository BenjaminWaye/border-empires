import { describe, expect, it } from "vitest";
import { createBarbarianPlanner, BARBARIAN_PLAYER_ID } from "./system-job-barbarian-planner.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";

const makeBarbTile = (x: number, y: number): PlannerTileView => ({
  x,
  y,
  terrain: "LAND",
  ownerId: BARBARIAN_PLAYER_ID,
  ownershipState: "FRONTIER"
});

const makePlayerTile = (x: number, y: number, ownerId = "player-1"): PlannerTileView => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED"
});

const makeBarbPlayer = (territoryTileKeys: string[]): PlannerPlayerView => ({
  id: BARBARIAN_PLAYER_ID,
  points: 9999,
  manpower: 9999,
  tileCollectionVersion: 1,
  hasActiveLock: false,
  territoryTileKeys,
  frontierTileKeys: territoryTileKeys,
  hotFrontierTileKeys: [],
  strategicFrontierTileKeys: [],
  buildCandidateTileKeys: [],
  pendingSettlementTileKeys: [],
  activeDevelopmentProcessCount: 0
});

const tileKey = (x: number, y: number): string => `${x},${y}`;

describe("createBarbarianPlanner cooldown", () => {
  it("cools down BOTH the source and target tile after a successful command", () => {
    // Barb sits at (10,10). Player tile at (10,11) provides activation.
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(10, 10), makeBarbTile(10, 10)],
      [tileKey(10, 11), makePlayerTile(10, 11)]
    ]);
    let nowMs = 1_000;
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      now: () => nowMs,
      cooldownMs: 15_000
    });
    const player = makeBarbPlayer([tileKey(10, 10)]);

    const cmd = planner.choose(player, 1, nowMs);
    expect(cmd).not.toBeNull();
    const payload = JSON.parse(cmd!.payloadJson) as { fromX: number; fromY: number; toX: number; toY: number };

    expect(planner.cooldownByTileKey.get(tileKey(payload.fromX, payload.fromY))).toBe(nowMs + 15_000);
    expect(planner.cooldownByTileKey.get(tileKey(payload.toX, payload.toY))).toBe(nowMs + 15_000);
  });

  it("prevents cascade: a freshly-walked barb at the target cannot act on the next plan", () => {
    // Simulate the player breaching a cluster: the chain we want to prevent is
    // (a) barb attacks player from (10,10) → walks into (10,11), target becomes barb,
    // (b) on the very next tick the newly-barb (10,11) is adjacent to remaining
    // player tile (10,12) and would otherwise immediately attack.
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(10, 10), makeBarbTile(10, 10)],
      [tileKey(10, 11), makePlayerTile(10, 11)],
      [tileKey(10, 12), makePlayerTile(10, 12)]
    ]);
    let nowMs = 1_000;
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      now: () => nowMs,
      cooldownMs: 15_000
    });

    const firstCmd = planner.choose(makeBarbPlayer([tileKey(10, 10)]), 1, nowMs);
    expect(firstCmd).not.toBeNull();
    const { toX, toY } = JSON.parse(firstCmd!.payloadJson) as { toX: number; toY: number };
    expect([toX, toY]).toEqual([10, 11]);

    // Apply the walk: source releases to neutral (mimics runtime resolution
    // with progress < threshold), target becomes barb.
    tilesByKey.set(tileKey(10, 10), { x: 10, y: 10, terrain: "LAND" });
    tilesByKey.set(tileKey(10, 11), makeBarbTile(10, 11));

    // Advance 1 tick — well inside the 15s cooldown window.
    nowMs += 50;
    const cascadeCmd = planner.choose(makeBarbPlayer([tileKey(10, 11)]), 2, nowMs);
    expect(cascadeCmd).toBeNull();

    // After the cooldown elapses, the same barb is free to act again.
    nowMs += 16_000;
    const followUp = planner.choose(makeBarbPlayer([tileKey(10, 11)]), 3, nowMs);
    expect(followUp).not.toBeNull();
  });

  it("ignores tiles with no non-barb neighbor (idle interior barbs cost nothing)", () => {
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(0, 0), makeBarbTile(0, 0)],
      [tileKey(1, 0), makeBarbTile(1, 0)],
      [tileKey(0, 1), makeBarbTile(0, 1)]
    ]);
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      now: () => 1_000,
      cooldownMs: 15_000
    });
    const player = makeBarbPlayer([tileKey(0, 0), tileKey(1, 0), tileKey(0, 1)]);

    expect(planner.choose(player, 1, 1_000)).toBeNull();
    expect(planner.cooldownByTileKey.size).toBe(0);
  });
});
