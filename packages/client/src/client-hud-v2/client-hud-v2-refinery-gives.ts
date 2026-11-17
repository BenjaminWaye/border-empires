// The tile panel's "Gives" fact for a town refinery: what it yields right
// now (slots of its resource, and how many of its field tiles feed it), not
// the per-tile rate from the structure catalog. Another player's refinery,
// one still being built, or one whose field hasn't streamed in yet falls
// back to the rate.
import { isRefineryType, REFINERY_FIELD_RESOURCE_BY_TYPE, type RefineryFieldResource } from "@border-empires/shared";
import { refineryPerTileSlots } from "../client-refineries/refinery-field-options.js";
import type { RefineryClientStatus, RefineryNeedsField } from "../client-refineries/refinery-client-status.js";
import type { Tile } from "../client-types.js";
import type { TileFact } from "./client-hud-v2-tile-facts.js";

/** The refinery status of a tile's refinery as the viewer sees it (refineryStatusFor). */
export type RefineryStatusOf = (tile: Tile) => RefineryClientStatus | undefined;

/** The slot resource a refinery yields (the GEMS tile resource is Crystal to players). */
const YIELD_NAME: Readonly<Record<RefineryFieldResource, string>> = { TITANIUM: "Titanium", UMBRITE: "Umbrite", GEMS: "Crystal" };

/** Same wording as the "needs a field" toast (refinery-field-toasts.ts). */
const NEEDS_FIELD_TEXT: Readonly<Record<RefineryNeedsField, string>> = {
  NO_FIELD: "Nothing · no field", FIELD_LOST: "Nothing · field lost", FIELD_TAKEN: "Nothing · field taken", UNLINKED: "Nothing · link broken"
};

const nothing = (value: string): TileFact => ({ label: "Gives", value, tone: "warn" });

/** The Gives fact for a refinery of `type` whose building is in `buildingStatus`; undefined for any other building. */
export const refineryGivesFact = (
  type: string, mine: boolean, buildingStatus: string, status: RefineryClientStatus | undefined
): TileFact | undefined => {
  if (!isRefineryType(type)) return undefined;
  const name = YIELD_NAME[REFINERY_FIELD_RESOURCE_BY_TYPE[type]];
  const rate = (boosted: boolean): TileFact => ({ label: "Gives", value: `+${refineryPerTileSlots(boosted)} ${name} slots per garrisoned field tile` });
  if (!mine || !status) return rate(false);
  // Switched off (manually or for upkeep): the State line says why; it gives nothing.
  if (buildingStatus === "inactive") return nothing("Nothing · switched off");
  if (buildingStatus !== "active") return rate(status.boosted);
  if (status.needsField) return nothing(NEEDS_FIELD_TEXT[status.needsField]);
  // A wire status whose field tiles haven't streamed in can't count them yet.
  if (!status.working || !status.fieldTiles) return rate(status.boosted);
  const processed = status.processedTileKeys.length;
  if (processed === 0) return nothing(`Nothing · garrison its ${name} field`);
  return { label: "Gives", value: `+${processed * refineryPerTileSlots(status.boosted)} ${name} slots · ${processed}/${status.fieldTiles.length} field tiles garrisoned` };
};
