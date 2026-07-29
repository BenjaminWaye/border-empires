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
  // §12.1 (docs/manpower-economy-rewrite-plan.md): the CRYSTAL slot
  // occupation (cost.strategic.CRYSTAL above) is Observatory's upkeep
  // now — no separate per-minute drain.
  upkeep: [],
  tileField: "observatory",
};
