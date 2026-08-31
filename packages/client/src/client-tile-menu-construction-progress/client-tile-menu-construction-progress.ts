// constructionProgressForTile moved out of client-tile-menu-view.ts (which
// is already over the repo's 500-line file-growth cap) so this file can grow
// independently. Re-exported from client-tile-menu-view.ts so existing
// importers of that path don't need to change.
import {
  FORT_BUILD_MS,
  FORT_TIER_LADDER,
  OBSERVATORY_BUILD_MS,
  SIEGE_OUTPOST_BUILD_MS,
  SIEGE_TIER_LADDER,
  structureBuildDurationMs,
  structureBuildManpowerCost
} from "@border-empires/shared";
import { rushBuyLabel, type QuickforgeRushBuyContext } from "../client-tile-menu-view/client-tile-menu-quickforge-rush-buy.js";
import { economicStructureBuildMs, economicStructureName } from "../client-map-display.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";

export const constructionProgressForTile = (
  tile: Tile,
  formatCountdownClock: (ms: number) => string,
  quickforge: QuickforgeRushBuyContext
): TileMenuProgressView | undefined => {
  const nowMs = Date.now();
  if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Fortification under construction",
      detail: "This tile will gain fortified defense when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, FORT_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, FORT_BUILD_MS, FORT_TIER_LADDER[tile.fort.variant ?? "FORT"].manpower, quickforge),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.fort?.status === "removing" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Removing Fort",
      detail: "This fortification is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("FORT")))),
      note: "Defense from this fort is disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Aether Tower under construction",
      detail: "This tile will extend vision and aether tower protection when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, OBSERVATORY_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, OBSERVATORY_BUILD_MS, structureBuildManpowerCost("OBSERVATORY"), quickforge),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.observatory?.status === "removing" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Removing Aether Tower",
      detail: "This aether tower is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("OBSERVATORY")))),
      note: "Vision, aether tower protection, and crystal-casting effects are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Siege camp under construction",
      detail: "This tile will gain an offensive staging structure when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, SIEGE_OUTPOST_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, SIEGE_OUTPOST_BUILD_MS, SIEGE_TIER_LADDER[tile.siegeOutpost.variant ?? "SIEGE_OUTPOST"].manpower, quickforge),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.siegeOutpost?.status === "removing" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Removing Siege Outpost",
      detail: "This outpost is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("SIEGE_OUTPOST")))),
      note: "Attack bonuses from this outpost are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    const buildMs = economicStructureBuildMs(tile.economicStructure.type);
    return {
      title: `${economicStructureName(tile.economicStructure.type)} under construction`,
      detail: "This tile is still being developed and is not fully online yet.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, buildMs))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, buildMs, structureBuildManpowerCost(tile.economicStructure.type), quickforge),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.economicStructure?.status === "removing" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    return {
      title: `Removing ${economicStructureName(tile.economicStructure.type)}`,
      detail: "This building is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, economicStructureBuildMs(tile.economicStructure.type)))),
      note: "Income, upkeep, and structure effects are paused while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  return undefined;
};
