// Builds the guide's GuideInput from ClientState. The tile scans (checklist
// state, owned structures, build and muster targets) walk every known tile,
// so they are cached per tiles revision and only recomputed when tiles
// actually change; the cheap fields (panels, Manifests, input signals) are
// read fresh on every call.

import { tileKey, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { onboardingChecklistState, type OnboardingChecklistState } from "../client-onboarding-checklist/client-onboarding-checklist.js";
import { isMusterUnlocked } from "../client-muster-unlock/client-muster-unlock-storage.js";
import { guideInputSignals } from "./tutorial-guide-input-signals.js";
import type { GuideInput } from "./tutorial-guide-steps.js";

export type GuideInputState = Pick<
  ClientState,
  "tiles" | "tilesRevision" | "me" | "authEmail" | "activePanel" | "mobilePanel" | "activityDashboard" | "techIds" | "techRootId" | "bridgeDebugSeasonId" | "homeTile"
>;

const MAX_BUILD_TARGETS = 6;
const MAX_MUSTER_TARGETS = 6;

type TileScan = {
  ownsBuiltStructure: boolean;
  ownsMusterFlag: boolean;
  buildTargetTiles: Array<{ x: number; y: number }>;
  musterTargetTiles: Array<{ x: number; y: number }>;
};

const NEIGHBOUR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const;

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const isOwnSettled = (tile: Tile, me: string): boolean => tile.ownerId === me && tile.ownershipState === "SETTLED" && !tile.optimisticPending;

/** A structure the player built or is building, other than a Relay Beacon (which needs no Manifest). */
const isOwnBuiltStructure = (tile: Tile, me: string): boolean =>
  tile.ownerId === me && ((tile.economicStructure !== undefined && tile.economicStructure.type !== "RELAY_BEACON") || tile.fort !== undefined);

const touchesOtherOwner = (tiles: ReadonlyMap<string, Tile>, tile: Tile, me: string): boolean =>
  NEIGHBOUR_OFFSETS.some(([dx, dy]) => {
    const neighbour = tiles.get(tileKey(wrap(tile.x + dx, WORLD_WIDTH), wrap(tile.y + dy, WORLD_HEIGHT)));
    return Boolean(neighbour?.ownerId && neighbour.ownerId !== me);
  });

const distanceFrom = (home: { x: number; y: number } | undefined) => (t: { x: number; y: number }): number =>
  home ? Math.abs(t.x - home.x) + Math.abs(t.y - home.y) : 0;

export const scanGuideTiles = (tiles: ReadonlyMap<string, Tile>, me: string, home: { x: number; y: number } | undefined): TileScan => {
  let ownsBuiltStructure = false;
  let ownsMusterFlag = false;
  const buildCandidates: Array<{ x: number; y: number }> = [];
  const musterCandidates: Array<{ x: number; y: number }> = [];
  for (const tile of tiles.values()) {
    if (tile.ownerId !== me) continue;
    if (isOwnBuiltStructure(tile, me)) ownsBuiltStructure = true;
    if (tile.muster?.ownerId === me) ownsMusterFlag = true;
    if (!isOwnSettled(tile, me)) continue;
    if (tile.resource && !tile.economicStructure && !tile.fort && !tile.town) buildCandidates.push({ x: tile.x, y: tile.y });
    if (!tile.muster && touchesOtherOwner(tiles, tile, me)) musterCandidates.push({ x: tile.x, y: tile.y });
  }
  const byDistance = distanceFrom(home);
  const nearest = (list: Array<{ x: number; y: number }>, limit: number) => list.sort((a, b) => byDistance(a) - byDistance(b)).slice(0, limit);
  return {
    ownsBuiltStructure,
    ownsMusterFlag,
    buildTargetTiles: nearest(buildCandidates, MAX_BUILD_TARGETS),
    musterTargetTiles: nearest(musterCandidates, MAX_MUSTER_TARGETS)
  };
};

// Muster unlock is stored in localStorage and flips only when a newly seen tile
// belongs to someone else, i.e. on a tile change, so it is cached alongside the scan.
let cached: { revision: number; me: string; checklist: OnboardingChecklistState; scan: TileScan; musterUnlocked: boolean } | undefined;

/** The panel the player has open: the desktop side panel, or a mobile panel other than the default "core". */
const openPanelOf = (state: GuideInputState): string | null => state.activePanel ?? (state.mobilePanel !== "core" ? state.mobilePanel : null);

export const buildGuideInput = (state: GuideInputState): GuideInput => {
  if (!cached || cached.revision !== state.tilesRevision || cached.me !== state.me) {
    cached = {
      revision: state.tilesRevision,
      me: state.me,
      checklist: onboardingChecklistState(state.tiles, state.me, state.authEmail),
      scan: scanGuideTiles(state.tiles, state.me, state.homeTile),
      musterUnlocked: isMusterUnlocked(state.authEmail, state.bridgeDebugSeasonId)
    };
  }
  const signals = guideInputSignals();
  return {
    checklist: cached.checklist,
    panned: signals.panned,
    zoomed: signals.zoomed,
    tileSelected: signals.tileSelected,
    openPanel: openPanelOf(state),
    activityDashboardOpen: state.activityDashboard.open || state.activityDashboard.chronicleOpen,
    manifestCount: state.techIds.filter((id) => id !== state.techRootId).length,
    ownsBuiltStructure: cached.scan.ownsBuiltStructure,
    buildTargetTiles: cached.scan.buildTargetTiles,
    musterUnlocked: cached.musterUnlocked,
    ownsMusterFlag: cached.scan.ownsMusterFlag,
    musterTargetTiles: cached.scan.musterTargetTiles
  };
};

/** Test-only: drops the per-revision tile-scan cache. */
export const resetGuideInputCacheForTests = (): void => {
  cached = undefined;
};
