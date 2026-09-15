import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { buildTileYieldView } from "../../../simulation/src/tile-yield-view/tile-yield-view.js";
import { firstThreeTownMultipliersForSnapshotTile } from "./tile-detail-first-three-towns.js";
import { converterModeOf, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY, type ConverterMode } from "@border-empires/shared";
import { nextPopulationTierUpgradeForSnapshotTown } from "./tile-detail-next-population-tier-upgrade.js";
import { derivedTownIsFed, derivedTownSupportStructures, supportSummaryForTown } from "./tile-detail-support-ring.js";

import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
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
  townFoodUpkeepPerMinute,
  townModifierTotalsFromCounts,
  townPopulationMultiplier,
  UPKEEP_MINUTES_PER_DAY
} from "@border-empires/game-domain";

type SnapshotTile = PlayerSubscriptionSnapshot["tiles"][number];
type TileUpdate = Record<string, unknown>;
type YieldSourceTile = Parameters<typeof buildTileYieldView>[0];

// Wraps both axes (matching worldgen/vision's own wrapX/wrapY convention —
// see apps/simulation/src/snapshot-tile-cache.ts's keyFor) so a support-ring
// loop's x±1/y±1 around a town on the map edge resolves to the tile that
// actually wraps there instead of a nonexistent out-of-bounds key. A no-op
// for any already-in-bounds tile, so safe for the existing
// "keyFor(tile.x, tile.y)" map-building convention too.
const keyFor = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

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
  // Mercantile Charter (see firstThreeTownMultipliersForTile's doc comment):
  // 1 when inactive/not one of the player's first three towns.
  firstThreeTownGoldMult: number;
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
      input.firstThreeTownGoldMult *
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
  // Mercantile Charter (see firstThreeTownMultipliersForTile's doc comment):
  // 1 when inactive/not one of the player's first three towns.
  firstThreeTownPopGrowthMult: number;
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
    input.firstThreeTownPopGrowthMult *
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
  // Same reasoning for musterJson, and it is load-bearing for a real desync:
  // the sim's tile-detail serializer (toFullSnapshotProtoTile) truthy-guards
  // every overlay JSON field, so a tile whose muster flag is gone carries no
  // muster_json at all -- and the spread below would then omit the key, which
  // the client reads as "unchanged" and keeps rendering a flag the sim no
  // longer has. That left the tile menu offering "Clear Muster" on a flagless
  // tile, and the sim rejecting it with MUSTER_INVALID ("no muster on owned
  // tile") no matter how many times the player re-selected the tile -- the
  // very refresh that should have healed the belief was the one path that
  // structurally could not. "" makes the client's `"musterJson" in update`
  // branch fire and delete the stale flag.
  //
  // Scoped to muster on purpose: the other overlay fields (shardSite,
  // naturalWonder, ...) are subject to per-player reveal gating in the sim's
  // projection, so an absent field there can mean "not revealed to you yet"
  // rather than "removed", and force-clearing them would wipe legitimately
  // discovered map features. Muster has no such gate.
  //
  // shardSiteJson gets the same explicit-clear treatment as musterJson, but
  // ONLY when the tile is owned by the requesting player: COLLECT_SHARD
  // requires ownership, so a player's own tile carries no "not revealed to
  // you yet" ambiguity -- they have full information about their own land.
  // Without this, a shard that expired (or was collected) while the tile was
  // outside this player's live vision left shardSiteJson truthy in the
  // gateway's cached snapshot forever: toFullSnapshotProtoTile truthy-guards
  // the field, so a fresh FetchTileDetail response for the same tile omits
  // it when the shard is gone, and the gateway's own snapshot-merge (see
  // mergeTileDetailIntoSnapshot) reads that omission as "unchanged" and kept
  // re-serving the phantom shard on every tile re-select -- Collect Shard
  // then failed with COLLECT_EMPTY every time, no matter how many times the
  // tile was reopened.
  const update: TileUpdate = {
    ...tile,
    ownerId: tile.ownerId ?? null,
    ownershipState: tile.ownershipState ?? null,
    musterJson: tile.musterJson ?? "",
    ...(tile.ownerId === playerId ? { shardSiteJson: tile.shardSiteJson ?? "" } : {}),
    detailLevel: "full"
  };
  if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return update;

  const tilesByKey = new Map((snapshot?.tiles ?? []).map((entry: PlayerSubscriptionSnapshot["tiles"][number]) => [keyFor(entry.x, entry.y), entry] as const));

  const upkeepEntries: Array<{ label: string; perMinute: Record<string, number> }> = [];
  const parsedTown = parseTown(tile);
  const supportSummary = supportSummaryForTown(tilesByKey, playerId, x, y);
  const supportStructures = derivedTownSupportStructures(tilesByKey, playerId, x, y);
  const populationTier = parsedTown?.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT";
  const { firstThreeTownGoldMult, firstThreeTownPopGrowthMult } =
    firstThreeTownMultipliersForSnapshotTile(snapshot, playerId, keyFor, x, y);
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
          converterGoldPerMinute: supportStructures.converterGoldPerMinute,
          firstThreeTownGoldMult
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
      hasGranary: supportStructures.hasGranary,
      firstThreeTownPopGrowthMult
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
  const nextPopulationTierUpgrade = nextPopulationTierUpgradeForSnapshotTown(populationTier, parsedTown?.population);
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
        ...(townModifierTotals.length > 0 ? { townModifierTotals } : {}),
        ...(nextPopulationTierUpgrade ? { nextPopulationTierUpgrade } : {}),
        // Mercantile Charter: only sent when active, matching
        // live-town-summary.ts's own wire convention.
        ...(firstThreeTownGoldMult !== 1 ? { firstThreeTownGoldMult } : {}),
        ...(firstThreeTownPopGrowthMult !== 1 ? { firstThreeTownPopGrowthMult } : {})
      }
    : undefined;
  if (town) update.townJson = JSON.stringify(town);
  if (townFoodUpkeep > 0.0001) {
    upkeepEntries.push({ label: "Town", perMinute: { FOOD: Number(townFoodUpkeep.toFixed(4)) } });
  }
  const economicStructure = parseStructure<{ type?: string; status?: string; converterMode?: ConverterMode }>(tile.economicStructureJson);
  // Fort family (food + increasing iron), Siege family (food + increasing
  // supply), and Observatory are surfaced here alongside economic structures.
  const structures = [
    economicStructure,
    parseStructure<{ type?: string; variant?: string; status?: string }>(tile.fortJson),
    parseStructure<{ type?: string; variant?: string; status?: string }>(tile.siegeOutpostJson),
    parseStructure<{ type?: string; status?: string }>(tile.observatoryJson),
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
