import { describe, expect, it } from "vitest";
import { createBarbarianPlanner, BARBARIAN_PLAYER_ID, BARBARIAN_TILE_COOLDOWN_MS, MAX_BARBARIAN_TILES } from "./system-job-barbarian-planner.js";
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
  topologyVersion: 1,
  topologyDirtyTileKeys: [],
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
  it("defaults to a 15 second per-tile action cooldown", () => {
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(10, 10), makeBarbTile(10, 10)],
      [tileKey(10, 11), makePlayerTile(10, 11)]
    ]);
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      getVisibleToAnyNonBarbPlayer: () => new Set([tileKey(10, 10)]),
      now: () => 1_000
    });

    const cmd = planner.choose(makeBarbPlayer([tileKey(10, 10)]), 1, 1_000);
    expect(cmd).not.toBeNull();
    const payload = JSON.parse(cmd!.payloadJson) as { fromX: number; fromY: number; toX: number; toY: number };
    expect(BARBARIAN_TILE_COOLDOWN_MS).toBe(15_000);
    expect(planner.cooldownByTileKey.get(tileKey(payload.fromX, payload.fromY))).toBe(16_000);
    expect(planner.cooldownByTileKey.get(tileKey(payload.toX, payload.toY))).toBe(16_000);
  });

  it("cools down BOTH the source and target tile after a successful command", () => {
    // Barb sits at (10,10), visible to a player; planner emits a walk and the
    // post-command cooldown lands on both endpoints.
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(10, 10), makeBarbTile(10, 10)],
      [tileKey(10, 11), makePlayerTile(10, 11)]
    ]);
    const visible = new Set([tileKey(10, 10)]);
    let nowMs = 1_000;
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      getVisibleToAnyNonBarbPlayer: () => visible,
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
    // (a) barb attacks player from (10,10) → walks into (10,11), target becomes barb,
    // (b) on the next tick the newly-barb (10,11) would otherwise immediately act
    //     against player tile (10,12). The cooldown blocks that.
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(10, 10), makeBarbTile(10, 10)],
      [tileKey(10, 11), makePlayerTile(10, 11)],
      [tileKey(10, 12), makePlayerTile(10, 12)]
    ]);
    const visible = new Set([tileKey(10, 10), tileKey(10, 11)]);
    let nowMs = 1_000;
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      getVisibleToAnyNonBarbPlayer: () => visible,
      now: () => nowMs,
      cooldownMs: 15_000
    });

    const firstCmd = planner.choose(makeBarbPlayer([tileKey(10, 10)]), 1, nowMs);
    expect(firstCmd).not.toBeNull();
    const { toX, toY } = JSON.parse(firstCmd!.payloadJson) as { toX: number; toY: number };
    expect([toX, toY]).toEqual([10, 11]);

    tilesByKey.set(tileKey(10, 10), { x: 10, y: 10, terrain: "LAND" });
    tilesByKey.set(tileKey(10, 11), makeBarbTile(10, 11));

    nowMs += 50;
    const cascadeCmd = planner.choose(makeBarbPlayer([tileKey(10, 11)]), 2, nowMs);
    expect(cascadeCmd).toBeNull();

    nowMs += 16_000;
    const followUp = planner.choose(makeBarbPlayer([tileKey(10, 11)]), 3, nowMs);
    expect(followUp).not.toBeNull();
  });

  it("ignores tiles not visible to any non-barb player (idle interior barbs cost nothing)", () => {
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
      getVisibleToAnyNonBarbPlayer: () => new Set(),
      now: () => 1_000,
      cooldownMs: 15_000
    });
    const player = makeBarbPlayer([tileKey(0, 0), tileKey(1, 0), tileKey(0, 1)]);

    expect(planner.choose(player, 1, 1_000)).toBeNull();
    expect(planner.cooldownByTileKey.size).toBe(0);
  });

  it("activates a barb that's revealed but has no orthogonal player neighbor", () => {
    // This is the exact prod case: player frontier 2+ tiles away (out of
    // orthogonal range under the old check) but inside the player's vision
    // bubble — the barb must activate and walk into a neutral neighbor.
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(222, 147), makeBarbTile(222, 147)],
      [tileKey(223, 145), makePlayerTile(223, 145)]
      // (222,146) and friends are neutral (undefined) → walk targets
    ]);
    const visible = new Set([tileKey(222, 147)]);
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      getVisibleToAnyNonBarbPlayer: () => visible,
      now: () => 1_000,
      cooldownMs: 15_000
    });
    const cmd = planner.choose(makeBarbPlayer([tileKey(222, 147)]), 1, 1_000);
    // No neutral land tiles exist around (222,147), so the planner returns
    // null this tick — the value here is that activation no longer short-
    // circuits on "no orthogonal player neighbor."
    expect(cmd).toBeNull();
    // Now add a neutral land tile within 8-direction action range and re-plan;
    // the barb should walk into it.
    tilesByKey.set(tileKey(222, 146), { x: 222, y: 146, terrain: "LAND" });
    const cmd2 = planner.choose(makeBarbPlayer([tileKey(222, 147)]), 2, 1_000);
    expect(cmd2).not.toBeNull();
  });

  it("returns null fast when the visible set is empty (no players, no work)", () => {
    const tilesByKey = new Map<string, PlannerTileView>([
      [tileKey(5, 5), makeBarbTile(5, 5)]
    ]);
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      getVisibleToAnyNonBarbPlayer: () => new Set(),
      now: () => 1_000
    });
    expect(planner.choose(makeBarbPlayer([tileKey(5, 5)]), 1, 1_000)).toBeNull();
  });

  it("takes no action once at/over the territory cap so the barbarian cannot grow unbounded", () => {
    // Build a barbarian at exactly the cap, every tile visible and eligible.
    // Without the cap the planner would emit an expansion command; with it,
    // the barbarian stays put so its per-churn planner export cost stays
    // bounded (see MAX_BARBARIAN_TILES rationale).
    const tilesByKey = new Map<string, PlannerTileView>();
    const territory: string[] = [];
    const visible = new Set<string>();
    for (let i = 0; i < MAX_BARBARIAN_TILES; i += 1) {
      const x = i;
      const y = 0;
      tilesByKey.set(tileKey(x, y), makeBarbTile(x, y));
      territory.push(tileKey(x, y));
      visible.add(tileKey(x, y));
    }
    // A neutral tile the barbarian could expand into if it were allowed to act.
    tilesByKey.set(tileKey(0, 1), { x: 0, y: 1, terrain: "LAND" });
    const planner = createBarbarianPlanner({
      tilesByKey,
      resolveOwnedTiles: (p) =>
        p.territoryTileKeys.map((k) => tilesByKey.get(k)).filter((t): t is PlannerTileView => !!t),
      getDockLinksByDockTileKey: () => new Map(),
      getVisibleToAnyNonBarbPlayer: () => visible,
      now: () => 1_000
    });
    expect(planner.choose(makeBarbPlayer(territory), 1, 1_000)).toBeNull();

    // One tile below the cap, it acts again.
    const belowCap = territory.slice(0, MAX_BARBARIAN_TILES - 1);
    expect(planner.choose(makeBarbPlayer(belowCap), 2, 1_000)).not.toBeNull();
  });

});
