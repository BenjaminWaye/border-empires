// Optimistic tile writes for structure build / cancel, mirroring the sim's
// handleBuildStructureCommand and cancelStructureActionTile so the tile the
// player sees before the server answers matches what the server will send.
// Extracted from client-optimistic-state.ts (500-line cap).
import {
  bestSiegeTierForTech,
  defendingFortVariant,
  fortTierForBuild,
  nextSiegeTierForUpgrade,
  type SiegeOutpostVariant
} from "@border-empires/shared";
import type { OptimisticStructureKind, Tile } from "../client-types.js";

export const writeOptimisticStructureBuild = (
  tile: Tile,
  kind: OptimisticStructureKind,
  ownerId: string,
  hasTech: (id: string) => boolean,
  completesAt: number
): void => {
  if (kind === "FORT" || kind === "WOODEN_FORT") {
    // Don't write a construction the sim will reject (max tier, or a Palisade on a fortified tile).
    const tier = fortTierForBuild(kind, tile.fort?.variant, hasTech);
    if (!tier) return;
    // An upgrade leaves the current tier standing until the new one completes.
    const standing = defendingFortVariant(tile.fort);
    tile.fort = {
      ownerId,
      status: "under_construction",
      variant: tier.variant,
      completesAt,
      ...(standing ? { upgradingFrom: standing } : {}),
      ...(standing && tile.fort?.disabledUntil !== undefined ? { disabledUntil: tile.fort.disabledUntil } : {})
    };
    return;
  }
  if (kind === "OBSERVATORY") {
    tile.observatory = { ownerId, status: "under_construction", completesAt };
    return;
  }
  if (kind === "SIEGE_OUTPOST") {
    delete tile.economicStructure;
    if (tile.siegeOutpost && !nextSiegeTierForUpgrade(tile.siegeOutpost.variant, hasTech)) return;
    const variant: SiegeOutpostVariant = tile.siegeOutpost
      ? nextSiegeTierForUpgrade(tile.siegeOutpost.variant, hasTech)!.variant
      : bestSiegeTierForTech(hasTech).variant;
    tile.siegeOutpost = { ownerId, status: "under_construction", variant, completesAt };
    return;
  }
  tile.economicStructure = { ownerId, type: kind, status: "under_construction", completesAt };
};

// Undo only the one structure action the sim's cancel targets (fort first,
// then observatory, siege outpost, economic structure) -- a stacked Relay
// Beacon or Harbor Exchange next to a cancelled fort build stays put.
export const writeOptimisticStructureCancel = (tile: Tile): void => {
  const fort = tile.fort;
  if (fort && (fort.status === "under_construction" || fort.status === "removing")) {
    if (fort.status === "removing") {
      tile.fort = { ...fort, status: "active" };
      delete tile.fort.completesAt;
    } else if (fort.upgradingFrom) {
      tile.fort = {
        ownerId: fort.ownerId,
        status: "active",
        variant: fort.upgradingFrom,
        ...(fort.disabledUntil !== undefined ? { disabledUntil: fort.disabledUntil } : {})
      };
    } else {
      delete tile.fort;
    }
    return;
  }
  for (const field of ["observatory", "siegeOutpost", "economicStructure"] as const) {
    const structure = tile[field];
    if (!structure || (structure.status !== "under_construction" && structure.status !== "removing")) continue;
    if (structure.status === "under_construction") {
      delete tile[field];
    } else {
      const { completesAt: _completesAt, ...rest } = structure;
      Object.assign(tile, { [field]: { ...rest, status: "active" } });
    }
    return;
  }
};
