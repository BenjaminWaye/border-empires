import type { CurrentSeasonSummary, SeasonArchiveRow, SeasonParticipationRow } from "@border-empires/sim-protocol";
import { withBackfilledLatestStandings } from "./season-summary/season-archive-standings.js";

import type { PersistedActivityLogs } from "./activity-dashboard/activity-log-persistence.js";
import { cloneDeadliestTile, type DeadliestTileEntry } from "./deadliest-tiles/deadliest-tiles.js";
import { computeSeasonElo } from "./season-elo/season-elo.js";
import type { SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";

// The Season archive list shown to players is the newest 12; the galaxy layer
// needs every archive, because a won season's Planet lives in its archive row
// (a 12-row cap made older Planets vanish once 12 newer seasons had ended).
export const SEASON_ARCHIVE_LIST_LIMIT = 12;
export const GALAXY_ARCHIVE_LIMIT = 500;

export type { SeasonParticipationRow } from "@border-empires/sim-protocol";

export type SeasonSummaryStore = {
  saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void>;
  loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined>;
  /**
   * Season-scoped top-K per-tile combat damage, kept OUT of the summary blob
   * itself: the summary is broadcast to every client, and this is only ever
   * read back on boot (see deadliest-tiles.ts for why it is a bounded top-K).
   */
  saveDeadliestTiles(seasonId: string, tiles: readonly DeadliestTileEntry[]): Promise<void>;
  loadDeadliestTiles(seasonId: string): Promise<DeadliestTileEntry[] | undefined>;
  /**
   * The rolling 24h activity feeds, so a restart does not silently reset the
   * activity dashboard's "today" (see activity-log-persistence.ts). Kept out
   * of the summary blob for the same reason as the tiles above.
   */
  saveActivityLogs(seasonId: string, logs: PersistedActivityLogs): Promise<void>;
  loadActivityLogs(seasonId: string): Promise<PersistedActivityLogs | undefined>;
  listArchives(limit?: number): Promise<SeasonArchiveRow[]>;
  archiveSeason(summary: SeasonArchiveRow): Promise<void>;
  /**
   * One row per player in the ended season's *full* leaderboard (not the
   * top-5 truncated into SeasonArchiveRow's mostPoints/mostTerritory) --
   * backs career stats (seasons played, best rank) on the player profile.
   * Idempotent per (seasonId, playerId) so a retried rollover can't double-count.
   * Also stamps each row with the player's season-end ELO (season-elo.ts),
   * seeded from their most recent rating in any *other* season, so a retry
   * recomputes the same ratings instead of compounding them.
   */
  recordSeasonParticipation(seasonId: string, seasonSequence: number, endedAt: number, overall: CurrentSeasonSummary["overall"]): Promise<void>;
  listParticipationForPlayer(playerId: string, limit?: number): Promise<SeasonParticipationRow[]>;
  bootstrapSeason(options: {
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void>;
  startNextSeason(options: {
    archiveSummary: SeasonArchiveRow;
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void>;
};

export class InMemorySeasonSummaryStore implements SeasonSummaryStore {
  private currentSummary?: CurrentSeasonSummary;
  private archives: SeasonArchiveRow[] = [];
  private deadliestTilesBySeasonId = new Map<string, DeadliestTileEntry[]>();
  private activityLogsBySeasonId = new Map<string, PersistedActivityLogs>();

  async saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void> {
    this.currentSummary = JSON.parse(JSON.stringify(summary)) as CurrentSeasonSummary;
  }

  async loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined> {
    return this.currentSummary ? (JSON.parse(JSON.stringify(this.currentSummary)) as CurrentSeasonSummary) : undefined;
  }

  async saveDeadliestTiles(seasonId: string, tiles: readonly DeadliestTileEntry[]): Promise<void> {
    this.deadliestTilesBySeasonId.set(seasonId, tiles.map(cloneDeadliestTile));
  }

  async loadDeadliestTiles(seasonId: string): Promise<DeadliestTileEntry[] | undefined> {
    return this.deadliestTilesBySeasonId.get(seasonId)?.map(cloneDeadliestTile);
  }

  async saveActivityLogs(seasonId: string, logs: PersistedActivityLogs): Promise<void> {
    this.activityLogsBySeasonId.set(seasonId, JSON.parse(JSON.stringify(logs)) as PersistedActivityLogs);
  }

  async loadActivityLogs(seasonId: string): Promise<PersistedActivityLogs | undefined> {
    const logs = this.activityLogsBySeasonId.get(seasonId);
    return logs ? (JSON.parse(JSON.stringify(logs)) as PersistedActivityLogs) : undefined;
  }

  async listArchives(limit = SEASON_ARCHIVE_LIST_LIMIT): Promise<SeasonArchiveRow[]> {
    const archives = this.archives.slice(0, limit).map((archive) => JSON.parse(JSON.stringify(archive)) as SeasonArchiveRow);
    return withBackfilledLatestStandings(archives, async (seasonId) =>
      [...this.participationByPlayerId.values()].flatMap((rows) => rows.filter((row) => row.seasonId === seasonId)).map((row) => ({ ...row })));
  }

  async archiveSeason(summary: SeasonArchiveRow): Promise<void> {
    this.archives = [summary, ...this.archives.filter((archive) => archive.seasonId !== summary.seasonId)]
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, GALAXY_ARCHIVE_LIMIT);
  }

  private participationByPlayerId = new Map<string, SeasonParticipationRow[]>();

  async recordSeasonParticipation(seasonId: string, seasonSequence: number, endedAt: number, overall: CurrentSeasonSummary["overall"]): Promise<void> {
    // A retried rollover replaces the earlier attempt's rows wholesale, like
    // the SQLite store's DELETE, so a player who dropped off the final
    // leaderboard keeps no row (or rating) for this season.
    for (const [playerId, rows] of this.participationByPlayerId) {
      const kept = rows.filter((row) => row.seasonId !== seasonId);
      if (kept.length === rows.length) continue;
      if (kept.length > 0) this.participationByPlayerId.set(playerId, kept);
      else this.participationByPlayerId.delete(playerId);
    }
    const ratings = computeSeasonElo(
      overall.map((entry) => ({ playerId: entry.id, rank: entry.rank })),
      (playerId) => (this.participationByPlayerId.get(playerId) ?? [])
        .filter((row) => row.seasonId !== seasonId && row.endedAt <= endedAt && typeof row.ratingAfter === "number")
        .sort((left, right) => right.endedAt - left.endedAt)[0]?.ratingAfter
    );
    for (const entry of overall) {
      const rating = ratings.get(entry.id);
      const row: SeasonParticipationRow = {
        seasonId, seasonSequence, playerId: entry.id, playerName: entry.name,
        rank: entry.rank, score: entry.score, tiles: entry.tiles,
        incomePerMinute: entry.incomePerMinute, techs: entry.techs, endedAt,
        ...(rating ? { ratingBefore: rating.ratingBefore, ratingAfter: rating.ratingAfter } : {})
      };
      const existing = (this.participationByPlayerId.get(entry.id) ?? []).filter((r) => r.seasonId !== seasonId);
      existing.push(row);
      // Bounded like `archives` above: keep only the most recent seasons per
      // player so this map cannot grow without limit across a long-lived process.
      const bounded = existing.sort((left, right) => right.endedAt - left.endedAt).slice(0, 200);
      this.participationByPlayerId.set(entry.id, bounded);
    }
  }

  async listParticipationForPlayer(playerId: string, limit = 200): Promise<SeasonParticipationRow[]> {
    return (this.participationByPlayerId.get(playerId) ?? [])
      .slice()
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  async bootstrapSeason(options: {
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void> {
    void options.snapshotSections;
    void options.createdAt;
    await this.saveCurrentSummary(options.currentSummary);
  }

  async startNextSeason(options: {
    archiveSummary: SeasonArchiveRow;
    snapshotSections: SimulationSnapshotSections;
    currentSummary: CurrentSeasonSummary;
    createdAt: number;
  }): Promise<void> {
    void options.snapshotSections;
    void options.createdAt;
    await this.archiveSeason(options.archiveSummary);
    await this.saveCurrentSummary(options.currentSummary);
  }
}
