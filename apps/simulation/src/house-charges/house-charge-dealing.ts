// Deals a House its charges at landing (docs/house-charges-plan.md, "Dealing
// charges"): one candidate per charge kind near the landing site, inside the
// plan's distance bands and per-target holder caps, then up to
// HOUSE_CHARGES_OFFERED of them, a rare relic charge always included when one
// is available. Deterministic for a given world seed, player and holder
// counts, so a deal lost to a crash between snapshots is dealt again the same.
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
  HOUSE_CHARGE_SEAT_MAX_DISTANCE,
  HOUSE_CHARGE_SEAT_MIN_DISTANCE,
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
  /** Multiplies every maximum distance band; dealHouseCharges widens it when too little qualifies nearby. */
  readonly reachScale?: number;
};

/** Wider searches tried, in order, while fewer than HOUSE_CHARGES_KEPT charges qualify (crowded maps). */
const REACH_SCALES = [1, 1.6, 2.2, 3] as const;
const reach = (input: DealHouseChargesInput): number => input.reachScale ?? 1;

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
  const route = pairDistance + Math.min(chargeDistance(world, home, a), chargeDistance(world, home, b));
  const renown = route <= 30 ? 1 : route <= 45 ? 2 : 3;
  const targets = [townTarget(a, tiles), townTarget(b, tiles)];
  const midpoint = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  return {
    id: `CHARTER:${targets[0]!.key}|${targets[1]!.key}`,
    kind: "CHARTER",
    targets,
    searchCircle: searchCircleAround(random, midpoint, Math.max(HOUSE_CHARGE_SEARCH_RADIUS, Math.ceil(pairDistance / 2) + 3), input.world),
    rarity: renown >= 3 ? "RARE" : "COMMON",
    renown,
    ...(a.islandId !== b.islandId ? { crossWater: true } : {})
  };
};

const seatCandidate = (input: DealHouseChargesInput, random: () => number): HouseCharge | undefined => {
  const { world, tiles, home } = input;
  const [openSeats, allSeats] = townTiers(input, (town) => {
    const distance = chargeDistance(world, home, town);
    const tier = tiles.get(town.key)?.town?.populationTier;
    return (tier === "SETTLEMENT" || tier === "TOWN") && distance >= HOUSE_CHARGE_SEAT_MIN_DISTANCE && distance <= HOUSE_CHARGE_SEAT_MAX_DISTANCE * reach(input);
  });
  const town = pick(random, openSeats.length > 0 ? openSeats : allSeats);
  if (!town) return undefined;
  const startTier = tiles.get(town.key)?.town?.populationTier ?? "TOWN";
  const renown = (startTier === "SETTLEMENT" ? 2 : 1) + (chargeDistance(world, home, town) > 30 ? 1 : 0);
  const target = townTarget(town, tiles);
  return {
    id: `SEAT:${target.key}`,
    kind: "SEAT",
    targets: [target],
    searchCircle: searchCircleAround(random, town, HOUSE_CHARGE_SEARCH_RADIUS, world),
    rarity: renown >= 3 ? "RARE" : "COMMON",
    renown,
    startTier
  };
};

const surveyCandidate = (input: DealHouseChargesInput, random: () => number): HouseCharge | undefined => {
  const { world, home } = input;
  const options: HouseCharge[] = [];
  for (const island of world.islands.islands) {
    if (island.landTilesAtBuild < HOUSE_CHARGE_SURVEY_MIN_LAND_TILES || island.landTilesAtBuild > HOUSE_CHARGE_SURVEY_MAX_LAND_TILES) continue;
    const key = `island:${island.id}`;
    if (input.holders(key) >= HOUSE_CHARGE_TARGET_CAP) continue;
    const nearest = nearestCell(world, island.cells, home);
    if (nearest.distance > HOUSE_CHARGE_REGION_MAX_DISTANCE * reach(input)) continue;
    const renown = island.landTilesAtBuild <= 150 ? 1 : island.landTilesAtBuild <= 350 ? 2 : 3;
    const centre = { x: Math.round(island.geometry.x), y: Math.round(island.geometry.y) };
    options.push({
      id: `SURVEY:${key}`,
      kind: "SURVEY",
      targets: [{ key, name: world.islandNames.defaultNameFor(island), ...centre }],
      searchCircle: { x: centre.x, y: centre.y, radius: Math.max(HOUSE_CHARGE_SEARCH_RADIUS, Math.ceil(island.geometry.span / 2) + 2) },
      rarity: renown >= 3 ? "RARE" : "COMMON",
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
    if (nearestCell(world, region.cells, home).distance > HOUSE_CHARGE_REGION_MAX_DISTANCE * reach(input)) continue;
    const renown = kind === "TUNDRA" ? 3 : region.cells.length <= 120 ? 1 : region.cells.length <= 250 ? 2 : 3;
    options.push({
      id: `${kind}:${key}`,
      kind,
      targets: [{ key, name: world.regionName(region), ...region.centre }],
      searchCircle: searchCircleAround(random, region.centre, HOUSE_CHARGE_SEARCH_RADIUS + 2, world),
      rarity: kind === "TUNDRA" || renown >= 3 ? "RARE" : "COMMON",
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
  return {
    id: `RELIC:${key}`,
    kind: "RELIC",
    targets: [{ key, name: "A Concordance installation", x: site.x, y: site.y }],
    searchCircle: searchCircleAround(random, site, HOUSE_CHARGE_SEARCH_RADIUS, world),
    rarity: "MYTHIC",
    renown: 4,
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
  // A Seat must not reuse one of this deal's Charter towns past the holder cap: count them as already held.
  const charterKeys = new Set(charter?.targets.map((target) => target.key) ?? []);
  const seatInput = { ...input, holders: (key: string) => input.holders(key) + (charterKeys.has(key) ? 1 : 0) };
  const others = [
    charter,
    seatCandidate(seatInput, random),
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
