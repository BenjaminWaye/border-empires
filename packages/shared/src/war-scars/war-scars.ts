// Battle scars: signs of war left on the ground (craters, scorch, wreckage)
// once a garrisoned tile has been taken in battle. They last
// WAR_SCAR_DURATION_MS after the latest battle there and deepen with every
// further battle on the tile, won or lost, up to WAR_SCAR_MAX_LEVEL.
// Presentation only: scars change no rules. The ground keeps them whoever
// owns it, so they stay through later captures.

export const WAR_SCAR_DURATION_MS = 24 * 60 * 60 * 1000;
export const WAR_SCAR_MAX_LEVEL = 5;

type WarScarTile = { warScarLevel?: number | undefined; warScarUntil?: number | undefined };

/** The scars' current depth (1..WAR_SCAR_MAX_LEVEL), or 0 when the tile has none or they have faded. */
export const liveWarScarLevel = (tile: WarScarTile | undefined, nowMs: number): number =>
  typeof tile?.warScarLevel === "number" && typeof tile.warScarUntil === "number" && tile.warScarUntil > nowMs
    ? Math.max(0, Math.min(WAR_SCAR_MAX_LEVEL, Math.floor(tile.warScarLevel)))
    : 0;

export type WarScarBattle = {
  /** A garrisoned (SETTLED) tile changed hands in this battle -- what first scars the ground. */
  capturedGarrison: boolean;
  /** Real combat was rolled on the tile (not an uncontested claim). */
  battle: boolean;
};

/**
 * The scar fields a tile should carry after a battle: a captured garrison
 * scars the ground (or deepens existing scars), and any other battle deepens
 * scars already there. Every deepening restarts the 24h fade. Returns the
 * tile's live scars unchanged when this battle adds none, and {} when it has none.
 */
export const warScarFieldsAfterBattle = (
  tile: WarScarTile | undefined,
  battle: WarScarBattle,
  nowMs: number
): { warScarLevel?: number; warScarUntil?: number } => {
  const live = liveWarScarLevel(tile, nowMs);
  const deepens = battle.capturedGarrison || (battle.battle && live > 0);
  if (deepens) return { warScarLevel: Math.min(WAR_SCAR_MAX_LEVEL, live + 1), warScarUntil: nowMs + WAR_SCAR_DURATION_MS };
  return live > 0 ? { warScarLevel: live, warScarUntil: tile!.warScarUntil! } : {};
};
