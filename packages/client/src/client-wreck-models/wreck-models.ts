// Registry of the 3D wreck / battle-scar models (see wreck-kit.ts), keyed so
// the overlay builds each model's geometry once and instances it.
import { createDistrictGeometryFromModel, type DistrictGeometry } from "../client-town-district/district-geometry.js";
import type { GroundMark, WreckBuilders } from "./wreck-kit.js";
import { BATTLE_SCAR_VARIANTS, buildBattleScars } from "./battle-scar-models.js";
import { buildFortBreachGround, buildResourceFire } from "./fort-breach-model.js";
import { buildRelayBeaconWreck } from "./relay-beacon-wreck.js";
import { buildSiegeWreck, type SiegeWreckVariant } from "./siege-wreck.js";

export type WreckModel =
  | { readonly kind: "RELAY_BEACON" }
  | { readonly kind: "SIEGE"; readonly variant: SiegeWreckVariant }
  | { readonly kind: "FORT_BREACH" }
  | { readonly kind: "RESOURCE_FIRE" }
  | { readonly kind: "BATTLE_SCARS"; readonly level: number };

/** Variants per model kind; a tile picks one from its seed. */
export const wreckModelVariants = (model: WreckModel): number => (model.kind === "BATTLE_SCARS" ? BATTLE_SCAR_VARIANTS : 2);

export const wreckModelKey = (model: WreckModel, variant: number): string => {
  switch (model.kind) {
    case "SIEGE": return `SIEGE-${model.variant}-${variant}`;
    case "BATTLE_SCARS": return `BATTLE_SCARS-${model.level}-${variant}`;
    default: return `${model.kind}-${variant}`;
  }
};

export const buildWreckModel = (t: WreckBuilders, model: WreckModel, variant: number): void => {
  switch (model.kind) {
    case "RELAY_BEACON": return buildRelayBeaconWreck(t, variant);
    case "SIEGE": return buildSiegeWreck(t, model.variant, variant);
    case "FORT_BREACH": return buildFortBreachGround(t, variant);
    case "RESOURCE_FIRE": return buildResourceFire(t, variant);
    case "BATTLE_SCARS": return buildBattleScars(t, model.level, variant);
  }
};

/** A wreck model's geometry (district layers) and the burn marks it leaves on the ground. */
export const createWreckGeometry = (model: WreckModel, variant: number): { readonly geometry: DistrictGeometry; readonly marks: readonly GroundMark[] } => {
  const marks: GroundMark[] = [];
  const geometry = createDistrictGeometryFromModel((t) => buildWreckModel({ ...t, marks }, model, variant));
  return { geometry, marks };
};
