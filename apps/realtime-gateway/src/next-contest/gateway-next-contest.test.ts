import { describe, expect, it, vi } from "vitest";
import { InMemorySectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import { reservedPlaceKey } from "../season-full-rejection/reserve-next-contest-place.js";
import { nextContestJoin } from "./gateway-next-contest.js";

// Review regression: committed players were joined to the new contest without
// their reserved place, so a reserved player was capped there.
describe("nextContestJoin", () => {
  const client = (store: InMemorySectorWaitlistStore, joinSeason: ReturnType<typeof vi.fn>) => ({
    store,
    simulationClient: { joinSeason, getCurrentSeasonSummary: vi.fn(async () => ({ seasonId: "season-8", seasonSequence: 8 })), startNextSeason: vi.fn() } as never
  });

  it("retries a capped committed player with their reserved place", async () => {
    const store = new InMemorySectorWaitlistStore();
    await store.join({ seasonId: reservedPlaceKey(8), playerId: "p1", joinedAt: 1 });
    const joinSeason = vi.fn().mockResolvedValueOnce({ spawned: false, full: true }).mockResolvedValueOnce({ spawned: true });
    await expect(nextContestJoin(client(store, joinSeason))("p1")).resolves.toEqual({ spawned: true });
    expect(joinSeason.mock.calls[1]![2]).toEqual({ isGuest: false, reservedPlace: true });
  });

  it("leaves a capped player without a reservation capped", async () => {
    const joinSeason = vi.fn(async () => ({ spawned: false, full: true }));
    await expect(nextContestJoin(client(new InMemorySectorWaitlistStore(), joinSeason))("p2")).resolves.toEqual({ spawned: false, full: true });
    expect(joinSeason).toHaveBeenCalledTimes(1);
  });
});
