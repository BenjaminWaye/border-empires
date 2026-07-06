/**
 * Regression test for the AI gold-reserve fix.
 *
 * Bug: the auto-claim tick (tickTerritoryAutomation) spent gold on new
 * frontier claims for any player as long as points >= FRONTIER_CLAIM_COST
 * (1). Because this runs every simulation tick, unconditionally, it
 * outpaced AI players' passive income (a few gold/minute), permanently
 * pinning their gold below SETTLE_COST (4) and locking them out of ever
 * affording an explicit SETTLE command — the only path that converts a
 * claimed FRONTIER tile into an income-producing town. Live staging data
 * confirmed this: AI players held 90-167 owned tiles but only 2-6 settled
 * towns, with gold oscillating at 0.3-0.9 forever.
 *
 * Fix: AI players (actor.isAi) reserve AI_AUTO_CLAIM_GOLD_RESERVE gold —
 * auto-claim stops spending once their gold would drop below that floor,
 * so gold can accumulate past SETTLE_COST. Human players are unaffected
 * (they keep the original FRONTIER_CLAIM_COST-only floor).
 */
import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import type { DomainTileState } from "@border-empires/game-domain";
import { AI_AUTO_CLAIM_GOLD_RESERVE, FRONTIER_CLAIM_COST } from "@border-empires/shared";

const makePlayer = (id: string, isAi: boolean, points: number) => ({
  id,
  isAi,
  points,
  manpower: 1_000_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const landTile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND" as const,
  ...extra
});

/** A settled town anchor plus a ring of unowned neighbor tiles to claim. */
const seedAnchorAndNeighbors = (playerId: string, baseX: number, baseY: number): DomainTileState[] => {
  const tiles: DomainTileState[] = [
    landTile(baseX, baseY, {
      ownerId: playerId,
      ownershipState: "SETTLED",
      town: {
        populationTier: "CITY",
        connectedTownBonus: 0,
        goldPerMinute: 5,
        cap: 2400,
        isFed: true,
        supportCurrent: 3,
        supportMax: 4
      }
    })
  ];
  // 8 unowned neutral LAND neighbors — all valid auto-claim targets.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      tiles.push(landTile(baseX + dx, baseY + dy));
    }
  }
  return tiles;
};

describe("tickTerritoryAutomation AI gold reserve", () => {
  it("stops AI auto-claiming once gold would drop below AI_AUTO_CLAIM_GOLD_RESERVE", () => {
    const NOW_MS = 1_000_000;
    const playerId = "ai-1";
    // More gold than the reserve, but only a few claims' worth of headroom
    // above it — enough to prove the loop stops at the floor instead of
    // draining toward zero like it did pre-fix.
    const startingPoints = AI_AUTO_CLAIM_GOLD_RESERVE + 3 * FRONTIER_CLAIM_COST;
    const seedTiles = seedAnchorAndNeighbors(playerId, 50, 50);

    const runtime = new SimulationRuntime({
      now: () => NOW_MS,
      initialPlayers: new Map([[playerId, makePlayer(playerId, true, startingPoints)]]),
      seedTiles: new Map(seedTiles.map((t) => [`${t.x},${t.y}`, t])),
      seedDocks: []
    });

    runtime.tickTerritoryAutomation(NOW_MS);

    const snapshot = runtime.exportPlayerDebugSnapshot().find((row) => row.id === playerId);
    expect(snapshot).toBeDefined();
    // The gate checks `points < floor` before each spend (matching the
    // pre-existing FRONTIER_CLAIM_COST-only check pattern), so gold settles
    // at exactly floor - FRONTIER_CLAIM_COST — never anywhere near zero like
    // it did before this fix, and stops well short of exhausting the 8
    // available neighbor tiles.
    expect(snapshot!.points).toBe(AI_AUTO_CLAIM_GOLD_RESERVE - FRONTIER_CLAIM_COST);
    expect(snapshot!.ownedTileCount).toBeLessThan(1 + 8); // anchor + not all 8 neighbors claimed
  });

  it("does not restrict human auto-claiming below the reserve floor", () => {
    const NOW_MS = 1_000_000;
    const playerId = "player-1";
    // Below AI_AUTO_CLAIM_GOLD_RESERVE, but well above FRONTIER_CLAIM_COST —
    // a human player should still be able to claim down near zero.
    const startingPoints = FRONTIER_CLAIM_COST * 3;
    const seedTiles = seedAnchorAndNeighbors(playerId, 50, 50);

    const runtime = new SimulationRuntime({
      now: () => NOW_MS,
      initialPlayers: new Map([[playerId, makePlayer(playerId, false, startingPoints)]]),
      seedTiles: new Map(seedTiles.map((t) => [`${t.x},${t.y}`, t])),
      seedDocks: []
    });

    runtime.tickTerritoryAutomation(NOW_MS);

    const snapshot = runtime.exportPlayerDebugSnapshot().find((row) => row.id === playerId);
    expect(snapshot).toBeDefined();
    // Human floor is still just FRONTIER_CLAIM_COST — all 3 affordable claims
    // should have gone through, well below AI_AUTO_CLAIM_GOLD_RESERVE.
    expect(snapshot!.points).toBe(0);
    expect(snapshot!.points).toBeLessThan(AI_AUTO_CLAIM_GOLD_RESERVE);
  });
});
