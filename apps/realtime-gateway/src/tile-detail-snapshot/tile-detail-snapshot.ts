import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { buildTileYieldView } from "../../../simulation/src/tile-yield-view/tile-yield-view.js";
import { converterModeOf, type ConverterMode } from "@border-empires/shared";

import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES,
  converterExchangeGoldPerMinute,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  MINTWORKS_FLAT_GOLD_BONUS_PER_MIN,
  mintworksGoldProductionMultiplier,
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  granaryGrowthMultiplier,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  SETTLEMENT_GROWTH_RATE_MULT,
  TOWN_BASE_GOLD_PER_MIN,
  TOWN_MODIFIER_AGGREGATE_TYPES,
  townFoodUpkeepPerMinute,
  townModifierTotalsFromCounts,
  townPopulationMultiplier,
  UPKEEP_MINUTES_PER_DAY,
  type ModifierStructureType
} from "@border-empires/game-domain";

type SnapshotTile = PlayerSubscriptionSnapshot["tiles"][number];
type TileUpdate = Record<string, unknown>;
type YieldSourceTile = Parameters<typeof buildTileYieldView>[0];

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Keep this in sync with buildTownSummary's gpm/cap branches in
// apps/simulation/src/live-snapshot-view.ts (around lines 720-770). Used to
// backfill goldPerMinute when the snapshot tile's townJson is missing it —
// without this, the gateway-cached tile-detail path serves
// yieldRate.goldPerMinute=0 for any TOWN-tier town the snapshot didn't fully
// populate, which is the bug we're fixing. firstThreeTownMult and the player
// income multiplier aren't available here; both default to 1.0, so this may
// under-report by tech/first-three bonuses (<= ~25%) until the sim's
// authoritative response lands — vastly better than reporting 0.
const fallbackTownGoldPerMinute = (input: {
  isSettlement: boolean;
  isFed: boolean;
  supportCurrent: number;
  supportMax: number;
  populationTier: string;
  connectedTownBonus: number;
  mintworksCount: number;
  clearingHouseActive: boolean;
  // Mintworks-style attribution (see economy-network-converter-support.ts /
  // live-town-summary.ts): gold/minute from active EXCHANGE-mode converters
  // (Aether Condenser/Titanium Works/Umbrite Works) in this town's support
  // ring. Excluded for SETTLEMENT-tier towns via the early return below,
  // same gate MINTWORKS_FLAT_GOLD_BONUS_PER_MIN already uses.
  converterGoldPerMinute: number;
}): number => {
  if (input.isSettlement) return SETTLEMENT_BASE_GOLD_PER_MIN * PASSIVE_INCOME_MULT;
  if (!input.isFed) return 0;
  const supportRatio = input.supportMax <= 0 ? 1 : input.supportCurrent / input.supportMax;
  return (
    (
      TOWN_BASE_GOLD_PER_MIN *
      supportRatio *
      townPopulationMultiplier(input.populationTier) *
      (1 + input.connectedTownBonus) *
      mintworksGoldProductionMultiplier(input.mintworksCount, input.clearingHouseActive) *
      PASSIVE_INCOME_MULT
    ) + MINTWORKS_FLAT_GOLD_BONUS_PER_MIN * input.mintworksCount + input.converterGoldPerMinute
  );
};

const fallbackTownCap = (goldPerMinute: number, isSettlement: boolean, mintworksCount: number, clearingHouseActive: boolean): number =>
  isSettlement ? goldPerMinute * 60 * 8 : goldPerMinute * 60 * 8 * mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive);

const parseTown = (tile: SnapshotTile): Partial<import("@border-empires/shared").Tile["town"]> | undefined => {
  if (!tile?.townJson) return undefined;
  try {
    return JSON.parse(tile.townJson) as Partial<import("@border-empires/shared").Tile["town"]>;
  } catch {
    return undefined;
  }
};

const parseStructure = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

// Mirrors applyObservatoryProgressiveCost (apps/simulation/src/resource-slot-view/resource-slot-view.ts):
// each additional Observatory a player owns costs progressively more CRYSTAL
// slot upkeep -- 1st = 1 slot, 2nd = 2, and so on, ranked by build order
// (earliest activatedAt first, tied broken by tile key). Watchtower Engine's
// own observatory is exempt (syncWatchtowerObservatory) and excluded here too.
const activeObservatoryActivations = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  playerId: string
): Array<{ key: string; activatedAt: number }> => {
  const activations: Array<{ key: string; activatedAt: number }> = [];
  for (const candidate of tilesByKey.values()) {
    if (candidate.ownerId !== playerId) continue;
    const observatory = parseStructure<{ status?: string; activatedAt?: number }>(candidate.observatoryJson);
    if (!observatory || observatory.status !== "active") continue;
    const naturalWonder = parseStructure<{ type?: string }>(candidate.naturalWonderJson);
    if (naturalWonder?.type === "WATCHTOWER_ENGINE") continue;
    activations.push({ key: keyFor(candidate.x, candidate.y), activatedAt: observatory.activatedAt ?? 0 });
  }
  return activations.sort((a, b) => a.activatedAt - b.activatedAt || a.key.localeCompare(b.key));
};

const supportSummaryForTown = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): { supportCurrent: number; supportMax: number } => {
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.terrain !== "LAND" || neighbor.dockId) continue;
      supportMax += 1;
      if (neighbor.ownerId === ownerId && neighbor.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const TOWN_MODIFIER_AGGREGATE_TYPE_SET = new Set<string>(TOWN_MODIFIER_AGGREGATE_TYPES);
const CONVERTER_TOWN_MODIFIER_TYPE_SET = new Set<string>(CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES);

const derivedTownSupportStructures = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): {
  hasMintworks: boolean;
  mintworksCount: number;
  hasGranary: boolean;
  clearingHouseActive: boolean;
  // Mintworks-style attribution: gold/minute from active EXCHANGE-mode
  // converters (Aether Condenser/Titanium Works/Umbrite Works) in the
  // support ring — see fallbackTownGoldPerMinute's matching param.
  converterGoldPerMinute: number;
  // Unified building modifier display (stage 2): per-type counts for every
  // TOWN_MODIFIER_AGGREGATE_TYPES member found in the support ring, fed
  // into game-domain's townModifierTotalsFromCounts below — the single
  // source of truth for the aggregation math itself, shared with
  // apps/simulation/src/live-town-summary.ts so the two paths can't drift
  // apart again the way they did the first time (this path never computed
  // townModifierTotals at all, so it never reached the tile popup). For the
  // converter types, this count is EXCHANGE-mode-filtered (a Refine-mode
  // converter earns no gold and shouldn't show a "Sell Off gold" line).
  aggregateCounts: Partial<Record<ModifierStructureType, number>>;
} => {
  let mintworksCount = 0;
  let hasGranary = false;
  // mintworks-stacking task: no town-level Clearing House signal previously
  // existed on this fallback path — detected here the same support-ring way
  // Mintworks/Granary already are, rather than left permanently false.
  let clearingHouseActive = false;
  let converterGoldPerMinute = 0;
  const aggregateCounts: Partial<Record<ModifierStructureType, number>> = {};
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED") continue;
      const structure = parseStructure<{ type?: string; status?: string; converterMode?: string }>(neighbor.economicStructureJson);
      if (!structure || structure.status !== "active" || !structure.type) continue;
      if (structure.type === "MINTWORKS") mintworksCount += 1;
      if (structure.type === "GRANARY") hasGranary = true;
      if (structure.type === "CLEARING_HOUSE") clearingHouseActive = true;
      if (CONVERTER_TOWN_MODIFIER_TYPE_SET.has(structure.type)) {
        const amountPerMinute = converterExchangeGoldPerMinute(structure.type, structure.converterMode);
        if (amountPerMinute <= 0) continue;
        converterGoldPerMinute += amountPerMinute;
        const type = structure.type as ModifierStructureType;
        aggregateCounts[type] = (aggregateCounts[type] ?? 0) + 1;
      } else if (TOWN_MODIFIER_AGGREGATE_TYPE_SET.has(structure.type)) {
        const type = structure.type as ModifierStructureType;
        aggregateCounts[type] = (aggregateCounts[type] ?? 0) + 1;
      }
    }
  }
  return { hasMintworks: mintworksCount > 0, mintworksCount, hasGranary, clearingHouseActive, converterGoldPerMinute, aggregateCounts };
};

const derivedTownIsFed = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED") continue;
      if (neighbor.resource === "FARM" || neighbor.resource === "FISH") return true;
    }
  }
  return false;
};

const snapshotFoodCoverage = (snapshot: PlayerSubscriptionSnapshot | undefined): number | undefined => {
  const upkeepLastTick = snapshot?.player?.upkeepLastTick;
  if (!upkeepLastTick || typeof upkeepLastTick !== "object") return undefined;
  const foodCoverage = (upkeepLastTick as { foodCoverage?: unknown }).foodCoverage;
  return typeof foodCoverage === "number" && Number.isFinite(foodCoverage) ? foodCoverage : undefined;
};

const townPopulationGrowthPerMinute = (input: {
  isFed: boolean;
  population: number | undefined;
  maxPopulation: number | undefined;
  populationTier: string;
  hasGranary: boolean;
}): number | undefined => {
  if (!input.isFed) return 0;
  if (typeof input.population !== "number" || typeof input.maxPopulation !== "number") return undefined;
  const logisticFactor = 1 - input.population / Math.max(1, input.maxPopulation);
  if (logisticFactor <= 0) return 0;
  // This fallback path doesn't detect Seed Granary / its buffed-radius state
  // (unlike runtime-population-growth.ts's authoritative live-tick check),
  // so it can only ever pass hasAnyGranary — never seedGranaryBuffed=true.
  // granaryGrowthMultiplier() therefore only ever applies a plain Granary's
  // flat GRANARY_ONGOING_GROWTH_MULT here, never the Seed Granary's
  // additional buffed-radius stacking.
  const growth =
    input.population *
    POPULATION_GROWTH_BASE_RATE *
    (input.populationTier === "SETTLEMENT" ? SETTLEMENT_GROWTH_RATE_MULT : 1) *
    granaryGrowthMultiplier(input.hasGranary, false) *
    logisticFactor;
  return Number(growth.toFixed(4));
};

const structureUpkeepPerMinute = (structureType: string, converterMode: ConverterMode): Partial<Record<"GOLD" | "FOOD" | "CRYSTAL" | "TITANIUM" | "UMBRITE", number>> => {
  // Every structure except the synthesizer family (Umbrite/Titanium/Crystal +
  // Advanced tiers, §6.4) has zero ongoing upkeep: FOOD/TITANIUM/CRYSTAL/UMBRITE
  // are slot-based (structure-slots.ts), not a per-minute drain, and only
  // the synthesizers still have a real GOLD cost -- and only while in
  // SYNTHESIZE (Refine) mode; EXCHANGE (Sell Off) mode pays no gold upkeep
  // (economicStructureGoldUpkeepPerInterval in runtime-structure-rules.ts is
  // the authoritative source this mirrors).
  if (converterMode === "EXCHANGE") return {};
  switch (structureType) {
    case "UMBRITE_SYNTHESIZER": return { GOLD: UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "ADVANCED_UMBRITE_SYNTHESIZER": return { GOLD: ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "TITANIUM_WORKS": return { GOLD: TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "ADVANCED_TITANIUM_WORKS": return { GOLD: ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "CRYSTAL_SYNTHESIZER": return { GOLD: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return { GOLD: ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    default: return {};
  }
};

export const buildSnapshotTileDetail = (
  snapshot: PlayerSubscriptionSnapshot | undefined,
  playerId: string,
  x: number,
  y: number
): TileUpdate | undefined => {
  const tile = snapshot?.tiles.find((candidate: PlayerSubscriptionSnapshot["tiles"][number]) => candidate.x === x && candidate.y === y);
  if (!tile) return undefined;
  // A full-detail TILE_DELTA is authoritative, unlike the sparse deltas the
  // client otherwise merges (client-network.ts treats an OMITTED field as
  // "unchanged", only clearing ownership when the key is present but falsy).
  // If ownerId/ownershipState are absent on the snapshot tile (neutral tile),
  // the object spread below would omit them entirely, so a client holding
  // stale ownership from a prior owned state would never see it cleared.
  // Emit explicit null so the field survives JSON.stringify and the client's
  // `"ownerId" in update` branch fires to clear stale ownership.
  const update: TileUpdate = {
    ...tile,
    ownerId: tile.ownerId ?? null,
    ownershipState: tile.ownershipState ?? null,
    detailLevel: "full"
  };
  if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return update;

  const tilesByKey = new Map((snapshot?.tiles ?? []).map((entry: PlayerSubscriptionSnapshot["tiles"][number]) => [keyFor(entry.x, entry.y), entry] as const));

  const upkeepEntries: Array<{
    label: string;
    perMinute: Record<string, number>;
    slot?: { resource: string; count: number };
  }> = [];
  const parsedTown = parseTown(tile);
  const supportSummary = supportSummaryForTown(tilesByKey, playerId, x, y);
  const supportStructures = derivedTownSupportStructures(tilesByKey, playerId, x, y);
  const populationTier = parsedTown?.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT";
  const foodCoverage = snapshotFoodCoverage(snapshot);
  // Trust the sim's authoritative isFed whenever the snapshot's townJson
  // actually carries it (buildTownSummary always populates it on a live
  // recompute -- see live-town-summary.ts) -- it's the same FOOD-slot
  // dormancy verdict the "Unfed" badge and growth tick use, so it must win
  // over these fallbacks, true OR false. Bug: this used to check
  // `parsedTown?.isFed === true`, so a freshly-computed `isFed: false` (a
  // real FOOD-slot shortfall) looked identical to "missing" and got
  // silently overridden back to fed by the legacy foodCoverage/adjacent-
  // Farm-or-Fish heuristics below (both predate the FOOD-slot rewrite and
  // don't know about the slot-shortfall dormancy this town might actually
  // be in) -- so a genuinely unfed town could still report fed here. The
  // heuristics now only fire for a truly thin/incomplete townJson (isFed
  // field absent entirely), e.g. a town record the sim hasn't fully
  // populated yet.
  const isFed =
    populationTier === "SETTLEMENT" ||
    (typeof parsedTown?.isFed === "boolean"
      ? parsedTown.isFed
      : (typeof foodCoverage === "number" && foodCoverage >= 0.999) || derivedTownIsFed(tilesByKey, playerId, x, y));
  const baseGoldPerMinute =
    typeof parsedTown?.baseGoldPerMinute === "number" && parsedTown.baseGoldPerMinute > 0.0001
      ? parsedTown.baseGoldPerMinute
      : populationTier === "SETTLEMENT"
        ? 1
        : 2;
  const populationTierIsSettlement = populationTier === "SETTLEMENT";
  // Trust the sim's authoritative goldPerMinute when it's on the snapshot.
  // Fall back to an inline recompute when missing — required because the
  // snapshot path (and re-stitched gateway townJson) sometimes drops the
  // field, and buildTileYieldView with no economyContext returns 0 for
  // TOWN-tier when town.goldPerMinute isn't present.
  const goldPerMinute =
    typeof parsedTown?.goldPerMinute === "number" && Number.isFinite(parsedTown.goldPerMinute)
      ? parsedTown.goldPerMinute
      : fallbackTownGoldPerMinute({
          isSettlement: populationTierIsSettlement,
          isFed,
          supportCurrent: supportSummary.supportCurrent,
          supportMax: supportSummary.supportMax,
          populationTier,
          connectedTownBonus:
            typeof parsedTown?.connectedTownBonus === "number" ? parsedTown.connectedTownBonus : 0,
          mintworksCount: supportStructures.mintworksCount,
          clearingHouseActive: supportStructures.clearingHouseActive,
          converterGoldPerMinute: supportStructures.converterGoldPerMinute
        });
  // Only backfill cap when goldPerMinute is positive. For unfed TOWN-tier
  // tiles the live-snapshot formula multiplies through 0, which on the wire
  // would clobber buildTileYieldView's default TILE_YIELD_CAP_GOLD fallback
  // (24) with a hard 0 cap — preserving the existing "undefined → default"
  // behavior for unfed tiles avoids a stored-yield-buffer regression.
  const cap =
    typeof parsedTown?.cap === "number" && Number.isFinite(parsedTown.cap)
      ? parsedTown.cap
      : goldPerMinute > 0
        ? fallbackTownCap(goldPerMinute, populationTierIsSettlement, supportStructures.mintworksCount, supportStructures.clearingHouseActive)
        : undefined;
  const populationGrowthPerMinute =
    townPopulationGrowthPerMinute({
      isFed,
      population: parsedTown?.population,
      maxPopulation: parsedTown?.maxPopulation,
      populationTier,
      hasGranary: supportStructures.hasGranary
    }) ?? parsedTown?.populationGrowthPerMinute;
  const growthModifiers =
    parsedTown?.growthModifiers ??
    (typeof populationGrowthPerMinute === "number" && populationGrowthPerMinute > 0
      ? [{ label: "Long time peace" as const, deltaPerMinute: populationGrowthPerMinute }]
      : undefined);
  const hasTown = Boolean(tile.townType || parsedTown);
  const townFoodUpkeep = hasTown ? townFoodUpkeepPerMinute(populationTier) : 0;
  // Unified building modifier display (stage 2): compute townModifierTotals
  // fresh here rather than relying on parsedTown to carry it — the
  // persisted townJson this spreads in was written by
  // toSharedVisibilityTownSummary (live-snapshot-view.ts), a hard field
  // allowlist that strips townModifierTotals (and most other fields) before
  // persisting, so it would otherwise be silently absent for every viewer,
  // including the town's own owner. Every other derived field in this
  // object already works this way (recomputed from the support ring, not
  // trusted from the cached JSON) for the same reason.
  const townModifierTotals = townModifierTotalsFromCounts(supportStructures.aggregateCounts, {
    clearingHouseActive: supportStructures.clearingHouseActive
  });
  const town = hasTown
    ? {
        ...(parsedTown ?? {}),
        type: parsedTown?.type ?? tile.townType,
        populationTier,
        supportCurrent: supportSummary.supportCurrent,
        supportMax: supportSummary.supportMax,
        isFed,
        hasMintworks: supportStructures.hasMintworks,
        mintworksActive: supportStructures.hasMintworks && isFed,
        mintworksCount: supportStructures.mintworksCount,
        hasGranary: supportStructures.hasGranary,
        granaryActive: supportStructures.hasGranary,
        baseGoldPerMinute,
        foodUpkeepPerMinute: townFoodUpkeep,
        ...(typeof goldPerMinute === "number" ? { goldPerMinute } : {}),
        ...(typeof cap === "number" ? { cap } : {}),
        ...(typeof populationGrowthPerMinute === "number" ? { populationGrowthPerMinute } : {}),
        ...(growthModifiers ? { growthModifiers } : {}),
        ...(townModifierTotals.length > 0 ? { townModifierTotals } : {})
      }
    : undefined;
  if (town) update.townJson = JSON.stringify(town);
  if (townFoodUpkeep > 0.0001) {
    upkeepEntries.push({ label: "Town", perMinute: { FOOD: Number(townFoodUpkeep.toFixed(4)) } });
  }
  const economicStructure = parseStructure<{ type?: string; status?: string; converterMode?: ConverterMode }>(tile.economicStructureJson);
  // Fort family (food + increasing iron) and Siege family (food + increasing
  // supply) are surfaced here alongside economic structures. Observatory has
  // no `type`/`variant` field on its domain object at all, and its upkeep is
  // a progressive CRYSTAL slot count rather than a per-minute drain, so it's
  // handled separately below instead of through this generic per-minute loop.
  const structures = [
    economicStructure,
    parseStructure<{ type?: string; variant?: string; status?: string }>(tile.fortJson),
    parseStructure<{ type?: string; variant?: string; status?: string }>(tile.siegeOutpostJson),
  ].filter((value): value is { type?: string; variant?: string; status?: string; converterMode?: ConverterMode } => Boolean(value));
  for (const structure of structures) {
    if (!structure?.status || structure.status !== "active") continue;
    const type = structure.type ?? structure.variant;
    if (!type) continue;
    const upkeep = structureUpkeepPerMinute(type, converterModeOf(structure));
    const perMinute = {
      ...(upkeep.FOOD ? { FOOD: Number(upkeep.FOOD.toFixed(4)) } : {}),
      ...(upkeep.GOLD ? { GOLD: Number(upkeep.GOLD.toFixed(4)) } : {}),
      ...(upkeep.CRYSTAL ? { CRYSTAL: Number(upkeep.CRYSTAL.toFixed(4)) } : {}),
      ...(upkeep.TITANIUM ? { TITANIUM: Number(upkeep.TITANIUM.toFixed(4)) } : {}),
      ...(upkeep.UMBRITE ? { UMBRITE: Number(upkeep.UMBRITE.toFixed(4)) } : {})
    };
    if (Object.keys(perMinute).length > 0) upkeepEntries.push({ label: type, perMinute });
  }
  const observatory = parseStructure<{ status?: string; activatedAt?: number }>(tile.observatoryJson);
  if (observatory?.status === "active") {
    const naturalWonder = parseStructure<{ type?: string }>(tile.naturalWonderJson);
    if (naturalWonder?.type !== "WATCHTOWER_ENGINE") {
      const activations = activeObservatoryActivations(tilesByKey, playerId);
      const rank = activations.findIndex((activation) => activation.key === keyFor(x, y));
      const crystalSlotCount = rank >= 0 ? rank + 1 : 1;
      upkeepEntries.push({ label: "Observatory", perMinute: {}, slot: { resource: "CRYSTAL", count: crystalSlotCount } });
    }
  }
  if (upkeepEntries.length > 0) update.upkeepEntries = upkeepEntries;

  // Keep tile-detail production metadata consistent with the derived town state.
  // Stored yield buffers come from the authoritative snapshot when present; they
  // cannot be reconstructed accurately here without the last-collected timestamp.
  const domainTile: YieldSourceTile = {
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain ?? "LAND",
    ...(tile.resource ? { resource: tile.resource as YieldSourceTile["resource"] } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState as YieldSourceTile["ownershipState"] } : {}),
    ...(town ? { town: town as YieldSourceTile["town"] } : {}),
    ...(economicStructure ? { economicStructure: economicStructure as YieldSourceTile["economicStructure"] } : {})
  };
  // Collect active Waterworks positions for the owning player so the radius
  // boost is reflected in the displayed yield rate (not just in accrual).
  const waterworksKeys = new Set<string>();
  for (const snapshotTile of (snapshot?.tiles ?? [])) {
    if (snapshotTile.ownerId !== playerId || snapshotTile.ownershipState !== "SETTLED") continue;
    const ws = parseStructure<{ type?: string; status?: string }>(snapshotTile.economicStructureJson);
    if (ws?.type === "WATERWORKS" && ws.status === "active") {
      waterworksKeys.add(keyFor(snapshotTile.x, snapshotTile.y));
    }
  }
  const now = Date.now();
  const fallbackYieldView = buildTileYieldView(domainTile, now, now, {
    waterworksKeys: waterworksKeys.size > 0 ? waterworksKeys : undefined
  });
  if (fallbackYieldView?.yieldRate) update.yieldRate = fallbackYieldView.yieldRate;
  if (fallbackYieldView?.yieldCap) update.yieldCap = fallbackYieldView.yieldCap;
  if (!("yield" in update) && fallbackYieldView?.yield) {
    update.yield = fallbackYieldView.yield;
  }

  return update;
};
