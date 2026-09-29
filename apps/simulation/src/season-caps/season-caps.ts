import { resolveMaxSeasonPlayers } from "../season-join-capacity.js";
import { resolveMaxSeasonGuests } from "../season-guests/season-guests.js";

// Single entry point for both season admission caps, so simulation-service.ts
// (already over its line cap) needs one import and one destructure instead
// of two of each.
export const resolveSeasonCaps = (options: {
  maxSeasonPlayers?: number;
  maxSeasonGuests?: number;
}): { maxSeasonPlayers: number; maxSeasonGuests: number } => ({
  maxSeasonPlayers: resolveMaxSeasonPlayers(options.maxSeasonPlayers),
  maxSeasonGuests: resolveMaxSeasonGuests(options.maxSeasonGuests)
});
