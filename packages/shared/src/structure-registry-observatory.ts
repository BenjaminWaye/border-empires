import { OBSERVATORY_BUILD_MS } from "./config.js";
import type { StructureSpec } from "./structure-registry/structure-registry.js";
import {
  noConflictingStructure,
  ownerOwnsTile,
  tileIsLand,
  tileIsSettled,
} from "./structure-registry/structure-registry.js";

// ── Observatory ────────────────────────────────────────────────────

export const OBSERVATORY_SPEC: StructureSpec = {
  type: "OBSERVATORY",
  kind: "OBSERVATORY",
  cost: {
    gold: 0,
    manpower: 80,
    strategic: { CRYSTAL: 45 },
  },
  buildMs: OBSERVATORY_BUILD_MS,
  techIds: ["cartography"],
  consumesDevelopmentSlot: true,
  placement: [
    ownerOwnsTile,
    tileIsSettled,
    tileIsLand,
    noConflictingStructure,
    // structureShowsOnTile("OBSERVATORY", ...) is applied by the handler.
  ],
  // cost.strategic.CRYSTAL above is a retired build-time figure (mirrors
  // structureCostDefinition("OBSERVATORY").resourceCost in structure-costs.ts)
  // — it is stripped before spend by stripRetiredStockpileCost and never
  // actually charged. It is NOT the same number as, and has no runtime
  // connection to, Observatory's real ongoing cost: permanently occupying
  // 1 CRYSTAL slot, declared independently in
  // STRUCTURE_SLOT_REQUIREMENTS.OBSERVATORY (structure-slots.ts). That slot
  // occupation is a build-capacity gate, not a per-minute drain. Observatory
  // has zero per-minute upkeep of any resource — confirmed by the absence of
  // an OBSERVATORY case in structureUpkeepPerMinute
  // (apps/simulation/src/player-update-economy/player-update-economy.ts).
  upkeep: [],
  tileField: "observatory",
};
