import { forcedAncillarificationQuote } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";

/** DOM actions are shared by the canvas and true-3D maps. */
export function forcedAncillarificationActions(state: Pick<ClientState, "me" | "tiles" | "dormantStructures">, tile: Tile, now = Date.now()): TileActionDef[] {
  if (tile.fogged || !state.me || tile.ownerId !== state.me || tile.economicStructure?.ownerId !== state.me || tile.economicStructure.type !== "ANCILLARY_FACTORY") return [];
  const townTile = tile.town ? tile : assignedTownForSupportTile(state.tiles, tile, state.me);
  const town = townTile?.town;
  const quote = forcedAncillarificationQuote(town?.population ?? 0);
  const cooldownMs = Math.max(0, (town?.forcedAncillarificationCooldownUntil ?? 0) - now);
  const reason = tile.ownershipState !== "SETTLED" || tile.economicStructure.status !== "active" ? "Factory must be active and garrisoned"
    : (tile.economicStructure.disabledUntil ?? 0) > now || state.dormantStructures.some(entry => entry.key === `${tile.x},${tile.y}:economicStructure`) ? "Factory must be active with a free FOOD slot"
    : !town || town.populationTier === "SETTLEMENT" ? "Factory needs an owned, settled town"
    : cooldownMs > 0 ? `Town recovering · ${Math.ceil(cooldownMs / 60000)}m`
    : !quote.available ? "Must leave at least 10,000 residents" : "";
  return [{
    id: "forced_ancillarification", label: "Forced Ancillarification",
    detail: `Permanently convert ${quote.populationCost.toLocaleString("en-US")} residents from ${town?.name ?? "the town"} into +${quote.manpower} immediate manpower. Works above your cap. 4h cooldown per town; population loss can reduce its tier.`,
    cost: `${quote.populationCost.toLocaleString("en-US")} population → +${quote.manpower} manpower`,
    disabled: Boolean(reason), ...(reason ? { disabledReason: reason } : {})
  }];
}
