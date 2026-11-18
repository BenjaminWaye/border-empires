import { isFortDefending } from "@border-empires/shared";
import { attackFloorForPlayer } from "../client-attack-commit/client-attack-floor.js";
import { captureRecoveryRemainingMsForTile } from "../client-tile-menu-status/client-tile-menu-status.js";
import type { Tile, TileOverviewLine } from "../client-types.js";

/**
 * Fort defense status under its own "Defense" heading, so it never reads as
 * part of the Upkeep section. The capture muster is attacker-facing, so it is
 * never shown on the viewer's own fort. Callers push these lines last: the
 * heading has no closing marker, so anything pushed after would sit under it.
 */
export function fortCaptureMenuLines(
  state: { readonly me?: string | undefined; readonly domainIds?: readonly string[] },
  tile: Tile
): TileOverviewLine[] {
  if (!isFortDefending(tile.fort) || !tile.ownerId) return [];
  const heading: TileOverviewLine = { html: "Defense", kind: "section" };
  if (captureRecoveryRemainingMsForTile(tile) !== undefined) {
    return [heading, { html: "Recently captured. Fort defense is offline until the capture shock timer ends." }];
  }
  if (tile.ownerId === state.me) return [];
  // Same helper the client's own attack gate uses (findClosestMuster in
  // client-muster-attack-gate.ts), so the number shown here always matches
  // the muster the client will actually demand.
  const required = attackFloorForPlayer(state, tile);
  return [heading, { html: `Capturing requires ${required} mustered manpower.` }];
}
