// Town-summary parsing/validation for gateway tile syncing, split out of
// client-gateway-sync.ts to keep that file under the repo's 500-line cap.
import type { Tile } from "../client-types.js";
import type { GatewayTileUpdate } from "./client-gateway-sync.js";

export type TownSummary = NonNullable<Tile["town"]>;
export type PartialTownSummary = Partial<TownSummary>;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const hasStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isGrowthModifierArray = (value: unknown): value is NonNullable<TownSummary["growthModifiers"]> =>
  Array.isArray(value) &&
  value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const modifier = entry as { label?: unknown; deltaPerMinute?: unknown };
    return (
      (modifier.label === "Recently captured" || modifier.label === "Nearby war" || modifier.label === "Long time peace") &&
      isFiniteNumber(modifier.deltaPerMinute)
    );
  });

const isNextPopulationTierUpgrade = (value: unknown): value is NonNullable<TownSummary["nextPopulationTierUpgrade"]> => {
  if (!value || typeof value !== "object") return false;
  const upgrade = value as { targetTier?: unknown; requiredPopulation?: unknown; goldCost?: unknown; available?: unknown };
  return (
    (upgrade.targetTier === "CITY" || upgrade.targetTier === "GREAT_CITY" || upgrade.targetTier === "METROPOLIS") &&
    isFiniteNumber(upgrade.requiredPopulation) &&
    isFiniteNumber(upgrade.goldCost) &&
    typeof upgrade.available === "boolean"
  );
};

// Minimum population that any real town has. Below this, the summary is partial
// (no real population sent yet, or a zero-default) — the renderer should show
// a "loading" state instead of acting on bogus numbers.
export const MIN_RENDERABLE_TOWN_POPULATION = 500;

const isValidTownType = (value: unknown): value is NonNullable<TownSummary["type"]> =>
  value === "MARKET" || value === "FARMING";

const isValidTownPopulationTier = (value: unknown): value is NonNullable<TownSummary["populationTier"]> =>
  value === "SETTLEMENT" ||
  value === "TOWN" ||
  value === "CITY" ||
  value === "GREAT_CITY" ||
  value === "METROPOLIS";

const isFiniteOptionalNumber = (value: unknown): boolean => value === undefined || isFiniteNumber(value);

const isOptionalBoolean = (value: unknown): boolean => value === undefined || typeof value === "boolean";

// Renderable threshold: the gate the UI uses to decide if it has enough data to
// draw a town card. Foreign towns under satellite reveal carry only public
// fields (type/tier/population/maxPopulation/connected*), and the server
// intentionally strips owner-only economy fields. Population >= 500 is the
// authoritative "this is a real town" signal — anything lower is partial data
// and should drive a spinner state in the overview pane.
export const isRenderableTownSummary = (town: PartialTownSummary | undefined): town is TownSummary =>
  Boolean(
    town &&
      isValidTownType(town.type) &&
      isValidTownPopulationTier(town.populationTier) &&
      isFiniteNumber(town.population) &&
      town.population >= MIN_RENDERABLE_TOWN_POPULATION &&
      isFiniteNumber(town.maxPopulation) &&
      // Tolerate missing private/economy fields — foreign towns under reveal
      // legitimately omit them. Just sanity-check the ones we DO receive.
      isFiniteOptionalNumber(town.baseGoldPerMinute) &&
      isFiniteOptionalNumber(town.supportCurrent) &&
      isFiniteOptionalNumber(town.supportMax) &&
      isFiniteOptionalNumber(town.goldPerMinute) &&
      isFiniteOptionalNumber(town.cap) &&
      isOptionalBoolean(town.isFed) &&
      isFiniteOptionalNumber(town.populationGrowthPerMinute) &&
      isFiniteOptionalNumber(town.connectedTownCount) &&
      isFiniteOptionalNumber(town.connectedTownBonus) &&
      isFiniteOptionalNumber(town.firstThreeTownGoldMult) &&
      isFiniteOptionalNumber(town.firstThreeTownPopGrowthMult) &&
      (town.connectedTownNames === undefined || hasStringArray(town.connectedTownNames)) &&
      isFiniteOptionalNumber(town.manpowerCurrent) &&
      isFiniteOptionalNumber(town.manpowerCap) &&
      isOptionalBoolean(town.hasMintworks) &&
      isOptionalBoolean(town.mintworksActive) &&
      isOptionalBoolean(town.hasGranary) &&
      isOptionalBoolean(town.granaryActive) &&
      isOptionalBoolean(town.hasSeedGranary) &&
      isOptionalBoolean(town.seedGranaryActive) &&
      isOptionalBoolean(town.seedGranaryBuffed) &&
      isOptionalBoolean(town.hasClearingHouse) && isOptionalBoolean(town.clearingHouseActive) && (town.clearingHouseTownNames === undefined || hasStringArray(town.clearingHouseTownNames)) &&
      isFiniteOptionalNumber(town.foodUpkeepPerMinute) &&
      (town.growthModifiers === undefined || isGrowthModifierArray(town.growthModifiers)) &&
      (town.nextPopulationTierUpgrade === undefined || isNextPopulationTierUpgrade(town.nextPopulationTierUpgrade))
  );

export const parseGatewayStructureJson = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

export type GatewayTownIdentity = {
  townType?: Tile["townType"];
  townName?: Tile["townName"];
  townPopulationTier?: Tile["townPopulationTier"];
};

export const gatewayTownIdentity = (
  update: GatewayTileUpdate,
  existing: Tile | undefined,
  town: Tile["town"] | undefined
): GatewayTownIdentity | undefined => {
  const existingType = existing?.town?.type ?? existing?.townType;
  const existingName = existing?.town?.name ?? existing?.townName;
  const existingTier = existing?.town?.populationTier ?? existing?.townPopulationTier;

  if ("townJson" in update && !update.townJson && !("townType" in update) && !("townName" in update) && !("townPopulationTier" in update)) {
    return { townType: undefined, townName: undefined, townPopulationTier: undefined };
  }

  const type = town?.type ?? update.townType ?? existingType;
  const name = town?.name ?? ("townName" in update ? update.townName : existingName);
  const populationTier = town?.populationTier ?? ("townPopulationTier" in update ? update.townPopulationTier : existingTier);

  if (!type && !name && !populationTier) return undefined;
  return {
    townType: type,
    townName: name,
    townPopulationTier: populationTier
  };
};

export type GatewayTownSummaryResult = {
  town: Tile["town"] | undefined;
  // True when a parsed town payload failed the renderable gate. Drives the
  // overview pane's spinner state — distinct from "townType is set" because
  // tile-shell updates can carry townType without a town summary.
  partial: boolean;
};

export const gatewayTownSummary = (
  update: GatewayTileUpdate,
  existing: Tile | undefined
): GatewayTownSummaryResult => {
  const existingTown = existing?.town;
  const parsedTown = parseGatewayStructureJson<PartialTownSummary>(update.townJson);
  if ("townJson" in update && !update.townJson) return { town: undefined, partial: false };
  if (parsedTown) {
    const authoritativeTown: PartialTownSummary = {
      ...parsedTown,
      ...(update.townName ? { name: update.townName } : {}),
      ...(update.townType ? { type: update.townType } : {}),
      ...(update.townPopulationTier ? { populationTier: update.townPopulationTier } : {})
    };
    if (isRenderableTownSummary(authoritativeTown)) return { town: authoritativeTown, partial: false };
    return { town: existingTown, partial: !existingTown };
  }
  if (!existingTown) return { town: undefined, partial: false };
  const mergedTown: PartialTownSummary = {
    ...existingTown,
    ...(update.townName ? { name: update.townName } : {}),
    ...(update.townType ? { type: update.townType } : {})
  };
  if (isRenderableTownSummary(mergedTown)) return { town: mergedTown, partial: false };
  return { town: existingTown, partial: false };
};
