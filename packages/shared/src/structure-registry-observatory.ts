import { OBSERVATORY_BUILD_MS, OBSERVATORY_UPKEEP_PER_MIN } from "./config.js";
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
    gold: 800,
    manpower: 0,
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
  upkeep: [{ label: "Observatory", perMinute: { CRYSTAL: OBSERVATORY_UPKEEP_PER_MIN } }],
  tileField: "observatory",
};
