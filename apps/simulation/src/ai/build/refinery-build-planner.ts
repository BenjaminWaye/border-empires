// Refinery and booster build candidates for chooseBestEconomicBuild
// (structure-command-planner.ts) — Phase 2 of
// docs/territory-development-plan.md, "AI". Rules come from
// packages/shared/src/refineries/; this file only scores.
//
// Refinery: for a garrisoned strategic deposit field (seeded from the AI's
// own SETTLED deposit tiles among the build candidates) that no refinery of
// the AI holds yet, find a town that links it (eligibleRefineryFields, the
// server's own rule) with a free support-ring tile, and build the matching
// refinery on that ring tile with explicit fieldX/fieldY, re-validated with
// chooseRefineryField so the server can never reject the field.
//
// Booster: a town whose working refineries of one resource process at least
// BOOSTER_MIN_PROCESSED_TILES tiles, with no booster of that resource yet.
import {
  REFINERY_BOOSTER_TYPE_BY_RESOURCE,
  REFINERY_REACH_LAND_TILES,
  REFINERY_SLOTS_PER_TILE,
  REFINERY_TYPE_BY_RESOURCE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  chooseRefineryField,
  compareRefineryTiles,
  eligibleRefineryFields,
  isRefineryFieldResource,
  refineryFieldAt,
  refineryReachMemo,
  takenRefineryFieldIds,
  type EconomicStructureType,
  type EligibleRefineryField,
  type RefineryField,
  type RefineryFieldResource,
  type RefineryTile,
  type SlotResource
} from "@border-empires/shared";
import { economicStructureTypesForSupportedTown, openTownSupportNeighborTiles, townSupportStructureShowsOnTile } from "../../town-support-lookup.js";
import { SURPLUS_PRODUCER_MIN_HEADROOM } from "../food-slot-relief-surplus.js";
import {
  asRefineryTiles, evaluatePlannerRefineries, freeSlotsOf, plannerRefineryTownResolver, refineryPlannerTowns, refinerySlotResource, refineryTilesAroundTowns,
  type RefineryPlannerTile
} from "./refinery-ai-view.js";

// Scores sit inside chooseBestEconomicBuild's range (roughly 20–190): a
// one-tile field with no shortage (~42) ranks like the retired Mine (46),
// a two-tile field the AI is short of (~116) beats a routine Manufactory, and
// even an eight-tile field in deficit (cap 175) stays under the food-crisis
// Hydrogarden (190).
export const REFINERY_SCORE = { base: 36, perTile: 14, maxTiles: 8, deficitBonus: 60, shortBonus: 30, perLandStep: 2, max: 175 } as const;
export const BOOSTER_SCORE = { base: 24, perTile: 10, max: 160 } as const;
/** "Enough processed tiles to pay back its FOOD slot": +1 slot per tile, so two tiles out-earn the one FOOD slot. */
export const BOOSTER_MIN_PROCESSED_TILES = 2;
/** Deposit seeds and distinct fields weighed per plan (AI CPU guardrails). */
const DEPOSIT_SEED_CAP = 48;
const FIELD_CAP = 8;

export type RefineryBuildCandidate<T> = { tile: T; structureType: EconomicStructureType; score: number; field?: { x: number; y: number } };

export type RefineryBuildContext<T extends RefineryPlannerTile> = {
  playerId: string;
  tilesByKey: ReadonlyMap<string, T>;
  /** Build candidates (the planner's bounded SETTLED resource/town/support set). */
  candidateTiles: readonly T[];
  /** Town-economy view keys, when the planner has the view. */
  townKeys?: readonly string[] | undefined;
  slotSupply?: Partial<Record<SlotResource, number>> | undefined;
  slotDemand?: Partial<Record<SlotResource, number>> | undefined;
  /** Tech, AFC module, manpower (after war reserve) and FOOD slot — canAffordStructure. */
  affordable: (type: EconomicStructureType) => boolean;
  blockedActionKeys?: ReadonlyMap<string, string> | undefined;
  /** Best score the existing economic scoring gives another support building at this town (0 = none). */
  competingSupportScore: (townKey: string) => number;
};

/** Shortage bonus for adding `gain` slots of `resource`; undefined = would only feed a surplus food relief switches off. */
const shortageBonus = (free: number | undefined, gain: number): number | undefined => {
  if (free === undefined) return 0;
  if (free + gain >= SURPLUS_PRODUCER_MIN_HEADROOM) return undefined;
  if (free <= 0) return REFINERY_SCORE.deficitBonus;
  return free < gain ? REFINERY_SCORE.shortBonus : 0;
};

export const refineryBuildScore = (garrisonedTiles: number, free: number | undefined, landSteps: number): number | undefined => {
  const bonus = shortageBonus(free, garrisonedTiles * REFINERY_SLOTS_PER_TILE);
  if (bonus === undefined) return undefined;
  const raw = REFINERY_SCORE.base + REFINERY_SCORE.perTile * Math.min(garrisonedTiles, REFINERY_SCORE.maxTiles) + bonus - REFINERY_SCORE.perLandStep * landSteps;
  return Math.min(REFINERY_SCORE.max, raw);
};

export const boosterBuildScore = (processedTiles: number, free: number | undefined): number | undefined => {
  if (processedTiles < BOOSTER_MIN_PROCESSED_TILES) return undefined;
  const bonus = shortageBonus(free, processedTiles);
  return bonus === undefined ? undefined : Math.min(BOOSTER_SCORE.max, BOOSTER_SCORE.base + BOOSTER_SCORE.perTile * processedTiles + bonus);
};

const wrappedDelta = (a: number, b: number, size: number): number => {
  const raw = Math.abs(a - b) % size;
  return Math.min(raw, size - raw);
};

/** Chebyshev lower bound on land steps: a town further than reach from every field tile cannot link it. */
const townNearField = (town: { x: number; y: number }, field: RefineryField): boolean =>
  field.tiles.some((tile) => Math.max(wrappedDelta(town.x, tile.x, WORLD_WIDTH), wrappedDelta(town.y, tile.y, WORLD_HEIGHT)) <= REFINERY_REACH_LAND_TILES);

const buildKey = (x: number, y: number, type: EconomicStructureType): string => `BUILD_ECONOMIC_STRUCTURE:${x},${y}:${type}`;

const better = <T>(a: RefineryBuildCandidate<T> | undefined, b: RefineryBuildCandidate<T> | undefined): RefineryBuildCandidate<T> | undefined =>
  !a ? b : !b ? a : b.score > a.score ? b : a;

/** Highest-scoring refinery or booster build, or undefined. */
export const chooseRefineryBuild = <T extends RefineryPlannerTile>(context: RefineryBuildContext<T>): RefineryBuildCandidate<T> | undefined => {
  const refineryResources = (["TITANIUM", "UMBRITE", "GEMS"] as const).filter((resource) => context.affordable(REFINERY_TYPE_BY_RESOURCE[resource]));
  const boosterResources = (["TITANIUM", "UMBRITE", "GEMS"] as const).filter((resource) => context.affordable(REFINERY_BOOSTER_TYPE_BY_RESOURCE[resource]));
  if (refineryResources.length === 0 && boosterResources.length === 0) return undefined;
  const towns = refineryPlannerTowns(context.playerId, context.tilesByKey, context.townKeys, context.candidateTiles);
  if (towns.length === 0) return undefined;
  const refineries = refineryTilesAroundTowns(context.playerId, context.tilesByKey, towns);
  const openRing = new Map<string, T[]>();
  const openRingOf = (townKey: string): T[] => {
    let open = openRing.get(townKey);
    if (!open) openRing.set(townKey, (open = openTownSupportNeighborTiles(context.tilesByKey, context.playerId, townKey).sort(compareRefineryTiles)));
    return open;
  };
  // The ring is scarce: never take a town's last free tile from a building
  // the existing scoring values at least as much.
  const ringAllows = (townKey: string, score: number): boolean => openRingOf(townKey).length > 1 || context.competingSupportScore(townKey) < score;
  const refinery = refineryResources.length > 0 ? bestRefinerySite(context, towns, refineries, new Set(refineryResources), openRingOf, ringAllows) : undefined;
  const booster = boosterResources.length > 0 && refineries.length > 0 ? bestBoosterSite(context, refineries, new Set(boosterResources), openRingOf, ringAllows) : undefined;
  return better(refinery, booster);
};

const bestRefinerySite = <T extends RefineryPlannerTile>(
  context: RefineryBuildContext<T>, towns: readonly T[], refineries: readonly T[], resources: ReadonlySet<RefineryFieldResource>,
  openRingOf: (townKey: string) => T[], ringAllows: (townKey: string, score: number) => boolean
): RefineryBuildCandidate<T> | undefined => {
  const { playerId } = context;
  const tiles = asRefineryTiles(context.tilesByKey);
  const fields = depositFields(context, resources);
  if (fields.length === 0) return undefined;
  const taken = takenRefineryFieldIds(tiles, playerId, refineries as unknown as RefineryTile[], plannerRefineryTownResolver(context.tilesByKey));
  const eligible = new Map<string, EligibleRefineryField[]>();
  const reachOf = refineryReachMemo(tiles, playerId);
  let best: RefineryBuildCandidate<T> | undefined;
  for (const field of fields) {
    if (taken.has(field.id)) continue;
    const type = REFINERY_TYPE_BY_RESOURCE[field.resource];
    const garrisoned = field.tiles.filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED").length;
    const free = freeSlotsOf(context.slotSupply, context.slotDemand, refinerySlotResource(field.resource));
    for (const town of towns) {
      if (!townNearField(town, field)) continue;
      const townKey = `${town.x},${town.y}`;
      const memoKey = `${townKey}|${type}`;
      let linked = eligible.get(memoKey);
      if (!linked) eligible.set(memoKey, (linked = eligibleRefineryFields(tiles, playerId, type, townKey, taken, reachOf(townKey))));
      const match = linked.find((entry) => entry.fieldId === field.id && !entry.taken);
      if (!match) continue;
      const score = refineryBuildScore(garrisoned, free, match.distance);
      if (score === undefined || (best && score <= best.score)) continue;
      const site = openRingOf(townKey).find((tile) =>
        townSupportStructureShowsOnTile(context.tilesByKey, playerId, tile, type) && !context.blockedActionKeys?.has(buildKey(tile.x, tile.y, type)));
      if (!site || !ringAllows(townKey, score)) continue;
      // The exact check the server runs on this build (refinery-commands.ts).
      const choice = chooseRefineryField(tiles, playerId, type, townKey, taken, { x: match.anchorX, y: match.anchorY }, reachOf(townKey));
      if (!choice.ok || choice.fieldId !== field.id) continue;
      best = { tile: site, structureType: type, score, field: { x: match.anchorX, y: match.anchorY } };
    }
  }
  return best;
};

/** Distinct fields holding one of the AI's SETTLED deposit tiles among the build candidates, capped. */
const depositFields = <T extends RefineryPlannerTile>(context: RefineryBuildContext<T>, resources: ReadonlySet<RefineryFieldResource>): RefineryField[] => {
  const tiles = asRefineryTiles(context.tilesByKey);
  const seen = new Set<string>();
  const fields: RefineryField[] = [];
  let seeds = 0;
  for (const tile of context.candidateTiles) {
    if (fields.length >= FIELD_CAP || seeds >= DEPOSIT_SEED_CAP) break;
    if (tile.ownerId !== context.playerId || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    const resource = tile.resource;
    if (!isRefineryFieldResource(resource) || !resources.has(resource)) continue;
    seeds += 1;
    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) continue;
    const field = refineryFieldAt(tiles, tile.x, tile.y, resource);
    if (!field) continue;
    for (const fieldKey of field.keys) seen.add(fieldKey);
    fields.push(field);
  }
  return fields;
};

const bestBoosterSite = <T extends RefineryPlannerTile>(
  context: RefineryBuildContext<T>, refineries: readonly T[], resources: ReadonlySet<RefineryFieldResource>,
  openRingOf: (townKey: string) => T[], ringAllows: (townKey: string, score: number) => boolean
): RefineryBuildCandidate<T> | undefined => {
  const processed = new Map<string, { townKey: string; resource: RefineryFieldResource; tiles: number; boosted: boolean }>();
  for (const evaluation of evaluatePlannerRefineries(context.tilesByKey, refineries).values()) {
    if (!evaluation.working || !evaluation.townKey || !resources.has(evaluation.resource)) continue;
    const key = `${evaluation.townKey}|${evaluation.resource}`;
    const entry = processed.get(key) ?? { townKey: evaluation.townKey, resource: evaluation.resource, tiles: 0, boosted: false };
    entry.tiles += evaluation.processedTileKeys.length;
    entry.boosted ||= evaluation.boosted;
    processed.set(key, entry);
  }
  let best: RefineryBuildCandidate<T> | undefined;
  for (const entry of [...processed.values()].sort((a, b) => a.townKey.localeCompare(b.townKey) || a.resource.localeCompare(b.resource))) {
    if (entry.boosted) continue;
    const type = REFINERY_BOOSTER_TYPE_BY_RESOURCE[entry.resource];
    const town = context.tilesByKey.get(entry.townKey);
    if (!town || context.blockedActionKeys?.has(buildKey(town.x, town.y, type))) continue;
    const score = boosterBuildScore(entry.tiles, freeSlotsOf(context.slotSupply, context.slotDemand, refinerySlotResource(entry.resource)));
    if (score === undefined || (best && score <= best.score)) continue;
    // One per town: one already going up (or switched off) also counts.
    if (economicStructureTypesForSupportedTown(context.tilesByKey, context.playerId, entry.townKey).has(type)) continue;
    if (!openRingOf(entry.townKey).some((tile) => townSupportStructureShowsOnTile(context.tilesByKey, context.playerId, tile, type))) continue;
    if (!ringAllows(entry.townKey, score)) continue;
    // Booster placement is "town_support": target the town; the runtime picks the ring tile.
    best = { tile: town, structureType: type, score };
  }
  return best;
};
