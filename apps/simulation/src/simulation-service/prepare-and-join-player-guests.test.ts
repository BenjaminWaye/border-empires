import { describe, expect, it, vi } from "vitest";
import type { SimulationSeasonState } from "@border-empires/sim-protocol";

import { joinSeasonHandler, preparePlayerHandler } from "./prepare-and-join-player.js";
import { createInitialSeasonState } from "../season-lifecycle.js";

const activeSeason = (overrides: Partial<SimulationSeasonState> = {}): SimulationSeasonState => ({
  ...createInitialSeasonState({ seasonSequence: 1, rulesetId: "standard", worldSeed: 1, startedAt: 1_000_000 }),
  ...overrides
});

// Stateful deps: setSeasonState really updates what getSeasonState returns,
// and spawning really creates a runtime record, so a sequence of calls
// behaves like the live service.
const buildDeps = (initial: SimulationSeasonState, options: { maxSeasonGuests?: number; existingPlayers?: string[] } = {}) => {
  let seasonState = initial;
  const players = new Set(options.existingPlayers ?? []);
  const metrics = {
    observeSimPreparePlayerLatencyMs: vi.fn(),
    setSimSeasonGuestPlayers: vi.fn(),
    incrementSimGuestUpgraded: vi.fn(),
    incrementSimGuestJoinRejectedFull: vi.fn()
  };
  const deps = {
    runtime: {
      ensurePlayerHasSpawnTerritory: vi.fn((playerId: string) => {
        players.add(playerId);
        return true;
      }),
      ensurePlayerHasAfc: vi.fn(() => false),
      hasPlayer: (playerId: string) => players.has(playerId),
      humanPlayerCount: () => players.size,
      emitShardRainHelloFor: vi.fn(),
      resendReachForPlayer: vi.fn(),
      devQueueCommandContext: vi.fn(),
      refreshResourceSlotCachesForPlayer: vi.fn()
    } as unknown as Parameters<typeof joinSeasonHandler>[0]["runtime"],
    log: { info: vi.fn(), error: vi.fn() },
    simulationMetrics: metrics as unknown as Parameters<typeof joinSeasonHandler>[0]["simulationMetrics"],
    deleteCachedSnapshot: vi.fn(),
    getSeasonState: () => seasonState,
    setSeasonState: (next: SimulationSeasonState) => {
      seasonState = next;
    },
    maxSeasonPlayers: 100,
    ...(options.maxSeasonGuests === undefined ? {} : { maxSeasonGuests: options.maxSeasonGuests })
  };
  return { deps, metrics, players, season: () => seasonState };
};

type AuthKind = "guest" | "account" | "";
const join = (deps: Parameters<typeof joinSeasonHandler>[0], playerId: string, authKind: AuthKind) => {
  const callback = vi.fn();
  joinSeasonHandler(deps, { request: { player_id: playerId, auth_kind: authKind } }, callback);
  return callback.mock.calls[0]?.[1] as { spawned: boolean; full?: boolean; guest_full?: boolean };
};

const prepare = (deps: Parameters<typeof preparePlayerHandler>[0], playerId: string, authKind: AuthKind) => {
  const callback = vi.fn();
  preparePlayerHandler(deps, { request: { player_id: playerId, auth_kind: authKind } }, callback);
  return callback.mock.calls[0]?.[1] as { ok: boolean; joined: boolean };
};

describe("guest season joins", () => {
  it("records a guest as joined and as a guest, and publishes the guest count", () => {
    const { deps, metrics, season } = buildDeps(activeSeason(), { maxSeasonGuests: 2 });

    expect(join(deps, "guest-1", "guest")).toMatchObject({ spawned: true });

    expect(season().joinedPlayerIds).toContain("guest-1");
    expect(season().guestPlayerIds).toEqual(["guest-1"]);
    expect(metrics.setSimSeasonGuestPlayers).toHaveBeenLastCalledWith(1);
  });

  it("turns a new guest away with guest_full once the allowance is used, without recording or spawning them", () => {
    const { deps, metrics, season } = buildDeps(activeSeason(), { maxSeasonGuests: 1 });
    join(deps, "guest-1", "guest");

    const result = join(deps, "guest-2", "guest");

    expect(result).toMatchObject({ spawned: false, guest_full: true });
    expect(result.full).toBeUndefined();
    expect(season().joinedPlayerIds).not.toContain("guest-2");
    expect(season().guestPlayerIds).toEqual(["guest-1"]);
    expect(deps.runtime.ensurePlayerHasSpawnTerritory).toHaveBeenCalledTimes(1);
    expect(metrics.incrementSimGuestJoinRejectedFull).toHaveBeenCalledTimes(1);
  });

  it("still admits players with a real account when the guest allowance is full", () => {
    const { deps, season } = buildDeps(activeSeason(), { maxSeasonGuests: 1 });
    join(deps, "guest-1", "guest");

    expect(join(deps, "signed-up-1", "account")).toMatchObject({ spawned: true });
    expect(season().guestPlayerIds).toEqual(["guest-1"]);
  });

  it("admits no new guests when the allowance is 0", () => {
    const { deps } = buildDeps(activeSeason(), { maxSeasonGuests: 0 });

    expect(join(deps, "guest-1", "guest")).toMatchObject({ spawned: false, guest_full: true });
  });

  it("never turns away a returning guest who already has territory", () => {
    const { deps } = buildDeps(activeSeason({ joinedPlayerIds: ["guest-1"], guestPlayerIds: ["guest-1"] }), {
      maxSeasonGuests: 1,
      existingPlayers: ["guest-1"]
    });

    expect(join(deps, "guest-1", "guest").guest_full).toBeUndefined();
  });

  it("does not count a recorded guest with no runtime record against the allowance", () => {
    const { deps } = buildDeps(activeSeason({ joinedPlayerIds: ["ghost"], guestPlayerIds: ["ghost"] }), { maxSeasonGuests: 1 });

    expect(join(deps, "guest-1", "guest")).toMatchObject({ spawned: true });
  });
});

describe("guest upgrade on PreparePlayer", () => {
  it("removes a recorded guest who logs in with a real account and frees their slot", () => {
    const { deps, metrics, season } = buildDeps(activeSeason(), { maxSeasonGuests: 1 });
    join(deps, "guest-1", "guest");
    expect(join(deps, "guest-2", "guest").guest_full).toBe(true);

    expect(prepare(deps, "guest-1", "account")).toMatchObject({ ok: true, joined: true });

    expect(season().guestPlayerIds).toEqual([]);
    expect(season().joinedPlayerIds).toContain("guest-1");
    expect(metrics.incrementSimGuestUpgraded).toHaveBeenCalledTimes(1);
    expect(join(deps, "guest-2", "guest")).toMatchObject({ spawned: true });
  });

  it("does not treat a caller that omits auth_kind as an upgrade", () => {
    const { deps, metrics, season } = buildDeps(activeSeason(), { maxSeasonGuests: 2 });
    join(deps, "guest-1", "guest");

    prepare(deps, "guest-1", "");

    expect(season().guestPlayerIds).toEqual(["guest-1"]);
    expect(metrics.incrementSimGuestUpgraded).not.toHaveBeenCalled();
  });

  it("leaves a guest who logs in as a guest again untouched", () => {
    const { deps, metrics, season } = buildDeps(activeSeason(), { maxSeasonGuests: 2 });
    join(deps, "guest-1", "guest");

    prepare(deps, "guest-1", "guest");

    expect(season().guestPlayerIds).toEqual(["guest-1"]);
    expect(metrics.incrementSimGuestUpgraded).not.toHaveBeenCalled();
  });

  it("re-records a guest whose entry a restart dropped before the next checkpoint", () => {
    const { deps, season } = buildDeps(activeSeason({ joinedPlayerIds: ["guest-1"] }), { existingPlayers: ["guest-1"] });

    prepare(deps, "guest-1", "guest");

    expect(season().guestPlayerIds).toEqual(["guest-1"]);
  });

  it("does not record an unjoined guest on PreparePlayer", () => {
    const { deps, season } = buildDeps(activeSeason());

    expect(prepare(deps, "guest-1", "guest")).toMatchObject({ joined: false });
    expect(season().guestPlayerIds ?? []).toEqual([]);
  });
});
