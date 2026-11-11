import {
  FORT_TIER_LADDER,
  fortTierForBuild,
  nextSiegeTierForUpgrade,
  siegeTierForFreshBuild,
  FORT_VARIANT_LABELS,
  SIEGE_TIER_LADDER,
  SIEGE_VARIANT_LABELS,
  bestFortTierForTech,
  bestSiegeTierForTech,
  type FortTierInfo,
  type SiegeTierInfo
} from "../structure-costs/structure-costs.js";
import type { FortVariant, SiegeBatteryVariant } from "../types.js";

// The Fortify / Siege tier picker (docs/game-mechanics.md §5): a player may
// pick any tier their tech allows instead of the default "best tier" build.
// A tier is unlocked when it is no higher than the best tier the tech allows,
// so the picker and the default build can never disagree about unlocks.

/** A tier a BUILD_STRUCTURE may name explicitly: a non-Palisade fort tier, or a siege tier. */
export type ChosenStructureTier = Exclude<FortVariant, "PALISADE"> | SiegeBatteryVariant;

export const FORT_TIER_ORDER: readonly FortVariant[] = ["PALISADE", "FORT", "TITANIUM_BASTION", "THUNDER_BASTION"];
export const SIEGE_TIER_ORDER: readonly SiegeBatteryVariant[] = ["SIEGE_BATTERY", "SIEGE_TOWER", "DREAD_TOWER"];

const FORT_TIER_TECH_IDS: Partial<Record<FortVariant, string>> = { TITANIUM_BASTION: "fortified-walls", THUNDER_BASTION: "steelworking" };
const SIEGE_TIER_TECH_IDS: Partial<Record<SiegeBatteryVariant, string>> = { SIEGE_TOWER: "siegecraft", DREAD_TOWER: "standing-army" };

export const isChosenFortTier = (value: unknown): value is Exclude<FortVariant, "PALISADE"> =>
  value === "FORT" || value === "TITANIUM_BASTION" || value === "THUNDER_BASTION";
export const isChosenSiegeTier = (value: unknown): value is SiegeBatteryVariant =>
  typeof value === "string" && (SIEGE_TIER_ORDER as readonly string[]).includes(value);
export const isChosenStructureTier = (value: unknown): value is ChosenStructureTier => isChosenFortTier(value) || isChosenSiegeTier(value);

/** The tech id that unlocks `variant`, or undefined for a base tier (Palisade, Fort, Siege Battery). */
export const fortTierTechId = (variant: FortVariant): string | undefined => FORT_TIER_TECH_IDS[variant];
export const siegeTierTechId = (variant: SiegeBatteryVariant): string | undefined => SIEGE_TIER_TECH_IDS[variant];

export type TierChoice<T> = { ok: true; tier: T } | { ok: false; reason: string };

/**
 * An explicitly chosen fort tier on a tile whose current fortification is
 * `current`. Over bare ground or a Palisade any unlocked tier goes; over a
 * real fort the choice must be higher than the standing tier (skipping tiers
 * is fine -- an upgrade is charged the chosen tier's full price either way).
 */
export const fortTierForChoice = (
  requested: Exclude<FortVariant, "PALISADE">,
  current: FortVariant | undefined,
  has: (id: string) => boolean
): TierChoice<FortTierInfo> => {
  const rank = FORT_TIER_ORDER.indexOf(requested);
  if (rank > FORT_TIER_ORDER.indexOf(bestFortTierForTech(has).variant)) return { ok: false, reason: `research the ${FORT_VARIANT_LABELS[requested]} first` };
  if (current && current !== "PALISADE" && rank <= FORT_TIER_ORDER.indexOf(current)) {
    return { ok: false, reason: current === requested ? `tile already has a ${FORT_VARIANT_LABELS[current]}` : `tile already has a stronger ${FORT_VARIANT_LABELS[current]}` };
  }
  return { ok: true, tier: FORT_TIER_LADDER[requested] };
};

/** An explicitly chosen siege tier; same rules as fortTierForChoice (no step-down for slots -- the slot gate reports a shortfall). */
export const siegeTierForChoice = (
  requested: SiegeBatteryVariant,
  current: SiegeBatteryVariant | undefined,
  has: (id: string) => boolean
): TierChoice<SiegeTierInfo> => {
  const rank = SIEGE_TIER_ORDER.indexOf(requested);
  if (rank > SIEGE_TIER_ORDER.indexOf(bestSiegeTierForTech(has).variant)) return { ok: false, reason: `research the ${SIEGE_VARIANT_LABELS[requested]} first` };
  if (current && rank <= SIEGE_TIER_ORDER.indexOf(current)) {
    return { ok: false, reason: current === requested ? `tile already has a ${SIEGE_VARIANT_LABELS[current]}` : `tile already has a stronger ${SIEGE_VARIANT_LABELS[current]}` };
  }
  return { ok: true, tier: SIEGE_TIER_LADDER[requested] };
};

// The tier a fort- or siege-family BUILD_STRUCTURE resolves to, shared by the
// sim's build handler, its dev-queue reservation estimate (so a queued build
// reserves exactly what it will be charged) and the client's optimistic
// structure write (so the map shows the tier the server will build).
// `requested` is the Fortify / Siege picker's explicit tier; without one the
// default "best tier" rules apply unchanged (the AI and older clients never
// send one).

const TIER_MISMATCH = "tier does not match the structure";

export const resolveFortBuildTier = (
  structureType: string,
  requested: ChosenStructureTier | undefined,
  current: FortVariant | undefined,
  has: (id: string) => boolean
): TierChoice<FortTierInfo> => {
  if (requested !== undefined) {
    if (structureType === "PALISADE" || !isChosenFortTier(requested)) return { ok: false, reason: TIER_MISMATCH };
    return fortTierForChoice(requested, current, has);
  }
  const tier = fortTierForBuild(structureType, current, has);
  if (tier) return { ok: true, tier };
  return {
    ok: false,
    reason: structureType === "PALISADE"
      ? "tile already has a fortification"
      : current === "THUNDER_BASTION" ? "fort already at maximum tier" : "research the next tier first"
  };
};

export const resolveSiegeBuildTier = (
  requested: ChosenStructureTier | undefined,
  current: SiegeBatteryVariant | undefined,
  has: (id: string) => boolean,
  slotsFit: (variant: SiegeBatteryVariant) => boolean
): TierChoice<SiegeTierInfo> => {
  if (requested !== undefined) {
    if (!isChosenSiegeTier(requested)) return { ok: false, reason: TIER_MISMATCH };
    return siegeTierForChoice(requested, current, has);
  }
  if (!current) return { ok: true, tier: siegeTierForFreshBuild(has, slotsFit) };
  const next = nextSiegeTierForUpgrade(current, has);
  if (next) return { ok: true, tier: next };
  return { ok: false, reason: current === "DREAD_TOWER" ? "siege battery already at maximum tier" : "research the next tier first" };
};
