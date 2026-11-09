// Waitlist for the next Sector Contest: accounts that were turned away
// because the current Sector was full (SEASON_FULL) and asked to be told
// when another Sector opens. Keyed by the seasonId of the full Sector, so a
// rollover naturally starts an empty list while the old one stays readable
// as a record of demand (how many Houses were waiting for that Sector).
//
// Deliberately only a demand signal today: the infrastructure runs one
// Sector at a time, so waitlisted accounts are notified by the existing
// season-start email that every bound account receives. Opening extra
// Sectors on demand, and paid pledges, build on this list later.
export type SectorWaitlistEntry = {
  seasonId: string;
  playerId: string;
  joinedAt: number;
};

export type SectorWaitlistStore = {
  /** Adds the entry. Resolves true when it was new, false when already present. */
  join: (entry: SectorWaitlistEntry) => Promise<boolean>;
  /** Removes the entry. Resolves true when one was removed. */
  leave: (seasonId: string, playerId: string) => Promise<boolean>;
  has: (seasonId: string, playerId: string) => Promise<boolean>;
  count: (seasonId: string) => Promise<number>;
};

export class InMemorySectorWaitlistStore implements SectorWaitlistStore {
  private readonly entries = new Map<string, Map<string, SectorWaitlistEntry>>();

  async join(entry: SectorWaitlistEntry): Promise<boolean> {
    const bySeason = this.entries.get(entry.seasonId) ?? new Map<string, SectorWaitlistEntry>();
    this.entries.set(entry.seasonId, bySeason);
    if (bySeason.has(entry.playerId)) return false;
    bySeason.set(entry.playerId, { ...entry });
    return true;
  }

  async leave(seasonId: string, playerId: string): Promise<boolean> {
    return this.entries.get(seasonId)?.delete(playerId) ?? false;
  }

  async has(seasonId: string, playerId: string): Promise<boolean> {
    return this.entries.get(seasonId)?.has(playerId) ?? false;
  }

  async count(seasonId: string): Promise<number> {
    return this.entries.get(seasonId)?.size ?? 0;
  }
}
