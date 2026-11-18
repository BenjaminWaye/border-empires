// The AFC tile panel's "Founded by House X" line: whose AFC this was, kept
// through captures (afcFoundedBy), so a House pressing a Writ of Correction
// can tell which AFCs count, and anyone can see an AFC changed hands.
import { afcFoundedBy, houseStyledName } from "@border-empires/shared";
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import type { TileOverviewLine } from "../client-tile-menu-types.js";
import type { Tile } from "../client-types.js";

/**
 * One line naming the founder, or none: not for the viewer's own AFC still in
 * its hands (nothing to tell), nor when the founder or their name is unknown.
 */
export const afcFounderOverviewLines = (
  tile: Pick<Tile, "afc">,
  playerNameForOwner: ((ownerId?: string | null) => string | undefined) | undefined,
  me: string | undefined
): TileOverviewLine[] => {
  const founderId = afcFoundedBy(tile.afc);
  if (!tile.afc || !founderId || (founderId === me && tile.afc.ownerId === me)) return [];
  const name = founderId === me ? "your House" : playerNameForOwner?.(founderId);
  if (!name) return [];
  const founder = founderId === me ? name : houseStyledName(name);
  const captured = founderId !== tile.afc.ownerId;
  return [{ html: escapeHtml(`Founded by ${founder}${captured ? " · captured" : ""}`) }];
};
