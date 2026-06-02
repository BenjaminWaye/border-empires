import {
  LIGHT_OUTPOST_BUILD_MS,
  SIEGE_OUTPOST_BUILD_MS,
  SIEGE_OUTPOST_BUILD_COST,
  SWEEP_BUDGET_CAP,
} from "./config.js";
import {
  SIEGE_TIER_LADDER,
} from "./structure-costs.js";
import type { StructureSpec } from "./structure-registry.js";
import {
  noConflictingStructure,
  noDuplicateStructureType,
  ownerOwnsTile,
  tileIsLand,
  tileIsSettled,
} from "./structure-registry.js";
import type { SiegeOutpostVariant } from "./types.js";

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
    upkeep: [{ label: "Siege outpost", perMinute: { GOLD: 1, SUPPLY: 0.025 } }],
    tileField: "siegeOutpost",
  };
}

export const LIGHT_OUTPOST_SPEC: StructureSpec = {
  type: "LIGHT_OUTPOST",
  kind: "OUTPOST",
  variant: "LIGHT_OUTPOST",
  cost: {
    gold: 75,
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
  upkeep: [{ label: "Gold upkeep", perMinute: { GOLD: 0.05 } }],
  // Acknowledged debt: LIGHT_OUTPOST lives on economicStructure in Phase 1.
  // Phase 4 collapses to tile.structure.
  tileField: "economicStructure",
};

export const OUTPOST_SPECS: Record<SiegeOutpostVariant, StructureSpec> = {
  SIEGE_OUTPOST: siegeSpec("SIEGE_OUTPOST"),
  SIEGE_TOWER: siegeSpec("SIEGE_TOWER"),
  DREAD_TOWER: siegeSpec("DREAD_TOWER"),
};
