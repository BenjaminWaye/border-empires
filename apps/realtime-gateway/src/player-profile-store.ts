export type StoredPlayerProfile = {
  playerId: string;
  name?: string;
  tileColor?: string;
  profileComplete?: boolean;
  updatedAt: number;
};

export type GatewayPlayerProfileStore = {
  get(playerId: string): Promise<StoredPlayerProfile | undefined>;
  setTileColor(playerId: string, tileColor: string): Promise<StoredPlayerProfile>;
  setProfile(playerId: string, name: string, tileColor: string): Promise<StoredPlayerProfile>;
};

export class InMemoryGatewayPlayerProfileStore implements GatewayPlayerProfileStore {
  private readonly profiles = new Map<string, StoredPlayerProfile>();

  async get(playerId: string): Promise<StoredPlayerProfile | undefined> {
    const profile = this.profiles.get(playerId);
    return profile ? { ...profile } : undefined;
  }

  async setTileColor(playerId: string, tileColor: string): Promise<StoredPlayerProfile> {
    const existing = this.profiles.get(playerId);
    const updated: StoredPlayerProfile = {
      playerId,
      ...(existing?.name ? { name: existing.name } : {}),
      tileColor,
      ...(typeof existing?.profileComplete === "boolean" ? { profileComplete: existing.profileComplete } : {}),
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }

  async setProfile(playerId: string, name: string, tileColor: string): Promise<StoredPlayerProfile> {
    const updated: StoredPlayerProfile = {
      playerId,
      name,
      tileColor,
      profileComplete: true,
      updatedAt: Date.now()
    };
    this.profiles.set(playerId, updated);
    return { ...updated };
  }
}
