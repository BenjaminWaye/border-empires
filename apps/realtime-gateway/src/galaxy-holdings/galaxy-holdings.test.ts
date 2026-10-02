import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { InMemoryGalaxyDefenseCampaignStore } from "../galaxy-defense-campaign-store/galaxy-defense-campaign-store.js";
import { resolveEndedSeasons, resolveGalaxyHoldingsByOwner, resolveDukeAuthUids, holdsPlanetTier } from "./galaxy-holdings.js";

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

const endedSummary = (overrides: Partial<CurrentSeasonSummary>): CurrentSeasonSummary =>
  ({
    seasonId: "season-default",
    seasonSequence: 1,
    status: "ended",
    updatedAt: 1_000,
    ...overrides
  }) as CurrentSeasonSummary;

describe("resolveGalaxyHoldingsByOwner", () => {
  it("groups an owner's won Planet and awarded Outposts together", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });

    const archives: SeasonArchiveRow[] = [
      archive({
        seasonId: "season-1",
        winner: { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
      }),
      archive({
        seasonId: "season-2",
        galaxyTiers: [{ playerId: "player-1", playerName: "Player One", tier: "OUTPOST", specialization: "INDUSTRIAL" }]
      })
    ];

    const byOwner = await resolveGalaxyHoldingsByOwner({
      listSeasonArchives: async () => archives,
      authBindingStore
    });

    const territories = byOwner.get("uid-1");
    expect(territories).toBeDefined();
    expect(territories?.sort((a, b) => a.seasonId.localeCompare(b.seasonId))).toEqual([
      { seasonId: "season-1", tier: "PLANET", specialization: "CAPITAL" },
      { seasonId: "season-2", tier: "OUTPOST", specialization: "INDUSTRIAL" }
    ]);
  });

  it("excludes Stipends (no territory) and unbound winners", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    const archives: SeasonArchiveRow[] = [
      archive({
        seasonId: "season-1",
        winner: { playerId: "unbound-player", playerName: "Someone", objectiveId: "TOWN_CONTROL", objectiveName: "Town Control", crownedAt: 1 }
      }),
      archive({
        seasonId: "season-2",
        galaxyTiers: [{ playerId: "unbound-player", playerName: "Someone", tier: "STIPEND", influence: 4, production: 4 }]
      })
    ];

    const byOwner = await resolveGalaxyHoldingsByOwner({ listSeasonArchives: async () => archives, authBindingStore });
    expect(byOwner.size).toBe(0);
  });

  it("a Defense Campaign season's own seasonId never becomes an independent Planet", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1" });
    const archives: SeasonArchiveRow[] = [
      archive({
        seasonId: "season-dc",
        winner: { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 },
        defenseCampaignTargetSeasonId: "season-original"
      })
    ];

    const { won } = await resolveEndedSeasons({ listSeasonArchives: async () => archives });
    expect(won).toHaveLength(0);
  });

  it("ownership resolves to the Defense Campaign winner once a transfer is recorded, not the territory's original winner", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-original", playerId: "player-original" });
    await authBindingStore.bindIdentity({ uid: "uid-conqueror", playerId: "player-conqueror" });
    const galaxyDefenseCampaignStore = new InMemoryGalaxyDefenseCampaignStore();
    await galaxyDefenseCampaignStore.recordTransfer({
      originalSeasonId: "season-original",
      currentOwnerAuthUid: "uid-conqueror",
      transferredAt: 500,
      wonViaSeasonId: "season-dc"
    });

    const archives: SeasonArchiveRow[] = [
      archive({
        seasonId: "season-original",
        winner: { playerId: "player-original", playerName: "Original Winner", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
      })
    ];

    const byOwner = await resolveGalaxyHoldingsByOwner({
      listSeasonArchives: async () => archives,
      authBindingStore,
      galaxyDefenseCampaignStore
    });

    expect(byOwner.get("uid-original")).toBeUndefined();
    expect(byOwner.get("uid-conqueror")).toEqual([{ seasonId: "season-original", tier: "PLANET", specialization: "CAPITAL" }]);
  });
});

describe("resolveEndedSeasons sector labels", () => {
  it("attaches a Frontier sectorLabel to a won season, and a Contestation label to a tiered Defense Campaign season", async () => {
    const archives: SeasonArchiveRow[] = [
      archive({
        seasonId: "season-1",
        winner: { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
      }),
      archive({
        seasonId: "season-dc",
        seasonSequence: 5,
        defenseCampaignTargetSeasonId: "season-1",
        galaxyTiers: [{ playerId: "player-2", playerName: "Player Two", tier: "STIPEND", influence: 1, production: 1 }]
      })
    ];

    const { won, tiered } = await resolveEndedSeasons({ listSeasonArchives: async () => archives });
    expect(won).toEqual([
      expect.objectContaining({ seasonId: "season-1", sectorLabel: { sectorNumber: 1, campaign: { kind: "FRONTIER" } } })
    ]);
    expect(tiered).toEqual([
      expect.objectContaining({ seasonId: "season-dc", sectorLabel: { sectorNumber: 1, campaign: { kind: "CONTESTATION", ordinal: 1 } } })
    ]);
  });

  it("leaves sectorLabel undefined for a tiered season nobody won outright", async () => {
    const archives: SeasonArchiveRow[] = [
      archive({ seasonId: "season-unwon", galaxyTiers: [{ playerId: "player-1", playerName: "Player One", tier: "STIPEND", influence: 1, production: 1 }] })
    ];

    const { tiered } = await resolveEndedSeasons({ listSeasonArchives: async () => archives });
    expect(tiered).toEqual([expect.objectContaining({ seasonId: "season-unwon", sectorLabel: undefined })]);
  });

  it("folds an in-progress-but-ended current season into numbering so a later Frontier win doesn't undercount it", async () => {
    const archives: SeasonArchiveRow[] = [
      archive({
        seasonId: "season-1",
        winner: { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
      }),
      archive({
        seasonId: "season-3",
        seasonSequence: 3,
        winner: { playerId: "player-3", playerName: "Player Three", objectiveId: "TOWN_CONTROL", objectiveName: "Town Control", crownedAt: 3 }
      })
    ];

    const { won } = await resolveEndedSeasons({
      listSeasonArchives: async () => archives,
      getCurrentSeasonSummary: async () =>
        endedSummary({
          seasonId: "season-2",
          seasonSequence: 2,
          seasonWinner: { playerId: "player-2", playerName: "Player Two", objectiveId: "RESOURCE_MONOPOLY", objectiveName: "Resource Monopoly", crownedAt: 2 },
          updatedAt: 2_000
        })
    });

    const bySeasonId = new Map(won.map((w) => [w.seasonId, w.sectorLabel.sectorNumber]));
    expect(bySeasonId.get("season-1")).toBe(1);
    expect(bySeasonId.get("season-2")).toBe(2);
    expect(bySeasonId.get("season-3")).toBe(3);
  });
});

describe("holdsPlanetTier", () => {
  it("is true only when at least one held territory is a Planet", () => {
    expect(holdsPlanetTier([{ seasonId: "s1", tier: "PLANET", specialization: "CAPITAL" }])).toBe(true);
    expect(holdsPlanetTier([{ seasonId: "s1", tier: "OUTPOST", specialization: "INDUSTRIAL" }])).toBe(false);
    expect(holdsPlanetTier(undefined)).toBe(false);
    expect(holdsPlanetTier([])).toBe(false);
  });
});

describe("resolveDukeAuthUids", () => {
  it("is the Duke title: every authUid holding at least one Planet, Outpost-only owners excluded", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-duke", playerId: "player-duke" });
    await authBindingStore.bindIdentity({ uid: "uid-outpost-only", playerId: "player-outpost-only" });

    const archives: SeasonArchiveRow[] = [
      archive({
        seasonId: "season-1",
        winner: { playerId: "player-duke", playerName: "Duke Player", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 }
      }),
      archive({
        seasonId: "season-2",
        galaxyTiers: [{ playerId: "player-outpost-only", playerName: "Outpost Player", tier: "OUTPOST", specialization: "INDUSTRIAL" }]
      })
    ];

    const dukeAuthUids = await resolveDukeAuthUids({
      listSeasonArchives: async () => archives,
      authBindingStore
    });

    expect(dukeAuthUids.has("uid-duke")).toBe(true);
    expect(dukeAuthUids.has("uid-outpost-only")).toBe(false);
    expect(dukeAuthUids.size).toBe(1);
  });
});
