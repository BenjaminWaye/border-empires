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
import type { ModifierContext, ModifierStructureType, ModifierTileContext, StructureModifier, TownModifierTotal } from "./structure-modifier-catalog-types.js";

export type { ModifierContext, ModifierStructureType, ModifierTileContext, StructureModifier, TownModifierTotal };
export { percentLabel, multiplierPercentLabel, connectedLabel } from "./structure-modifier-catalog-types.js";
export { structureModifiersFor } from "./structure-modifier-catalog-core.js";
export { TOWN_MODIFIER_AGGREGATE_TYPES, CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES, townModifierTotalsFromCounts } from "./structure-modifier-catalog-town-aggregate.js";
