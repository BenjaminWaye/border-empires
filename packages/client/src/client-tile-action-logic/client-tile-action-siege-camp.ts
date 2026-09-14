// build_siege_camp action -- extracted from client-tile-action-logic.ts
// (over the 500-line file-size limit) to keep that file from growing
// further.
//
// The siege ladder (SIEGE_OUTPOST/SIEGE_TOWER/DREAD_TOWER) is the one
// buildable family that never needs SETTLED at all -- it builds directly on
// FRONTIER ground (see structureSkipsSettledRequirement and the OUTPOST-kind
// skip in runtime-structure-command-handlers.ts), so this action gets its
// own reach gate (weaker than settle_land/build_relay_beacon's: a tile
// currently sitting in ANOTHER player's reach is fair game, only a tile no
// one's reach covers at all is blocked) and never appends the generic
// " • settles this tile first" detail suffix or combined settle+build cost
// every other frontier build action gets.
import { SIEGE_OUTPOST_BUILD_MS } from "@border-empires/shared";
import type { DevelopmentSlotSummary } from "../client-queue-logic/client-queue-logic.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { nextSiegeVariantForTile } from "./client-tile-action-fort-siege-variants.js";
import {
  chainedBuildAvailabilityFromModule,
  hasFreeResourceSlots,
  missingResourceSlotReason,
  tileActionAvailabilityWithDevelopmentSlot,
  type TileActionLogicDeps
} from "./client-tile-action-logic.js";

export const siegeCampAction = (
  state: ClientState,
  tile: Tile,
  deps: TileActionLogicDeps,
  slots: DevelopmentSlotSummary,
  hasRelayBeacon: boolean
): TileActionDef | undefined => {
  if (tile.ownerId !== state.me || tile.fort || tile.observatory) return undefined;
  if (!(tile.siegeOutpost || !tile.economicStructure || hasRelayBeacon)) return undefined;

  const siegeVariant = nextSiegeVariantForTile(state, tile);
  if (!siegeVariant) return undefined;

  const hasTech = tile.siegeOutpost ? true : state.techIds.includes("leatherworking");
  const canUseTile = Boolean(tile.siegeOutpost) || !tile.economicStructure || hasRelayBeacon;
  const hasFreeSlots = hasFreeResourceSlots(state, siegeVariant.variant, tile.siegeOutpost?.variant);
  // tile.reachOwnerId mirrors the server's per-tile reachBorderOwnerAt
  // exactly (always-emitted, like ownerId) -- undefined means no one's
  // reach covers this tile at all, the only case the siege ladder rejects.
  const siegeOutOfReach = tile.ownershipState === "FRONTIER" && !tile.reachOwnerId;
  const withSiegeReachGate = ([eligible, reason, cost]: [boolean, string, string]): [boolean, string, string] =>
    siegeOutOfReach ? [false, "Outside your reach", cost] : [eligible, reason, cost];

  return {
    id: "build_siege_camp",
    label: tile.siegeOutpost || hasRelayBeacon ? `Upgrade to ${siegeVariant.label}` : `Build ${siegeVariant.label}`,
    // No settle-first detail suffix here -- unlike every other build action,
    // the siege ladder never settles the tile first.
    detail: deps.buildDetailTextForAction("build_siege_camp", tile),
    ...tileActionAvailabilityWithDevelopmentSlot(
      ...withSiegeReachGate(chainedBuildAvailabilityFromModule(
        deps,
        state,
        tile,
        "SIEGE_OUTPOST",
        hasTech && hasFreeSlots && canUseTile,
        !hasTech
          ? "Requires Tanner's Craft"
          : !canUseTile
            ? "Tile already has structure"
            : missingResourceSlotReason(state, siegeVariant.variant, tile.siegeOutpost?.variant) ?? "Unavailable",
        `${siegeVariant.summary} • ${Math.round(SIEGE_OUTPOST_BUILD_MS / 60000)}m • atk x${siegeVariant.attackMult.toFixed(2)}`,
        siegeVariant.gold
      )),
      slots,
      deps
    )
  };
};
