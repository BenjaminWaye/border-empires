import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { createInitialSeasonState, hasPlayerJoinedSeason } from "../season-lifecycle.js";
import { joinSeasonHandler, preparePlayerHandler } from "./prepare-and-join-player.js";

// GDD §6, "No landing site, no join": a new House used to be landed inside a
// rival's reach when no open ground was left ("spawn map nearly full"),
// owning only its AFC footprint. JoinSeason now refuses with no_landing_site
// and records nothing, so the gateway can close joining and reserve the
// player's place in the next contest.

// Every tile sits inside the two rival towns' radius-3 reach (same world as
// runtime-afc-crowded-spawn.test.ts): no viable landing site exists.
const crowdedWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 7; y <= 13; y += 1) {
    for (let x = 8; x <= 16; x += 1) {
      const isTown = y === 10 && (x === 10 || x === 14);
      tiles.push(
        isTown
          ? { x, y, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", town: { name: `Rival ${x}`, type: "FARMING", populationTier: "TOWN" } }
          : { x, y, terrain: "LAND" }
      );
    }
  }
  return tiles;
};

// Open land with no other empire: a viable site exists.
const openWorld = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y < 40; y += 1) for (let x = 0; x < 40; x += 1) tiles.push({ x, y, terrain: "LAND" });
  return tiles;
};

const buildDeps = (tiles: DomainTileState[]) => {
  let seasonState = createInitialSeasonState({ seasonSequence: 1, rulesetId: "standard", worldSeed: 1, startedAt: 1_000 });
  const runtime = new SimulationRuntime({
    now: () => 5_000,
    initialPlayers: new Map([["rival", buildPlayer("rival")]]),
    seedTiles: new Map(),
    initialState: { tiles, activeLocks: [] }
  });
  return {
    runtime,
    log: { info: vi.fn(), error: vi.fn() },
    simulationMetrics: {
      observeSimPreparePlayerLatencyMs: vi.fn(),
      incrementSimRallySpawn: vi.fn(),
      incrementSimRallySpawnFallback: vi.fn(),
      setSimSeasonGuestPlayers: vi.fn(),
      incrementSimGuestUpgraded: vi.fn(),
      incrementSimGuestJoinRejectedFull: vi.fn()
    } as unknown as Parameters<typeof joinSeasonHandler>[0]["simulationMetrics"],
    deleteCachedSnapshot: vi.fn(),
    getSeasonState: () => seasonState,
    setSeasonState: (next: typeof seasonState) => {
      seasonState = next;
    },
    maxSeasonPlayers: 120
  };
};

const ownedBy = (deps: ReturnType<typeof buildDeps>, playerId: string) =>
  deps.runtime.exportState().tiles.filter((tile) => tile.ownerId === playerId);

describe("joinSeasonHandler with no viable landing site", () => {
  it("refuses a new House with no_landing_site and records nothing", () => {
    const deps = buildDeps(crowdedWorld());
    const callback = vi.fn();

    joinSeasonHandler(deps, { request: { player_id: "newcomer" } }, callback);

    expect(callback).toHaveBeenCalledWith(null, { ok: true, player_id: "newcomer", playerId: "newcomer", spawned: false, no_landing_site: true });
    expect(ownedBy(deps, "newcomer")).toEqual([]);
    expect(deps.runtime.hasPlayer("newcomer")).toBe(false);
    expect(hasPlayerJoinedSeason(deps.getSeasonState(), "newcomer")).toBe(false);
  });

  it("a later reconnect does not land the refused House through PreparePlayer", () => {
    const deps = buildDeps(crowdedWorld());
    joinSeasonHandler(deps, { request: { player_id: "newcomer" } }, vi.fn());
    const callback = vi.fn();

    preparePlayerHandler(deps, { request: { player_id: "newcomer" } }, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ joined: false, spawned: false, season_started_at: 1_000 }));
    expect(ownedBy(deps, "newcomer")).toEqual([]);
  });

  it("still lands a new House when a viable site exists", () => {
    const deps = buildDeps(openWorld());
    const callback = vi.fn();

    joinSeasonHandler(deps, { request: { player_id: "newcomer" } }, callback);

    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ ok: true, spawned: true }));
    expect(callback.mock.calls[0]![1].no_landing_site).toBeUndefined();
    expect(ownedBy(deps, "newcomer").length).toBeGreaterThan(0);
    expect(hasPlayerJoinedSeason(deps.getSeasonState(), "newcomer")).toBe(true);
  });

  it("does not block a returning House that already has a record (redeploy/recovery path unchanged)", () => {
    const deps = buildDeps(crowdedWorld());
    deps.runtime.ensurePlayerHasSpawnTerritory("returning");
    expect(ownedBy(deps, "returning").length).toBeGreaterThan(0);
    const callback = vi.fn();

    joinSeasonHandler(deps, { request: { player_id: "returning" } }, callback);

    expect(callback.mock.calls[0]![1].no_landing_site).toBeUndefined();
    expect(hasPlayerJoinedSeason(deps.getSeasonState(), "returning")).toBe(true);
  });
});
