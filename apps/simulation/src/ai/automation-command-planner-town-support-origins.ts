import { computeTownSupport } from "../town-support.js";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

// Factored out of automation-command-planner.ts (which sits at the repo's
// 500-line cap) to keep that file under the limit — same idiom as
// broad-fallback-sample.ts.
//
// Filters a dock/town candidate scan source down to this player's SETTLED
// towns (below SETTLEMENT tier) that still have open support slots. Prefers
// the tile's own stored supportMax/supportCurrent (kept current by the
// runtime's incremental town-support tracking) and only falls back to
// computeTownSupport's live neighbor scan when those aren't populated
// (e.g. a caller/test constructing tiles by hand).
export const townSupportNeededOrigins = <T extends AutomationPlannerTile>(
  scanSource: readonly T[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, T>
): readonly T[] =>
  scanSource.filter((tile) => {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !tile.town) return false;
    if (tile.town.populationTier === "SETTLEMENT") return false;
    const storedMax = tile.town.supportMax;
    const storedCurrent = tile.town.supportCurrent;
    if (typeof storedMax === "number" && typeof storedCurrent === "number") {
      return storedMax > storedCurrent;
    }
    const { supportMax, supportCurrent } = computeTownSupport(playerId, tile.x, tile.y, tilesByKey);
    return supportMax > supportCurrent;
  });
