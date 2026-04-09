import type { EconomicStructure, EconomicStructureType, Player, ResourceType, TileKey } from "@border-empires/shared";

type StrategicResource = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";
type ActiveSiphon = { casterPlayerId: string; endsAt: number };

type TerritoryStructureRuntimeDeps = Record<string, any>;

export const createServerTerritoryStructureRuntime = (deps: TerritoryStructureRuntimeDeps) => {
  const {
    now,
    parseKey,
    key,
    terrainAtRuntime,
    ownership,
    ownershipStateByTile,
    observatoriesByTile,
    observatoryTileKeysByPlayer,
    economicStructuresByTile,
    economicStructureTileKeysByPlayer,
    siphonByTile,
    siphonCacheByPlayer,
    chebyshevDistance,
    getPlayerEffectsForPlayer,
    OBSERVATORY_PROTECTION_RADIUS,
    OBSERVATORY_CAST_RADIUS,
    RADAR_SYSTEM_RADIUS,
    GOVERNORS_OFFICE_RADIUS,
    GOVERNORS_OFFICE_UPKEEP_MULT,
    FOUNDRY_RADIUS,
    FOUNDRY_OUTPUT_MULT,
    SIPHON_SHARE,
    randomUUID
  } = deps;

  const isOwnedSettledLandTile = (playerId: string, tileKey: TileKey): boolean => {
    const [x, y] = parseKey(tileKey);
    if (terrainAtRuntime(x, y) !== "LAND") return false;
    return ownership.get(tileKey) === playerId && ownershipStateByTile.get(tileKey) === "SETTLED";
  };

  const observatoryStatusForTile = (playerId: string, tileKey: TileKey): "under_construction" | "active" | "inactive" | "removing" => {
    const observatory = observatoriesByTile.get(tileKey);
    if (!observatory || observatory.ownerId !== playerId) return "inactive";
    if (observatory.status === "under_construction") return "under_construction";
    if (observatory.status === "removing") return "removing";
    return isOwnedSettledLandTile(playerId, tileKey) ? observatory.status : "inactive";
  };

  const activeObservatoryTileKeysForPlayer = (playerId: string): TileKey[] => {
    const out: TileKey[] = [];
    for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
      if (observatoryStatusForTile(playerId, tk) === "active") out.push(tk);
    }
    return out;
  };

  const syncObservatoriesForPlayer = (playerId: string, active: boolean): void => {
    let changed = false;
    for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
      const observatory = observatoriesByTile.get(tk);
      if (!observatory) continue;
      if (observatory.status === "under_construction" || observatory.status === "removing") continue;
      const nextStatus = active && isOwnedSettledLandTile(playerId, tk) ? "active" : "inactive";
      if (observatory.status !== nextStatus) {
        observatory.status = nextStatus;
        changed = true;
      }
    }
    if (changed) deps.markVisibilityDirty(playerId);
  };

  const hostileObservatoryProtectingTile = (actor: Player, x: number, y: number): TileKey | undefined => {
    for (const [tk, observatory] of observatoriesByTile) {
      if (observatory.ownerId === actor.id || actor.allies.has(observatory.ownerId)) continue;
      if (observatoryStatusForTile(observatory.ownerId, tk) !== "active") continue;
      const [ox, oy] = parseKey(tk);
      const protectionRadius = OBSERVATORY_PROTECTION_RADIUS + getPlayerEffectsForPlayer(observatory.ownerId).observatoryProtectionRadiusBonus;
      if (chebyshevDistance(ox, oy, x, y) <= protectionRadius) return tk;
    }
    return undefined;
  };

  const ownedActiveObservatoryWithinRange = (playerId: string, x: number, y: number, range = OBSERVATORY_CAST_RADIUS): boolean => {
    const castRadius = range + getPlayerEffectsForPlayer(playerId).observatoryCastRadiusBonus;
    for (const tk of observatoryTileKeysByPlayer.get(playerId) ?? []) {
      if (observatoryStatusForTile(playerId, tk) !== "active") continue;
      const [ox, oy] = parseKey(tk);
      if (chebyshevDistance(ox, oy, x, y) <= castRadius) return true;
    }
    return false;
  };

  const activeAirportAt = (ownerId: string, tileKey: TileKey): EconomicStructure | undefined => {
    const structure = economicStructuresByTile.get(tileKey);
    return structure && structure.ownerId === ownerId && structure.type === "AIRPORT" && structure.status === "active" ? structure : undefined;
  };

  const activeOwnedEconomicStructureWithinRange = (
    ownerId: string,
    type: EconomicStructureType,
    x: number,
    y: number,
    range: number
  ): TileKey | undefined => {
    for (const tk of economicStructureTileKeysByPlayer.get(ownerId) ?? []) {
      const structure = economicStructuresByTile.get(tk);
      if (!structure || structure.type !== type || structure.status !== "active") continue;
      const [sx, sy] = parseKey(tk);
      if (chebyshevDistance(sx, sy, x, y) <= range) return tk;
    }
    return undefined;
  };

  const hostileRadarProtectingTile = (actor: Player, x: number, y: number): TileKey | undefined => {
    for (const [tk, structure] of economicStructuresByTile) {
      if (structure.type !== "RADAR_SYSTEM" || structure.status !== "active") continue;
      if (structure.ownerId === actor.id || actor.allies.has(structure.ownerId)) continue;
      const [rx, ry] = parseKey(tk);
      if (chebyshevDistance(rx, ry, x, y) <= RADAR_SYSTEM_RADIUS) return tk;
    }
    return undefined;
  };

  const governorUpkeepMultiplierAtTile = (ownerId: string | undefined, tileKey: TileKey): number => {
    if (!ownerId) return 1;
    const [x, y] = parseKey(tileKey);
    return activeOwnedEconomicStructureWithinRange(ownerId, "GOVERNORS_OFFICE", x, y, GOVERNORS_OFFICE_RADIUS)
      ? GOVERNORS_OFFICE_UPKEEP_MULT
      : 1;
  };

  const foundryMineOutputMultiplierAt = (ownerId: string | undefined, tileKey: TileKey): number => {
    if (!ownerId) return 1;
    const structure = economicStructuresByTile.get(tileKey);
    if (!structure || structure.ownerId !== ownerId || structure.status !== "active" || structure.type !== "MINE") return 1;
    const [x, y] = parseKey(tileKey);
    return activeOwnedEconomicStructureWithinRange(ownerId, "FOUNDRY", x, y, FOUNDRY_RADIUS) ? FOUNDRY_OUTPUT_MULT : 1;
  };

  const converterStructureOutputFor = (
    structureType: EconomicStructureType,
    ownerId?: string
  ): Partial<Record<StrategicResource, number>> | undefined => {
    if (structureType === "FUR_SYNTHESIZER") return { SUPPLY: deps.FUR_SYNTHESIZER_SUPPLY_PER_DAY };
    if (structureType === "ADVANCED_FUR_SYNTHESIZER") return { SUPPLY: deps.ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY };
    if (structureType === "IRONWORKS") return { IRON: deps.IRONWORKS_IRON_PER_DAY };
    if (structureType === "ADVANCED_IRONWORKS") return { IRON: deps.ADVANCED_IRONWORKS_IRON_PER_DAY };
    if (structureType === "CRYSTAL_SYNTHESIZER") return { CRYSTAL: deps.CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
    if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") return { CRYSTAL: deps.ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
    if (structureType === "FUEL_PLANT") return { OIL: deps.FUEL_PLANT_OIL_PER_DAY };
    return undefined;
  };

  const activeSiphonAt = (tileKey: TileKey): ActiveSiphon | undefined => {
    const siphon = siphonByTile.get(tileKey);
    if (!siphon || siphon.endsAt <= now()) {
      if (siphon) siphonByTile.delete(tileKey);
      return undefined;
    }
    return siphon;
  };

  const siphonMultiplierAt = (tileKey: TileKey): number => (activeSiphonAt(tileKey) ? 1 - SIPHON_SHARE : 1);

  const addToSiphonCache = (
    casterPlayerId: string,
    targetTileKey: TileKey,
    gold: number,
    strategic: Partial<Record<StrategicResource, number>>,
    expiresAt: number
  ): void => {
    const caches = siphonCacheByPlayer.get(casterPlayerId) ?? [];
    let current = caches.find((cache: any) => cache.targetTileKey === targetTileKey && cache.expiresAt === expiresAt);
    if (!current) {
      current = { siphonId: randomUUID(), targetTileKey, expiresAt, gold: 0, strategic: {} };
      caches.push(current);
      siphonCacheByPlayer.set(casterPlayerId, caches);
    }
    current.gold += gold;
    for (const [resource, amount] of Object.entries(strategic) as Array<[StrategicResource, number]>) {
      current.strategic[resource] = (current.strategic[resource] ?? 0) + amount;
    }
  };

  const economicStructureForTile = (tileKey: TileKey): EconomicStructure | undefined => economicStructuresByTile.get(tileKey);

  const economicStructureUpkeepDue = (structure: EconomicStructure): boolean =>
    structure.nextUpkeepAt <= now() && (!structure.disabledUntil || structure.disabledUntil <= now());

  const economicStructureResourceType = (resource: ResourceType | undefined): EconomicStructureType | undefined => {
    if (resource === "FARM" || resource === "FISH") return "FARMSTEAD";
    if (resource === "WOOD" || resource === "FUR") return "CAMP";
    if (resource === "IRON" || resource === "GEMS") return "MINE";
    return undefined;
  };

  const economicStructureOutputMultAt = (tileKey: TileKey, ownerId: string | undefined): number => {
    const structure = economicStructuresByTile.get(tileKey);
    if (!structure || !ownerId || structure.ownerId !== ownerId || structure.status !== "active") return 1;
    if (
      structure.type === "GRANARY" ||
      structure.type === "MARKET" ||
      structure.type === "BANK" ||
      structure.type === "AIRPORT" ||
      structure.type === "WOODEN_FORT" ||
      structure.type === "LIGHT_OUTPOST" ||
      structure.type === "FUR_SYNTHESIZER" ||
      structure.type === "ADVANCED_FUR_SYNTHESIZER" ||
      structure.type === "IRONWORKS" ||
      structure.type === "ADVANCED_IRONWORKS" ||
      structure.type === "CRYSTAL_SYNTHESIZER" ||
      structure.type === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
      structure.type === "FUEL_PLANT" ||
      structure.type === "FOUNDRY" ||
      structure.type === "GOVERNORS_OFFICE" ||
      structure.type === "RADAR_SYSTEM"
    ) {
      return 1;
    }
    return deps.STRUCTURE_OUTPUT_MULT * foundryMineOutputMultiplierAt(ownerId, tileKey);
  };

  return {
    isOwnedSettledLandTile,
    observatoryStatusForTile,
    activeObservatoryTileKeysForPlayer,
    syncObservatoriesForPlayer,
    hostileObservatoryProtectingTile,
    ownedActiveObservatoryWithinRange,
    activeAirportAt,
    activeOwnedEconomicStructureWithinRange,
    hostileRadarProtectingTile,
    governorUpkeepMultiplierAtTile,
    foundryMineOutputMultiplierAt,
    converterStructureOutputFor,
    activeSiphonAt,
    siphonMultiplierAt,
    addToSiphonCache,
    economicStructureForTile,
    economicStructureUpkeepDue,
    economicStructureResourceType,
    economicStructureOutputMultAt
  };
};
