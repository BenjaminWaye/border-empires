import { empireColorRejection } from "@border-empires/shared";
import { suggestAlternative } from "./player-color-allocation.js";
import { colorsInUseOf } from "./taken-color-set.js";

export type ColorPickRejection = { readonly message: string; readonly suggestion: string };

/**
 * Why a player may not pick `normalized` (a #rrggbb colour), or undefined when
 * they may: the shared empireColorRejection rule (held exactly by another
 * empire, or too close to an active one), the same rule the client runs
 * inline. Both go out as COLOR_TAKEN with a suggestion that passes that rule.
 */
export const colorPickRejection = (normalized: string, taken: ReadonlySet<string>): ColorPickRejection | undefined => {
  const rejection = empireColorRejection(normalized, colorsInUseOf(taken));
  if (!rejection) return undefined;
  return { message: rejection.message, suggestion: suggestAlternative(normalized, taken) };
};
