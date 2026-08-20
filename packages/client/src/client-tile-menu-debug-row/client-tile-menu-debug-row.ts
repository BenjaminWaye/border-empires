import { isDebugAccountEmail } from "../client-debug/client-debug.js";
import type { Tile, TileMenuView } from "../client-types.js";

/**
 * Always-available debug download row for the debug account: unlike the
 * existing stuck-loading rows in client-tile-menu-view.ts (which only grow
 * a debug-download button once a tile is already caught in a partial/
 * loading state), this lets the debug account click ANY tile -- fogged,
 * frontier, whatever -- and pull its full state plus recent tile messages
 * (see the data-tile-debug-download handler in client-tile-action-menu-ui.ts)
 * on demand, before there's any "stuck" symptom to detect. Gated on the
 * real logged-in email so no localStorage priming is needed ahead of time.
 *
 * Kept as its own module (rather than folded into menuOverviewForTile in
 * client-tile-menu-view.ts) because that file is already over the
 * repo's line-limit cap -- see check-file-line-limits.mjs, which fails any
 * further growth of an already-oversized file. Injected into the view the
 * same way client-waypoint-menu-actions.ts's injectWaypointActions mutates
 * it, right before render (see client-tile-action-menu-ui.ts).
 */
export const injectDebugDownloadRow = (view: TileMenuView, tile: Tile, authEmail: string | undefined): void => {
  if (!isDebugAccountEmail(authEmail)) return;
  const tileKey = `${tile.x},${tile.y}`;
  view.overviewLines.unshift({
    html:
      `<div class="tile-town-loading tile-debug-always" role="status">` +
      `<span class="tile-town-loading-label">Tile ${tileKey}${tile.fogged ? " (fogged)" : ""}</span>` +
      `<button type="button" class="tile-town-debug-btn" data-tile-debug-download="${tileKey}">Download debug log</button>` +
      `</div>`
  });
};
