import type { PopulationTier } from "../types.js";
import type { NetworkResource } from "./resource-networks.js";

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

/** Biota slots each active Vivarium covers for the town it supports. */
export const VIVARIUM_BIOTA_SLOTS = 1;

/** Slots a town still needs from biota sites once its Vivaria are counted. */
export const biotaSlotsNeededFromSites = (tier: PopulationTier, vivaria = 0): number =>
  Math.max(0, biotaSlotsNeededForTier(tier) - Math.max(0, Math.floor(vivaria)) * VIVARIUM_BIOTA_SLOTS);

/** `vivaria`: active Vivaria supporting the town; each covers one slot without drawing on biota sites. */
export type BiotaTown = { readonly key: string; readonly tier: PopulationTier; readonly heldSince: number; readonly vivaria?: number };
/** `received` counts every covered slot; `local` is the part the town's own Vivaria cover (omitted when 0). */
export type BiotaTownSupply = { readonly received: number; readonly needed: number; readonly manpowerTier: PopulationTier; readonly local?: number };

/**
 * Hands biota slots to towns in the order they were acquired, oldest first
 * (ties by tile key), so a new conquest never takes biota from towns already
 * held. A town's own Vivaria cover their slots first, so it draws only the
 * rest from biota sites. Only towns above Town tier appear in the result.
 */
export const allocateBiotaSlots = (towns: Iterable<BiotaTown>, slots: number): Map<string, BiotaTownSupply> => {
  const result = new Map<string, BiotaTownSupply>();
  let remaining = Math.max(0, Math.floor(slots));
  const ordered = [...towns].filter(town => biotaSlotsNeededForTier(town.tier) > 0)
    .sort((a, b) => a.heldSince - b.heldSince || a.key.localeCompare(b.key));
  for (const town of ordered) {
    const needed = biotaSlotsNeededForTier(town.tier);
    const local = needed - biotaSlotsNeededFromSites(town.tier, town.vivaria);
    const fromSites = Math.min(needed - local, remaining);
    remaining -= fromSites;
    const received = local + fromSites;
    result.set(town.key, { received, needed, manpowerTier: biotaManpowerTier(town.tier, received), ...(local > 0 ? { local } : {}) });
  }
  return result;
};

// --- Precursor salvage: finite loads ------------------------------------------

export const SALVAGE_LOADS_PER_SITE = 3;
export const SALVAGE_ARMS_BONUS_PER_SITE = 0.01;
export const SALVAGE_ARMS_BONUS_MAX = 0.1;
/**
 * Manpower an Imperial delivery for one salvage load brings, never above the
 * cap. A flat amount: scaling with the cap paid larger empires more per load.
 */
export const SALVAGE_TRIBUTE_MANPOWER = 1000;
/** Court Strength the Court regains per load shipped (a Writ gives 3). */
export const SALVAGE_TRIBUTE_COURT_STRENGTH = 1;

/** Loads left at a Reclamation Works; absent means untouched. */
export const salvageLoadsRemaining = (works: { readonly salvageLoadsShipped?: number | undefined }): number =>
  Math.max(0, SALVAGE_LOADS_PER_SITE - Math.max(0, Math.floor(works.salvageLoadsShipped ?? 0)));

/**
 * A Reclamation Works whose field has shipped its last load: the deposit is
 * gone, the Works stays as a depleted yard. It gives no arms bonus, holds no
 * loads and counts as no salvage site; the owner may dismantle it.
 */
export const isDepletedReclamationWorks = (tile: {
  readonly resource?: string | undefined; readonly economicStructure?: { readonly type?: string } | null | undefined;
}): boolean => tile.economicStructure?.type === "RECLAMATION_WORKS" && tile.resource !== "PRECURSOR_SALVAGE";

export const DEPLETED_RECLAMATION_WORKS_NAME = "Depleted Reclamation Works";

/** Attack and defense multiplier from developed salvage sites that still hold loads. */
export const salvageArmsMultiplier = (sites: number): number =>
  1 + Math.min(SALVAGE_ARMS_BONUS_MAX, Math.max(0, Math.floor(sites)) * SALVAGE_ARMS_BONUS_PER_SITE);

/** Manpower an Imperial delivery for one load adds, never above the cap. */
export const salvageTributeManpower = (manpower: number, cap: number): number =>
  Math.max(0, Math.min(cap - manpower, SALVAGE_TRIBUTE_MANPOWER));

/** Plain-language value of capturing one more site of `resource` (UI). */
export const frontierSiteCaptureValue = (resource: NetworkResource, held: number): string => {
  if (resource === "LUXURY_BIOTA") return `+${BIOTA_SLOTS_PER_SITE} biota slots`;
  return held >= SALVAGE_ARMS_BONUS_MAX / SALVAGE_ARMS_BONUS_PER_SITE ? "+0% (arms bonus at its +10% limit)" : `+${Math.round(SALVAGE_ARMS_BONUS_PER_SITE * 100)}% attack and defense`;
};
