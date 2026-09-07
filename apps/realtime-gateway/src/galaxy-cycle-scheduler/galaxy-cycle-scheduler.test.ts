import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { currentGlobalCycleIndex } from "../galaxy-senate-tick/galaxy-senate-tick.js";
import { startGalaxyCycleScheduler } from "./galaxy-cycle-scheduler.js";

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

describe("startGalaxyCycleScheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("seeds a baseline ledger row immediately without granting trickle for partial time", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    let nowMs = 5_000;

    const scheduler = startGalaxyCycleScheduler({
      listSeasonArchives: async () => [
        archive({
          seasonId: "season-1",
          winner: { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
        })
      ],
      authBindingStore,
      galaxyEconomyStore,
      now: () => nowMs,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const balance = await galaxyEconomyStore.getBalance("uid-1");
    expect(balance).toEqual({ authUid: "uid-1", influence: 0, production: 0, lastCycleAt: 5_000 });
  });

  it("applies exactly the number of whole Cycles elapsed since lastCycleAt", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-1", influence: 0, production: 0, lastCycleAt: 0 });

    const nowMs = GALAXY_CYCLE_LENGTH_MS * 2 + 100;
    const scheduler = startGalaxyCycleScheduler({
      listSeasonArchives: async () => [
        archive({
          seasonId: "season-1",
          winner: { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
        })
      ],
      authBindingStore,
      galaxyEconomyStore,
      now: () => nowMs,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Capital Planet, 2 Cycles: (+6 -3) * 2 = +6 Inf.
    const balance = await galaxyEconomyStore.getBalance("uid-1");
    expect(balance?.influence).toBe(6);
    expect(balance?.lastCycleAt).toBe(GALAXY_CYCLE_LENGTH_MS * 2);

    const stability = await galaxyEconomyStore.getStability("uid-1", "season-1");
    expect(stability?.stability).toBe(100);
  });

  it("halves trickle for an empire under an active EMBARGO, and leaves an un-embargoed empire untouched", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-embargoed", playerId: "player-embargoed" });
    await authBindingStore.bindIdentity({ uid: "uid-clean", playerId: "player-clean" });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-embargoed", influence: 0, production: 0, lastCycleAt: 0 });
    await galaxyEconomyStore.upsertBalance({ authUid: "uid-clean", influence: 0, production: 0, lastCycleAt: 0 });

    const nowMs = GALAXY_CYCLE_LENGTH_MS + 100;
    const galaxySenateStore = new InMemoryGalaxySenateStore();
    const proposal = await galaxySenateStore.createProposal({
      type: "EMBARGO",
      proposerAuthUid: "someone",
      targetAuthUid: "uid-embargoed",
      createdAt: 0,
      createdAtCycleIndex: 0
    });
    await galaxySenateStore.resolveProposal(proposal.id, {
      status: "PASSED",
      resolvedAt: 0,
      activeUntilCycleIndex: currentGlobalCycleIndex(nowMs) + 1
    });

    const scheduler = startGalaxyCycleScheduler({
      listSeasonArchives: async () => [
        archive({
          seasonId: "season-embargoed",
          winner: { playerId: "player-embargoed", playerName: "Embargoed", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
        }),
        archive({
          seasonId: "season-clean",
          winner: { playerId: "player-clean", playerName: "Clean", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
        })
      ],
      authBindingStore,
      galaxyEconomyStore,
      galaxySenateStore,
      now: () => nowMs,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Capital Planet, 1 Cycle, no Embargo: +6 -3 = +3 Inf.
    const clean = await galaxyEconomyStore.getBalance("uid-clean");
    expect(clean?.influence).toBe(3);
    // Same setup, but trickle halved by the active Embargo: +3 -3 = 0 Inf.
    const embargoed = await galaxyEconomyStore.getBalance("uid-embargoed");
    expect(embargoed?.influence).toBe(0);
  });
});
