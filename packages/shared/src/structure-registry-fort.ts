import {
  FORT_BUILD_MS,
  FORT_DEFENSE_MULT,
} from "./config.js";
import {
  FORT_TIER_LADDER,
} from "./structure-costs/structure-costs.js";
import type { StructureSpec } from "./structure-registry/structure-registry.js";
import { noConflictingStructure, ownerOwnsTile, tileIsLand, tileIsSettled } from "./structure-registry/structure-registry.js";
import type { FortVariant, TileUpkeepEntry } from "./types.js";

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

// Per-minute upkeep for the fort ladder: 1 FOOD base on every tier, plus an
// increasing IRON rate per tier (FORT 0.1, IRON_BASTION 0.2, THUNDER_BASTION
// 0.4). This is a real, nonzero, live drain — mirrors
// structureUpkeepPerMinute in apps/simulation/src/player-update-economy/
// player-update-economy.ts (there is also a near-duplicate copy in
// apps/simulation/src/snapshot-economy-helpers.ts; both agree on the fort
// ladder). Distinct from, and in addition to, the fort ladder's slot
// occupation (1/2/4 IRON, structure-slots.ts), which gates whether the fort
// can be built/exist at all rather than draining anything per minute. This
// field itself has zero runtime consumers in apps/simulation/src — it is a
// mirror kept in sync by hand, not the thing actually charged.
const FORT_UPKEEP: Partial<Record<FortVariant, TileUpkeepEntry>> = {
  WOODEN_FORT: { label: "Food upkeep", perMinute: { FOOD: 0.1 } },
  FORT: { label: "Fort upkeep", perMinute: { IRON: 0.1, FOOD: 0.1 } },
  IRON_BASTION: { label: "Fort upkeep", perMinute: { IRON: 0.2, FOOD: 0.1 } },
  THUNDER_BASTION: { label: "Fort upkeep", perMinute: { IRON: 0.4, FOOD: 0.1 } },
};

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
    upkeep: FORT_UPKEEP[variant] ? [FORT_UPKEEP[variant]!] : [],
    tileField: "fort",
  };
}

export const FORT_SPECS: Record<FortVariant, StructureSpec> = {
  WOODEN_FORT: fortSpec("WOODEN_FORT"),
  FORT: fortSpec("FORT"),
  IRON_BASTION: fortSpec("IRON_BASTION"),
  THUNDER_BASTION: fortSpec("THUNDER_BASTION"),
};
