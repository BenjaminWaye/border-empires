import type { SeasonArchiveRow } from "@border-empires/sim-protocol";
import { describe, expect, it } from "vitest";

import { buildSectorLabelIndex } from "./galaxy-sector-numbering.js";

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

const winner = { playerId: "player-1", playerName: "Player One", objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", crownedAt: 1 };

describe("buildSectorLabelIndex", () => {
  it("labels a single Frontier win as Sector 1", () => {
    const index = buildSectorLabelIndex([archive({ seasonId: "season-1", seasonSequence: 1, winner })]);
    expect(index.get("season-1")).toEqual({ sectorNumber: 1, campaign: { kind: "FRONTIER" } });
  });

  it("labels a Defense Campaign as the 1st Contestation of its target's Sector", () => {
    const archives = [
      archive({ seasonId: "season-1", seasonSequence: 1, winner }),
      archive({ seasonId: "season-dc-1", seasonSequence: 5, winner, defenseCampaignTargetSeasonId: "season-1" })
    ];
    const index = buildSectorLabelIndex(archives);
    expect(index.get("season-1")).toEqual({ sectorNumber: 1, campaign: { kind: "FRONTIER" } });
    expect(index.get("season-dc-1")).toEqual({ sectorNumber: 1, campaign: { kind: "CONTESTATION", ordinal: 1 } });
  });

  it("orders multiple contestations of the same sector by seasonSequence, not insertion order", () => {
    const archives = [
      archive({ seasonId: "season-dc-2", seasonSequence: 9, winner, defenseCampaignTargetSeasonId: "season-1" }),
      archive({ seasonId: "season-1", seasonSequence: 1, winner }),
      archive({ seasonId: "season-dc-1", seasonSequence: 5, winner, defenseCampaignTargetSeasonId: "season-1" })
    ];
    const index = buildSectorLabelIndex(archives);
    expect(index.get("season-dc-1")).toEqual({ sectorNumber: 1, campaign: { kind: "CONTESTATION", ordinal: 1 } });
    expect(index.get("season-dc-2")).toEqual({ sectorNumber: 1, campaign: { kind: "CONTESTATION", ordinal: 2 } });
  });

  it("numbers independent sectors gaplessly by Frontier seasonSequence, ignoring intervening Defense Campaign seasons", () => {
    const archives = [
      archive({ seasonId: "season-1", seasonSequence: 1, winner }),
      archive({ seasonId: "season-dc-1", seasonSequence: 2, winner, defenseCampaignTargetSeasonId: "season-1" }),
      archive({ seasonId: "season-3", seasonSequence: 3, winner })
    ];
    const index = buildSectorLabelIndex(archives);
    expect(index.get("season-1")?.sectorNumber).toBe(1);
    expect(index.get("season-3")?.sectorNumber).toBe(2);
  });

  it("omits a Defense Campaign whose target isn't a recorded Frontier win, without throwing", () => {
    const archives = [archive({ seasonId: "season-dc-orphan", seasonSequence: 1, winner, defenseCampaignTargetSeasonId: "season-unknown" })];
    expect(() => buildSectorLabelIndex(archives)).not.toThrow();
    expect(buildSectorLabelIndex(archives).get("season-dc-orphan")).toBeUndefined();
  });

  it("omits an unwon season entirely", () => {
    const index = buildSectorLabelIndex([archive({ seasonId: "season-unwon", seasonSequence: 1 })]);
    expect(index.has("season-unwon")).toBe(false);
  });
});
