import { isFortDefending } from "@border-empires/shared";
import { attackFloorForPlayer } from "../client-attack-commit/client-attack-floor.js";
import { captureRecoveryRemainingMsForTile } from "../client-tile-menu-status/client-tile-menu-status.js";
import type { Tile, TileOverviewLine } from "../client-types.js";

/**
 * The muster an attacker needs to take a defending fort. It is attacker-facing
 * information, so it is never shown on the viewer's own fort, and it gets its
 * own "Defense" heading so it never reads as part of the Upkeep section.
 */
export function fortCaptureMenuLines(
  state: { readonly me?: string | undefined; readonly domainIds?: readonly string[] },
  tile: Tile
): TileOverviewLine[] {
  if (!isFortDefending(tile.fort) || !tile.ownerId || tile.ownerId === state.me) return [];
  if (captureRecoveryRemainingMsForTile(tile) !== undefined) return [];
  // Same helper the client's own attack gate uses (findClosestMuster in
  // client-muster-attack-gate.ts), so the number shown here always matches
  // the muster the client will actually demand.
  const required = attackFloorForPlayer(state, tile);
  return [{ html: "Defense", kind: "section" }, { html: `Capturing requires ${required} mustered manpower.` }];
}
