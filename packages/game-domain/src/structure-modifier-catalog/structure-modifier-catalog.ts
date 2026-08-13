// Single source of truth for "what does this building actually do,
// numerically" — consumed by both the tile-overview popup
// (client-tile-overview-modifiers.ts) and the structure-info modal
// (client-map-display.ts's effectsFor via client-tech-detail-ui.ts), so the
// same Modifier styling shows identical numbers in both places instead of
// three independently hand-written copies of the same text.
//
// Buildings are split across three sibling files by family, each kept under
// the repo's 500-line cap:
//   - structure-modifier-catalog-military.ts (fort/siege/observatory/weapons)
//   - structure-modifier-catalog-economic.ts (farm/resource/support buildings)
//   - structure-modifier-catalog-utility.ts (power/vision/monuments)
import { militaryStructureModifiers } from "./structure-modifier-catalog-military.js";
import { economicStructureModifiers } from "./structure-modifier-catalog-economic.js";
import { utilityStructureModifiers } from "./structure-modifier-catalog-utility.js";
import type { ModifierContext, ModifierStructureType, ModifierTileContext, StructureModifier } from "./structure-modifier-catalog-types.js";

export type { ModifierContext, ModifierStructureType, ModifierTileContext, StructureModifier };
export { percentLabel, multiplierPercentLabel, connectedLabel } from "./structure-modifier-catalog-types.js";

export const structureModifiersFor = (type: ModifierStructureType, ctx: ModifierContext = {}): StructureModifier[] =>
  militaryStructureModifiers(type) ?? economicStructureModifiers(type, ctx) ?? utilityStructureModifiers(type) ?? [];
