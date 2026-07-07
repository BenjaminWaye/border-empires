// A "galaxy planet" is the durable, cross-season record of a season's crowned
// planet: who won it, what they named it, and when. It is a pure read/write
// model layered on top of the already-durable `season_archive` winner data —
// this store only ever holds the one-time christening (name), never the win
// itself, so it can be rebuilt from archives at any point without data loss.
export type GalaxyPlanetRecord = {
  seasonId: string;
  ownerAuthUid: string;
  planetName: string;
  namedAt: number;
};

export type GalaxyPlanetChristenResult = {
  // false when a planet was already named for this seasonId (the insert was a
  // no-op) — christening is intentionally one-time and permanent.
  inserted: boolean;
  record: GalaxyPlanetRecord;
};

export type GalaxyPlanetStore = {
  getBySeasonId: (seasonId: string) => Promise<GalaxyPlanetRecord | undefined>;
  getByOwner: (ownerAuthUid: string) => Promise<GalaxyPlanetRecord[]>;
  christen: (input: { seasonId: string; ownerAuthUid: string; planetName: string }) => Promise<GalaxyPlanetChristenResult>;
};

export class InMemoryGalaxyPlanetStore implements GalaxyPlanetStore {
  private readonly planetsBySeasonId = new Map<string, GalaxyPlanetRecord>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async getBySeasonId(seasonId: string): Promise<GalaxyPlanetRecord | undefined> {
    const existing = this.planetsBySeasonId.get(seasonId);
    return existing ? { ...existing } : undefined;
  }

  async getByOwner(ownerAuthUid: string): Promise<GalaxyPlanetRecord[]> {
    const owned: GalaxyPlanetRecord[] = [];
    for (const record of this.planetsBySeasonId.values()) {
      if (record.ownerAuthUid === ownerAuthUid) owned.push({ ...record });
    }
    return owned;
  }

  async christen(input: {
    seasonId: string;
    ownerAuthUid: string;
    planetName: string;
  }): Promise<GalaxyPlanetChristenResult> {
    const existing = this.planetsBySeasonId.get(input.seasonId);
    if (existing) return { inserted: false, record: { ...existing } };

    const record: GalaxyPlanetRecord = {
      seasonId: input.seasonId,
      ownerAuthUid: input.ownerAuthUid,
      planetName: input.planetName,
      namedAt: this.now()
    };
    this.planetsBySeasonId.set(input.seasonId, record);
    return { inserted: true, record: { ...record } };
  }
}
