// The public, shareable House profile (docs/gdd.md §7): contest history,
// placements, rating, House Charges held, records, awards and wins. Built only from
// data the game already shows other players, and deliberately carries no
// playerId, auth id or email: the page is reachable by anyone with the link.
import type { SeasonArchiveRow, SeasonParticipationRow } from "@border-empires/sim-protocol";

import { ratingSummary } from "../career-routes/career-routes.js";

export type PublicHouseContest = {
  seasonSequence: number;
  endedAt: number;
  rank: number;
  /** Houses on that contest's final leaderboard; null when the archive predates final standings. */
  houses: number | null;
  score: number;
  tiles: number;
  ratingAfter?: number;
  ratingDelta?: number;
  won: boolean;
  /** Victory path name, when this House won. */
  victoryPath?: string;
};

export type PublicHouseCharge = {
  title: string;
  kind: string;
  rarity: string;
  renown: number;
  hoursHeld: number;
  places?: string[];
  seasonSequence: number;
  /** Earned in a contest this House also won. */
  foil: boolean;
};

export type PublicHouseRecord =
  | { kind: "LONGEST_ROAD"; seasonSequence: number; tiles: number; from?: string; to?: string }
  | { kind: "MOST_DEADLY_TILE"; seasonSequence: number; x: number; y: number; manpowerLost: number };

/** Never Gave Up / Comeback Kid (shared season-awards.ts), decided at that contest's crowning. */
export type PublicHouseAward = { kind: "NEVER_GAVE_UP" | "COMEBACK_KID"; seasonSequence: number; redeploys: number; rank?: number };

export type PublicHouseProfileView = {
  ok: true;
  name: string;
  /** A title the account holds, e.g. "Count"; absent when it holds none. */
  title?: string;
  rating: number | null;
  lastRatingDelta: number | null;
  peakRating: number | null;
  contestsPlayed: number;
  bestRank: number | null;
  wins: number;
  contests: PublicHouseContest[];
  charges: PublicHouseCharge[];
  records: PublicHouseRecord[];
  awards: PublicHouseAward[];
};

const MAX_CONTESTS = 100;
const MAX_CHARGES = 200;

export const buildPublicHouseProfileView = (input: {
  playerId: string;
  name: string;
  title?: string;
  participation: readonly SeasonParticipationRow[];
  archives: readonly SeasonArchiveRow[];
}): PublicHouseProfileView => {
  const { playerId } = input;
  const archiveBySeasonId = new Map(input.archives.map((archive) => [archive.seasonId, archive]));
  const rows = [...input.participation].sort((a, b) => b.endedAt - a.endedAt);

  const contests = rows.slice(0, MAX_CONTESTS).map((row): PublicHouseContest => {
    const archive = archiveBySeasonId.get(row.seasonId);
    const won = archive?.winner?.playerId === playerId;
    const rated = typeof row.ratingBefore === "number" && typeof row.ratingAfter === "number";
    return {
      seasonSequence: row.seasonSequence,
      endedAt: row.endedAt,
      rank: row.rank,
      houses: archive?.finalStandings?.length ?? null,
      score: row.score,
      tiles: row.tiles,
      ...(rated ? { ratingAfter: row.ratingAfter as number, ratingDelta: (row.ratingAfter as number) - (row.ratingBefore as number) } : {}),
      won,
      ...(won && archive?.winner ? { victoryPath: archive.winner.objectiveName } : {})
    };
  });

  const newestFirst = [...input.archives].sort((a, b) => b.endedAt - a.endedAt);
  const charges: PublicHouseCharge[] = [];
  const records: PublicHouseRecord[] = [];
  const awards: PublicHouseAward[] = [];
  for (const archive of newestFirst) {
    for (const award of archive.awards ?? []) {
      if (award.playerId !== playerId) continue;
      awards.push({ kind: award.kind, seasonSequence: archive.seasonSequence, redeploys: award.redeploys, ...(award.kind === "COMEBACK_KID" ? { rank: award.rank } : {}) });
    }
    const house = archive.houseCharges?.find((entry) => entry.playerId === playerId);
    for (const charge of house?.charges ?? []) {
      if (!charge.held || charges.length >= MAX_CHARGES) continue;
      charges.push({
        title: charge.title,
        kind: charge.kind,
        rarity: charge.rarity,
        renown: charge.renown,
        hoursHeld: charge.hoursHeld,
        ...(charge.places ? { places: charge.places } : {}),
        seasonSequence: archive.seasonSequence,
        foil: archive.winner?.playerId === playerId
      });
    }
    const stats = archive.seasonStats ?? archive.winner?.seasonStats;
    const road = stats?.longestRoad;
    if (road && road.playerId === playerId) {
      records.push({
        kind: "LONGEST_ROAD",
        seasonSequence: archive.seasonSequence,
        tiles: road.tileCount,
        ...(road.fromCity ? { from: road.fromCity.name } : {}),
        ...(road.toCity ? { to: road.toCity.name } : {})
      });
    }
    const deadly = stats?.mostDeadlyTile;
    if (deadly?.mostLossesPlayer?.playerId === playerId) {
      records.push({ kind: "MOST_DEADLY_TILE", seasonSequence: archive.seasonSequence, x: deadly.x, y: deadly.y, manpowerLost: deadly.mostLossesPlayer.manpowerLost });
    }
  }

  return {
    ok: true,
    name: input.name,
    ...(input.title ? { title: input.title } : {}),
    ...ratingSummary(rows),
    contestsPlayed: rows.length,
    bestRank: rows.length > 0 ? Math.min(...rows.map((row) => row.rank)) : null,
    wins: input.archives.filter((archive) => archive.winner?.playerId === playerId).length,
    contests,
    charges,
    records,
    awards
  };
};
