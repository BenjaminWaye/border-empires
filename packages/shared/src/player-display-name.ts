const OPAQUE_PLAYER_ID_RE = /^[A-Za-z0-9]{20,}$/;

const stableDisplayCode = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
};

export const isOpaquePlayerId = (value: string): boolean => OPAQUE_PLAYER_ID_RE.test(value);

export const anonymizedEmpireNameForId = (playerId: string): string => `Empire ${stableDisplayCode(playerId)}`;

// Player-facing name for the "barbarian" system owner: what is left of the
// planet's own defense force after the world was prepared for the planetary
// games. Internal ids stay "barbarian" / "barbarian-1".
export const PLANETARY_DEFENSE_DISPLAY_NAME = "Planetary Defense";
