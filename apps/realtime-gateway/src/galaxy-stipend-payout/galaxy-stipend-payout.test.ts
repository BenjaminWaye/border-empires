import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { startGalaxyCycleScheduler } from "../galaxy-cycle-scheduler/galaxy-cycle-scheduler.js";
import { stipendPayoutAmounts } from "./galaxy-stipend-payout.js";

const archive = (overrides: Partial<SeasonArchiveRow>): SeasonArchiveRow => ({
  seasonId: "season-default",
  seasonSequence: 1,
  endedAt: 1_000,
  updatedAt: 1_000,
  mostTerritory: [],
  mostPoints: [],
  longestSurvivalMs: [],
  replayEvents: [],
  ...overrides
});

const runOnePoll = async (deps: Parameters<typeof startGalaxyCycleScheduler>[0]): Promise<void> => {
  const scheduler = startGalaxyCycleScheduler({ pollIntervalMs: 60_000, ...deps });
  scheduler.stop();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

// An unwon season (no Planet anywhere) whose only galaxy record is a §3
// Stipend for player-1, plus one for an unbound AI empire.
const stipendArchives = async (): Promise<SeasonArchiveRow[]> => [
  archive({
    seasonId: "season-stipend",
    galaxyTiers: [
      { playerId: "player-1", playerName: "Bystander", tier: "STIPEND", influence: 9, production: 36 },
      { playerId: "ai-3", playerName: "Some AI", tier: "STIPEND", influence: 5, production: 20 }
    ]
  })
];

describe("Stipend payout (§3/§13)", () => {
  it("credits a Stipend's Influence and Production to the galaxy balance exactly once, across polls and restarts", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();

    await runOnePoll({ listSeasonArchives: stipendArchives, authBindingStore, galaxyEconomyStore, now: () => 5_000 });
    expect(await galaxyEconomyStore.getBalance("uid-1")).toEqual({ authUid: "uid-1", influence: 9, production: 36, lastCycleAt: 5_000 });

    // A second scheduler instance against the same store (= gateway restart),
    // and a later poll: no double payment.
    await runOnePoll({ listSeasonArchives: stipendArchives, authBindingStore, galaxyEconomyStore, now: () => 6_000 });
    await runOnePoll({ listSeasonArchives: stipendArchives, authBindingStore, galaxyEconomyStore, now: () => 7_000 });
    expect(await galaxyEconomyStore.getBalance("uid-1")).toEqual({ authUid: "uid-1", influence: 9, production: 36, lastCycleAt: 5_000 });

    // AI empires (no bound account) are never paid.
    expect((await galaxyEconomyStore.getAllBalances()).map((b) => b.authUid)).toEqual(["uid-1"]);
  });

  it("adds the Stipend on top of an existing balance without disturbing its Cycle clock", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 3, production: 10, lastCycleAt: 0 });

    // A Cycle elapses in the same poll: the Stipend must survive the Cycle
    // tick's balance write (no territory here, so the Cycle itself adds 0).
    await runOnePoll({ listSeasonArchives: stipendArchives, authBindingStore, galaxyEconomyStore, now: () => GALAXY_CYCLE_LENGTH_MS + 1 });
    expect(await galaxyEconomyStore.getBalance("uid-1")).toEqual({
      authUid: "uid-1",
      influence: 12,
      production: 46,
      lastCycleAt: GALAXY_CYCLE_LENGTH_MS
    });
  });

  it("pays whole units, matching what /hq/galaxy/me shows", () => {
    expect(stipendPayoutAmounts({ influence: 9.37, production: 37.48 })).toEqual({ influence: 9, production: 37 });
    expect(stipendPayoutAmounts({})).toEqual({ influence: 0, production: 0 });
  });
});
