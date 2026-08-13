// The actual structureModifiersFor implementation, split out of the barrel
// (structure-modifier-catalog.ts) so structure-modifier-catalog-town-aggregate.ts
// can import it without creating a barrel <-> town-aggregate import cycle
// (the barrel re-exports town-aggregate's functions too).
import { militaryStructureModifiers } from "./structure-modifier-catalog-military.js";
import { economicStructureModifiers } from "./structure-modifier-catalog-economic.js";
import { utilityStructureModifiers } from "./structure-modifier-catalog-utility.js";
import type { ModifierContext, ModifierStructureType, StructureModifier } from "./structure-modifier-catalog-types.js";

export const structureModifiersFor = (type: ModifierStructureType, ctx: ModifierContext = {}): StructureModifier[] =>
  militaryStructureModifiers(type) ?? economicStructureModifiers(type, ctx) ?? utilityStructureModifiers(type) ?? [];
