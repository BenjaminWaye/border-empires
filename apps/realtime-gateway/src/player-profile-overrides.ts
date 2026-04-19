export type PlayerProfileOverride = {
  name?: string;
  tileColor?: string;
  profileComplete?: boolean;
};

export type PlayerProfileOverrides = {
  get: (playerId: string) => PlayerProfileOverride | undefined;
  setTileColor: (playerId: string, tileColor: string) => PlayerProfileOverride;
  setProfile: (playerId: string, name: string, tileColor: string) => PlayerProfileOverride;
};

export const createPlayerProfileOverrides = (): PlayerProfileOverrides => {
  const overridesByPlayerId = new Map<string, PlayerProfileOverride>();

  const getOrCreate = (playerId: string): PlayerProfileOverride => {
    const existing = overridesByPlayerId.get(playerId);
    if (existing) return existing;
    const created: PlayerProfileOverride = {};
    overridesByPlayerId.set(playerId, created);
    return created;
  };

  return {
    get(playerId) {
      return overridesByPlayerId.get(playerId);
    },
    setTileColor(playerId, tileColor) {
      const override = getOrCreate(playerId);
      override.tileColor = tileColor;
      return override;
    },
    setProfile(playerId, name, tileColor) {
      const override = getOrCreate(playerId);
      override.name = name;
      override.tileColor = tileColor;
      override.profileComplete = true;
      return override;
    }
  };
};
