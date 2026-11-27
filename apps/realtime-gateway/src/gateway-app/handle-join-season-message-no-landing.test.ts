import { describe, expect, it, vi } from "vitest";
import { handleJoinSeasonMessage, type JoinSeasonMessageDeps } from "./handle-join-season-message.js";
import { hasReservedPlace, reserveNextContestPlace } from "../season-full-rejection/reserve-next-contest-place.js";
import { InMemorySectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

// GDD §6, "No landing site, no join": JoinSeason's no_landing_site closes
// joining with NO_LANDING_SITE (never a JOIN_SEASON_ACK) and reserves the
// player's place in the next contest on the next-Sector waitlist.
const buildDeps = (overrides: Partial<JoinSeasonMessageDeps> = {}) => {
  const sent: unknown[] = [];
  const deps = {
    playerId: "player-1",
    rallyAnchor: undefined,
    simulationClient: {
      preparePlayer: vi.fn(),
      joinSeason: vi.fn(async () => ({ playerId: "player-1", spawned: false, noLandingSite: true }))
    },
    recordGatewayEvent: vi.fn(),
    sendJson: (_socket: unknown, payload: unknown) => {
      sent.push(payload);
    },
    socket: {} as JoinSeasonMessageDeps["socket"],
    seasonFullErrorPayload: () => ({ type: "ERROR" as const, code: "SEASON_FULL" as const, message: "full" }),
    seasonPendingErrorPayload: (scheduledStartAt: number) => ({ type: "ERROR" as const, code: "SEASON_PENDING" as const, message: "not yet", scheduledStartAt }),
    ...overrides
  } as JoinSeasonMessageDeps;
  return { deps, sent };
};

describe("handleJoinSeasonMessage with no viable landing site", () => {
  it("closes joining and reserves the player's place in the next contest", async () => {
    const store = new InMemorySectorWaitlistStore();
    const { deps, sent } = buildDeps({
      reserveNextContestPlace: (id) => reserveNextContestPlace({ store, getCurrentSeason: async () => ({ seasonId: "season-7", seasonSequence: 7 }), now: () => 5 }, id)
    });

    await handleJoinSeasonMessage(deps);

    expect(sent).toEqual([expect.objectContaining({ type: "ERROR", code: "NO_LANDING_SITE", reserved: true })]);
    expect(await store.has("season-7", "player-1")).toBe(true);
  });

  it("on a hosted sector (no next contest) closes joining without a reservation", async () => {
    const { deps, sent } = buildDeps();

    await handleJoinSeasonMessage(deps);

    expect(sent).toEqual([expect.objectContaining({ type: "ERROR", code: "NO_LANDING_SITE", reserved: false })]);
    expect((sent[0] as { message: string }).message).not.toMatch(/reserved/i);
  });

  it("still tells the player joining is closed when the reservation fails", async () => {
    const { deps, sent } = buildDeps({ reserveNextContestPlace: async () => false });
    await handleJoinSeasonMessage(deps);
    expect(sent).toEqual([expect.objectContaining({ code: "NO_LANDING_SITE", reserved: false })]);
  });
});

describe("reserveNextContestPlace", () => {
  it("resolves false when the season is unavailable", async () => {
    const store = new InMemorySectorWaitlistStore();
    await expect(reserveNextContestPlace({ store, getCurrentSeason: async () => Promise.reject(new Error("down")) }, "p")).resolves.toBe(false);
  });
});

describe("reserved place in the next contest (owner decision 2026-11-27)", () => {
  const season = (seasonSequence: number) => async () => ({ seasonId: `season-${seasonSequence}`, seasonSequence });

  it("is stored for the next season's sequence and lets the player past that contest's cap", async () => {
    const store = new InMemorySectorWaitlistStore();
    await reserveNextContestPlace({ store, getCurrentSeason: season(7) }, "player-1");
    const nextSeason = { store, getCurrentSeason: season(8) };
    expect(await hasReservedPlace(nextSeason, "player-1")).toBe(true);
    expect(await hasReservedPlace({ store, getCurrentSeason: season(7) }, "player-1")).toBe(false);
    expect(await hasReservedPlace(nextSeason, "someone-else")).toBe(false);

    const joinSeason = vi.fn()
      .mockResolvedValueOnce({ playerId: "player-1", spawned: false, full: true })
      .mockResolvedValueOnce({ playerId: "player-1", spawned: true });
    const { deps, sent } = buildDeps({
      simulationClient: { preparePlayer: vi.fn(), joinSeason },
      hasReservedPlace: (id) => hasReservedPlace(nextSeason, id)
    });
    await handleJoinSeasonMessage(deps);
    expect(joinSeason.mock.calls.map((call) => call[2])).toEqual([{ isGuest: false }, { isGuest: false, reservedPlace: true }]);
    expect(sent).toEqual([{ type: "JOIN_SEASON_ACK", spawned: true }]);
  });

  it("costs an ordinary join no reservation lookup (review regression)", async () => {
    const lookup = vi.fn(async () => true);
    const joinSeason = vi.fn(async () => ({ playerId: "player-1", spawned: true }));
    const { deps } = buildDeps({ simulationClient: { preparePlayer: vi.fn(), joinSeason }, hasReservedPlace: lookup });
    await handleJoinSeasonMessage(deps);
    expect(lookup).not.toHaveBeenCalled();
    expect(joinSeason).toHaveBeenCalledTimes(1);
  });

  it("keeps the full reply when the player has no reservation or the lookup fails", async () => {
    const joinSeason = vi.fn(async () => ({ playerId: "player-1", spawned: false, full: true }));
    const { deps, sent } = buildDeps({ simulationClient: { preparePlayer: vi.fn(), joinSeason }, hasReservedPlace: (id) => hasReservedPlace({ store: new InMemorySectorWaitlistStore(), getCurrentSeason: async () => Promise.reject(new Error("down")) }, id) });
    await handleJoinSeasonMessage(deps);
    expect(joinSeason).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([expect.objectContaining({ code: "SEASON_FULL" })]);
  });
});
