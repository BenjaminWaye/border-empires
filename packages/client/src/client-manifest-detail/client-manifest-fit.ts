// "Good pick" signals for a Manifest you haven't taken yet. Every reason is a
// fact read from your own empire's state -- never a design judgement -- so the
// badge only appears when something concrete makes the Manifest pay off now:
//   1. Resource lead: it reveals a resource and you have a survey report for
//      it, or prospect clues for it lie within a few tiles of your land.
//   2. Build right away: one of its structures fits your free resource slots
//      and current manpower.
// The opposite case ("Not useful yet") is shown when every structure it
// unlocks needs a resource you have no slots of at all.
import {
  SYNTHESIZER_TYPE_SET,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  prospectSignatureResource,
  structureBuildManpowerCost,
  structureSlotRequirements,
  type BuildableStructureType,
  type ProspectSignature,
  type SlotResource
} from "@border-empires/shared";
import { STRUCTURE_DISPLAY_NAMES } from "../client-map-display.js";
import type { OccupationSurveyReport, OccupationSurveyResource } from "../client-occupation-survey.js";
import type { TechInfo, Tile } from "../client-types.js";

// Unlock effect key -> the structure a player can then build directly.
// Monuments (multi-part projects) are left out on purpose: they are never
// "build right away" material.
const BUILDABLE_UNLOCKS: Readonly<Record<string, BuildableStructureType>> = {
  unlockForts: "FORT",
  unlockObservatory: "OBSERVATORY",
  unlockSiegeOutposts: "SIEGE_OUTPOST",
  unlockFarmstead: "FARMSTEAD",
  unlockWaterworksUpgrade: "WATERWORKS",
  unlockUmbriteRig: "UMBRITE_RIG",
  unlockMine: "MINE",
  unlockMintworks: "MINTWORKS",
  unlockGranary: "GRANARY",
  unlockCensusHall: "CENSUS_HALL",
  unlockClearingHouse: "CLEARING_HOUSE",
  unlockCaravanary: "CARAVANARY",
  unlockUmbriteSynthesizer: "UMBRITE_SYNTHESIZER",
  unlockTitaniumWorks: "TITANIUM_WORKS",
  unlockCrystalSynthesizer: "CRYSTAL_SYNTHESIZER",
  unlockFoundry: "FOUNDRY",
  unlockAetherTower: "AETHER_TOWER",
  unlockCustomsHouse: "CUSTOMS_HOUSE",
  unlockGovernorsOffice: "GOVERNORS_OFFICE",
  unlockGarrisonHall: "GARRISON_HALL",
  unlockAirport: "AIRPORT",
  unlockRadarSystem: "RADAR_SYSTEM",
  unlockRailDepot: "RAIL_DEPOT",
  unlockLogisticsGuild: "LOGISTICS_GUILD",
  unlockAssemblyWorks: "ASSEMBLY_WORKS",
  unlockTitaniumWeaponsFactory: "TITANIUM_WEAPONS_FACTORY",
  unlockUmbriteWeaponsFactory: "UMBRITE_WEAPONS_FACTORY"
};

const SIGNATURE_BY_REVEAL: Readonly<Record<string, ProspectSignature>> = {
  titanium: "FERROUS_DUST",
  umbrite: "BLACKWOOD_CANOPY",
  crystal: "REFRACTIVE_GROUND"
};

const RESOURCE_LABEL: Record<SlotResource, string> = { FOOD: "Food", TITANIUM: "Titanium", CRYSTAL: "Crystal", UMBRITE: "Umbrite" };

/** How close (in tiles, any direction) a clue must be to your land to count as "nearby". */
export const CLUE_NEARBY_RADIUS = 4;

export type ManifestFitInput = {
  me: string;
  manpower: number;
  resourceSlots: { supply: Record<SlotResource, number>; demand: Record<SlotResource, number> };
  tiles: Iterable<Tile>;
  surveyReportFor: (resource: OccupationSurveyResource) => OccupationSurveyReport | undefined;
};

export type ManifestFit = {
  goodPickReasons: string[];
  notUsefulYet?: string;
};

const wrappedDelta = (delta: number, size: number): number => {
  const d = ((delta % size) + size) % size;
  return d > size / 2 ? d - size : d;
};

const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"] as const;

const compassFor = (dx: number, dy: number): string => {
  const angle = Math.atan2(dy, dx);
  const index = Math.round(angle / (Math.PI / 4));
  return COMPASS[((index % 8) + 8) % 8] ?? "nearby";
};

export type NearbyClues = { count: number; direction?: string };

// Clue tiles you can see that sit within CLUE_NEARBY_RADIUS of any tile you
// own (including clue tiles inside your own land). Runs only when a
// resource-revealing Manifest's detail is open, over tiles the client
// already holds -- it never reveals anything the map does not show.
export const prospectCluesNearTerritory = (tiles: Iterable<Tile>, me: string, signature: ProspectSignature): NearbyClues => {
  const owned = new Set<string>();
  const clues: Tile[] = [];
  let ownedSumX = 0;
  let ownedSumY = 0;
  for (const tile of tiles) {
    if (tile.ownerId === me && tile.terrain === "LAND") {
      owned.add(`${tile.x},${tile.y}`);
      ownedSumX += tile.x;
      ownedSumY += tile.y;
    }
    if (tile.prospectSignature === signature) clues.push(tile);
  }
  if (owned.size === 0 || clues.length === 0) return { count: 0 };
  const r = CLUE_NEARBY_RADIUS;
  const near: Tile[] = [];
  for (const clue of clues) {
    let found = false;
    for (let dy = -r; dy <= r && !found; dy += 1) {
      for (let dx = -r; dx <= r && !found; dx += 1) {
        const x = (((clue.x + dx) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
        const y = (((clue.y + dy) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
        if (owned.has(`${x},${y}`)) found = true;
      }
    }
    if (found) near.push(clue);
  }
  if (near.length === 0) return { count: 0 };
  const centerX = ownedSumX / owned.size;
  const centerY = ownedSumY / owned.size;
  const avgDx = near.reduce((sum, tile) => sum + wrappedDelta(tile.x - centerX, WORLD_WIDTH), 0) / near.length;
  const avgDy = near.reduce((sum, tile) => sum + wrappedDelta(tile.y - centerY, WORLD_HEIGHT), 0) / near.length;
  const direction = Math.hypot(avgDx, avgDy) < 1 ? undefined : compassFor(avgDx, avgDy);
  return { count: near.length, ...(direction ? { direction } : {}) };
};

// Synthesizers (Titanium Works and friends) are left out of both slot rules:
// their slot use depends on the mode you run them in, and by default
// (SYNTHESIZE) they *supply* the resource -- so "needs Titanium slots" would
// be backwards for exactly the players who need them most.
const unlockedBuildables = (tech: Pick<TechInfo, "effects">): BuildableStructureType[] =>
  Object.entries(tech.effects ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => BUILDABLE_UNLOCKS[key])
    .filter((type): type is BuildableStructureType => Boolean(type) && !SYNTHESIZER_TYPE_SET.has(type as BuildableStructureType));

const structureName = (type: BuildableStructureType): string => STRUCTURE_DISPLAY_NAMES[type] ?? type;

const resourceLeadReason = (tech: Pick<TechInfo, "effects">, input: ManifestFitInput): string | undefined => {
  const reveal = typeof tech.effects?.revealResource === "string" ? tech.effects.revealResource.toLowerCase() : undefined;
  const signature = reveal ? SIGNATURE_BY_REVEAL[reveal] : undefined;
  if (!signature) return undefined;
  const resource = prospectSignatureResource(signature);
  const label = resource === "GEMS" ? "Crystal" : RESOURCE_LABEL[resource];
  const report = input.surveyReportFor(resource);
  if (report) return `${label} likely ${report.bearing.toLowerCase()} of a town you took (occupation survey)`;
  const clues = prospectCluesNearTerritory(input.tiles, input.me, signature);
  if (clues.count === 0) return undefined;
  const where = clues.direction ? `, mostly to the ${clues.direction}` : "";
  return `${label} likely nearby: ${clues.count} clue tile${clues.count === 1 ? "" : "s"} within ${CLUE_NEARBY_RADIUS} tiles of your land${where}`;
};

const freeSlots = (input: ManifestFitInput, resource: SlotResource): number =>
  (input.resourceSlots.supply[resource] ?? 0) - (input.resourceSlots.demand[resource] ?? 0);

export const manifestFit = (tech: TechInfo, input: ManifestFitInput): ManifestFit => {
  const reasons: string[] = [];
  const lead = resourceLeadReason(tech, input);
  if (lead) reasons.push(lead);
  const buildables = unlockedBuildables(tech);
  const buildNow = buildables.find(
    (type) =>
      input.manpower >= structureBuildManpowerCost(type) &&
      structureSlotRequirements(type).every((requirement) => freeSlots(input, requirement.resource) >= requirement.count)
  );
  if (buildNow) reasons.push(`You can build a ${structureName(buildNow)} right away`);
  const starved = buildables.map((type) => ({
    type,
    missing: structureSlotRequirements(type).find((requirement) => (input.resourceSlots.supply[requirement.resource] ?? 0) === 0)
  }));
  const allStarved = starved.length > 0 && starved.every((entry) => entry.missing);
  const firstStarved = starved[0];
  const notUsefulYet =
    allStarved && firstStarved?.missing
      ? `${structureName(firstStarved.type)} needs ${RESOURCE_LABEL[firstStarved.missing.resource]} slots, and you hold no ${RESOURCE_LABEL[firstStarved.missing.resource]} yet`
      : undefined;
  return { goodPickReasons: reasons, ...(notUsefulYet ? { notUsefulYet } : {}) };
};
