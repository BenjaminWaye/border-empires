// The tile panel's "Gives" fact for a town refinery: what it yields right
// now (slots of its resource, and how many of its field tiles feed it), not
// the per-tile rate from the structure catalog. Another player's refinery,
// or one whose status hasn't resolved, falls back to the rate.
import { isRefineryType, REFINERY_FIELD_RESOURCE_BY_TYPE, type RefineryFieldResource } from "@border-empires/shared";
import { refineryPerTileSlots } from "../client-refineries/refinery-field-options.js";
import type { RefineryClientStatus } from "../client-refineries/refinery-client-status.js";
import type { Tile } from "../client-types.js";
import type { TileFact } from "./client-hud-v2-tile-facts.js";

/** The refinery status of a tile's refinery as the viewer sees it (refineryStatusFor). */
export type RefineryStatusOf = (tile: Tile) => RefineryClientStatus | undefined;

/** The slot resource a refinery yields (the GEMS tile resource is Crystal to players). */
const YIELD_NAME: Readonly<Record<RefineryFieldResource, string>> = { TITANIUM: "Titanium", UMBRITE: "Umbrite", GEMS: "Crystal" };

/** The Gives fact for a refinery of `type`; undefined for any other building. */
export const refineryGivesFact = (type: string, mine: boolean, status: RefineryClientStatus | undefined): TileFact | undefined => {
  if (!isRefineryType(type)) return undefined;
  const name = YIELD_NAME[REFINERY_FIELD_RESOURCE_BY_TYPE[type]];
  if (!mine || !status) return { label: "Gives", value: `+${refineryPerTileSlots(false)} ${name} per garrisoned field tile` };
  if (status.needsField) {
    return { label: "Gives", value: status.needsField === "UNLINKED" ? "Nothing · field cut off" : "Nothing · no field", tone: "warn" };
  }
  if (!status.working) return { label: "Gives", value: `+${refineryPerTileSlots(status.boosted)} ${name} per garrisoned field tile` };
  const processed = status.processedTileKeys.length;
  const fieldSize = status.fieldTiles?.length ?? processed;
  if (processed === 0) return { label: "Gives", value: `Nothing · garrison its ${name} field`, tone: "warn" };
  return { label: "Gives", value: `+${processed * refineryPerTileSlots(status.boosted)} ${name} · ${processed}/${fieldSize} field tiles garrisoned` };
};
