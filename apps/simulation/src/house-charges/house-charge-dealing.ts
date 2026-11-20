// Deals a House its charges at landing (docs/house-charges-plan.md, "Dealing
// charges"): one candidate per charge kind near the landing site, inside the
// plan's distance bands and per-target holder caps, then up to
// HOUSE_CHARGES_OFFERED of them, a rare relic charge always included when one
// is available. Seeded by world seed and player, so the same inputs give the
// same deal; a redeal after a crash can still differ if holders or town
// ownership changed in between (charges are snapshot state, like island names).
// Charge ids are opaque (chargeIdFor): they reach the client, and a relic's
// id must not carry its position before the beacon is found.
import type { DomainTileState } from "@border-empires/game-domain";
import {
  HOUSE_CHARGES_KEPT,
  HOUSE_CHARGES_OFFERED,
  HOUSE_CHARGE_CHARTER_PAIR_MAX_DISTANCE,
  HOUSE_CHARGE_CHARTER_PAIR_MIN_DISTANCE,
  HOUSE_CHARGE_CHARTER_TOWN_MAX_DISTANCE,
  HOUSE_CHARGE_CHARTER_TOWN_MIN_DISTANCE,
  HOUSE_CHARGE_REGION_MAX_DISTANCE,
  HOUSE_CHARGE_RELIC_MAX_DISTANCE,
  HOUSE_CHARGE_SEARCH_RADIUS,
  HOUSE_CHARGE_CORRECTION_MAX_DISTANCE,
  HOUSE_CHARGE_HOUSE_CAP,
  HOUSE_CHARGE_CORRECTION_MIN_DISTANCE,
  HOUSE_CHARGE_METROPOLIS_COUNT,
  HOUSE_CHARGE_METROPOLIS_MAX_DISTANCE,
  HOUSE_CHARGE_SURVEY_MAX_LAND_TILES,
  HOUSE_CHARGE_SURVEY_MIN_LAND_TILES,
  HOUSE_CHARGE_TARGET_CAP,
  HOUSE_CHARGE_TOWN_CAP,
  type HouseCharge,
  type HouseChargePoint,
  type HouseChargeTarget,
  type HouseChargesState
} from "@border-empires/shared";
import { chargeDistance, nearestCell, type ChargeTownSite, type HouseChargesWorld } from "./house-charges-world.js";
import { houseChargeDifficulty, rivalsNearTarget } from "./house-charge-difficulty.js";

export type RivalLanding = HouseChargePoint & { readonly playerId: string; readonly name: string };

export type DealHouseChargesInput = {
  readonly world: HouseChargesWorld;
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly playerId: string;
  readonly home: HouseChargePoint;
  readonly worldSeed: number;
  /** How many Houses already hold (were offered) the target with this key. */
  readonly holders: (targetKey: string) => number;
  readonly now: number;
  /** Other Houses' landing sites; towns right beside them (a House's seat of power) are never targets. */
  readonly rivalLandingSites?: readonly HouseChargePoint[];
  /** Other Houses with their landing site and name: the possible targets of a Writ of Correction. */
  readonly rivalLandings?: readonly RivalLanding[];
  /** Multiplies every maximum distance band; dealHouseCharges widens it when too little qualifies nearby. */
  readonly reachScale?: number;
};

/** Wider searches tried, in order, while fewer than HOUSE_CHARGES_KEPT charges qualify (crowded maps). */
const REACH_SCALES = [1, 1.6, 2.2, 3] as const;
const reach = (input: DealHouseChargesInput): number => input.reachScale ?? 1;

/** Rival landing sites near a target point, for the difficulty score. */
const rivalsNear = (input: DealHouseChargesInput, target: HouseChargePoint, exclude?: HouseChargePoint): number =>
  rivalsNearTarget(input.world, input.rivalLandingSites ?? [], target, exclude);

/** The landmass of the House's landing site. */
const homeIslandOf = (input: DealHouseChargesInput): string | undefined => input.world.islands.islandAt(input.home.x, input.home.y)?.id;

/** Towns within this distance of a rival's landing site are never charge targets. */
const RIVAL_SEAT_EXCLUSION = 4;

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: number): (() => number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** An opaque, stable charge id: the kind plus a hash of the player and target keys, never a position. */
export const chargeIdFor = (playerId: string, kind: HouseCharge["kind"], targets: ReadonlyArray<{ key: string }>): string =>
  `${kind}:${hashString(`${playerId}|${targets.map((target) => target.key).join("|")}`).toString(36)}`;

const pick = <T>(random: () => number, items: readonly T[]): T | undefined => items[Math.floor(random() * items.length)];

/** Circle around `centre`, nudged so the target is inside it but not at its exact centre. */
const searchCircleAround = (random: () => number, centre: HouseChargePoint, radius: number, world: HouseChargesWorld): HouseCharge["searchCircle"] => {
  const angle = random() * Math.PI * 2;
  const offset = radius * 0.5 * random();
  return {
    x: ((Math.round(centre.x + Math.cos(angle) * offset) % world.width) + world.width) % world.width,
    y: ((Math.round(centre.y + Math.sin(angle) * offset) % world.height) + world.height) % world.height,
    radius
  };
};

const townTarget = (town: ChargeTownSite, tiles: ReadonlyMap<string, DomainTileState>): HouseChargeTarget => ({
  key: `town:${town.key}`,
  name: tiles.get(town.key)?.town?.name ?? "Unnamed town",
  x: town.x,
  y: town.y
});

/** A town that no rival owns at deal time. */
const isOpenTown = (town: ChargeTownSite, tiles: ReadonlyMap<string, DomainTileState>, playerId: string): boolean => {
  const ownerId = tiles.get(town.key)?.ownerId;
  return !ownerId || ownerId === playerId || ownerId === "barbarian-1";
};

/**
 * Towns passing `eligible`, open ones first: a charge only asks a House to
 * take a rival's town when no open town qualifies (crowded maps, where rivals
 * already hold most towns near a landing). Never a town beside a rival's
 * landing site, so no House is charged with taking another's seat.
 */
const townTiers = (input: DealHouseChargesInput, eligible: (town: ChargeTownSite) => boolean): [ChargeTownSite[], ChargeTownSite[]] => {
  const rivalSites = input.rivalLandingSites ?? [];
  const open: ChargeTownSite[] = [];
  const all: ChargeTownSite[] = [];
  for (const town of input.world.towns) {
    if (!eligible(town) || input.holders(`town:${town.key}`) >= HOUSE_CHARGE_TOWN_CAP) continue;
    if (rivalSites.some((site) => chargeDistance(input.world, site, town) <= RIVAL_SEAT_EXCLUSION)) continue;
    all.push(town);
    if (isOpenTown(town, input.tiles, input.playerId)) open.push(town);
  }
  return [open, all];
};

const charterCandidate = (input: DealHouseChargesInput, random: () => number): HouseCharge | undefined => {
  const { world, tiles, home } = input;
  const homeIsland = world.islands.islandAt(home.x, home.y)?.id;
  if (!homeIsland) return undefined;
  // Towns on the home landmass, or on any docked landmass when the home one has a dock: a road may cross the sea.
  const reachable = (islandId: string | undefined): boolean =>
    islandId === homeIsland || (islandId !== undefined && world.dockedIslandIds.has(homeIsland) && world.dockedIslandIds.has(islandId));
  const tiers = townTiers(input, (town) => {
    const distance = chargeDistance(world, home, town);
    return reachable(town.islandId) && distance >= HOUSE_CHARGE_CHARTER_TOWN_MIN_DISTANCE && distance <= HOUSE_CHARGE_CHARTER_TOWN_MAX_DISTANCE * reach(input);
  });
  const pairsOf = (near: readonly ChargeTownSite[]): Array<[ChargeTownSite, ChargeTownSite, number]> => {
    const pairs: Array<[ChargeTownSite, ChargeTownSite, number]> = [];
    for (let i = 0; i < near.length; i += 1) {
      for (let j = i + 1; j < near.length; j += 1) {
        const distance = chargeDistance(world, near[i]!, near[j]!);
        // Same-landmass pairs, or pairs on two docked landmasses (joined by sea).
        const crossesWater = near[i]!.islandId !== near[j]!.islandId;
        if (crossesWater && !(world.dockedIslandIds.has(near[i]!.islandId ?? "") && world.dockedIslandIds.has(near[j]!.islandId ?? ""))) continue;
        if (distance >= HOUSE_CHARGE_CHARTER_PAIR_MIN_DISTANCE && distance <= HOUSE_CHARGE_CHARTER_PAIR_MAX_DISTANCE) pairs.push([near[i]!, near[j]!, distance]);
      }
    }
    return pairs;
  };
  const openPairs = pairsOf(tiers[0]);
  const chosen = pick(random, openPairs.length > 0 ? openPairs : pairsOf(tiers[1]));
  if (!chosen) return undefined;
  const [a, b, pairDistance] = chosen;
  const targets = [townTarget(a, tiles), townTarget(b, tiles)];
  const midpoint = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  const { renown, rarity } = houseChargeDifficulty({
    kind: "CHARTER",
    roadTiles: pairDistance,
    reach: Math.min(chargeDistance(world, home, a), chargeDistance(world, home, b)),
    crossesWater: a.islandId !== homeIsland || b.islandId !== homeIsland,
    rivalsNear: rivalsNear(input, midpoint),
    otherHolders: Math.max(...targets.map((target) => input.holders(target.key)))
  });
  return {
    id: chargeIdFor(input.playerId, "CHARTER", targets),
    kind: "CHARTER",
    targets,
    searchCircle: searchCircleAround(random, midpoint, Math.max(HOUSE_CHARGE_SEARCH_RADIUS, Math.ceil(pairDistance / 2) + 3), input.world),
    rarity,
    renown,
    ...(a.islandId !== b.islandId ? { crossWater: true } : {})
  };
};

/**
 * Writ of Correction: a rival House whose landing site lies in the band. Held
 * by owning any AFC that House founded (house-charge-held.ts); the target
 * point is its landing site, where the map circle and AI pursuit aim.
 */
const correctionCandidate = (input: DealHouseChargesInput, random: () => number): HouseCharge | undefined => {
  const { world, home } = input;
  const rivals = (input.rivalLandings ?? []).filter((rival) => {
    const distance = chargeDistance(world, home, rival);
    return distance >= HOUSE_CHARGE_CORRECTION_MIN_DISTANCE && distance <= HOUSE_CHARGE_CORRECTION_MAX_DISTANCE * reach(input) && input.holders(`house:${rival.playerId}`) < HOUSE_CHARGE_HOUSE_CAP;
  });
  const rival = pick(random, rivals);
  if (!rival) return undefined;
  const key = `house:${rival.playerId}`;
  const { renown, rarity } = houseChargeDifficulty({
    kind: "CORRECTION",
    reach: chargeDistance(world, home, rival),
    crossesWater: world.islands.islandAt(rival.x, rival.y)?.id !== homeIslandOf(input),
    rivalsNear: rivalsNear(input, rival, rival),
    otherHolders: input.holders(key)
  });
  return {
    id: chargeIdFor(input.playerId, "CORRECTION", [{ key }]),
    kind: "CORRECTION",
    targets: [{ key, name: rival.name, x: rival.x, y: rival.y }],
    searchCircle: searchCircleAround(random, rival, HOUSE_CHARGE_SEARCH_RADIUS, world),
    rarity,
    renown
  };
};

/**
 * Three Metropolises: a landmass with at least HOUSE_CHARGE_METROPOLIS_COUNT
 * towns. Any of its towns count, rivals' landing towns included (they can be
 * taken, and on crowded island maps most towns are one), so many Houses may
 * share a large landmass: the holder cap is metropolisHolderCap. The target
 * point is the middle of the three towns nearest the House.
 */
/** The middle of some points, the short way round the wrapped world (towns either side of the seam stay together). */
const wrappedCentre = (world: Pick<HouseChargesWorld, "width" | "height">, points: readonly HouseChargePoint[]): HouseChargePoint => {
  const [first] = points;
  if (!first) return { x: 0, y: 0 };
  const delta = (from: number, to: number, size: number): number => {
    const raw = (((to - from) % size) + size) % size;
    return raw > size / 2 ? raw - size : raw;
  };
  const dx = points.reduce((sum, point) => sum + delta(first.x, point.x, world.width), 0) / points.length;
  const dy = points.reduce((sum, point) => sum + delta(first.y, point.y, world.height), 0) / points.length;
  return { x: (((Math.round(first.x + dx)) % world.width) + world.width) % world.width, y: (((Math.round(first.y + dy)) % world.height) + world.height) % world.height };
};

/** Houses that may share one landmass's Three Metropolises charge: one per three of its towns. */
export const metropolisHolderCap = (townCount: number): number => Math.max(1, Math.floor(townCount / HOUSE_CHARGE_METROPOLIS_COUNT));

const metropolisCandidate = (input: DealHouseChargesInput, random: () => number): HouseCharge | undefined => {
  const { world, home } = input;
  const townsByIsland = new Map<string, ChargeTownSite[]>();
  for (const town of world.towns) {
    if (!town.islandId) continue;
    const list = townsByIsland.get(town.islandId) ?? [];
    list.push(town);
    townsByIsland.set(town.islandId, list);
  }
  const homeIsland = world.islands.islandAt(home.x, home.y)?.id;
  const options: HouseCharge[] = [];
  for (const island of world.islands.islands) {
    const towns = townsByIsland.get(island.id) ?? [];
    if (towns.length < HOUSE_CHARGE_METROPOLIS_COUNT) continue;
    const key = `metropolis:${island.id}`;
    if (input.holders(key) >= metropolisHolderCap(towns.length)) continue;
    // Distance to the landmass's towns, not every cell: a continent has tens of thousands of cells and dealing runs for every House.
    const nearest = [...towns].sort((a, b) => chargeDistance(world, home, a) - chargeDistance(world, home, b)).slice(0, HOUSE_CHARGE_METROPOLIS_COUNT);
    if (chargeDistance(world, home, nearest[0]!) > HOUSE_CHARGE_METROPOLIS_MAX_DISTANCE * reach(input)) continue;
    const centre = wrappedCentre(world, nearest);
    const { renown, rarity } = houseChargeDifficulty({
      kind: "METROPOLIS",
      reach: chargeDistance(world, home, nearest[0]!),
      crossesWater: island.id !== homeIsland,
      rivalsNear: rivalsNear(input, centre),
      otherHolders: input.holders(key)
    });
    options.push({
      id: chargeIdFor(input.playerId, "METROPOLIS", [{ key }]),
      kind: "METROPOLIS",
      targets: [{ key, name: world.islandNames.defaultNameFor(island), ...centre }],
      searchCircle: searchCircleAround(random, centre, HOUSE_CHARGE_SEARCH_RADIUS, world),
      rarity,
      renown,
      areaTowns: towns.length
    });
  }
  return pick(random, options);
};

const surveyCandidate = (input: DealHouseChargesInput, random: () => number): HouseCharge | undefined => {
  const { world, home } = input;
  const homeIsland = homeIslandOf(input);
  const options: HouseCharge[] = [];
  for (const island of world.islands.islands) {
    if (island.landTilesAtBuild < HOUSE_CHARGE_SURVEY_MIN_LAND_TILES || island.landTilesAtBuild > HOUSE_CHARGE_SURVEY_MAX_LAND_TILES) continue;
    const key = `island:${island.id}`;
    if (input.holders(key) >= HOUSE_CHARGE_TARGET_CAP) continue;
    const nearest = nearestCell(world, island.cells, home);
    if (nearest.distance > HOUSE_CHARGE_REGION_MAX_DISTANCE * reach(input)) continue;
    const centre = { x: Math.round(island.geometry.x), y: Math.round(island.geometry.y) };
    const { renown, rarity } = houseChargeDifficulty({
      kind: "SURVEY",
      areaTiles: island.landTilesAtBuild,
      reach: nearest.distance,
      crossesWater: island.id !== homeIsland,
      rivalsNear: rivalsNear(input, centre),
      otherHolders: input.holders(key)
    });
    options.push({
      id: chargeIdFor(input.playerId, "SURVEY", [{ key }]),
      kind: "SURVEY",
      targets: [{ key, name: world.islandNames.defaultNameFor(island), ...centre }],
      searchCircle: { x: centre.x, y: centre.y, radius: Math.max(HOUSE_CHARGE_SEARCH_RADIUS, Math.ceil(island.geometry.span / 2) + 2) },
      rarity,
      renown,
      areaTiles: island.landTilesAtBuild
    });
  }
  return pick(random, options);
};

const regionCandidate = (input: DealHouseChargesInput, random: () => number, kind: "DESERT" | "TUNDRA"): HouseCharge | undefined => {
  const { world, home } = input;
  const options: HouseCharge[] = [];
  for (const region of world.regions.regions) {
    if (region.kind !== kind) continue;
    const key = `region:${region.id}`;
    if (input.holders(key) >= HOUSE_CHARGE_TARGET_CAP) continue;
    const nearest = nearestCell(world, region.cells, home);
    if (nearest.distance > HOUSE_CHARGE_REGION_MAX_DISTANCE * reach(input)) continue;
    const { renown, rarity } = houseChargeDifficulty({
      kind,
      areaTiles: region.cells.length,
      reach: nearest.distance,
      crossesWater: world.islands.islandAt(nearest.x, nearest.y)?.id !== homeIslandOf(input),
      rivalsNear: rivalsNear(input, region.centre),
      otherHolders: input.holders(key)
    });
    options.push({
      id: chargeIdFor(input.playerId, kind, [{ key }]),
      kind,
      targets: [{ key, name: world.regionName(region), ...region.centre }],
      searchCircle: searchCircleAround(random, region.centre, HOUSE_CHARGE_SEARCH_RADIUS + 2, world),
      rarity,
      renown,
      areaTiles: region.cells.length
    });
  }
  return pick(random, options);
};

const relicCandidate = (input: DealHouseChargesInput, random: () => number): HouseCharge | undefined => {
  const { world, tiles, home } = input;
  const sites = world.relics.filter((site) => {
    const wonder = tiles.get(site.key)?.naturalWonder;
    if (!wonder || wonder.remainingUses === 0) return false;
    return chargeDistance(world, home, site) <= HOUSE_CHARGE_RELIC_MAX_DISTANCE * reach(input) && input.holders(`relic:${site.key}`) < HOUSE_CHARGE_TARGET_CAP;
  });
  const site = pick(random, sites);
  if (!site) return undefined;
  const key = `relic:${site.key}`;
  const { renown, rarity } = houseChargeDifficulty({
    kind: "RELIC",
    reach: chargeDistance(world, home, site),
    crossesWater: world.islands.islandAt(site.x, site.y)?.id !== homeIslandOf(input),
    rivalsNear: rivalsNear(input, site),
    otherHolders: input.holders(key)
  });
  return {
    id: chargeIdFor(input.playerId, "RELIC", [{ key }]),
    kind: "RELIC",
    targets: [{ key, name: "A Concordance installation", x: site.x, y: site.y }],
    searchCircle: searchCircleAround(random, site, HOUSE_CHARGE_SEARCH_RADIUS, world),
    rarity,
    renown,
    ...(tiles.get(site.key)?.naturalWonder?.type ? { relicType: tiles.get(site.key)!.naturalWonder!.type } : {})
  };
};

/**
 * Deals a House its charges, or undefined when no target qualifies. On a
 * crowded map where fewer than two qualify within the plan's bands, the
 * search widens (REACH_SCALES) before giving up.
 */
export const dealHouseCharges = (input: DealHouseChargesInput): HouseChargesState | undefined => {
  let best: HouseChargesState | undefined;
  for (const reachScale of REACH_SCALES) {
    const dealt = dealWithinReach({ ...input, reachScale });
    if (dealt && dealt.offered.length >= (best?.offered.length ?? 0)) best = dealt;
    if (best && best.keptIds.length >= HOUSE_CHARGES_KEPT) break;
  }
  return best;
};

const dealWithinReach = (input: DealHouseChargesInput): HouseChargesState | undefined => {
  const random = seededRandom(hashString(`house-charges:${input.worldSeed}:${input.playerId}`));
  const relic = relicCandidate(input, random);
  const charter = charterCandidate(input, random);
  const others = [
    charter,
    metropolisCandidate(input, random),
    correctionCandidate(input, random),
    surveyCandidate(input, random),
    regionCandidate(input, random, "DESERT"),
    regionCandidate(input, random, "TUNDRA")
  ].filter((charge): charge is HouseCharge => Boolean(charge));
  // Fisher-Yates with the seeded stream so the offer order is reproducible.
  for (let index = others.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [others[index], others[swap]] = [others[swap]!, others[index]!];
  }
  const offered = [...(relic ? [relic] : []), ...others].slice(0, HOUSE_CHARGES_OFFERED);
  if (offered.length === 0) return undefined;
  return { dealtAt: input.now, offered, keptIds: offered.slice(0, HOUSE_CHARGES_KEPT).map((charge) => charge.id) };
};

/** Target keys of every charge a House was offered (used for holder caps). */
export const offeredTargetKeys = (state: HouseChargesState | undefined): string[] =>
  state ? state.offered.flatMap((charge) => charge.targets.map((target) => target.key)) : [];
