import {
  RELAY_BEACON_BUILD_MS,
  SIEGE_OUTPOST_BUILD_MS,
  SIEGE_OUTPOST_BUILD_COST,
} from "./config.js";
import {
  SIEGE_TIER_LADDER,
} from "./structure-costs/structure-costs.js";
import type { StructureSpec } from "./structure-registry/structure-registry.js";
import {
  noConflictingStructure,
  noDuplicateStructureType,
  ownerOwnsTile,
  tileIsLand,
  tileIsSettled,
} from "./structure-registry/structure-registry.js";
import type { SiegeOutpostVariant } from "./types.js";

// ── Outpost family ─────────────────────────────────────────────────
// Three siege variants (SIEGE_OUTPOST, SIEGE_TOWER, DREAD_TOWER) + RELAY_BEACON.
// RELAY_BEACON lives on economicStructure in Phase 1 — acknowledged debt to
// be unwound in Phase 4.

/**
 * Placement check shared by all outpost variants.
 * Outposts do NOT require SETTLED — only owned.
 * Siege outpost handler checks ownerOwnsTile + tileIsLand + noConflictingStructure.
 * RELAY_BEACON goes through the economic handler which additionally
 * requires SETTLED (because the economic handler adds it).
 */
const outpostPlacement: StructureSpec["placement"] = [
  ownerOwnsTile,
  tileIsLand,
  noConflictingStructure,
  // structureShowsOnTile("SIEGE_OUTPOST", ...) is applied by the handler.
  // RELAY_BEACON uses structureShowsOnTile("RELAY_BEACON", ...) via the economic handler.
];

// §12.1: the siege ladder's UMBRITE cost is already charged as a
// resource-slot occupation (structure-slots.ts) — no separate per-minute
// drain on top of that, same as Observatory/Airport.

function siegeSpec(variant: SiegeOutpostVariant): StructureSpec {
  const tier = SIEGE_TIER_LADDER[variant];
  const techIds: string[] = ["leatherworking"];
  if (variant === "SIEGE_TOWER") techIds.push("siegecraft");
  if (variant === "DREAD_TOWER") techIds.push("siegecraft", "standing-army");

  return {
    type: variant,
    kind: "OUTPOST",
    variant,
    cost: {
      gold: tier.gold,
      manpower: tier.manpower,
      strategic: { UMBRITE: tier.umbrite, ...(tier.titanium > 0 ? { TITANIUM: tier.titanium } : {}) },
    },
    buildMs: SIEGE_OUTPOST_BUILD_MS,
    techIds,
    consumesDevelopmentSlot: true,
    placement: outpostPlacement,
    upkeep: [],
    tileField: "siegeOutpost",
  };
}

export const RELAY_BEACON_SPEC: StructureSpec = {
  type: "RELAY_BEACON",
  kind: "OUTPOST",
  variant: "RELAY_BEACON",
  cost: {
    gold: 0,
    manpower: 30,
  },
  buildMs: RELAY_BEACON_BUILD_MS,
  techIds: [],
  consumesDevelopmentSlot: true,
  placement: [
    ownerOwnsTile,
    tileIsSettled, // economic handler adds this; siege handler doesn't
    tileIsLand,
    noConflictingStructure,
    noDuplicateStructureType,
  ],
  // §12.1 (docs/manpower-economy-rewrite-plan.md): retired to 0 like the
  // rest of the non-synthesizer structure roster — RELAY_BEACON_GOLD_UPKEEP
  // is 0 now, gold's only remaining jobs are tech/rush-buys/synthesizer upkeep.
  // Food cost is already represented as a FOOD resource slot (see
  // structure-slots.ts), so no separate continuous per-minute drain here.
  upkeep: [],
  // Acknowledged debt: RELAY_BEACON lives on economicStructure in Phase 1.
  // Phase 4 collapses to tile.structure.
  tileField: "economicStructure",
};

export const OUTPOST_SPECS: Record<SiegeOutpostVariant, StructureSpec> = {
  SIEGE_OUTPOST: siegeSpec("SIEGE_OUTPOST"),
  SIEGE_TOWER: siegeSpec("SIEGE_TOWER"),
  DREAD_TOWER: siegeSpec("DREAD_TOWER"),
};
