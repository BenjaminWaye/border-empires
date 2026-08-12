/**
 * Regression test for the "deploy just snapped my manpower to full" bug:
 * SimulationRuntime's constructor used to compute each recovered player's
 * manpower cap (via applyManpowerRegen -> playerManpowerCap ->
 * cachedManpowerStructureBonusForPlayer) in a loop that ran BEFORE
 * this.tiles was hydrated, so garrisonHallTilesByOwner/railDepotTilesByOwner/
 * assemblyWorksTilesByOwner/logisticsGuildTilesByOwner were all still empty
 * at that point.
 *
 * That early call did two bad things:
 *  1. It cached a structure-bonus-free (artificially LOW) cap in
 *     manpowerStructureBonusCacheByPlayer, and stamped that low value into
 *     manpowerCapSnapshot — discarding the real persisted (higher) cap.
 *  2. Worse, refreshManpowerOnly clamps player.manpower down to whatever cap
 *     it just computed (Math.min(cap, ...)) — so a recovered player whose
 *     real manpower was legitimately above the (wrongly low) boot-time cap
 *     got silently clamped DOWN at boot.
 *
 * The stale low-cap cache entry then survived until the player's first
 * post-boot tile mutation invalidated it (replaceTileState ->
 * refreshEconomyCachesForTileChange). At that point refreshManpowerOnly
 * recomputed the TRUE (higher) cap, saw `cap > previousCap`, and handed the
 * player their entire Garrison Hall/Rail Depot/Assembly Works/Logistics
 * Guild cap bonus as free manpower — indistinguishable from the intended
 * "build a Garrison Hall, get the extra manpower immediately" mechanic
 * (§4.4). Combined with (2) above, a player near their true cap would get
 * clamped down at boot and then snapped straight back up to the full true
 * cap on their first command after a deploy.
 *
 * The fix moves the entire applyManpowerRegen loop in SimulationRuntime's
 * constructor to run AFTER this.tiles and every structure-by-owner index it
 * depends on are fully populated (runtime.ts, right after the
 * wonderEffects.refreshPlayerWonders loop). The very first manpower read for
 * a recovered player then always sees the true cap, so neither (1) nor (2)
 * above can happen — no separate re-stamp step needed, and no window where a
 * stale low-cap cache entry can survive into real gameplay. A
 * manpowerCapBootstrapRestampedCount counter (exposed via
 * manpowerCapBootstrapRestampedTotal(), polled into the
 * sim_manpower_cap_bootstrap_restamped_total prometheus gauge) still fires
 * whenever a recovered manpowerCapSnapshot disagrees with what boot
 * hydration computes, purely for prod observability.
 *
 * Player id is deliberately NOT "player-1"/"player-2" — createSeedWorld's
 * "default" profile (merged in by default whenever seedTiles isn't given
 * explicitly, see SimulationRuntime's constructor) owns real tiles/a town
 * under those exact ids, which would silently add its own manpower-cap
 * contributions on top of what this test sets up.
 */
import { describe, expect, it } from "vitest";
import { GARRISON_HALL_MANPOWER_CAP_BONUS, STARTING_CAPITAL_MANPOWER_CAP } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime.js";

const TEST_PLAYER_ID = "boot-order-test-player";

// §5/§12: an active Garrison Hall still draws 1 FOOD + 1 CRYSTAL resource
// slot — without supply for both, §5.4 marks it dormant and its cap bonus
// (along with everything else under test here) silently doesn't apply. Mirrors
// runtime-manpower-structure-bonus.test.ts's own setup for the same reason.
const garrisonHallOwnerTiles = [
  {
    x: 16,
    y: 16,
    terrain: "LAND" as const,
    ownerId: TEST_PLAYER_ID,
    ownershipState: "SETTLED" as const,
    economicStructure: { ownerId: TEST_PLAYER_ID, type: "GARRISON_HALL" as const, status: "active" as const }
  },
  { x: 17, y: 16, terrain: "LAND" as const, ownerId: TEST_PLAYER_ID, ownershipState: "SETTLED" as const, resource: "FARM" as const }
];

describe("manpower boot-order regression", () => {
  it("does not snap a recovered player's manpower to cap once post-boot tile mutations invalidate the structure-bonus cache", () => {
    const trueCap = STARTING_CAPITAL_MANPOWER_CAP + GARRISON_HALL_MANPOWER_CAP_BONUS;
    // Well below the true (structure-inclusive) cap, but ABOVE what a
    // structure-bonus-free boot-time read would compute
    // (STARTING_CAPITAL_MANPOWER_CAP) — this is exactly the shape that
    // triggers the bug: pre-fix, the early read clamps manpower down to the
    // low cap, and the later cache-invalidation-triggered recompute then
    // grants the entire true-cap delta back as "free" manpower, landing
    // at/near the full true cap instead of back at this starting value.
    const belowTrueCapButAboveStartingCapital = STARTING_CAPITAL_MANPOWER_CAP + 100;

    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: {
        players: [
          {
            id: TEST_PLAYER_ID,
            manpower: belowTrueCapButAboveStartingCapital,
            // Persisted from before the restart, i.e. the TRUE cap including
            // the already-built Garrison Hall's bonus.
            manpowerCapSnapshot: trueCap,
            // Same instant as `now` above: zero elapsed time, so regen can't
            // perturb the exact-equality assertions below.
            manpowerUpdatedAt: 1_000,
            strategicResources: { CRYSTAL: 1_000 }
          }
        ],
        tiles: garrisonHallOwnerTiles,
        activeLocks: []
      }
    });

    // Right after boot, manpower must be untouched, and the snapshot must
    // already reflect the true structure-inclusive cap — not the
    // zero-structure value the pre-tile-hydration read would otherwise have
    // stamped.
    const bootPlayer = runtime.exportState().players.find((p) => p.id === TEST_PLAYER_ID)!;
    expect(bootPlayer.manpower).toBe(belowTrueCapButAboveStartingCapital);
    expect(bootPlayer.manpowerCapSnapshot).toBe(trueCap);

    // Simulate the first real tile mutation after boot invalidating the
    // structure-bonus cache — exactly what replaceTileState ->
    // refreshEconomyCachesForTileChange does on any owned-tile change for
    // this player in production. Pre-fix, this is the trigger point where
    // the bogus low->true cap delta got added to player.manpower.
    (
      runtime as unknown as { manpowerStructureBonusCacheByPlayer: Map<string, unknown> }
    ).manpowerStructureBonusCacheByPlayer.delete(TEST_PLAYER_ID);

    runtime.exportPlayerDebugSnapshot(); // triggers refreshManpowerOnly as a side effect
    const afterInvalidation = runtime.exportState().players.find((p) => p.id === TEST_PLAYER_ID)!;
    expect(afterInvalidation.manpower).toBe(belowTrueCapButAboveStartingCapital);
    expect(afterInvalidation.manpowerCapSnapshot).toBe(trueCap);
  });

  it("records a boot-time restamp when the recovered snapshot disagrees with the true structure-inclusive cap", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: {
        players: [
          {
            id: TEST_PLAYER_ID,
            manpower: 400,
            // Deliberately wrong/stale, to force a disagreement with what
            // boot hydration computes (STARTING_CAPITAL_MANPOWER_CAP +
            // GARRISON_HALL_MANPOWER_CAP_BONUS) and exercise the counter.
            manpowerCapSnapshot: STARTING_CAPITAL_MANPOWER_CAP,
            manpowerUpdatedAt: 1_000,
            strategicResources: { CRYSTAL: 1_000 }
          }
        ],
        tiles: garrisonHallOwnerTiles,
        activeLocks: []
      }
    });

    expect(runtime.manpowerCapBootstrapRestampedTotal()).toBeGreaterThanOrEqual(1);
  });

  it("leaves a fresh (non-recovered) player's manpower and cap alone at boot", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialPlayers: new Map([
        [
          TEST_PLAYER_ID,
          {
            id: TEST_PLAYER_ID,
            isAi: false,
            points: 100,
            manpower: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      initialState: { tiles: [], activeLocks: [] }
    });

    const bootPlayer = runtime.exportState().players.find((p) => p.id === TEST_PLAYER_ID)!;
    expect(bootPlayer.manpower).toBe(150);
    expect(bootPlayer.manpowerCapSnapshot).toBe(STARTING_CAPITAL_MANPOWER_CAP);
  });
});
