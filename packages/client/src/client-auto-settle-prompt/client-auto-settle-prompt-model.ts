// Pure model for the join-time "settle these for you?" prompt: which FRONTIER
// tiles the server is holding (it never spends manpower on a category the
// player hasn't opted into -- see @border-empires/shared's auto-settle-prefs.ts),
// grouped by category, with the real cost and yield numbers from shared constants.
import {
  AUTO_SETTLE_CATEGORIES,
  SETTLE_COST,
  SETTLE_MANPOWER_COST,
  autoSettleCategoryForTile,
  townFoodSlotDemandForTier,
  type AutoSettleCategory
} from "@border-empires/shared";
import { isClientAutoSettleAllowedForTile } from "./client-auto-settle-prefs.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

export type AutoSettlePromptTile = { x: number; y: number; tileKey: string; tile: Tile; distance: number };

export type AutoSettlePromptSection = {
  category: AutoSettleCategory;
  label: string;
  /** Nearest to the capital first -- the stepper settles a prefix of this list. */
  tiles: AutoSettlePromptTile[];
};

export type AutoSettlePromptModel = { sections: AutoSettlePromptSection[] };

const CATEGORY_LABELS: Record<AutoSettleCategory, string> = { towns: "Towns & docks", food: "Food", resources: "Other resources" };

/**
 * Held-back candidates only: FRONTIER tiles of mine, in a category the player has NOT switched on for
 * auto-settle (those are settled for them already), that they haven't dismissed or cancelled.
 * `dismissedTileKeys` is the prompt's own per-session memory, so it comes back only for new tiles.
 */
export const buildAutoSettlePromptModel = (
  state: Pick<ClientState, "autoSettlementQueue" | "tiles" | "me" | "homeTile" | "developmentQueue" | "autoSettle" | "skippedAutoSettlementTileKeys">,
  dismissedTileKeys: ReadonlySet<string> = new Set()
): AutoSettlePromptModel => {
  // Prefs not loaded yet: we can't tell held-back from allowed, so never prompt.
  if (state.autoSettle.status !== "loaded") return { sections: [] };
  const home = state.homeTile;
  const alreadyQueued = new Set(state.developmentQueue.filter((entry) => entry.kind === "SETTLE").map((entry) => entry.tileKey));
  const byCategory = new Map<AutoSettleCategory, AutoSettlePromptTile[]>();
  for (const { x, y } of state.autoSettlementQueue) {
    const tileKey = `${x},${y}`;
    const tile = state.tiles.get(tileKey);
    if (!tile || tile.ownerId !== state.me || tile.ownershipState !== "FRONTIER" || alreadyQueued.has(tileKey)) continue;
    if (dismissedTileKeys.has(tileKey) || state.skippedAutoSettlementTileKeys.has(tileKey)) continue;
    if (isClientAutoSettleAllowedForTile(state, tile)) continue;
    const category = autoSettleCategoryForTile(tile);
    const distance = home ? Math.max(Math.abs(x - home.x), Math.abs(y - home.y)) : 0;
    const list = byCategory.get(category) ?? [];
    list.push({ x, y, tileKey, tile, distance });
    byCategory.set(category, list);
  }
  const sections: AutoSettlePromptSection[] = [];
  for (const category of AUTO_SETTLE_CATEGORIES) {
    const tiles = byCategory.get(category);
    if (!tiles || tiles.length === 0) continue;
    tiles.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
    sections.push({ category, label: CATEGORY_LABELS[category], tiles });
  }
  return { sections };
};

export const settleManpowerCost = (tileCount: number): number => tileCount * SETTLE_MANPOWER_COST;
export const settleGoldCost = (tileCount: number): number => tileCount * SETTLE_COST;

/** Food slots one settled tile adds (grain 1, fish 2) -- mirrors structure-slots.ts's RESOURCE_SLOT_SPEC. */
const foodSlotsForTile = (tile: Tile): number => (tile.resource === "FISH" ? 2 : tile.resource === "FARM" ? 1 : 0);

const RESOURCE_LABELS: Record<string, string> = { TITANIUM: "titanium", UMBRITE: "umbrite", CRYSTAL: "crystal", GEMS: "gems" };

/** One-line yield summary for the first `count` tiles of a section, from the same constants the economy uses. */
export const yieldSummary = (section: AutoSettlePromptSection, count: number): string => {
  const picked = section.tiles.slice(0, count);
  if (section.category === "food") {
    const slots = picked.reduce((sum, entry) => sum + foodSlotsForTile(entry.tile), 0);
    return `+${slots} food slot${slots === 1 ? "" : "s"}`;
  }
  if (section.category === "resources") {
    const counts = new Map<string, number>();
    for (const entry of picked) counts.set(entry.tile.resource ?? "", (counts.get(entry.tile.resource ?? "") ?? 0) + 1);
    return [...counts].map(([resource, n]) => `+${n} ${RESOURCE_LABELS[resource] ?? resource.toLowerCase()} slot${n === 1 ? "" : "s"}`).join(", ");
  }
  const towns = picked.filter((entry) => entry.tile.town);
  const docks = picked.length - towns.length;
  const parts: string[] = [];
  if (towns.length > 0) parts.push("+ Coin", "+ Manpower");
  if (docks > 0) parts.push("+ Coin (docks)");
  return parts.join(" · ");
};

/** Food slots the first `count` towns of a section would require once settled (0 for SETTLEMENT tier). */
export const townFoodSlotDemand = (section: AutoSettlePromptSection, count: number): number =>
  section.tiles.slice(0, count).reduce((sum, entry) => sum + (entry.tile.town ? townFoodSlotDemandForTier(entry.tile.town.populationTier) : 0), 0);

/** Warning text when settling these towns would leave them short on food slots, else undefined. */
export const townFoodWarning = (
  state: Pick<ClientState, "resourceSlots">,
  townSection: AutoSettlePromptSection | undefined,
  townCount: number,
  foodSlotsAdded: number
): string | undefined => {
  if (!townSection || townCount <= 0) return undefined;
  const demand = townFoodSlotDemand(townSection, townCount);
  if (demand <= 0) return undefined;
  const supplyAfter = state.resourceSlots.supply.FOOD + foodSlotsAdded;
  const demandAfter = state.resourceSlots.demand.FOOD + demand;
  return supplyAfter >= demandAfter ? undefined : `Needs ${demand} food slots (${demandAfter - supplyAfter} short) – idle until you settle more food.`;
};
