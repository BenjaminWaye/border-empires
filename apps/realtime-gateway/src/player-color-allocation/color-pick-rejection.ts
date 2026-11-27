import { closestClashingEmpire, tooCloseColorReason } from "@border-empires/shared";
import { isTaken, suggestAlternative } from "./player-color-allocation.js";
import { activeEmpiresOf } from "./taken-color-set.js";

export type ColorPickRejection = { readonly message: string; readonly suggestion: string };

/**
 * Why a player may not pick `normalized` (a #rrggbb colour), or undefined when
 * they may. Held exactly by another empire, or too close to an active one
 * (MIN_EMPIRE_COLOR_DELTA_E). Both go out as COLOR_TAKEN with a suggestion.
 */
export const colorPickRejection = (normalized: string, taken: ReadonlySet<string>): ColorPickRejection | undefined => {
  if (isTaken(normalized, taken)) {
    return { message: "That colour is already taken by another empire.", suggestion: suggestAlternative(normalized, taken) };
  }
  const clash = closestClashingEmpire(normalized, activeEmpiresOf(taken));
  if (!clash) return undefined;
  return { message: tooCloseColorReason(clash.name), suggestion: suggestAlternative(normalized, taken) };
};
