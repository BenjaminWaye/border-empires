import { afterEach, describe, expect, it } from "vitest";

import { createSimulationService } from "./simulation-service.js";
import { createRawSimulationClient, joinSeason, joinSeasonAsGuest, preparePlayer, silentLog } from "./prepare-player-test-client.js";

// Over real gRPC, so it also proves auth_kind / guest_full survive the proto.
describe("season guest allowance integration", () => {
  const cleanup: Array<() => Promise<void>> = [];
  const originalMaxGuests = process.env.SIMULATION_MAX_SEASON_GUESTS;

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
    if (originalMaxGuests === undefined) delete process.env.SIMULATION_MAX_SEASON_GUESTS;
    else process.env.SIMULATION_MAX_SEASON_GUESTS = originalMaxGuests;
  });

  it("caps new guests, keeps admitting real accounts, and frees a guest's slot when they upgrade", async () => {
    process.env.SIMULATION_MAX_SEASON_GUESTS = "1";
    const service = await createSimulationService({ host: "127.0.0.1", port: 0, maxSeasonPlayers: 10, log: silentLog });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = createRawSimulationClient(started.address);

    await expect(joinSeasonAsGuest(client, "guest-a")).resolves.toMatchObject({ spawned: true, guestFull: false });
    await expect(joinSeasonAsGuest(client, "guest-b")).resolves.toMatchObject({ spawned: false, full: false, guestFull: true });
    expect(service.runtime.exportState().tiles.some((tile) => tile.ownerId === "guest-b")).toBe(false);

    // The default test world only has room for one more spawn after guest-a,
    // so later joins are checked for admission (full / guestFull), not spawn.
    await expect(joinSeason(client, "account-c")).resolves.toMatchObject({ full: false });

    // guest-a links a real account: their next login is a non-guest prepare.
    await expect(preparePlayer(client, "guest-a", { authKind: "account" })).resolves.toMatchObject({ joined: true });
    await expect(joinSeasonAsGuest(client, "guest-b")).resolves.toMatchObject({ full: false, guestFull: false });
  });
});
