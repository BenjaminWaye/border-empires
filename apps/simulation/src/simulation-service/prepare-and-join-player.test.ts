import { describe, expect, it, vi } from "vitest";
import { joinSeasonHandler } from "./prepare-and-join-player.js";
import { createInitialSeasonState } from "../season-lifecycle.js";

const buildDeps = (seasonState: ReturnType<typeof createInitialSeasonState>) => ({
  runtime: {
    ensurePlayerHasSpawnTerritory: vi.fn(() => true),
    hasPlayer: vi.fn(() => false),
    humanPlayerCount: vi.fn(() => 0)
  } as unknown as Parameters<typeof joinSeasonHandler>[0]["runtime"],
  log: { info: vi.fn(), error: vi.fn() },
  simulationMetrics: { observeSimPreparePlayerLatencyMs: vi.fn() } as unknown as Parameters<typeof joinSeasonHandler>[0]["simulationMetrics"],
  deleteCachedSnapshot: vi.fn(),
  getSeasonState: () => seasonState,
  setSeasonState: vi.fn(),
  maxSeasonPlayers: 120
});

describe("joinSeasonHandler pending season", () => {
  it("rejects with pending:true and scheduledStartAt, without recording membership or spawning", () => {
    const seasonState = createInitialSeasonState({
      seasonSequence: 1,
      rulesetId: "standard",
      worldSeed: 1,
      startedAt: 1_000_000,
      scheduledStartAt: 1_800_000_000_000
    });
    const deps = buildDeps(seasonState);
    const callback = vi.fn();

    joinSeasonHandler(deps, { request: { player_id: "new-player" } }, callback);

    expect(callback).toHaveBeenCalledWith(null, {
      ok: true,
      player_id: "new-player",
      playerId: "new-player",
      spawned: false,
      pending: true,
      scheduled_start_at: 1_800_000_000_000
    });
    expect(deps.setSeasonState).not.toHaveBeenCalled();
    expect(deps.runtime.ensurePlayerHasSpawnTerritory).not.toHaveBeenCalled();
  });

  it("joins normally once the season is active", () => {
    const seasonState = createInitialSeasonState({ seasonSequence: 1, rulesetId: "standard", worldSeed: 1, startedAt: 1_000_000 });
    const deps = buildDeps(seasonState);
    const callback = vi.fn();

    joinSeasonHandler(deps, { request: { player_id: "new-player" } }, callback);

    expect(deps.setSeasonState).toHaveBeenCalled();
    expect(deps.runtime.ensurePlayerHasSpawnTerritory).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({ ok: true, spawned: true }));
  });
});
