import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { resolveGalaxyHoldingsByOwner } from "./galaxy-holdings.js";

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
});
