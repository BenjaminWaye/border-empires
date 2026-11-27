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
import { structureSlotRequirements } from "@border-empires/shared";
import { readyAfcUpgradeCount } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import { isMeetablePlayerId } from "../client-alliance/client-met-players.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { scanGuideFootholdTargets, type GuideFootholdTargets } from "./tutorial-guide-foothold-targets.js";
import { createGuideTownRouteCheck } from "./tutorial-guide-town-route.js";
import { guideLandDock, type GuideLandDock } from "./tutorial-guide-island-dock.js";
import { guideDockLead, type GuideDockLead } from "./tutorial-guide-dock-lead.js";
import { resolveMyReach, serverReachKey } from "../client-reach-authoritative/client-reach-authoritative.js";
import { bestRelayBeaconSites } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { GUIDE_EXPLORE_MAX_FLIGHTS, guideExploreTarget, guideScoutStatus } from "./tutorial-guide-explore-target.js";
import { scoutChargesReady, scoutLaunchAfc } from "../client-scout-drone/client-scout-drone-plan.js";
import { leadRouteLegs } from "../client-scout-drone/client-scout-drone-lead-route.js";
import { guideAttackLaunched, guideAttackTargets, guideTruceStage, type GuideAttackCandidate, type GuideContestState } from "./tutorial-guide-contest-input.js";

export type GuideInputState = Pick<
  ClientState,
  | "tiles"
  | "resourceSlots"
  | "tilesRevision"
  | "chunkFullCount"
  | "me"
  | "authEmail"
  | "activePanel"
  | "activityDashboard"
  | "techIds"
  | "techRootId"
  | "bridgeDebugSeasonId"
  | "homeTile"
  | "outgoingTruceRequests"
  | "activeTruces"
  | "allies"
  | "resourceSlots"
  | "domainIds"
  | "domainCatalog"
  | "domainChoices"
  | "afcUpgradeRuleset"
  | "afcUpgradeInstallAllowed"
  | "techCatalog"
  | "gold"
  | "strategicResources"
  | "pendingDomainUnlockId"
  | "serverReach"
  | "serverReachRevision"
  | "manpower"
  | "manpowerCap"
  | "scoutDroneFlight"
  | "afcRecovery"
  | "discoveredTiles"
  | "guideTownLead"
  | "scoutDroneCharges"
  | "dockPairs"
> &
  GuideContestState;

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
  /** Manifests a Waystation granted this player for free (its TECH effect): owned, but never commissioned. */
  waystationGiftTechIds: Set<string>;
  buildTargetTiles: Array<{ x: number; y: number }>;
  musterTargetTiles: Array<{ x: number; y: number }>;
  /** Other owners' land tiles touching the player's land: Planetary Defense or a rival to attack. */
  attackCandidates: GuideAttackCandidate[];
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

const touchesMine = (tiles: ReadonlyMap<string, Tile>, tile: Tile, me: string): boolean =>
  NEIGHBOUR_OFFSETS.some(([dx, dy]) => tiles.get(tileKey(wrap(tile.x + dx, WORLD_WIDTH), wrap(tile.y + dy, WORLD_HEIGHT)))?.ownerId === me);

/** A border tile: a land neighbour isn't the player's (neutral, another owner's, or not yet seen). */
const touchesLandNotMine = (tiles: ReadonlyMap<string, Tile>, tile: Tile, me: string): boolean =>
  NEIGHBOUR_OFFSETS.some(([dx, dy]) => {
    const neighbour = tiles.get(tileKey(wrap(tile.x + dx, WORLD_WIDTH), wrap(tile.y + dy, WORLD_HEIGHT)));
    return !neighbour || (neighbour.terrain === "LAND" && neighbour.ownerId !== me);
  });

const distanceFrom = (home: { x: number; y: number } | undefined) => (t: { x: number; y: number }): number =>
  home ? Math.abs(t.x - home.x) + Math.abs(t.y - home.y) : 0;

export const scanGuideTiles = (tiles: ReadonlyMap<string, Tile>, me: string, home: { x: number; y: number } | undefined): TileScan => {
  let ownsBuiltStructure = false;
  let ownsRelayBeacon = false;
  let ownsMusterFlag = false;
  let manufactoryInstalled = false;
  let rivalHouseMet = false;
  const waystationGiftTechIds = new Set<string>();
  const buildCandidates: Array<{ x: number; y: number }> = [];
  const musterCandidates: Array<{ x: number; y: number }> = [];
  const attackCandidates: GuideAttackCandidate[] = [];
  // When no border tile touches another owner (Planetary Defense or a rival was only seen
  // across neutral land), any border tile can raise a flag: point at the ones facing them.
  const borderCandidates: Array<{ x: number; y: number }> = [];
  const byHomeDistance = distanceFrom(home);
  let nearestOther: { x: number; y: number } | undefined;
  for (const tile of tiles.values()) {
    if (isMeetablePlayerId(tile.ownerId, me)) rivalHouseMet = true;
    // The activation record stays on the tile, whoever owns it now.
    const waystation = tile.waystation;
    if (waystation?.activated && waystation.activatedByPlayerId === me && waystation.grantedTechId) waystationGiftTechIds.add(waystation.grantedTechId);
    if (tile.ownerId && tile.ownerId !== me && (!nearestOther || byHomeDistance(tile) < byHomeDistance(nearestOther))) nearestOther = tile;
    if (tile.ownerId && tile.ownerId !== me && tile.terrain === "LAND" && touchesMine(tiles, tile, me)) attackCandidates.push({ x: tile.x, y: tile.y, ownerId: tile.ownerId });
    if (tile.ownerId !== me) continue;
    if (isOwnBuiltStructure(tile, me)) ownsBuiltStructure = true;
    if (tile.economicStructure?.type === "RELAY_BEACON") ownsRelayBeacon = true;
    if (tile.muster?.ownerId === me) ownsMusterFlag = true;
    // Any own land can hold a flag (client-muster-tile-actions.ts), FRONTIER included: a settled
    // core ringed by fresh claims has its border on the FRONTIER tiles.
    const flagFree = !tile.muster && tile.terrain === "LAND" && !tile.optimisticPending;
    if (flagFree && musterCandidates.length === 0 && touchesLandNotMine(tiles, tile, me)) borderCandidates.push({ x: tile.x, y: tile.y });
    if (!isOwnSettled(tile, me)) continue;
    if (tile.afc?.status === "active" && tile.afc.modules?.includes(RECOMMENDED_FIRST_MANIFEST_ID)) manufactoryInstalled = true;
    // A Manufactory goes on a garrisoned town tile or its support ring; the town itself is the clearest target.
    // Not the spawn SETTLEMENT: settlements can't support economic structures (runtime-structure-town-support-target.ts).
    const town = townIdentityForTile(tile);
    if (town && town.populationTier !== "SETTLEMENT") buildCandidates.push({ x: tile.x, y: tile.y });
    if (flagFree && touchesOtherOwner(tiles, tile, me)) musterCandidates.push({ x: tile.x, y: tile.y });
  }
  const nearest = (list: Array<{ x: number; y: number }>, limit: number, from = home) => {
    const byDistance = distanceFrom(from);
    return list.sort((a, b) => byDistance(a) - byDistance(b)).slice(0, limit);
  };
  return {
    manufactoryInstalled,
    rivalHouseMet,
    ownsBuiltStructure,
    ownsRelayBeacon,
    ownsMusterFlag,
    waystationGiftTechIds,
    buildTargetTiles: nearest(buildCandidates, MAX_BUILD_TARGETS),
    musterTargetTiles:
      musterCandidates.length > 0 ? nearest(musterCandidates, MAX_MUSTER_TARGETS) : nearest(borderCandidates, MAX_MUSTER_TARGETS, nearestOther ?? home),
    attackCandidates
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
      reachKey: string;
      me: string;
      footholdSaved: boolean;
      checklist: OnboardingChecklistState;
      scan: TileScan;
      footholdTargets: GuideFootholdTargets;
      musterUnlocked: boolean;
      landDock: GuideLandDock | undefined;
      /** Filled on first use: only a town lead too far for one drone leg, with no dock on the player's land, asks for it. */
      dockLead?: { value: GuideDockLead | undefined; discovered: number };
      /** Filled on first use: only the Relay Beacon step reads it, so other steps skip the reach scan. */
      beaconSite?: { value: { x: number; y: number } | undefined };
    }
  | undefined;

/** Best Relay Beacon site for the most new reach; skipped (a reach scan) once the player has a beacon and the step is done. */
const beaconSiteOf = (tiles: ReadonlyMap<string, Tile>, me: string, ownsRelayBeacon: boolean, reach: ReadonlySet<string>): { x: number; y: number } | undefined => {
  if (ownsRelayBeacon) return undefined;
  const [site] = bestRelayBeaconSites(tiles, me, { reach, limit: 1 });
  return site ? { x: site.x, y: site.y } : undefined;
};

/** The server's town lead, only while its tile is still fog: once seen, the town targets take over. */
const townLeadInFog = (state: GuideInputState): Pick<GuideInput, "townLead" | "townLeadChargesShort" | "townLeadFar"> => {
  const lead = state.guideTownLead;
  if (!lead) return {};
  const key = tileKey(lead.x, lead.y);
  if (state.discoveredTiles.has(key) || state.tiles.has(key)) return {};
  // Every flight starts at the AFC. A town more than one leg away is no drone target: the player is
  // probably on an island, and the guide steers to a dock instead (owner, 2026-11-27).
  const launch = scoutLaunchAfc(state, lead);
  const legs = launch ? leadRouteLegs(launch, lead) : 1;
  if (legs > 1) return { townLeadFar: true };
  const short = launch ? legs - scoutChargesReady(state, Date.now()) : 0;
  return { townLead: lead, townLeadChargesShort: Math.max(0, short) };
};

/** The dock to steer to: on a fully seen island, or on any land mass once the nearest town is more than a leg away. */
const islandDockOf = (landDock: GuideLandDock | undefined, townLeadFar: boolean | undefined): Pick<GuideInput, "islandDock" | "islandSealed" | "dockLead"> =>
  landDock && (landDock.sealed || townLeadFar) ? { islandDock: landDock.dock, islandSealed: landDock.sealed } : {};

// The explore target scans rings of discoveredTiles around home. A drone flight grows that set
// without touching tiles, so it is cached on the set's size and home, not on the tiles revision.
let exploreCache: { size: number; homeKey: string; value: { x: number; y: number } | undefined } | undefined;

// Distinct drone flights seen this session (by launch time), per player, capped: after
// GUIDE_EXPLORE_MAX_FLIGHTS the town and food steps stop asking for Explore.
let flightsSeen: { me: string; launches: Set<number> } = { me: "", launches: new Set() };

const scoutFlightsOf = (state: GuideInputState): number => {
  if (flightsSeen.me !== state.me) flightsSeen = { me: state.me, launches: new Set() };
  const flight = state.scoutDroneFlight;
  if (flight && flightsSeen.launches.size < GUIDE_EXPLORE_MAX_FLIGHTS) flightsSeen.launches.add(flight.launchedAt);
  return flightsSeen.launches.size;
};

const exploreTargetOf = (state: GuideInputState): { x: number; y: number } | undefined => {
  const homeKey = state.homeTile ? tileKey(state.homeTile.x, state.homeTile.y) : "";
  if (!exploreCache || exploreCache.size !== state.discoveredTiles.size || exploreCache.homeKey !== homeKey) {
    exploreCache = { size: state.discoveredTiles.size, homeKey, value: guideExploreTarget(state.discoveredTiles, state.homeTile) };
  }
  return exploreCache.value;
};

/** The new desktop HUD (HUD v2) marks the body; its full-screen views add `hud-v2-screen-<id>` (client-hud-v2-context.ts). */
const bodyHasClass = (cls: string): boolean => typeof document !== "undefined" && document.body.classList.contains(cls);

/**
 * The panel the player has open: the side panel, or HUD v2's Manifest screen (which clears
 * activePanel and is tracked only by its body class), reported as "tech".
 */
const openPanelOf = (state: GuideInputState): string | null =>
  state.activePanel ??
  (bodyHasClass("hud-v2-screen-manifest") ? "tech" : bodyHasClass("hud-v2-screen-diplomacy") ? "alliance" : null);


const FOOTHOLD_STEP_IDS = GUIDE_STEPS.filter((step) => step.chapter === "foothold").map((step) => step.id);

/** Every "A foothold" step is in the guide's own saved progress (done, or skipped). */
const footholdStepsSaved = (authEmail: string | null | undefined): boolean => {
  const saved = new Set(readGuideProgress(authEmail).steps);
  return FOOTHOLD_STEP_IDS.every((id) => saved.has(id));
};

/** A free FOOD slot for the Manufactory (the supply/demand gate in client-resource-slot-gate.ts). */
const foodSlotFreeFor = (state: GuideInputState): boolean => {
  const needed = structureSlotRequirements("MANUFACTORY").find((r) => r.resource === "FOOD")?.count ?? 1;
  return (state.resourceSlots?.supply.FOOD ?? 0) - (state.resourceSlots?.demand.FOOD ?? 0) >= needed;
};

/** Towns and food to point at; food only inside reach (the server's border once a REACH_UPDATE has arrived), towns only with an overland route. */
const footholdTargetsFor = (state: GuideInputState): GuideFootholdTargets => {
  const reach = resolveMyReach(state);
  const hasRoute = createGuideTownRouteCheck(state.tiles, state.me, state.dockPairs);
  return scanGuideFootholdTargets(state.tiles.values(), state.me, distanceFrom(state.homeTile), (x, y) => reach.has(tileKey(x, y)), hasRoute);
};

export const buildGuideInput = (state: GuideInputState): GuideInput => {
  const footholdSaved = footholdStepsSaved(state.authEmail);
  if (
    !cached ||
    cached.revision !== state.tilesRevision ||
    cached.chunks !== state.chunkFullCount ||
    cached.reachKey !== serverReachKey(state) ||
    cached.me !== state.me ||
    cached.footholdSaved !== footholdSaved
  ) {
    cached = {
      revision: state.tilesRevision,
      chunks: state.chunkFullCount,
      reachKey: serverReachKey(state),
      me: state.me,
      footholdSaved,
      // Judged from the live tiles, not the checklist's account-wide saved flag, until the guide's
      // own foothold steps are saved; then a constant DONE, so later chapters skip the reach scan.
      checklist: onboardingChecklistState(state.tiles, state.me, state.authEmail, { completed: footholdSaved, reach: resolveMyReach(state) }),
      scan: scanGuideTiles(state.tiles, state.me, state.homeTile),
      footholdTargets: footholdTargetsFor(state),
      // Only while the foothold is still being taught: a big empire's walk would just run out of budget.
      landDock: footholdSaved ? undefined : guideLandDock(state.tiles, state.me, state.homeTile),
      musterUnlocked: isMusterUnlocked(state.authEmail, state.bridgeDebugSeasonId)
    };
  }
  const current = cached;
  const lead = townLeadInFog(state);
  const dockSteer = islandDockOf(current.landDock, lead.townLeadFar);
  if (lead.townLeadFar && !dockSteer.islandDock) {
    // A drone flight grows discoveredTiles without a tiles change: recompute so the lead's Explore ask clears.
    if (current.dockLead?.discovered !== state.discoveredTiles.size) {
      const withinOneLeg = (dock: { x: number; y: number }): boolean => {
        const launch = scoutLaunchAfc(state, dock);
        return launch !== undefined && leadRouteLegs(launch, dock) <= 1;
      };
      current.dockLead = { value: guideDockLead(state.tiles, state.discoveredTiles, state.me, state.homeTile, state.dockPairs, withinOneLeg), discovered: state.discoveredTiles.size };
    }
    if (current.dockLead.value) dockSteer.dockLead = current.dockLead.value;
  }
  const signals = guideInputSignals();
  const openPanel = openPanelOf(state);
  return {
    checklist: cached.checklist,
    footholdTargets: cached.footholdTargets,
    panned: signals.panned,
    zoomed: signals.zoomed,
    openPanel,
    hudV2: bodyHasClass("hud-v2"),
    activityDashboardOpen: state.activityDashboard.open || state.activityDashboard.chronicleOpen,
    // A Waystation's free Manifest isn't one the player commissioned: it must not tick the Manifest steps.
    manifestCount: state.techIds.filter((id) => id !== state.techRootId && !current.scan.waystationGiftTechIds.has(id)).length,
    ...manifestPriceOf(state),
    manufactoryResearched: state.techIds.includes(RECOMMENDED_FIRST_MANIFEST_ID),
    manufactoryUnlocked: cached.scan.manufactoryInstalled,
    afcUpgradeReady: readyAfcUpgradeCount(state) > 0,
    afcUpgradeInstalled: state.domainIds.length > 0,
    foodSlotFree: foodSlotFreeFor(state),
    rivalHouseMet: cached.scan.rivalHouseMet,
    diplomacyUsed: openPanel === "alliance" || openPanel === "social" || state.outgoingTruceRequests.length > 0 || state.activeTruces.length > 0 || state.allies.length > 0,
    ownsBuiltStructure: cached.scan.ownsBuiltStructure,
    ownsRelayBeacon: cached.scan.ownsRelayBeacon,
    beaconSite: () => {
      current.beaconSite ??= { value: beaconSiteOf(state.tiles, state.me, current.scan.ownsRelayBeacon, resolveMyReach(state)) };
      return current.beaconSite.value;
    },
    buildTargetTiles: cached.scan.buildTargetTiles,
    musterUnlocked: cached.musterUnlocked,
    ownsMusterFlag: cached.scan.ownsMusterFlag,
    musterTargetTiles: cached.scan.musterTargetTiles,
    attackLaunched: guideAttackLaunched(state),
    attackTargetTiles: () => guideAttackTargets(current.scan.attackCandidates, state, distanceFrom(state.homeTile)),
    truceStage: guideTruceStage(state),
    manpower: { current: state.manpower, cap: state.manpowerCap },
    // No AFC (lost, awaiting a replacement): no drone to send, as in the unexplored tile menu.
    scout: guideScoutStatus(state.scoutDroneFlight, state.afcRecovery?.requiredSince === undefined, Date.now()),
    exploreTarget: () => exploreTargetOf(state),
    scoutFlights: scoutFlightsOf(state),
    ...lead,
    ...dockSteer,
    // Not before home is known: an unknown home also has no target, and the Explore step's completion is sticky.
    nothingToExplore: () => state.homeTile !== undefined && exploreTargetOf(state) === undefined
  };
};

/** Every Manifest costs the same at a given moment, so the recommended one's catalog price is the next Manifest's. */
const manifestPriceOf = (state: GuideInputState): Pick<GuideInput, "manifestPrice"> => {
  const cost = state.techCatalog.find((t) => t.id === RECOMMENDED_FIRST_MANIFEST_ID)?.requirements.gold;
  return typeof cost === "number" ? { manifestPrice: { cost, coin: state.gold } } : {};
};

/** Test-only: drops the per-revision tile-scan cache. */
export const resetGuideInputCacheForTests = (): void => {
  cached = undefined;
  exploreCache = undefined;
  flightsSeen = { me: "", launches: new Set() };
};
