// The Fortify / Siege tier picker (docs/game-mechanics.md §5): every tier a
// tile can take, each with its cost and -- when it can't be built -- the one
// reason why, instead of the old single "best tier" row that silently hid the
// rest. The menu row (client-tile-action-logic.ts / -siege-camp.ts) carries
// these as `tierOptions`; the sheet (client-structure-tier-sheet/) lists them.
// Tier unlocks come from the shared rule (structure-tier-choice.ts), so the
// picker can never offer a tier the server would refuse on tech grounds.
import {
  FORT_TIER_LADDER,
  FORT_TIER_ORDER,
  FORT_VARIANT_LABELS,
  SETTLE_COST,
  SIEGE_TIER_LADDER,
  SIEGE_TIER_ORDER,
  SIEGE_VARIANT_LABELS,
  fortTierForChoice,
  fortTierTechId,
  siegeTierForChoice,
  siegeTierTechId,
  type FortVariant,
  type SiegeBatteryVariant
} from "@border-empires/shared";
import { fortBuildMsForState, siegeBuildMsForState } from "../client-build-speed/client-build-speed.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { settleDurationMsForState } from "../client-queue-logic/client-queue-logic.js";
import type { ClientState } from "../client-state/client-state.js";
import { structureManpowerCostForState } from "../client-structure-manpower-cost/client-structure-manpower-cost.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import { afcModuleInstalled } from "../client-tile-action-support/client-tech-locked-tile-action.js";
import type { StructureTierOption, Tile } from "../client-types.js";
import { FORT_MODULE_TECH_ID, freeFortAvailable, hasFortTech } from "./client-tile-action-fort-siege-variants.js";
import { missingResourceSlotReason } from "./client-resource-slot-gate.js";

const SIEGE_MODULE_TECH_ID = "leatherworking";

type OptionState = ClientState;

const techName = (state: OptionState, techId: string): string => state.techCatalog.find((tech) => tech.id === techId)?.name ?? techId;

/** Why a tier can't be built right now; an undefined reason means it can. */
type Blocker = { disabledReason?: string | undefined; techLinkId?: string };

const requiresTech = (state: OptionState, techId: string): Blocker => ({
  disabledReason: `Requires ${techName(state, techId)}`,
  techLinkId: techId
});

/** Manpower/coin check, adding the garrison step when the build settles a FRONTIER tile first. */
const affordReason = (state: OptionState, manpower: number, gold: number, settlesFirst: boolean): string | undefined => {
  const totalGold = gold + (settlesFirst ? SETTLE_COST : 0);
  const totalManpower = manpower + (settlesFirst ? state.settleManpowerCost : 0);
  if (totalGold > 0 && state.gold < totalGold) return `Need ${totalGold} coin`;
  if (state.manpower < totalManpower) return `Need ${totalManpower} manpower`;
  return undefined;
};

const option = (
  base: Omit<StructureTierOption, "disabled" | "disabledReason" | "techLinkId">,
  blocked: Blocker
): StructureTierOption => blocked.disabledReason
  ? { ...base, disabled: true, disabledReason: blocked.disabledReason, ...(blocked.techLinkId ? { techLinkId: blocked.techLinkId } : {}) }
  : { ...base, disabled: false };

const costLine = (parts: Array<string | undefined>, upkeep: string): string => parts.filter(Boolean).join(" • ") + upkeep;

/** Palisade (only on unfortified ground) plus every fort tier above the standing one. */
export const fortTierOptionsForTile = (state: OptionState, tile: Tile): StructureTierOption[] => {
  const current = tile.fort?.variant;
  const settlesFirst = tile.ownershipState === "FRONTIER";
  const garrison = settlesFirst ? `+ garrison (${buildTimeLabel(settleDurationMsForState(state, tile))})` : undefined;
  const options: StructureTierOption[] = [];
  if (!current) {
    const palisade = FORT_TIER_LADDER.PALISADE;
    const manpower = structureManpowerCostForState(state, "PALISADE", palisade.manpower);
    options.push(option(
      {
        structureType: "PALISADE",
        variant: "PALISADE",
        label: FORT_VARIANT_LABELS.PALISADE,
        stat: `Defense ×${palisade.defenseMult.toFixed(2)}`,
        cost: costLine([`${manpower} manpower`, buildTimeLabel(fortBuildMsForState(state, "PALISADE")), garrison], upkeepSuffixFor("PALISADE"))
      },
      { disabledReason: missingResourceSlotReason(state, "PALISADE") ?? affordReason(state, manpower, palisade.gold, settlesFirst) }
    ));
  }
  const has = (id: string): boolean => state.techIds.includes(id);
  for (const variant of FORT_TIER_ORDER) {
    if (variant === "PALISADE") continue;
    if (current && current !== "PALISADE" && FORT_TIER_ORDER.indexOf(variant) <= FORT_TIER_ORDER.indexOf(current)) continue;
    const tier = FORT_TIER_LADDER[variant];
    const free = freeFortAvailable(state, variant, current);
    const manpower = free ? 0 : structureManpowerCostForState(state, variant, tier.manpower);
    const tierTech = fortTierTechId(variant);
    const blocked: Blocker = !hasFortTech(state)
      ? requiresTech(state, FORT_MODULE_TECH_ID)
      : tierTech && !fortTierForChoice(variant, current, has).ok
        ? requiresTech(state, tierTech)
        : !afcModuleInstalled(state, FORT_MODULE_TECH_ID)
          ? { disabledReason: `Install ${techName(state, FORT_MODULE_TECH_ID)} on an active AFC` }
          : { disabledReason: missingResourceSlotReason(state, variant, current, tile) ?? affordReason(state, manpower, tier.gold, settlesFirst) };
    options.push(option(
      {
        structureType: "FORT",
        tier: variant as Exclude<FortVariant, "PALISADE">,
        variant,
        label: FORT_VARIANT_LABELS[variant],
        stat: `Defense ×${tier.defenseMult.toFixed(2)}`,
        cost: costLine([free ? "free (Fortification Patterns)" : `${manpower} manpower`, buildTimeLabel(fortBuildMsForState(state, variant)), garrison], upkeepSuffixFor(variant))
      },
      blocked
    ));
  }
  return options;
};

/** Every siege tier above the standing one. Siege never garrisons first; `outOfReach` is the row's reach gate. */
export const siegeTierOptionsForTile = (state: OptionState, tile: Tile, outOfReach: boolean): StructureTierOption[] => {
  const current = tile.siegeBattery?.variant;
  const has = (id: string): boolean => state.techIds.includes(id);
  const options: StructureTierOption[] = [];
  for (const variant of SIEGE_TIER_ORDER) {
    if (current && SIEGE_TIER_ORDER.indexOf(variant) <= SIEGE_TIER_ORDER.indexOf(current)) continue;
    const tier = SIEGE_TIER_LADDER[variant];
    const manpower = structureManpowerCostForState(state, variant, tier.manpower);
    const tierTech = siegeTierTechId(variant);
    const blocked: Blocker = !has(SIEGE_MODULE_TECH_ID)
      ? requiresTech(state, SIEGE_MODULE_TECH_ID)
      : tierTech && !siegeTierForChoice(variant, current, has).ok
        ? requiresTech(state, tierTech)
        : outOfReach
          ? { disabledReason: "Outside your reach" }
          : { disabledReason: missingResourceSlotReason(state, variant, current) ?? affordReason(state, manpower, tier.gold, false) };
    options.push(option(
      {
        structureType: "SIEGE_BATTERY",
        tier: variant as SiegeBatteryVariant,
        variant,
        label: SIEGE_VARIANT_LABELS[variant],
        stat: `Attack ×${tier.attackMult.toFixed(2)}`,
        cost: costLine([`${manpower} manpower`, buildTimeLabel(siegeBuildMsForState(state, variant))], upkeepSuffixFor(variant))
      },
      blocked
    ));
  }
  return options;
};

/**
 * The menu row's own availability: enabled while any tier can be built. When
 * none can, it reports the cheapest tier's reason -- but skips a bare
 * "Requires ..." when another tier has a different blocker, because the menu
 * hides rows whose only reason is a missing tech (client-tech-locked-tile-action.ts)
 * and Palisade/Fort still belong on screen with their real blocker.
 */
export const tierRowAvailability = (options: readonly StructureTierOption[]): { disabled: boolean; disabledReason?: string } => {
  if (options.some((entry) => !entry.disabled)) return { disabled: false };
  const reason = options.find((entry) => entry.disabledReason && !entry.disabledReason.startsWith("Requires "))?.disabledReason ?? options[0]?.disabledReason;
  return reason ? { disabled: true, disabledReason: reason } : { disabled: true };
};
