import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { applyEconomyAccrual, consumeUpkeepFromTileYield, type RuntimeUpkeepAccrualContext } from "./runtime-upkeep-accrual.js";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext, UpkeepNeed } from "./runtime-types.js";
import { createEmptyPlayerRuntimeSummary, type PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { chosenTrickleRateForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";

vi.mock("./tech-domain-bridge/tech-domain-bridge.js", () => ({
  chosenTrickleRateForPlayer: vi.fn()
}));

const tileKey = (x: number, y: number): string => `${x},${y}`;

const testPlayer = (id: string, overrides: Partial<RuntimePlayer> = {}): RuntimePlayer => ({
  id,
  isAi: false,
  points: 100,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
  ...overrides
});

const goldTownTile = (x: number, y: number, ownerId: string): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  town: { type: "MARKET", populationTier: "SETTLEMENT" }
});

const ironResourceTile = (x: number, y: number, ownerId: string): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  resource: "IRON"
});

const emptyNeed = (): UpkeepNeed => ({ gold: 0, FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0 });

const emptyEconomyContext = (player: RuntimePlayer): RuntimeTileYieldEconomyContext => ({
  player,
  townNetwork: new Map(),
  fedTownKeys: new Set(),
  firstThreeTownKeys: new Set(),
  waterworksKeys: new Set(),
  foundryKeys: new Set()
});

type HarnessOptions = {
  tiles?: DomainTileState[];
  upkeep?: { gold?: number; food?: number; iron?: number; crystal?: number; supply?: number };
  hasSummary?: boolean;
};

const createHarness = (options: HarnessOptions = {}) => {
  const tiles = new Map<string, DomainTileState>();
  for (const tile of options.tiles ?? []) tiles.set(tileKey(tile.x, tile.y), tile);

  const yieldBearingTilesByOwner = new Map<string, Set<string>>();
  for (const tile of options.tiles ?? []) {
    if (!tile.ownerId) continue;
    const set = yieldBearingTilesByOwner.get(tile.ownerId) ?? new Set<string>();
    set.add(tileKey(tile.x, tile.y));
    yieldBearingTilesByOwner.set(tile.ownerId, set);
  }

  const events: Array<{ eventType: "TILE_YIELD_ANCHOR_BATCH"; commandId: string; playerId: string; anchors: Array<{ tileKey: string; collectedAt: number }> }> = [];
  const forgotten: string[] = [];
  const tileYieldCollectedAtByTile = new Map<string, number>();
  const sortedYieldBearingKeysByOwner = new Map<string, string[]>();
  const lastEconomyAccrualAtByPlayer = new Map<string, number>();
  const playerSummaries = new Map<string, PlayerRuntimeSummary>();

  const ctx: RuntimeUpkeepAccrualContext = {
    tiles,
    dockLinksByDockTileKey: new Map(),
    lastEconomyAccrualAtByPlayer,
    playerSummaries,
    yieldBearingTilesByOwner,
    sortedYieldBearingKeysByOwner,
    tileYieldCollectedAtByTile,
    cachedUpkeepAccrual: () => ({
      gold: options.upkeep?.gold ?? 0,
      food: options.upkeep?.food ?? 0,
      iron: options.upkeep?.iron ?? 0,
      crystal: options.upkeep?.crystal ?? 0,
      supply: options.upkeep?.supply ?? 0
    }),
    summaryForPlayer: (playerId) => playerSummaries.get(playerId) ?? createEmptyPlayerRuntimeSummary(),
    tileYieldEconomyContextForPlayer: (player) => emptyEconomyContext(player),
    enrichTileWithTownContext: (tile) => tile,
    tileYieldCollectedAt: (key) => tileYieldCollectedAtByTile.get(key),
    emitEvent: (event) => events.push(event),
    forgetReplayedCommand: (commandId) => forgotten.push(commandId)
  };

  return { ctx, tiles, events, forgotten, tileYieldCollectedAtByTile, sortedYieldBearingKeysByOwner, lastEconomyAccrualAtByPlayer, playerSummaries };
};

afterEach(() => {
  vi.mocked(chosenTrickleRateForPlayer).mockReset();
});

describe("consumeUpkeepFromTileYield", () => {
  it("does nothing when there is no outstanding upkeep need", () => {
    const player = testPlayer("player-1");
    const { ctx, events } = createHarness({ tiles: [goldTownTile(0, 0, "player-1")] });
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0)]);

    consumeUpkeepFromTileYield(ctx, player, summary, emptyNeed(), 1_000_000);

    expect(events).toHaveLength(0);
  });

  it("does nothing when the player has no territory", () => {
    const player = testPlayer("player-1");
    const { ctx, events } = createHarness({ tiles: [goldTownTile(0, 0, "player-1")] });
    const summary = createEmptyPlayerRuntimeSummary();
    const need: UpkeepNeed = { ...emptyNeed(), gold: 5 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, 1_000_000);

    expect(events).toHaveLength(0);
    expect(need.gold).toBe(5);
  });

  it("skips a yield-bearing tile key that no longer matches ownership/settlement/terrain", () => {
    const player = testPlayer("player-1");
    const otherOwnerTile = goldTownTile(0, 0, "player-2");
    const { ctx, events } = createHarness({ tiles: [otherOwnerTile] });
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0)]);
    const need: UpkeepNeed = { ...emptyNeed(), gold: 5 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, 1_000_000);

    expect(need.gold).toBe(5);
    expect(events).toHaveLength(0);
  });

  it("drains gold need from buffered tile yield and advances the anchor", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const lastCollectedAt = nowMs - 3_600_000; // 60 minutes of buffered yield
    const tile = goldTownTile(0, 0, "player-1");
    const { ctx, events, tileYieldCollectedAtByTile } = createHarness({ tiles: [tile] });
    tileYieldCollectedAtByTile.set(tileKey(0, 0), lastCollectedAt);
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0)]);
    const need: UpkeepNeed = { ...emptyNeed(), gold: 3 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    expect(need.gold).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("TILE_YIELD_ANCHOR_BATCH");
    expect(events[0]?.playerId).toBe("player-1");
    expect(events[0]?.commandId).toBe(`accrual:upkeep:player-1:${nowMs}`);
    expect(events[0]?.anchors).toHaveLength(1);
    const newAnchor = events[0]?.anchors[0]?.collectedAt ?? 0;
    expect(newAnchor).toBeGreaterThan(lastCollectedAt);
    expect(newAnchor).toBeLessThan(nowMs);
    expect(tileYieldCollectedAtByTile.get(tileKey(0, 0))).toBe(newAnchor);
  });

  it("drains strategic need (IRON) from a resource tile", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const lastCollectedAt = nowMs - 4 * 60 * 60_000; // 4 hours -> 10 IRON buffered (well under the 20 cap)
    const tile = ironResourceTile(0, 0, "player-1");
    const { ctx, tileYieldCollectedAtByTile } = createHarness({ tiles: [tile] });
    tileYieldCollectedAtByTile.set(tileKey(0, 0), lastCollectedAt);
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0)]);
    const need: UpkeepNeed = { ...emptyNeed(), IRON: 4 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    expect(need.IRON).toBe(0);
  });

  it("leaves remaining need untouched once tile yield is exhausted", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const lastCollectedAt = nowMs - 60_000; // 1 minute -> only 1 gold buffered
    const tile = goldTownTile(0, 0, "player-1");
    const { ctx, tileYieldCollectedAtByTile } = createHarness({ tiles: [tile] });
    tileYieldCollectedAtByTile.set(tileKey(0, 0), lastCollectedAt);
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0)]);
    const need: UpkeepNeed = { ...emptyNeed(), gold: 10 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    expect(need.gold).toBeCloseTo(9, 3);
  });

  it("stops iterating once the need is fully satisfied, leaving later tiles' anchors untouched", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const lastCollectedAt = nowMs - 3_600_000;
    const tileA = goldTownTile(0, 0, "player-1");
    const tileB = goldTownTile(0, 1, "player-1");
    const { ctx, events, tileYieldCollectedAtByTile } = createHarness({ tiles: [tileA, tileB] });
    tileYieldCollectedAtByTile.set(tileKey(0, 0), lastCollectedAt);
    tileYieldCollectedAtByTile.set(tileKey(0, 1), lastCollectedAt);
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0), tileKey(0, 1)]);
    const need: UpkeepNeed = { ...emptyNeed(), gold: 3 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    expect(need.gold).toBe(0);
    // Sorted order visits "0,0" before "0,1"; the second tile's need was
    // already satisfied so its anchor should be untouched.
    expect(tileYieldCollectedAtByTile.get(tileKey(0, 1))).toBe(lastCollectedAt);
    expect(events[0]?.anchors).toHaveLength(1);
    expect(events[0]?.anchors[0]?.tileKey).toBe(tileKey(0, 0));
  });

  it("batches anchor updates from multiple tiles into a single emitEvent call", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const lastCollectedAt = nowMs - 3_600_000;
    const tileA = goldTownTile(0, 0, "player-1");
    const tileB = goldTownTile(0, 1, "player-1");
    const { ctx, events, tileYieldCollectedAtByTile } = createHarness({ tiles: [tileA, tileB] });
    tileYieldCollectedAtByTile.set(tileKey(0, 0), lastCollectedAt);
    tileYieldCollectedAtByTile.set(tileKey(0, 1), lastCollectedAt);
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0), tileKey(0, 1)]);
    // Needs more gold than a single tile can supply, so both tiles drain.
    const need: UpkeepNeed = { ...emptyNeed(), gold: 100 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    expect(events).toHaveLength(1);
    expect(events[0]?.anchors).toHaveLength(2);
  });

  it("does not emit an event when a settled tile has no buffered yield to drain", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const tile = goldTownTile(0, 0, "player-1");
    const { ctx, events, forgotten, tileYieldCollectedAtByTile } = createHarness({ tiles: [tile] });
    tileYieldCollectedAtByTile.set(tileKey(0, 0), nowMs); // already collected as of now
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0)]);
    const need: UpkeepNeed = { ...emptyNeed(), gold: 5 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    expect(events).toHaveLength(0);
    expect(need.gold).toBe(5);
    // The synthetic replay-cache id is still forgotten even with no event.
    expect(forgotten).toEqual([`accrual:upkeep:player-1:${nowMs}`]);
  });

  it("computes and caches the sorted yield-bearing tile-key order on first use", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const tiles = [goldTownTile(2, 0, "player-1"), goldTownTile(0, 0, "player-1"), goldTownTile(1, 0, "player-1")];
    const { ctx, sortedYieldBearingKeysByOwner } = createHarness({ tiles });
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set(tiles.map((t) => tileKey(t.x, t.y)));
    // A zero need would return before the tile loop ever runs, so the sort
    // cache would never get populated — use a nonzero need to reach it.
    const need: UpkeepNeed = { ...emptyNeed(), gold: 0.01 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    expect(sortedYieldBearingKeysByOwner.get("player-1")).toEqual(["0,0", "1,0", "2,0"]);
  });

  it("reuses a pre-populated sorted cache instead of recomputing it", () => {
    const player = testPlayer("player-1");
    const nowMs = 10_000_000;
    const lastCollectedAt = nowMs - 3_600_000;
    const tileA = goldTownTile(0, 0, "player-1");
    const tileB = goldTownTile(0, 1, "player-1");
    const { ctx, events, sortedYieldBearingKeysByOwner, tileYieldCollectedAtByTile } = createHarness({ tiles: [tileA, tileB] });
    tileYieldCollectedAtByTile.set(tileKey(0, 0), lastCollectedAt);
    tileYieldCollectedAtByTile.set(tileKey(0, 1), lastCollectedAt);
    // Deliberately reversed vs. natural sort order.
    sortedYieldBearingKeysByOwner.set("player-1", [tileKey(0, 1), tileKey(0, 0)]);
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0), tileKey(0, 1)]);
    const need: UpkeepNeed = { ...emptyNeed(), gold: 3 };

    consumeUpkeepFromTileYield(ctx, player, summary, need, nowMs);

    // The cached (reversed) order was honored: "0,1" drained first and alone
    // satisfies the need, so "0,0" is never touched.
    expect(events[0]?.anchors).toHaveLength(1);
    expect(events[0]?.anchors[0]?.tileKey).toBe(tileKey(0, 1));
  });
});

describe("applyEconomyAccrual", () => {
  it("records the first-seen timestamp without applying any upkeep", () => {
    const player = testPlayer("player-1");
    const { ctx, lastEconomyAccrualAtByPlayer } = createHarness({ upkeep: { gold: 10 } });

    applyEconomyAccrual(ctx, player, 1_000);

    expect(lastEconomyAccrualAtByPlayer.get("player-1")).toBe(1_000);
    expect(player.points).toBe(100);
  });

  it("is a no-op while under the 15s rate-limit window, and does not move the anchor", () => {
    const player = testPlayer("player-1");
    const { ctx, playerSummaries, lastEconomyAccrualAtByPlayer } = createHarness({ upkeep: { gold: 10 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 14_999);

    expect(lastEconomyAccrualAtByPlayer.get("player-1")).toBe(1_000);
    expect(player.points).toBe(100);
  });

  it("skips upkeep work but still advances the anchor when the player has no summary yet", () => {
    const player = testPlayer("player-1");
    const cachedUpkeepAccrual = vi.fn();
    const { ctx, lastEconomyAccrualAtByPlayer } = createHarness();
    ctx.cachedUpkeepAccrual = cachedUpkeepAccrual;
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    expect(cachedUpkeepAccrual).not.toHaveBeenCalled();
    expect(lastEconomyAccrualAtByPlayer.get("player-1")).toBe(16_000);
  });

  it("drains gold and strategic upkeep from points/stockpile once 15s have elapsed with no covering tile yield", () => {
    const player = testPlayer("player-1", { points: 100, strategicResources: { FOOD: 10, IRON: 10, CRYSTAL: 10, SUPPLY: 10, SHARD: 0 } });
    const { ctx, playerSummaries } = createHarness({ upkeep: { gold: 2, food: 1, iron: 1, crystal: 1, supply: 1 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    // 15s = 0.25 minutes of upkeep at the configured per-minute rates.
    expect(player.points).toBeCloseTo(100 - 0.5, 6);
    expect(player.strategicResources?.FOOD).toBeCloseTo(10 - 0.25, 6);
    expect(player.strategicResources?.IRON).toBeCloseTo(10 - 0.25, 6);
    expect(player.strategicResources?.CRYSTAL).toBeCloseTo(10 - 0.25, 6);
    expect(player.strategicResources?.SUPPLY).toBeCloseTo(10 - 0.25, 6);
  });

  it("never drops points/stockpiles below zero", () => {
    const player = testPlayer("player-1", { points: 0.1, strategicResources: { FOOD: 0.1, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } });
    const { ctx, playerSummaries } = createHarness({ upkeep: { gold: 100, food: 100 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    expect(player.points).toBe(0);
    expect(player.strategicResources?.FOOD).toBe(0);
  });

  it("drains upkeep from settled tile yield before touching points", () => {
    const nowStart = 1_000;
    const player = testPlayer("player-1", { points: 100 });
    const tile = goldTownTile(0, 0, "player-1");
    const { ctx, playerSummaries, tileYieldCollectedAtByTile } = createHarness({ tiles: [tile], upkeep: { gold: 2 } });
    const summary = createEmptyPlayerRuntimeSummary();
    summary.territoryTileKeys = new Set([tileKey(0, 0)]);
    playerSummaries.set("player-1", summary);
    // Buffer an hour of gold yield on the tile before the accrual tick fires.
    tileYieldCollectedAtByTile.set(tileKey(0, 0), nowStart + 15_000 - 3_600_000);
    applyEconomyAccrual(ctx, player, nowStart);

    applyEconomyAccrual(ctx, player, nowStart + 15_000);

    // need.gold = 2 * 0.25min = 0.5, fully covered by the ~60 buffered gold on the tile.
    expect(player.points).toBe(100);
  });

  it("credits the player's chosen trickle resource before draining upkeep", () => {
    vi.mocked(chosenTrickleRateForPlayer).mockReturnValue({ resource: "IRON", ratePerMinute: 4 });
    const player = testPlayer("player-1", { strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 } });
    const { ctx, playerSummaries } = createHarness({ upkeep: { iron: 1 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    // Trickle credits 4/min * 0.25min = 1 IRON, then upkeep drains 1/min * 0.25min = 0.25 IRON.
    expect(player.strategicResources?.IRON).toBeCloseTo(1 - 0.25, 6);
  });

  it("runs the accrual work through trackSyncMainThreadTask when provided", () => {
    const player = testPlayer("player-1");
    const { ctx, playerSummaries } = createHarness({ upkeep: { gold: 4 } });
    playerSummaries.set("player-1", createEmptyPlayerRuntimeSummary());
    const trackSyncMainThreadTask = vi.fn((_label: string, _meta: unknown, run: () => void) => run());
    ctx.trackSyncMainThreadTask = trackSyncMainThreadTask;
    applyEconomyAccrual(ctx, player, 1_000);

    applyEconomyAccrual(ctx, player, 1_000 + 15_000);

    expect(trackSyncMainThreadTask).toHaveBeenCalledTimes(1);
    expect(trackSyncMainThreadTask.mock.calls[0]?.[0]).toBe("apply_economy_accrual");
    expect(trackSyncMainThreadTask.mock.calls[0]?.[1]).toEqual({ playerId: "player-1" });
    expect(player.points).toBeCloseTo(100 - 1, 6);
  });
});
