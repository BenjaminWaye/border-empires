// Hard cap on human players admitted into a season, and the gate applied in
// PreparePlayer. 0/unset disables the cap. Only gates a genuinely new spawn —
// a returning player who already has territory this season is never
// rejected by it (see resolveMaxSeasonPlayers/seasonIsAtPlayerCap callers).
// Default 120: ~100 invited beta testers plus headroom for a second account
// or a stale binding, so a real invitee never hits SEASON_FULL at launch.
export const resolveMaxSeasonPlayers = (configured: number | undefined): number =>
  Math.max(0, Number(configured ?? process.env.SIMULATION_MAX_SEASON_PLAYERS ?? 120));

export const seasonIsAtPlayerCap = (
  maxSeasonPlayers: number,
  runtime: { hasPlayer: (playerId: string) => boolean; humanPlayerCount: () => number },
  playerId: string
): boolean => maxSeasonPlayers > 0 && !runtime.hasPlayer(playerId) && runtime.humanPlayerCount() >= maxSeasonPlayers;
