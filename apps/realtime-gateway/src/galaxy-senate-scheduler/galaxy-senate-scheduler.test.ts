import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";
import { InMemoryGalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";
import { GALAXY_CYCLE_LENGTH_MS } from "../galaxy-cycle-tick/galaxy-cycle-tick.js";
import { currentGlobalCycleIndex } from "../galaxy-senate-tick/galaxy-senate-tick.js";
import { startGalaxySenateScheduler } from "./galaxy-senate-scheduler.js";

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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startGalaxySenateScheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("leaves a proposal PENDING until the global Cycle index advances past its createdAtCycleIndex", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxySenateStore = new InMemoryGalaxySenateStore();
    const nowMs = 1_000; // still cycle 0
    const proposal = await galaxySenateStore.createProposal({
      type: "EMBARGO",
      proposerAuthUid: "uid-1",
      targetAuthUid: "uid-1",
      createdAt: nowMs,
      createdAtCycleIndex: currentGlobalCycleIndex(nowMs)
    });

    const scheduler = startGalaxySenateScheduler({
      listSeasonArchives: async () => [],
      authBindingStore,
      galaxyEconomyStore,
      galaxySenateStore,
      now: () => nowMs,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await flush();

    await expect(galaxySenateStore.getProposal(proposal.id)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("resolves a proposal PASSED once quorum and the distinct-voter floor are cleared, and stamps EMBARGO's active window", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    // 4 Planet-holding empires so 3 of them clear the 3-distinct-voter floor
    // and enough combined weight to clear EMBARGO's 25% quorum.
    for (const n of [1, 2, 3, 4]) await authBindingStore.bindIdentity({ uid: `uid-${n}`, playerId: `player-${n}` });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxySenateStore = new InMemoryGalaxySenateStore();

    const proposal = await galaxySenateStore.createProposal({
      type: "EMBARGO",
      proposerAuthUid: "uid-1",
      targetAuthUid: "uid-4",
      createdAt: 0,
      createdAtCycleIndex: 0
    });
    // Each Planet-holder has weight 10 (Planet) + 1 (100 Stability / 100) = 11.
    // 3 supporting voters * 11 = 33 of a total 44 -> 75%, clears 25% quorum.
    for (const n of [1, 2, 3]) {
      await galaxySenateStore.addVote({ proposalId: proposal.id, voterAuthUid: `uid-${n}`, weight: 11, castAt: 0 });
    }

    const nowMs = GALAXY_CYCLE_LENGTH_MS + 1; // now in cycle 1, proposal raised in cycle 0
    const scheduler = startGalaxySenateScheduler({
      listSeasonArchives: async () =>
        [1, 2, 3, 4].map((n) =>
          archive({
            seasonId: `season-${n}`,
            winner: { playerId: `player-${n}`, playerName: `Player ${n}`, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
          })
        ),
      authBindingStore,
      galaxyEconomyStore,
      galaxySenateStore,
      now: () => nowMs,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await flush();

    const resolved = await galaxySenateStore.getProposal(proposal.id);
    expect(resolved?.status).toBe("PASSED");
    // EMBARGO duration is 2 Cycles from the resolving Cycle (1): active through cycle 3.
    expect(resolved?.activeUntilCycleIndex).toBe(currentGlobalCycleIndex(nowMs) + 2);
  });

  it("resolves a proposal FAILED when quorum isn't cleared, applying no effect", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    const galaxySenateStore = new InMemoryGalaxySenateStore();

    const proposal = await galaxySenateStore.createProposal({
      type: "CONTEST",
      proposerAuthUid: "uid-1",
      targetAuthUid: "uid-1",
      targetSeasonId: "season-1",
      createdAt: 0,
      createdAtCycleIndex: 0
    });
    // No votes cast at all.

    const nowMs = GALAXY_CYCLE_LENGTH_MS + 1;
    const scheduler = startGalaxySenateScheduler({
      listSeasonArchives: async () => [
        archive({ seasonId: "season-1", winner: { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 } })
      ],
      authBindingStore,
      galaxyEconomyStore,
      galaxySenateStore,
      now: () => nowMs,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await flush();

    const resolved = await galaxySenateStore.getProposal(proposal.id);
    expect(resolved?.status).toBe("FAILED");
    await expect(galaxyEconomyStore.getStability("uid-1", "season-1")).resolves.not.toMatchObject({ stability: 0 });
  });

  it("a passed CONTEST forces the named territory's Stability to 0", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    for (const n of [1, 2, 3, 4]) await authBindingStore.bindIdentity({ uid: `uid-${n}`, playerId: `player-${n}` });
    const galaxyEconomyStore = new InMemoryGalaxyEconomyStore();
    // The target territory starts healthy -- CONTEST must zero it regardless.
    await galaxyEconomyStore.ensureStability({ authUid: "uid-4", seasonId: "season-4", tier: "PLANET" });
    const galaxySenateStore = new InMemoryGalaxySenateStore();

    const proposal = await galaxySenateStore.createProposal({
      type: "CONTEST",
      proposerAuthUid: "uid-1",
      targetAuthUid: "uid-4",
      targetSeasonId: "season-4",
      createdAt: 0,
      createdAtCycleIndex: 0
    });
    // CONTEST needs 40% quorum; all 3 other empires' full weight clears it.
    for (const n of [1, 2, 3]) {
      await galaxySenateStore.addVote({ proposalId: proposal.id, voterAuthUid: `uid-${n}`, weight: 11, castAt: 0 });
    }

    const nowMs = GALAXY_CYCLE_LENGTH_MS + 1;
    const scheduler = startGalaxySenateScheduler({
      listSeasonArchives: async () =>
        [1, 2, 3, 4].map((n) =>
          archive({
            seasonId: `season-${n}`,
            winner: { playerId: `player-${n}`, playerName: `Player ${n}`, objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
          })
        ),
      authBindingStore,
      galaxyEconomyStore,
      galaxySenateStore,
      now: () => nowMs,
      pollIntervalMs: 60_000
    });
    scheduler.stop();
    await flush();

    await expect(galaxySenateStore.getProposal(proposal.id)).resolves.toMatchObject({ status: "PASSED" });
    await expect(galaxyEconomyStore.getStability("uid-4", "season-4")).resolves.toMatchObject({ stability: 0 });
  });
});
