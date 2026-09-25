import { describe, expect, it } from "vitest";

import type { SeasonArchiveRow } from "@border-empires/sim-protocol";

import { GALAXY_ARCHIVE_LIMIT, SEASON_ARCHIVE_LIST_LIMIT } from "./season-summary-store.js";
import { createSeasonSummaryStore } from "./season-summary-store-factory.js";

const archive = (sequence: number, withWinner: boolean): SeasonArchiveRow =>
  ({
    seasonId: `season-${sequence}`,
    seasonSequence: sequence,
    endedAt: sequence * 1000,
    updatedAt: sequence * 1000,
    mostTerritory: [],
    mostPoints: [],
    longestSurvivalMs: [],
    replayEvents: [],
    ...(withWinner ? { winner: { playerId: "p", playerName: "Nauticus", crownedAt: 1, objectiveId: "ECONOMIC_HEGEMONY", objectiveName: "Economic Ascendancy" } } : {})
  }) as unknown as SeasonArchiveRow;

describe("season archive limits", () => {
  it("a won season's archive is still listed after more than 12 newer seasons (its Planet lives there)", async () => {
    const store = await createSeasonSummaryStore();
    await store.archiveSeason(archive(1, true));
    for (let n = 2; n <= 20; n += 1) await store.archiveSeason(archive(n, false));

    const newestOnly = await store.listArchives();
    expect(newestOnly).toHaveLength(SEASON_ARCHIVE_LIST_LIMIT);
    expect(newestOnly.some((row) => row.seasonId === "season-1")).toBe(false);

    const forGalaxy = await store.listArchives(GALAXY_ARCHIVE_LIMIT);
    expect(forGalaxy.some((row) => row.seasonId === "season-1" && row.winner)).toBe(true);
  });
});
