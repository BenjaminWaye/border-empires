import { strategicResourceKeyForTile } from "../client-map-display.js";
import type { Tile } from "../client-types.js";

export const tileProductionRequirementLabel = (tile: Tile, prettyToken: (value: string) => string): string | undefined => {
  if (tile.town) return "coin";
  const strategicKey = strategicResourceKeyForTile(tile);
  if (strategicKey) return prettyToken(strategicKey).toLowerCase();
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  if (gpm > 0.01) return "coin";
  return undefined;
};

// Owner-economy fields only ride a full snapshot or tile-detail response.
// During the short delta-only window, the overview must load rather than
// silently substituting 0 for private support and FOOD values.
export const ownTownEconomyFieldsPartial = (tile: Tile, viewerId: string): boolean =>
  Boolean(
    tile.ownerId === viewerId &&
      tile.ownershipState === "SETTLED" &&
      tile.town &&
      tile.town.populationTier !== "SETTLEMENT" &&
      typeof tile.town.isFed !== "boolean"
  );

// The sim's stored town record keeps isFed and populationGrowthPerMinute as
// independently optional fields, so a summary-level tile delta can carry
// isFed (enough to render the stat grid) without the growth rate. Treating
// the missing rate as 0 painted "0.00/m — growth paused" until the
// tile-detail response landed; the grid shows a loading line instead.
export const ownTownGrowthRatePending = (town: NonNullable<Tile["town"]>): boolean =>
  typeof town.populationGrowthPerMinute !== "number" || !Number.isFinite(town.populationGrowthPerMinute);

// Recovery trigger for the tile-detail request: any owned, settled town
// whose owner-economy or growth-rate fields haven't arrived yet.
export const ownTownDetailRecoveryNeeded = (tile: Tile, viewerId: string): boolean =>
  ownTownEconomyFieldsPartial(tile, viewerId) ||
  Boolean(tile.ownerId === viewerId && tile.ownershipState === "SETTLED" && tile.town && typeof tile.town.isFed === "boolean" && ownTownGrowthRatePending(tile.town));

export const tileTownPartialLoadingRowHtml = (tileKey: string, label: string, loadingSinceMs: number): string =>
  `<div class="tile-town-loading tile-town-loading-row" role="status" aria-live="polite">` +
    `<span class="tile-town-loading-spinner" aria-hidden="true"></span>` +
    `<span class="tile-town-loading-label"><strong>${label}:</strong> loading <span class="tile-town-loading-timer" data-loading-timer-since="${loadingSinceMs}">0s</span></span>` +
    `<button type="button" class="tile-town-debug-btn" data-tile-debug-download="${tileKey}">Report</button>` +
  `</div>`;
