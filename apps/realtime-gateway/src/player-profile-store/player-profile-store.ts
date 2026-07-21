export type StoredPlayerProfile = {
  playerId: string;
  name?: string;
  tileColor?: string;
  profileComplete?: boolean;
  // Season id (CurrentSeasonSummary.seasonId) the display name was last
  // actually changed in, once the player has completed initial setup — used
  // to throttle renames to once per season. Undefined until the player's
  // first post-setup rename.
  nameChangedSeasonId?: string;
  updatedAt: number;
};

export type GatewayPlayerProfileStore = {
  get(playerId: string): Promise<StoredPlayerProfile | undefined>;
  getMany(playerIds: Iterable<string>): Promise<StoredPlayerProfile[]>;
  listAllNamed(): Promise<StoredPlayerProfile[]>;
  setTileColor(playerId: string, tileColor: string): Promise<StoredPlayerProfile>;
  // nameChangedSeasonId, when passed, records the season the rename happened
  // in (for the once-per-season throttle); omit it for the player's initial
  // profile setup, which doesn't consume that season's allowance.
  setProfile(playerId: string, name: string, tileColor: string, nameChangedSeasonId?: string): Promise<StoredPlayerProfile>;
};

export class InMemoryGatewayPlayerProfileStore implements GatewayPlayerProfileStore {
  private readonly profiles = new Map<string, StoredPlayerProfile>();

  async get(playerId: string): Promise<StoredPlayerProfile | undefined> {
    const profile = this.profiles.get(playerId);
    return profile ? { ...profile } : undefined;
  }

  async getMany(playerIds: Iterable<string>): Promise<StoredPlayerProfile[]> {
    const profiles: StoredPlayerProfile[] = [];
    const seen = new Set<string>();
    for (const playerId of playerIds) {
      if (seen.has(playerId)) continue;
      seen.add(playerId);
      const profile = this.profiles.get(playerId);
      if (profile) profiles.push({ ...profile });
    }
    return profiles;
  }

  async listAllNamed(): Promise<StoredPlayerProfile[]> {
    return [...this.profiles.values()].filter((p) => p.name && p.name.length > 0).map((p) => ({ ...p }));
  }

  async setTileColor(playerId: string, tileColor: string): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const updated: StoredPlayerProfile = {
      playerId,
      ...(existing?.name ? { name: existing.name } : {}),
      tileColor,
      ...(typeof existing?.profileComplete === "boolean" ? { profileComplete: existing.profileComplete } : {}),
      ...(existing?.nameChangedSeasonId ? { nameChangedSeasonId: existing.nameChangedSeasonId } : {}),
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }

  async setProfile(playerId: string, name: string, tileColor: string, nameChangedSeasonId?: string): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const resolvedSeasonId = nameChangedSeasonId ?? existing?.nameChangedSeasonId;
    const updated: StoredPlayerProfile = {
      playerId,
      name,
      tileColor,
      profileComplete: true,
      ...(resolvedSeasonId ? { nameChangedSeasonId: resolvedSeasonId } : {}),
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }
}
