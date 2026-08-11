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

// §12.1: the fort ladder's TITANIUM (and WOODEN_FORT's FOOD) cost is already
// charged as a resource-slot occupation (structure-slots.ts) — no
// separate per-minute drain on top of that, same as Observatory/Airport.

function fortSpec(variant: FortVariant): StructureSpec {
  const tier = FORT_TIER_LADDER[variant];
  // Wooden Fort has no tech requirement — always available from the start.
  const techIds: string[] = [];
  if (variant === "FORT") techIds.push("masonry");
  if (variant === "TITANIUM_BASTION") techIds.push("masonry", "fortified-walls");
  if (variant === "THUNDER_BASTION") techIds.push("masonry", "steelworking", "fortified-walls");

  return {
    type: variant,
    kind: "FORT",
    variant,
    cost: {
      gold: tier.gold,
      manpower: tier.manpower,
      strategic: { TITANIUM: tier.titanium },
    },
    buildMs: FORT_BUILD_MS,
    techIds,
    consumesDevelopmentSlot: true,
    placement: fortPlacement,
    upkeep: [],
    tileField: "fort",
  };
}

export const FORT_SPECS: Record<FortVariant, StructureSpec> = {
  WOODEN_FORT: fortSpec("WOODEN_FORT"),
  FORT: fortSpec("FORT"),
  TITANIUM_BASTION: fortSpec("TITANIUM_BASTION"),
  THUNDER_BASTION: fortSpec("THUNDER_BASTION"),
};
