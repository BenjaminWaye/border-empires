// Shared by season-lobby-gateway-integration.ts and
// gateway-app/handle-set-country-flag-message.ts -- kept in its own module
// so those two don't import each other (season-lobby-gateway-integration.ts
// also imports handle-set-country-flag-message.ts).
export type LobbyDisplayLookup = {
  getOverride: (playerId: string) => { name?: string; countryFlag?: string } | undefined;
  getStoredProfile: (playerId: string) => Promise<{ name?: string; countryFlag?: string } | undefined>;
  fallbackName: (playerId: string) => string;
};

// Resolves a player's display name + optional flag for the lobby roster,
// preferring the (already-warm) profile override cache over a store read,
// then a generated fallback name -- mirrors how PLAYER_STYLE resolves names
// elsewhere in gateway-app.ts.
export const resolveLobbyDisplay = async (
  playerId: string,
  lookup: LobbyDisplayLookup
): Promise<{ name: string; countryFlag?: string }> => {
  const override = lookup.getOverride(playerId);
  const stored = override?.name ? undefined : await lookup.getStoredProfile(playerId);
  const name = override?.name ?? stored?.name ?? lookup.fallbackName(playerId);
  const countryFlag = override?.countryFlag ?? stored?.countryFlag;
  return { name, ...(countryFlag ? { countryFlag } : {}) };
};
