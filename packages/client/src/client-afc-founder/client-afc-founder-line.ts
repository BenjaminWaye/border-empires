// The AFC tile panel's "Founded by House X" line: whose AFC this was, kept
// through captures (afcFoundedBy), so a House pressing a Writ of Correction
// can tell which AFCs count, and anyone can see an AFC changed hands.
import { afcFoundedBy, houseStyledName } from "@border-empires/shared";
import { escapeHtml } from "../client-duke-panel/client-duke-escape.js";
import type { TileOverviewLine } from "../client-tile-menu-types.js";
import type { Tile } from "../client-types.js";

export const afcFounderOverviewLine = (
  tile: Pick<Tile, "afc">,
  playerNameForOwner: ((ownerId?: string | null) => string | undefined) | undefined,
  me: string
): TileOverviewLine | undefined => {
  const founderId = afcFoundedBy(tile.afc);
  if (!tile.afc || !founderId) return undefined;
  const founder = founderId === me ? "your House" : houseStyledName(playerNameForOwner?.(founderId) ?? "Unknown");
  const captured = founderId !== tile.afc.ownerId;
  return { html: escapeHtml(`Founded by ${founder}${captured ? " · captured" : ""}`) };
};
