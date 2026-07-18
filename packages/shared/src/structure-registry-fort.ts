import {
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
} from "./config.js";
import {
  FORT_TIER_LADDER,
} from "./structure-costs/structure-costs.js";
import type { StructureSpec } from "./structure-registry/structure-registry.js";
import { noConflictingStructure, ownerOwnsTile, tileIsLand, tileIsSettled } from "./structure-registry/structure-registry.js";
import type { FortVariant } from "./types.js";

// ── Fort family ────────────────────────────────────────────────────

/**
 * Placement check shared by all fort variants.
 * Forts allow upgrading from an existing fort (same tile field)
 * and from WOODEN_FORT (via the economic handler's upgrade path).
 */
const fortPlacement: StructureSpec["placement"] = [
  ownerOwnsTile,
  tileIsSettled,
  tileIsLand,
  noConflictingStructure,
  // structureShowsOnTile("FORT", ...) is applied by the handler.
  // The per-handler predicate varies (settled/resource/town/support/dock).
];

function fortSpec(variant: FortVariant): StructureSpec {
  const tier = FORT_TIER_LADDER[variant];
  const techIds: string[] = ["masonry"];
  if (variant === "IRON_BASTION") techIds.push("fortified-walls");
  if (variant === "THUNDER_BASTION") techIds.push("steelworking", "fortified-walls");

  return {
    type: variant,
    kind: "FORT",
    variant,
    cost: {
      gold: tier.gold,
      manpower: tier.manpower,
      strategic: { IRON: tier.iron },
    },
    buildMs: FORT_BUILD_MS,
    techIds,
    consumesDevelopmentSlot: true,
    placement: fortPlacement,
    upkeep: [{ label: "Fort", perMinute: { GOLD: 1, IRON: 0.025 } }],
    tileField: "fort",
  };
}

export const FORT_SPECS: Record<FortVariant, StructureSpec> = {
  WOODEN_FORT: fortSpec("WOODEN_FORT"),
  FORT: fortSpec("FORT"),
  IRON_BASTION: fortSpec("IRON_BASTION"),
  THUNDER_BASTION: fortSpec("THUNDER_BASTION"),
};
