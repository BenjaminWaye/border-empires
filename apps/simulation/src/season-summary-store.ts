import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";

import type { SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";

export type SeasonSummaryStore = {
  saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void>;
  loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined>;
  listArchives(limit?: number): Promise<SeasonArchiveRow[]>;
  archiveSeason(summary: SeasonArchiveRow): Promise<void>;
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

  async saveCurrentSummary(summary: CurrentSeasonSummary): Promise<void> {
    this.currentSummary = JSON.parse(JSON.stringify(summary)) as CurrentSeasonSummary;
  }

  async loadCurrentSummary(): Promise<CurrentSeasonSummary | undefined> {
    return this.currentSummary ? (JSON.parse(JSON.stringify(this.currentSummary)) as CurrentSeasonSummary) : undefined;
  }

  async listArchives(limit = 12): Promise<SeasonArchiveRow[]> {
    return this.archives.slice(0, limit).map((archive) => JSON.parse(JSON.stringify(archive)) as SeasonArchiveRow);
  }

  async archiveSeason(summary: SeasonArchiveRow): Promise<void> {
    this.archives = [summary, ...this.archives.filter((archive) => archive.seasonId !== summary.seasonId)]
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, 12);
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
