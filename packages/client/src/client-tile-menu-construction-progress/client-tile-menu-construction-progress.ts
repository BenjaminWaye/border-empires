// constructionProgressForTile moved out of client-tile-menu-view.ts (which
// is already over the repo's 500-line file-growth cap) so this file can grow
// independently. Re-exported from client-tile-menu-view.ts so existing
// importers of that path don't need to change.
import {
  FORT_TIER_LADDER,
  FORT_VARIANT_LABELS,
  RELAY_BEACON_FIRST_TIER_COUNT,
  SIEGE_TIER_LADDER,
  economicStructureBuildDurationMs,
  fortRemovalDurationMs,
  siegeOutpostRemovalDurationMs,
  structureBuildDurationMs,
  structureBuildDurationMsForManpowerCost,
  structureBuildManpowerCost,
  structureRemovalDurationMs,
  type EconomicStructureType
} from "@border-empires/shared";
import { rushBuyLabel, type QuickforgeRushBuyContext } from "../client-tile-menu-view/client-tile-menu-quickforge-rush-buy.js";
import { economicStructureBuildMs, economicStructureName } from "../client-map-display.js";
import { constructionSiteForTile } from "../client-construction-phase/client-construction-phase.js";
import type { Tile, TileMenuProgressView } from "../client-types.js";
import { constructionClockMs } from "../client-construction-remaining-ms/client-construction-remaining-ms.js";

// Fallback windows for records that predate startedAt: build time is 1s per
// manpower point of the tier being built, removal 0.5s per point of what's
// being torn down (the same shared helpers the simulation stamps
// completesAt with in runtime-structure-*-command-handlers.ts).
const fortBuildEstimateMs = (tile: Tile): number =>
  structureBuildDurationMsForManpowerCost(FORT_TIER_LADDER[tile.fort?.variant ?? "FORT"].manpower);
const siegeBuildEstimateMs = (tile: Tile): number =>
  structureBuildDurationMsForManpowerCost(SIEGE_TIER_LADDER[tile.siegeOutpost?.variant ?? "SIEGE_OUTPOST"].manpower);

// The server stamps the real construction window (startedAt..completesAt), which
// depends on tier upgrades, build-speed effects and manpower cost; use it when
// present so this ring agrees with the on-map construction phases. Records that
// predate startedAt keep the caller's per-type estimate.
type ConstructionField = "fort" | "observatory" | "siegeOutpost" | "economicStructure";
const exactProgress = (tile: Tile, field: ConstructionField, nowMs: number): number | undefined =>
  typeof tile[field]?.startedAt === "number" ? constructionSiteForTile(tile, nowMs, field)?.fraction : undefined;

// Rush-buy is priced on the fraction of the build still remaining, so it needs the
// real build window: the server-stamped startedAt..completesAt when present, else a
// manpower-derived estimate. The flat *_BUILD_MS constants are pre-D9 and don't
// match real build times (rushes measured against them were mispriced).
const rushWindowMs = (structure: { startedAt?: number | undefined; completesAt?: number | undefined }, estimateMs: number): number =>
  typeof structure.startedAt === "number" && typeof structure.completesAt === "number" && structure.completesAt > structure.startedAt
    ? structure.completesAt - structure.startedAt
    : estimateMs;

// The owned count is unknown here, and a Relay Beacon's count-0 duration is 0 (the
// first five are instant), which priced a real, paid-tier beacon build's rush at 0.
const economicBuildEstimateMs = (type: EconomicStructureType): number =>
  type === "RELAY_BEACON" ? economicStructureBuildDurationMs(type, RELAY_BEACON_FIRST_TIER_COUNT) : economicStructureBuildMs(type);

// Cancel / rush-buy only make sense on the viewer's own construction; on a
// foreign tile the card is informational (timer + progress) with no actions.
export const constructionProgressForTile = (
  tile: Tile,
  formatCountdownClock: (ms: number) => string,
  quickforge: QuickforgeRushBuyContext,
  viewerId: string
): TileMenuProgressView | undefined => {
  const progress = ownConstructionProgressForTile(tile, formatCountdownClock, quickforge);
  if (!progress || tile.ownerId === viewerId) return progress;
  const { cancelLabel: _cancelLabel, cancelActionId: _cancelActionId, rushBuyLabel: _rushBuyLabel, rushBuyActionId: _rushBuyActionId, ...readOnly } = progress;
  return readOnly;
};

const ownConstructionProgressForTile = (
  tile: Tile,
  formatCountdownClock: (ms: number) => string,
  quickforge: QuickforgeRushBuyContext
): TileMenuProgressView | undefined => withPausedModifier(tile, activeConstructionProgressForTile(tile, formatCountdownClock, quickforge));

const PAUSED_NOTE = "Paused due to an ongoing attack on this tile. Construction resumes when the battle resolves.";

// A build the server paused because its tile is under attack: the countdown is
// frozen, so say so, and drop rush-buy (the server refuses it while paused).
const withPausedModifier = (tile: Tile, progress: TileMenuProgressView | undefined): TileMenuProgressView | undefined => {
  if (!progress) return progress;
  const isPaused = [tile.fort, tile.observatory, tile.siegeOutpost, tile.economicStructure].some(
    (candidate) => candidate?.status === "under_construction" && candidate.pausedAt !== undefined
  );
  if (!isPaused) return progress;
  const { rushBuyLabel: _rushBuyLabel, rushBuyActionId: _rushBuyActionId, ...rest } = progress;
  return { ...rest, remainingLabel: `${progress.remainingLabel} · Paused: ongoing attack`, note: PAUSED_NOTE };
};

const activeConstructionProgressForTile = (
  tile: Tile,
  formatCountdownClock: (ms: number) => string,
  quickforge: QuickforgeRushBuyContext
): TileMenuProgressView | undefined => {
  const nowMs = Date.now();
  if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - constructionClockMs(tile.fort));
    const standing = tile.fort.upgradingFrom;
    return {
      title: standing ? `Upgrading to ${FORT_VARIANT_LABELS[tile.fort.variant ?? "FORT"]}` : "Fortification under construction",
      detail: standing
        ? `The current ${FORT_VARIANT_LABELS[standing]} keeps defending this tile until the upgrade completes.`
        : "This tile will gain fortified defense when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "fort", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, fortBuildEstimateMs(tile)))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(
        remaining,
        rushWindowMs(tile.fort, fortBuildEstimateMs(tile)),
        FORT_TIER_LADDER[tile.fort.variant ?? "FORT"].manpower,
        quickforge
      ),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.fort?.status === "removing" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Removing Fort",
      detail: "This fortification is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "fort", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, fortRemovalDurationMs(tile.fort.variant)))),
      note: "Defense from this fort is disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - constructionClockMs(tile.observatory));
    return {
      title: "Aether Tower under construction",
      detail: "This tile will extend vision and aether tower protection when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "observatory", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("OBSERVATORY")))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, rushWindowMs(tile.observatory, structureBuildDurationMs("OBSERVATORY")), structureBuildManpowerCost("OBSERVATORY"), quickforge),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.observatory?.status === "removing" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Removing Aether Tower",
      detail: "This aether tower is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "observatory", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureRemovalDurationMs("OBSERVATORY")))),
      note: "Vision, aether tower protection, and crystal-casting effects are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - constructionClockMs(tile.siegeOutpost));
    return {
      title: "Siege camp under construction",
      detail: "This tile will gain an offensive staging structure when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "siegeOutpost", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, siegeBuildEstimateMs(tile)))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(
        remaining,
        rushWindowMs(tile.siegeOutpost, siegeBuildEstimateMs(tile)),
        SIEGE_TIER_LADDER[tile.siegeOutpost.variant ?? "SIEGE_OUTPOST"].manpower,
        quickforge
      ),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.siegeOutpost?.status === "removing" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Removing Siege Battery",
      detail: "This outpost is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "siegeOutpost", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, siegeOutpostRemovalDurationMs(tile.siegeOutpost.variant)))),
      note: "Attack bonuses from this outpost are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - constructionClockMs(tile.economicStructure));
    const buildMs = economicBuildEstimateMs(tile.economicStructure.type);
    return {
      title: `${economicStructureName(tile.economicStructure.type)} under construction`,
      detail: "This tile is still being developed and is not fully online yet.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "economicStructure", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, buildMs))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, rushWindowMs(tile.economicStructure, buildMs), structureBuildManpowerCost(tile.economicStructure.type), quickforge),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.economicStructure?.status === "removing" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    return {
      title: `Removing ${economicStructureName(tile.economicStructure.type)}`,
      detail: "This building is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: exactProgress(tile, "economicStructure", nowMs) ?? Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureRemovalDurationMs(tile.economicStructure.type)))),
      note: "Income, upkeep, and structure effects are paused while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  return undefined;
};
