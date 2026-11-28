import { pickSuggestedPalette } from "./player-color-allocation.js";
import { colorsInUseOf } from "./taken-color-set.js";

/**
 * The colour fields of INIT's player: six swatches the player may pick, and
 * the colours in use that SET_PROFILE checks against, so the client's inline
 * check (shared empireColorRejection) agrees with the submit check.
 */
export const applyInitColorFields = (player: Record<string, unknown>, taken: ReadonlySet<string>): void => {
  player.suggestedColors = pickSuggestedPalette(6, taken);
  player.colorsInUse = colorsInUseOf(taken);
};
