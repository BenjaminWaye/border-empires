import { combatSideIsBesieged, isTownBesieged, TOWN_BESIEGED_LABEL } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileCombatBreakdown } from "../client-types.js";

// Siege tag for the odds displays (owner rule 2026-11-27, shared town-siege.ts).
// The server's attack preview is authoritative: its defender breakdown carries
// the "Besieged" row exactly when the sim would apply the siege term. Without a
// preview the client applies the same shared rule to the tiles it knows.

/**
 * Same shared rule as the sim, over the client's known tiles (paint and pre-preview estimates). The client
 * can't see the town owner's alliances, so only the viewer's own land counts as rival here.
 */
export const townBesiegedFromKnownTiles = (tile: Tile | undefined, state: Pick<ClientState, "tiles" | "me"> | undefined): boolean =>
  Boolean(tile?.townType && state?.me) && isTownBesieged(tile!, (x, y) => state!.tiles.get(`${x},${y}`), (id) => id === state!.me);

/** Besieged per the server preview's breakdown when there is one, else per the known tiles. */
export const targetShowsBesieged = (
  tile: Tile | undefined,
  state: Pick<ClientState, "tiles" | "me"> | undefined,
  breakdown: Pick<TileCombatBreakdown, "defender"> | undefined
): boolean => (breakdown ? combatSideIsBesieged(breakdown.defender) : townBesiegedFromKnownTiles(tile, state));

/** " · Besieged" suffix for a one-line odds summary, or "" when not besieged. */
export const besiegedOddsSuffix = (besieged: boolean): string => (besieged ? ` · ${TOWN_BESIEGED_LABEL}` : "");
