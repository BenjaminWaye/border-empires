import {
  LIGHT_OUTPOST_BUILD_MS,
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
import type { SiegeOutpostVariant, TileUpkeepEntry } from "./types.js";

// ── Outpost family ─────────────────────────────────────────────────
// Three siege variants (SIEGE_OUTPOST, SIEGE_TOWER, DREAD_TOWER) + LIGHT_OUTPOST.
// LIGHT_OUTPOST lives on economicStructure in Phase 1 — acknowledged debt to
// be unwound in Phase 4.

/**
 * Placement check shared by all outpost variants.
 * Outposts do NOT require SETTLED — only owned.
 * Siege outpost handler checks ownerOwnsTile + tileIsLand + noConflictingStructure.
 * LIGHT_OUTPOST goes through the economic handler which additionally
 * requires SETTLED (because the economic handler adds it).
 */
const outpostPlacement: StructureSpec["placement"] = [
  ownerOwnsTile,
  tileIsLand,
  noConflictingStructure,
  // structureShowsOnTile("SIEGE_OUTPOST", ...) is applied by the handler.
  // LIGHT_OUTPOST uses structureShowsOnTile("LIGHT_OUTPOST", ...) via the economic handler.
];

// Per-minute upkeep for the siege ladder: 1 FOOD base on every tier, plus an
// increasing SUPPLY rate per tier (SIEGE_OUTPOST 0.1, SIEGE_TOWER 0.2,
// DREAD_TOWER 0.3). Mirrors the slot occupation (1/2/3 SUPPLY) and the sim's
// structureUpkeepPerMinute.
const SIEGE_UPKEEP: Partial<Record<SiegeOutpostVariant, TileUpkeepEntry>> = {
  SIEGE_OUTPOST: { label: "Siege upkeep", perMinute: { SUPPLY: 0.1, FOOD: 0.1 } },
  SIEGE_TOWER: { label: "Siege upkeep", perMinute: { SUPPLY: 0.2, FOOD: 0.1 } },
  DREAD_TOWER: { label: "Siege upkeep", perMinute: { SUPPLY: 0.3, FOOD: 0.1 } },
};

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
      strategic: { SUPPLY: tier.supply, ...(tier.iron > 0 ? { IRON: tier.iron } : {}) },
    },
    buildMs: SIEGE_OUTPOST_BUILD_MS,
    techIds,
    consumesDevelopmentSlot: true,
    placement: outpostPlacement,
    upkeep: SIEGE_UPKEEP[variant] ? [SIEGE_UPKEEP[variant]!] : [],
    tileField: "siegeOutpost",
  };
}

export const LIGHT_OUTPOST_SPEC: StructureSpec = {
  type: "LIGHT_OUTPOST",
  kind: "OUTPOST",
  variant: "LIGHT_OUTPOST",
  cost: {
    gold: 0,
    manpower: 30,
  },
  buildMs: LIGHT_OUTPOST_BUILD_MS,
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
  // rest of the non-synthesizer structure roster — LIGHT_OUTPOST_GOLD_UPKEEP
  // is 0 now, gold's only remaining jobs are tech/rush-buys/synthesizer upkeep.
  upkeep: [{ label: "Food upkeep", perMinute: { FOOD: 0.1 } }],
  // Acknowledged debt: LIGHT_OUTPOST lives on economicStructure in Phase 1.
  // Phase 4 collapses to tile.structure.
  tileField: "economicStructure",
};

export const OUTPOST_SPECS: Record<SiegeOutpostVariant, StructureSpec> = {
  SIEGE_OUTPOST: siegeSpec("SIEGE_OUTPOST"),
  SIEGE_TOWER: siegeSpec("SIEGE_TOWER"),
  DREAD_TOWER: siegeSpec("DREAD_TOWER"),
};
