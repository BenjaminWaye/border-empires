/**
 * Regression test for the AI manpower-reserve fix, the manpower analogue of
 * tick-territory-automation-ai-gold-reserve.test.ts.
 *
 * Bug: the auto-claim tick (tickTerritoryAutomation) never checked or
 * deducted actor.manpower at all — it only gated/spent gold. Once EXPAND
 * started costing EXPAND_MANPOWER_COST manpower (§4.2 of
 * docs/manpower-economy-rewrite-plan.md), this meant auto-claim silently
 * bypassed the manpower economy entirely: it claimed tiles for free with
 * respect to manpower, and could drain an AI's manpower toward the same
 * near-zero trap the pre-fix gold reserve bug caused, permanently starving
 * it of the manpower needed for its own deliberate SETTLE/ATTACK decisions.
 *
 * Fix: AI players (actor.isAi) reserve a manpower floor — auto-claim stops
 * spending manpower once their manpower would drop below it — and every
 * claim now also deducts EXPAND_MANPOWER_COST manpower, matching the
 * authoritative EXPAND cost in game-domain's manpowerRequirements(). Human
 * players keep the original EXPAND_MANPOWER_COST-only floor.
 *
 * The floor itself was originally a small SETTLE-sized reserve
 * (AI_AUTO_CLAIM_MANPOWER_RESERVE) and was later raised to the full AI war
 * reserve (docs/ai-war-peace-balance-plan.md, aiWarReserveManpower) — see
 * that plan for why: a small floor let auto-claim keep spending every tick
 * before the AI's own deliberate policy loop ever got a chance to save
 * toward ATTACK_MANPOWER_MIN, leaving AI empires structurally unable to ever
 * fight back against sustained pressure.
 */
import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import type { DomainTileState } from "@border-empires/game-domain";
import { aiWarReserveManpower, EXPAND_MANPOWER_COST } from "@border-empires/shared";

const makePlayer = (id: string, isAi: boolean) => ({
  id,
  isAi,
  points: 1_000_000,
  manpower: 0,
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

type RawPlayerRef = { manpower: number; manpowerCapSnapshot?: number };

/**
 * Builds a runtime with a settled CITY-tier anchor town + claimable
 * neighbors, then sets the actor's manpower to `startingManpower` exactly.
 *
 * The two-step approach (construct, THEN set manpower) sidesteps an
 * unrelated runtime-construction quirk: a fresh player's manpowerCapSnapshot
 * is initialized before owned tiles are registered against the player
 * summary, so the *first* real cap recompute (during the tick or any
 * snapshot read) sees the cap jump from the town-less baseline up to the
 * true cap including the CITY-tier anchor, and grants the difference onto
 * manpower — the same "cap grew, top up manpower" migration behavior
 * intentionally shipped for real players in §4.3. Reading
 * exportPlayerDebugSnapshot() once forces that one-time grant to settle
 * immediately (and syncs manpowerCapSnapshot to the real cap), so setting
 * manpower afterward gives these tests a clean, predictable starting point
 * for the auto-claim gating behavior actually under test.
 */
const buildRuntimeWithManpower = (playerId: string, isAi: boolean, startingManpower: number, nowMs: number): SimulationRuntime => {
  const seedTiles = seedAnchorAndNeighbors(playerId, 50, 50);
  const runtime = new SimulationRuntime({
    now: () => nowMs,
    initialPlayers: new Map([[playerId, makePlayer(playerId, isAi)]]),
    seedTiles: new Map(seedTiles.map((t) => [`${t.x},${t.y}`, t])),
    seedDocks: []
  });
  runtime.exportPlayerDebugSnapshot(); // settle the one-time cap-grant quirk
  const raw = (runtime as unknown as { state: { players: Map<string, RawPlayerRef> } }).state.players.get(playerId)!;
  raw.manpower = startingManpower;
  return runtime;
};

describe("tickTerritoryAutomation AI manpower reserve", () => {
  it("stops AI auto-claiming once manpower would drop below the AI war reserve", () => {
    const NOW_MS = 1_000_000;
    const playerId = "ai-1";
    // Read the real cap the seeded CITY-tier anchor produces, so the
    // expected reserve tracks aiWarReserveManpower's actual formula instead
    // of a hardcoded number that would silently drift from it.
    const probe = buildRuntimeWithManpower(playerId, true, 0, NOW_MS);
    const capSnapshot = (probe as unknown as { state: { players: Map<string, RawPlayerRef> } }).state.players.get(playerId)!
      .manpowerCapSnapshot!;
    const reserve = aiWarReserveManpower(capSnapshot);
    // More manpower than the reserve, but only a few claims' worth of
    // headroom above it — enough to prove the loop stops at the floor
    // instead of draining toward zero.
    const startingManpower = reserve + 3 * EXPAND_MANPOWER_COST;
    const runtime = buildRuntimeWithManpower(playerId, true, startingManpower, NOW_MS);

    runtime.tickTerritoryAutomation(NOW_MS);

    const snapshot = runtime.exportPlayerDebugSnapshot().find((row) => row.id === playerId);
    expect(snapshot).toBeDefined();
    // The gate checks `manpower < floor` before each spend (matching the
    // pre-existing gold-reserve check pattern), so manpower settles at
    // exactly floor - EXPAND_MANPOWER_COST — never anywhere near zero — and
    // stops well short of exhausting the 8 available neighbor tiles.
    expect(snapshot!.manpower).toBe(reserve - EXPAND_MANPOWER_COST);
    expect(snapshot!.ownedTileCount).toBeLessThan(1 + 8); // anchor + not all 8 neighbors claimed
  });

  it("does not restrict human auto-claiming below the manpower reserve floor", () => {
    const NOW_MS = 1_000_000;
    const playerId = "player-1";
    // Well above EXPAND_MANPOWER_COST but far below any plausible AI war
    // reserve — a human player should still be able to claim down near zero.
    const startingManpower = EXPAND_MANPOWER_COST * 3;
    const runtime = buildRuntimeWithManpower(playerId, false, startingManpower, NOW_MS);

    runtime.tickTerritoryAutomation(NOW_MS);

    const snapshot = runtime.exportPlayerDebugSnapshot().find((row) => row.id === playerId);
    expect(snapshot).toBeDefined();
    // Human floor is still just EXPAND_MANPOWER_COST — all 3 affordable
    // claims should have gone through.
    expect(snapshot!.manpower).toBe(0);
  });

  it("deducts EXPAND_MANPOWER_COST manpower per tile claimed, matching the authoritative EXPAND cost", () => {
    const NOW_MS = 1_000_000;
    const playerId = "player-1";
    const startingManpower = EXPAND_MANPOWER_COST; // exactly one claim's worth
    const runtime = buildRuntimeWithManpower(playerId, false, startingManpower, NOW_MS);

    runtime.tickTerritoryAutomation(NOW_MS);

    const snapshot = runtime.exportPlayerDebugSnapshot().find((row) => row.id === playerId);
    expect(snapshot).toBeDefined();
    expect(snapshot!.manpower).toBe(0);
    // Anchor tile + exactly 1 claimed neighbor (manpower ran out after that).
    expect(snapshot!.ownedTileCount).toBe(2);
  });
});
