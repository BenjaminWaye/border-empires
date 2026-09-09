import type { CurrentSeasonSummary, SeasonArchiveRow, SeasonParticipationRow } from "@border-empires/sim-protocol";

import type { PersistedActivityLogs } from "./activity-dashboard/activity-log-persistence.js";
import type { DeadliestTileEntry } from "./deadliest-tiles/deadliest-tiles.js";
import type { SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";

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
    this.deadliestTilesBySeasonId.set(seasonId, tiles.map((tile) => ({ ...tile })));
  }

  async loadDeadliestTiles(seasonId: string): Promise<DeadliestTileEntry[] | undefined> {
    return this.deadliestTilesBySeasonId.get(seasonId)?.map((tile) => ({ ...tile }));
  }

  async saveActivityLogs(seasonId: string, logs: PersistedActivityLogs): Promise<void> {
    this.activityLogsBySeasonId.set(seasonId, JSON.parse(JSON.stringify(logs)) as PersistedActivityLogs);
  }

  async loadActivityLogs(seasonId: string): Promise<PersistedActivityLogs | undefined> {
    const logs = this.activityLogsBySeasonId.get(seasonId);
    return logs ? (JSON.parse(JSON.stringify(logs)) as PersistedActivityLogs) : undefined;
  }

  async listArchives(limit = 12): Promise<SeasonArchiveRow[]> {
    return this.archives.slice(0, limit).map((archive) => JSON.parse(JSON.stringify(archive)) as SeasonArchiveRow);
  }

  async archiveSeason(summary: SeasonArchiveRow): Promise<void> {
    this.archives = [summary, ...this.archives.filter((archive) => archive.seasonId !== summary.seasonId)]
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, 12);
  }

  private participationByPlayerId = new Map<string, SeasonParticipationRow[]>();

  async recordSeasonParticipation(seasonId: string, seasonSequence: number, endedAt: number, overall: CurrentSeasonSummary["overall"]): Promise<void> {
    for (const entry of overall) {
      const row: SeasonParticipationRow = {
        seasonId, seasonSequence, playerId: entry.id, playerName: entry.name,
        rank: entry.rank, score: entry.score, tiles: entry.tiles,
        incomePerMinute: entry.incomePerMinute, techs: entry.techs, endedAt
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
