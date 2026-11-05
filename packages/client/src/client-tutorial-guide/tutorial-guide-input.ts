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
import { GUIDE_STEPS, RECOMMENDED_FIRST_MANIFEST_ID, type GuideInput } from "./tutorial-guide-steps.js";
import { readGuideProgress } from "./tutorial-guide-storage.js";
import { findHomeAfcTile } from "../client-afc-locate/client-afc-locate.js";
import { isMeetablePlayerId } from "../client-alliance/client-met-players.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { scanGuideFootholdTargets, type GuideFootholdTargets } from "./tutorial-guide-foothold-targets.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
import { bestRelayBeaconSites } from "../client-relay-beacon-site/client-relay-beacon-site.js";

export type GuideInputState = Pick<
  ClientState,
  | "tiles"
  | "tilesRevision"
  | "chunkFullCount"
  | "me"
  | "authEmail"
  | "activePanel"
  | "mobilePanel"
  | "activityDashboard"
  | "techIds"
  | "techRootId"
  | "bridgeDebugSeasonId"
  | "homeTile"
  | "outgoingTruceRequests"
  | "activeTruces"
  | "allies"
>;

const MAX_BUILD_TARGETS = 6;
const MAX_MUSTER_TARGETS = 6;

type TileScan = {
  /** The recommended Manifest's module is docked on an active AFC the player owns (what the tile menu requires). */
  manufactoryInstalled: boolean;
  /** Another House's land (not Planetary Defense) is among the known tiles. */
  rivalHouseMet: boolean;
  ownsBuiltStructure: boolean;
  ownsRelayBeacon: boolean;
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
  let ownsRelayBeacon = false;
  let ownsMusterFlag = false;
  let manufactoryInstalled = false;
  let rivalHouseMet = false;
  const buildCandidates: Array<{ x: number; y: number }> = [];
  const musterCandidates: Array<{ x: number; y: number }> = [];
  for (const tile of tiles.values()) {
    if (isMeetablePlayerId(tile.ownerId, me)) rivalHouseMet = true;
    if (tile.ownerId !== me) continue;
    if (isOwnBuiltStructure(tile, me)) ownsBuiltStructure = true;
    if (tile.economicStructure?.type === "RELAY_BEACON") ownsRelayBeacon = true;
    if (tile.muster?.ownerId === me) ownsMusterFlag = true;
    if (!isOwnSettled(tile, me)) continue;
    if (tile.afc?.status === "active" && tile.afc.modules?.includes(RECOMMENDED_FIRST_MANIFEST_ID)) manufactoryInstalled = true;
    // A Manufactory goes on a garrisoned town tile or its support ring; the town itself is the clearest target.
    // Not the spawn SETTLEMENT: settlements can't support economic structures (runtime-structure-town-support-target.ts).
    const town = townIdentityForTile(tile);
    if (town && town.populationTier !== "SETTLEMENT") buildCandidates.push({ x: tile.x, y: tile.y });
    if (!tile.muster && touchesOtherOwner(tiles, tile, me)) musterCandidates.push({ x: tile.x, y: tile.y });
  }
  const byDistance = distanceFrom(home);
  const nearest = (list: Array<{ x: number; y: number }>, limit: number) => list.sort((a, b) => byDistance(a) - byDistance(b)).slice(0, limit);
  return {
    manufactoryInstalled,
    rivalHouseMet,
    ownsBuiltStructure,
    ownsRelayBeacon,
    ownsMusterFlag,
    buildTargetTiles: nearest(buildCandidates, MAX_BUILD_TARGETS),
    musterTargetTiles: nearest(musterCandidates, MAX_MUSTER_TARGETS)
  };
};

// Muster unlock is stored in localStorage and flips only when a newly seen tile
// belongs to someone else, i.e. on a tile change, so it is cached alongside the scan.
// Keyed on chunkFullCount as well as tilesRevision: chunk loads (CHUNK_FULL /
// CHUNK_BATCH) write state.tiles without bumping tilesRevision, and a newly
// loaded chunk is exactly how "Find a town" / "Find food" complete.
let cached:
  | {
      revision: number;
      chunks: number;
      me: string;
      footholdSaved: boolean;
      checklist: OnboardingChecklistState;
      scan: TileScan;
      footholdTargets: GuideFootholdTargets;
      musterUnlocked: boolean;
      afcTile: { x: number; y: number } | undefined;
      /** Filled on first use: only the Relay Beacon step reads it, so other steps skip the reach scan. */
      beaconSite?: { value: { x: number; y: number } | undefined };
    }
  | undefined;

/** Best Relay Beacon site for the most new reach; skipped (a reach scan) once the player has a beacon and the step is done. */
const beaconSiteOf = (tiles: ReadonlyMap<string, Tile>, me: string, ownsRelayBeacon: boolean): { x: number; y: number } | undefined => {
  if (ownsRelayBeacon) return undefined;
  const [site] = bestRelayBeaconSites(tiles, me, { reach: computeLocalReachSet(tiles, me), limit: 1 });
  return site ? { x: site.x, y: site.y } : undefined;
};

/** The new desktop HUD (HUD v2) marks the body; its full-screen views add `hud-v2-screen-<id>` (client-hud-v2-context.ts). */
const bodyHasClass = (cls: string): boolean => typeof document !== "undefined" && document.body.classList.contains(cls);

/**
 * The panel the player has open: the desktop side panel, a mobile panel other
 * than the default "core", or HUD v2's Manifest screen (which clears
 * activePanel and is tracked only by its body class), reported as "tech".
 */
const openPanelOf = (state: GuideInputState): string | null =>
  state.activePanel ??
  (state.mobilePanel !== "core"
    ? state.mobilePanel
    : bodyHasClass("hud-v2-screen-manifest")
      ? "tech"
      : bodyHasClass("hud-v2-screen-diplomacy")
        ? "alliance"
        : null);

const afcTileOf = (state: GuideInputState): { x: number; y: number } | undefined => {
  const afc = findHomeAfcTile(state);
  return afc ? { x: afc.x, y: afc.y } : state.homeTile;
};

const FOOTHOLD_STEP_IDS = GUIDE_STEPS.filter((step) => step.chapter === "foothold").map((step) => step.id);

/** Every "A foothold" step is in the guide's own saved progress (done, or skipped). */
const footholdStepsSaved = (authEmail: string | null | undefined): boolean => {
  const saved = new Set(readGuideProgress(authEmail).steps);
  return FOOTHOLD_STEP_IDS.every((id) => saved.has(id));
};

export const buildGuideInput = (state: GuideInputState): GuideInput => {
  const footholdSaved = footholdStepsSaved(state.authEmail);
  if (
    !cached ||
    cached.revision !== state.tilesRevision ||
    cached.chunks !== state.chunkFullCount ||
    cached.me !== state.me ||
    cached.footholdSaved !== footholdSaved
  ) {
    cached = {
      revision: state.tilesRevision,
      chunks: state.chunkFullCount,
      me: state.me,
      footholdSaved,
      // Judged from the live tiles, not the checklist's account-wide saved flag, until the guide's
      // own foothold steps are saved; then a constant DONE, so later chapters skip the reach scan.
      checklist: onboardingChecklistState(state.tiles, state.me, state.authEmail, { completed: footholdSaved }),
      scan: scanGuideTiles(state.tiles, state.me, state.homeTile),
      footholdTargets: scanGuideFootholdTargets(state.tiles.values(), state.me, distanceFrom(state.homeTile)),
      musterUnlocked: isMusterUnlocked(state.authEmail, state.bridgeDebugSeasonId),
      afcTile: afcTileOf(state)
    };
  }
  const current = cached;
  const signals = guideInputSignals();
  const openPanel = openPanelOf(state);
  return {
    checklist: cached.checklist,
    footholdTargets: cached.footholdTargets,
    panned: signals.panned,
    zoomed: signals.zoomed,
    tileSelected: signals.tileSelected,
    openPanel,
    hudV2: bodyHasClass("hud-v2"),
    activityDashboardOpen: state.activityDashboard.open || state.activityDashboard.chronicleOpen,
    manifestCount: state.techIds.filter((id) => id !== state.techRootId).length,
    manufactoryResearched: state.techIds.includes(RECOMMENDED_FIRST_MANIFEST_ID),
    manufactoryUnlocked: cached.scan.manufactoryInstalled,
    afcTile: cached.afcTile,
    rivalHouseMet: cached.scan.rivalHouseMet,
    diplomacyUsed: openPanel === "alliance" || openPanel === "social" || state.outgoingTruceRequests.length > 0 || state.activeTruces.length > 0 || state.allies.length > 0,
    ownsBuiltStructure: cached.scan.ownsBuiltStructure,
    ownsRelayBeacon: cached.scan.ownsRelayBeacon,
    beaconSite: () => {
      current.beaconSite ??= { value: beaconSiteOf(state.tiles, state.me, current.scan.ownsRelayBeacon) };
      return current.beaconSite.value;
    },
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
