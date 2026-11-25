import { ABILITY_DEFS } from "../server-game-constants/ability-defs.js";
import type { AbilityDefinition } from "../server-shared-types.js";

export type AbilityId = AbilityDefinition["id"];

// Single source of truth for "which Manifest tech unlocks this ability".
// Server handlers, shared constants and client menus all read ABILITY_DEFS
// through these helpers so they cannot disagree (Manifest plan §7 item 2).
export const requiredTechIdsForAbility = (id: AbilityId): readonly string[] => ABILITY_DEFS[id].requiredTechIds;

/**
 * True when every tech the ability needs is researched or, for an AFC module,
 * installed on an active AFC the player owns (installedModules). A captured
 * module works fully for its captor, casting included. Callers pass only
 * AFC_MODULE ids in installedModules, so a crew or office tech (Augury
 * Office) still needs research.
 */
export const playerHasAbilityTech = (
  techIds: ReadonlySet<string> | readonly string[],
  id: AbilityId,
  installedModules?: ReadonlySet<string>
): boolean => {
  const owned = techIds instanceof Set ? techIds : new Set(techIds);
  return ABILITY_DEFS[id].requiredTechIds.every((techId) => owned.has(techId) || installedModules?.has(techId) === true);
};
