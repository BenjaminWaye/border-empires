// build_siege_camp action -- extracted from client-tile-action-logic.ts
// (over the 500-line file-size limit) to keep that file from growing
// further.
//
// The siege ladder (SIEGE_BATTERY/SIEGE_TOWER/DREAD_TOWER) is the one
// buildable family that never needs SETTLED at all -- it builds directly on
// FRONTIER ground (see structureSkipsSettledRequirement and the OUTPOST-kind
// skip in runtime-structure-command-handlers.ts), so this action gets its
// own reach gate (weaker than settle_land/build_relay_beacon's: a tile
// currently sitting in ANOTHER player's reach is fair game, only a tile no
// one's reach covers at all is blocked) and never appends the generic
// " • garrisons this tile first" detail suffix or combined settle+build cost
// every other frontier build action gets.
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { siegeTierOptionsForTile, tierRowAvailability } from "./client-structure-tier-options.js";
import type { TileActionLogicDeps } from "./client-tile-action-logic.js";

/** The Siege row: opens the tier picker (client-structure-tier-options.ts) listing every siege tier this tile can take. */
export const siegeCampAction = (
  state: ClientState,
  tile: Tile,
  deps: TileActionLogicDeps,
  hasRelayBeacon: boolean
): TileActionDef | undefined => {
  if (tile.ownerId !== state.me || tile.fort || tile.observatory) return undefined;
  if (!(tile.siegeBattery || !tile.economicStructure || hasRelayBeacon)) return undefined;
  // tile.reachOwnerId mirrors the server's per-tile reachBorderOwnerAt
  // exactly (always-emitted, like ownerId) -- undefined means no one's
  // reach covers this tile at all, the only case the siege ladder rejects.
  const siegeOutOfReach = tile.ownershipState === "FRONTIER" && !tile.reachOwnerId;
  const options = siegeTierOptionsForTile(state, tile, siegeOutOfReach);
  if (options.length === 0) return undefined;
  return {
    id: "build_siege_camp",
    label: tile.siegeBattery ? "Upgrade siege" : "Siege",
    // No settle-first detail suffix here -- unlike every other build action,
    // the siege ladder never settles the tile first.
    detail: deps.buildDetailTextForAction("build_siege_camp", tile),
    cost: `Choose a tier: ${options.map((entry) => entry.label).join(" · ")}`,
    ...tierRowAvailability(options),
    tierOptions: options
  };
};
