import { MANPOWER_REFILL_WINDOW_MS } from "../manpower-refill.js";
import type { PopulationTier } from "../types.js";
import { ANCILLARY_MATERIAL_RESOURCES, type NetworkResource, type NetworkSiteCounts } from "./resource-networks.js";

// --- Resin, conductive, catalyst: manpower per refill window -----------------

/** Manpower per refill window from your first developed site of a material type. */
export const FRONTIER_FIRST_SITE_MANPOWER_PER_WINDOW = 120;
/** Manpower per refill window from every further site of the same type. */
export const FRONTIER_EXTRA_SITE_MANPOWER_PER_WINDOW = 30;

/** Manpower per refill window that `sites` developed tiles of one material type give. */
export const materialManpowerPerWindow = (sites: number): number => {
  const n = Math.max(0, Math.floor(sites));
  return n === 0 ? 0 : FRONTIER_FIRST_SITE_MANPOWER_PER_WINDOW + (n - 1) * FRONTIER_EXTRA_SITE_MANPOWER_PER_WINDOW;
};

/** Value of one more site of a material type when you already hold `held`. */
export const materialMarginalManpowerPerWindow = (held: number): number =>
  held <= 0 ? FRONTIER_FIRST_SITE_MANPOWER_PER_WINDOW : FRONTIER_EXTRA_SITE_MANPOWER_PER_WINDOW;

export const frontierMaterialManpowerPerWindow = (counts: NetworkSiteCounts): number =>
  ANCILLARY_MATERIAL_RESOURCES.reduce((sum, resource) => sum + materialManpowerPerWindow(counts[resource]), 0);

export const frontierMaterialManpowerRegenPerMinute = (counts: NetworkSiteCounts): number =>
  frontierMaterialManpowerPerWindow(counts) / (MANPOWER_REFILL_WINDOW_MS / 60_000);

// --- Luxury biota: big towns' manpower -----------------------------------------

export const BIOTA_SLOTS_PER_SITE = 2;
const TIER_ORDER: readonly PopulationTier[] = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];
const TIER_RANK = (tier: PopulationTier): number => TIER_ORDER.indexOf(tier);

/** Biota slots a town needs to give its full manpower: one per tier above Town. */
export const biotaSlotsNeededForTier = (tier: PopulationTier): number => Math.max(0, TIER_RANK(tier) - TIER_RANK("TOWN"));

/** The tier whose manpower a town gives: Town level plus one tier per biota slot, up to its real tier. */
export const biotaManpowerTier = (tier: PopulationTier, slotsReceived: number): PopulationTier => {
  const needed = biotaSlotsNeededForTier(tier);
  if (needed === 0) return tier;
  return TIER_ORDER[TIER_RANK("TOWN") + Math.min(needed, Math.max(0, Math.floor(slotsReceived)))]!;
};

export type BiotaTown = { readonly key: string; readonly tier: PopulationTier; readonly heldSince: number };
export type BiotaTownSupply = { readonly received: number; readonly needed: number; readonly manpowerTier: PopulationTier };

/**
 * Hands biota slots to towns in the order they were acquired, oldest first
 * (ties by tile key), so a new conquest never takes biota from towns already
 * held. Only towns above Town tier appear in the result.
 */
export const allocateBiotaSlots = (towns: Iterable<BiotaTown>, slots: number): Map<string, BiotaTownSupply> => {
  const result = new Map<string, BiotaTownSupply>();
  let remaining = Math.max(0, Math.floor(slots));
  const ordered = [...towns].filter(town => biotaSlotsNeededForTier(town.tier) > 0)
    .sort((a, b) => a.heldSince - b.heldSince || a.key.localeCompare(b.key));
  for (const town of ordered) {
    const needed = biotaSlotsNeededForTier(town.tier);
    const received = Math.min(needed, remaining);
    remaining -= received;
    result.set(town.key, { received, needed, manpowerTier: biotaManpowerTier(town.tier, received) });
  }
  return result;
};

// --- Precursor salvage: finite loads ------------------------------------------

export const SALVAGE_LOADS_PER_SITE = 3;
export const SALVAGE_ARMS_BONUS_PER_SITE = 0.01;
export const SALVAGE_ARMS_BONUS_MAX = 0.1;
/** Share of the manpower cap an Imperial delivery for one salvage load brings (never above the cap). */
export const SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE = 0.25;
/** Court Strength the Court regains per load shipped (a Writ gives 3). */
export const SALVAGE_TRIBUTE_COURT_STRENGTH = 1;

/** Loads left on a salvage tile; absent means untouched. */
export const salvageLoadsRemaining = (tile: { readonly salvageLoadsShipped?: number }): number =>
  Math.max(0, SALVAGE_LOADS_PER_SITE - Math.max(0, Math.floor(tile.salvageLoadsShipped ?? 0)));

/** Attack and defense multiplier from developed salvage sites that still hold loads. */
export const salvageArmsMultiplier = (sites: number): number =>
  1 + Math.min(SALVAGE_ARMS_BONUS_MAX, Math.max(0, Math.floor(sites)) * SALVAGE_ARMS_BONUS_PER_SITE);

/** Manpower an Imperial delivery for one load adds, never above the cap. */
export const salvageTributeManpower = (manpower: number, cap: number): number =>
  Math.max(0, Math.min(cap - manpower, cap * SALVAGE_TRIBUTE_MANPOWER_CAP_SHARE));

/** Plain-language value of capturing one more site of `resource` (UI). */
export const frontierSiteCaptureValue = (resource: NetworkResource, held: number): string => {
  if (resource === "LUXURY_BIOTA") return `+${BIOTA_SLOTS_PER_SITE} biota slots`;
  if (resource === "PRECURSOR_SALVAGE") return held >= SALVAGE_ARMS_BONUS_MAX / SALVAGE_ARMS_BONUS_PER_SITE ? "+0% (arms bonus at its +10% limit)" : `+${Math.round(SALVAGE_ARMS_BONUS_PER_SITE * 100)}% attack and defense`;
  return `+${materialMarginalManpowerPerWindow(held)} manpower per refill`;
};
