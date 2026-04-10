import type { EconomicStructureType, Player, ResourceType, Tile, TileKey } from "@border-empires/shared";
import type {
  EconomyBreakdown,
  EconomyBreakdownBucket,
  EconomyResourceKey,
  PlayerEconomySnapshot,
  ServerPlayerEconomyRuntime,
  ServerPlayerEconomyRuntimeDeps,
  UpkeepContributor,
  UpkeepDiagnostics
} from "./server-economy-types.js";
import type { StrategicResource } from "./server-shared-types.js";

export const createServerPlayerEconomyRuntime = (deps: ServerPlayerEconomyRuntimeDeps): ServerPlayerEconomyRuntime => {
  const {
    parseKey,
    playerTile,
    players,
    townsByTile,
    docksByTile,
    fortsByTile,
    siegeOutpostsByTile,
    observatoriesByTile,
    economicStructuresByTile,
    ownershipStateByTile,
    economicStructureTileKeysByPlayer,
    getOrInitResourceCounts,
    resourceRate,
    currentIncomePerMinute,
    strategicProductionPerMinute,
    getPlayerEffectsForPlayer,
    effectiveManpowerAt,
    playerManpowerCap,
    townGoldIncomeEnabledForPlayer,
    townFoodUpkeepPerMinute,
    governorUpkeepMultiplierAtTile,
    dockIncomeForOwner,
    townIncomeForOwner,
    townPopulationTierForTown,
    toStrategicResource,
    activeResourceIncomeMult,
    strategicDailyFromResource,
    siphonMultiplierAt,
    economicStructureOutputMultAt,
    converterStructureOutputFor,
    emptyEconomyBreakdown,
    pushEconomyBreakdownBucket,
    setEconomyBreakdownBucket,
    sortedEconomyBreakdownBuckets,
    goldResourceSourceLabel,
    strategicResourceSourceLabel,
    getOrInitRevealTargets,
    prettyEconomicStructureLabel,
    lastUpkeepByPlayer,
    emptyUpkeepDiagnostics,
    PASSIVE_INCOME_MULT,
    OBSERVATORY_UPKEEP_PER_MIN,
    REVEAL_EMPIRE_UPKEEP_PER_MIN,
    AIRPORT_OIL_UPKEEP_PER_MIN
  } = deps;

  const upkeepPerMinuteForPlayer = (player: Player) => {
    let townFoodUpkeep = 0;
    let settledTileGoldUpkeep = 0;
    let fortCount = 0;
    let outpostCount = 0;
    let observatoryCount = 0;
    let airportCount = 0;
    let foodStructureUpkeep = 0;
    let goldStructureUpkeep = 0;
    let crystalStructureUpkeep = 0;
    for (const tk of player.territoryTiles) {
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
      const town = townsByTile.get(tk);
      if (!(town && townPopulationTierForTown(town) === "SETTLEMENT")) {
        settledTileGoldUpkeep += 0.04 * governorUpkeepMultiplierAtTile(player.id, tk);
      }
      if (town) townFoodUpkeep += townFoodUpkeepPerMinute(town) * governorUpkeepMultiplierAtTile(player.id, tk);
      const fort = fortsByTile.get(tk);
      if (fort?.ownerId === player.id && fort.status === "active") fortCount += 1;
      const siege = siegeOutpostsByTile.get(tk);
      if (siege?.ownerId === player.id && siege.status === "active") outpostCount += 1;
      const observatory = observatoriesByTile.get(tk);
      if (observatory?.ownerId === player.id && observatory?.status === "active") observatoryCount += 1;
      const structure = economicStructuresByTile.get(tk);
      if (structure?.ownerId === player.id && structure.status === "active") {
        foodStructureUpkeep += economicStructureFoodUpkeepPerInterval(structure.type, player.id) / 10;
        goldStructureUpkeep += economicStructureGoldUpkeepPerInterval(structure.type) / 10;
        crystalStructureUpkeep += economicStructureCrystalUpkeepPerInterval(structure.type, player.id) / 10;
        if (structure.type === "AIRPORT") airportCount += 1;
      }
    }
    const activeRevealCount = Math.min(1, getOrInitRevealTargets(player.id).size);
    const effects = getPlayerEffectsForPlayer(player.id);
    return {
      food: townFoodUpkeep * effects.townFoodUpkeepMult + foodStructureUpkeep,
      iron: fortCount * 0.025 * effects.fortIronUpkeepMult,
      supply: outpostCount * 0.025 * effects.outpostSupplyUpkeepMult,
      crystal: activeRevealCount * REVEAL_EMPIRE_UPKEEP_PER_MIN * effects.revealUpkeepMult + observatoryCount * OBSERVATORY_UPKEEP_PER_MIN + crystalStructureUpkeep,
      oil: airportCount * AIRPORT_OIL_UPKEEP_PER_MIN,
      gold:
        fortCount * 1 * effects.fortGoldUpkeepMult +
        outpostCount * 1 * effects.outpostGoldUpkeepMult +
        settledTileGoldUpkeep * effects.settledGoldUpkeepMult +
        goldStructureUpkeep
    };
  };

  const settledTileGoldUpkeepPerMinuteAt = (playerId: string, tileKey: TileKey): number => {
    const town = townsByTile.get(tileKey);
    if (town && townPopulationTierForTown(town) === "SETTLEMENT") return 0;
    return 0.04 * governorUpkeepMultiplierAtTile(playerId, tileKey);
  };

  const roundedUpkeepPerMinute = (amountPerMinute: number): number => Number(amountPerMinute.toFixed(4));

  const tileUpkeepEntriesForTile = (tileKey: TileKey, ownerId: string | undefined): NonNullable<Tile["upkeepEntries"]> => {
    if (!ownerId || ownershipStateByTile.get(tileKey) !== "SETTLED") return [];
    const effects = getPlayerEffectsForPlayer(ownerId);
    const entries: NonNullable<Tile["upkeepEntries"]> = [];
    const town = townsByTile.get(tileKey);
    if (town) {
      const townFoodUpkeep = townFoodUpkeepPerMinute(town) * effects.townFoodUpkeepMult * governorUpkeepMultiplierAtTile(ownerId, tileKey);
      if (townFoodUpkeep > 0.0001) entries.push({ label: "Town", perMinute: { FOOD: roundedUpkeepPerMinute(townFoodUpkeep) } });
    }
    const settledLandGoldUpkeep = settledTileGoldUpkeepPerMinuteAt(ownerId, tileKey) * effects.settledGoldUpkeepMult;
    if (settledLandGoldUpkeep > 0.0001) entries.push({ label: "Settled land", perMinute: { GOLD: roundedUpkeepPerMinute(settledLandGoldUpkeep) } });
    const fort = fortsByTile.get(tileKey);
    if (fort?.ownerId === ownerId && fort.status === "active") {
      entries.push({ label: "Fort", perMinute: { GOLD: roundedUpkeepPerMinute(1 * effects.fortGoldUpkeepMult), IRON: roundedUpkeepPerMinute(0.025 * effects.fortIronUpkeepMult) } });
    }
    const siegeOutpost = siegeOutpostsByTile.get(tileKey);
    if (siegeOutpost?.ownerId === ownerId && siegeOutpost.status === "active") {
      entries.push({ label: "Siege outpost", perMinute: { GOLD: roundedUpkeepPerMinute(1 * effects.outpostGoldUpkeepMult), SUPPLY: roundedUpkeepPerMinute(0.025 * effects.outpostSupplyUpkeepMult) } });
    }
    const observatory = observatoriesByTile.get(tileKey);
    if (observatory?.ownerId === ownerId && observatory.status === "active") {
      entries.push({ label: "Observatory", perMinute: { CRYSTAL: roundedUpkeepPerMinute(OBSERVATORY_UPKEEP_PER_MIN) } });
    }
    const structure = economicStructuresByTile.get(tileKey);
    if (structure?.ownerId === ownerId && structure.status === "active") {
      const food = economicStructureFoodUpkeepPerInterval(structure.type, ownerId) / 10;
      const gold = economicStructureGoldUpkeepPerInterval(structure.type) / 10;
      const crystal = economicStructureCrystalUpkeepPerInterval(structure.type, ownerId) / 10;
      const oil = structure.type === "AIRPORT" ? AIRPORT_OIL_UPKEEP_PER_MIN : 0;
      if (food > 0.0001 || gold > 0.0001 || crystal > 0.0001 || oil > 0.0001) {
        entries.push({
          label: prettyEconomicStructureLabel(structure.type),
          perMinute: {
            ...(food > 0.0001 ? { FOOD: roundedUpkeepPerMinute(food) } : {}),
            ...(gold > 0.0001 ? { GOLD: roundedUpkeepPerMinute(gold) } : {}),
            ...(crystal > 0.0001 ? { CRYSTAL: roundedUpkeepPerMinute(crystal) } : {}),
            ...(oil > 0.0001 ? { OIL: roundedUpkeepPerMinute(oil) } : {})
          }
        });
      }
    }
    return entries;
  };

  const economicStructureGoldUpkeepPerInterval = (structureType: EconomicStructureType): number =>
    structureType === "FARMSTEAD" ? deps.FARMSTEAD_GOLD_UPKEEP
      : structureType === "CAMP" ? deps.CAMP_GOLD_UPKEEP
      : structureType === "MINE" ? deps.MINE_GOLD_UPKEEP
      : structureType === "GRANARY" ? deps.GRANARY_GOLD_UPKEEP
      : structureType === "ADVANCED_FUR_SYNTHESIZER" ? deps.FUR_SYNTHESIZER_GOLD_UPKEEP
      : structureType === "WOODEN_FORT" ? deps.WOODEN_FORT_GOLD_UPKEEP
      : structureType === "LIGHT_OUTPOST" ? deps.LIGHT_OUTPOST_GOLD_UPKEEP
      : structureType === "FUR_SYNTHESIZER" ? deps.FUR_SYNTHESIZER_GOLD_UPKEEP
      : structureType === "IRONWORKS" ? deps.IRONWORKS_GOLD_UPKEEP
      : structureType === "ADVANCED_IRONWORKS" ? deps.IRONWORKS_GOLD_UPKEEP
      : structureType === "CRYSTAL_SYNTHESIZER" ? deps.CRYSTAL_SYNTHESIZER_GOLD_UPKEEP
      : structureType === "ADVANCED_CRYSTAL_SYNTHESIZER" ? deps.CRYSTAL_SYNTHESIZER_GOLD_UPKEEP
      : structureType === "FUEL_PLANT" ? deps.FUEL_PLANT_GOLD_UPKEEP
      : structureType === "FOUNDRY" ? deps.FOUNDRY_GOLD_UPKEEP
      : structureType === "GARRISON_HALL" ? deps.GARRISON_HALL_GOLD_UPKEEP
      : structureType === "CUSTOMS_HOUSE" ? deps.CUSTOMS_HOUSE_GOLD_UPKEEP
      : structureType === "GOVERNORS_OFFICE" ? deps.GOVERNORS_OFFICE_GOLD_UPKEEP
      : structureType === "RADAR_SYSTEM" ? deps.RADAR_SYSTEM_GOLD_UPKEEP
      : 0;

  const economicStructureFoodUpkeepPerInterval = (structureType: EconomicStructureType, playerId: string): number =>
    structureType === "MARKET" || structureType === "BANK" || structureType === "CARAVANARY"
      ? (
        structureType === "MARKET" ? deps.MARKET_FOOD_UPKEEP
          : structureType === "BANK" ? deps.BANK_FOOD_UPKEEP
          : deps.CARAVANARY_FOOD_UPKEEP
      ) * getPlayerEffectsForPlayer(playerId).supportEconomicFoodUpkeepMult
      : 0;

  const economicStructureCrystalUpkeepPerInterval = (structureType: EconomicStructureType, _playerId: string): number =>
    0;

  const pushUpkeepContributor = (map: Map<string, UpkeepContributor>, label: string, amountPerMinute: number, options: { count?: number; note?: string } = {}): void => {
    if (amountPerMinute <= 0.0001) return;
    const existing = map.get(label);
    if (existing) {
      existing.amountPerMinute += amountPerMinute;
      existing.count = (existing.count ?? 0) + (options.count ?? 0);
      if (options.note) existing.note = options.note;
      return;
    }
    const contributor: UpkeepContributor = { label, amountPerMinute };
    if (options.count !== undefined) contributor.count = options.count;
    if (options.note !== undefined) contributor.note = options.note;
    map.set(label, contributor);
  };

  const sortedUpkeepContributors = (map: Map<string, UpkeepContributor>): UpkeepContributor[] =>
    [...map.values()].sort((a, b) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));

  const upkeepContributorsForPlayer = (player: Player): Record<"food" | "iron" | "supply" | "crystal" | "oil" | "gold", UpkeepContributor[]> => {
    const food = new Map<string, UpkeepContributor>();
    const iron = new Map<string, UpkeepContributor>();
    const supply = new Map<string, UpkeepContributor>();
    const crystal = new Map<string, UpkeepContributor>();
    const oil = new Map<string, UpkeepContributor>();
    const gold = new Map<string, UpkeepContributor>();
    const effects = getPlayerEffectsForPlayer(player.id);
    let townCount = 0;
    let settledTileCount = 0;
    let settledTileGoldUpkeep = 0;
    let fortCount = 0;
    let outpostCount = 0;
    let observatoryCount = 0;
    let airportCount = 0;
    const foodStructureCounts = new Map<EconomicStructureType, number>();
    const goldStructureCounts = new Map<EconomicStructureType, number>();
    const crystalStructureCounts = new Map<EconomicStructureType, number>();
    for (const tk of player.territoryTiles) {
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
      settledTileCount += 1;
      settledTileGoldUpkeep += settledTileGoldUpkeepPerMinuteAt(player.id, tk);
      if (townsByTile.has(tk)) townCount += 1;
      const fort = fortsByTile.get(tk);
      if (fort?.ownerId === player.id && fort.status === "active") fortCount += 1;
      const siege = siegeOutpostsByTile.get(tk);
      if (siege?.ownerId === player.id && siege.status === "active") outpostCount += 1;
      const observatory = observatoriesByTile.get(tk);
      if (observatory && observatory.ownerId === player.id && observatory.status === "active") observatoryCount += 1;
      const structure = economicStructuresByTile.get(tk);
      if (structure?.ownerId === player.id && structure.status === "active") {
        const foodPerMinute = economicStructureFoodUpkeepPerInterval(structure.type, player.id) / 10;
        const goldPerMinute = economicStructureGoldUpkeepPerInterval(structure.type) / 10;
        const crystalPerMinute = economicStructureCrystalUpkeepPerInterval(structure.type, player.id) / 10;
        if (foodPerMinute > 0) foodStructureCounts.set(structure.type, (foodStructureCounts.get(structure.type) ?? 0) + 1);
        if (goldPerMinute > 0) goldStructureCounts.set(structure.type, (goldStructureCounts.get(structure.type) ?? 0) + 1);
        if (crystalPerMinute > 0) crystalStructureCounts.set(structure.type, (crystalStructureCounts.get(structure.type) ?? 0) + 1);
        if (structure.type === "AIRPORT") airportCount += 1;
      }
    }
    if (townCount > 0) {
      let townFoodUpkeep = 0;
      for (const tk of player.territoryTiles) {
        if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
        const town = townsByTile.get(tk);
        if (!town) continue;
        townFoodUpkeep += townFoodUpkeepPerMinute(town) * governorUpkeepMultiplierAtTile(player.id, tk);
      }
      if (townFoodUpkeep > 0.0001) pushUpkeepContributor(food, "Town upkeep", townFoodUpkeep * effects.townFoodUpkeepMult, { count: townCount, note: `${townCount} town${townCount === 1 ? "" : "s"}` });
    }
    pushUpkeepContributor(gold, "Settled land upkeep", settledTileGoldUpkeep * effects.settledGoldUpkeepMult, { count: settledTileCount, note: `${settledTileCount} settled tiles` });
    if (fortCount > 0) {
      pushUpkeepContributor(gold, "Fort upkeep", fortCount * effects.fortGoldUpkeepMult, { count: fortCount, note: `${fortCount} active fort${fortCount === 1 ? "" : "s"}` });
      pushUpkeepContributor(iron, "Fort upkeep", fortCount * 0.025 * effects.fortIronUpkeepMult, { count: fortCount, note: `${fortCount} active fort${fortCount === 1 ? "" : "s"}` });
    }
    if (outpostCount > 0) {
      pushUpkeepContributor(gold, "Siege outpost upkeep", outpostCount * effects.outpostGoldUpkeepMult, { count: outpostCount, note: `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}` });
      pushUpkeepContributor(supply, "Siege outpost upkeep", outpostCount * 0.025 * effects.outpostSupplyUpkeepMult, { count: outpostCount, note: `${outpostCount} active outpost${outpostCount === 1 ? "" : "s"}` });
    }
    const activeRevealCount = Math.min(1, getOrInitRevealTargets(player.id).size);
    if (activeRevealCount > 0) pushUpkeepContributor(crystal, "Empire reveal upkeep", activeRevealCount * REVEAL_EMPIRE_UPKEEP_PER_MIN * effects.revealUpkeepMult, { count: activeRevealCount, note: `${activeRevealCount} active reveal` });
    if (observatoryCount > 0) pushUpkeepContributor(crystal, "Observatory upkeep", observatoryCount * OBSERVATORY_UPKEEP_PER_MIN, { count: observatoryCount, note: `${observatoryCount} active observator${observatoryCount === 1 ? "y" : "ies"}` });
    if (airportCount > 0) pushUpkeepContributor(oil, "Airport upkeep", airportCount * AIRPORT_OIL_UPKEEP_PER_MIN, { count: airportCount, note: `${airportCount} active airport${airportCount === 1 ? "" : "s"}` });
    for (const [type, count] of foodStructureCounts) {
      pushUpkeepContributor(food, `${prettyEconomicStructureLabel(type)} upkeep`, (economicStructureFoodUpkeepPerInterval(type, player.id) / 10) * count, {
        count,
        note: `${count} active ${prettyEconomicStructureLabel(type).toLowerCase()}${count === 1 ? "" : "s"}`
      });
    }
    for (const [type, count] of goldStructureCounts) pushUpkeepContributor(gold, `${prettyEconomicStructureLabel(type)} upkeep`, (economicStructureGoldUpkeepPerInterval(type) / 10) * count, { count, note: `${count} active ${prettyEconomicStructureLabel(type).toLowerCase()}${count === 1 ? "" : "s"}` });
    for (const [type, count] of crystalStructureCounts) pushUpkeepContributor(crystal, `${prettyEconomicStructureLabel(type)} upkeep`, (economicStructureCrystalUpkeepPerInterval(type, player.id) / 10) * count, { count, note: `${count} active ${prettyEconomicStructureLabel(type).toLowerCase()}${count === 1 ? "" : "s"}` });
    return { food: sortedUpkeepContributors(food), iron: sortedUpkeepContributors(iron), supply: sortedUpkeepContributors(supply), crystal: sortedUpkeepContributors(crystal), oil: sortedUpkeepContributors(oil), gold: sortedUpkeepContributors(gold) };
  };

  const economyBreakdownForPlayer = (player: Player, upkeepContributors: Record<"food" | "iron" | "supply" | "crystal" | "oil" | "gold", UpkeepContributor[]>): EconomyBreakdown => {
    const breakdown = emptyEconomyBreakdown();
    const goldSources = new Map<string, EconomyBreakdownBucket>();
    const foodSources = new Map<string, EconomyBreakdownBucket>();
    const ironSources = new Map<string, EconomyBreakdownBucket>();
    const crystalSources = new Map<string, EconomyBreakdownBucket>();
    const supplySources = new Map<string, EconomyBreakdownBucket>();
    const shardSources = new Map<string, EconomyBreakdownBucket>();
    const oilSources = new Map<string, EconomyBreakdownBucket>();
    const goldMultiplier = player.mods.income * PASSIVE_INCOME_MULT;
    for (const [resource, count] of Object.entries(getOrInitResourceCounts(player.id)) as Array<[ResourceType, number]>) {
      if (count <= 0) continue;
      pushEconomyBreakdownBucket(goldSources, goldResourceSourceLabel(resource), count * (deps.resourceRate[resource] ?? 0) * goldMultiplier, { count });
    }
    let dockCount = 0;
    let dockIncome = 0;
    for (const dock of docksByTile.values()) {
      const [dx, dy] = parseKey(dock.tileKey);
      const tile = playerTile(dx, dy);
      if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED") continue;
      dockCount += 1;
      dockIncome += dockIncomeForOwner(dock, player.id);
    }
    pushEconomyBreakdownBucket(goldSources, "Docks", dockIncome * goldMultiplier, { count: dockCount });
    let townCount = 0;
    let townIncome = 0;
    const townIncomePaused = !townGoldIncomeEnabledForPlayer(player);
    for (const town of townsByTile.values()) {
      if (townIncomePaused) {
      if (deps.ownership.get(town.tileKey) !== player.id || ownershipStateByTile.get(town.tileKey) !== "SETTLED") continue;
        townCount += 1;
        continue;
      }
      const income = townIncomeForOwner(town, player.id) * siphonMultiplierAt(town.tileKey);
      if (income <= 0.0001) continue;
      townCount += 1;
      townIncome += income;
    }
    if (townIncomePaused && townCount > 0) {
      setEconomyBreakdownBucket(goldSources, "Towns", 0, {
        count: townCount,
        note: `Paused until manpower is full (${Math.round(effectiveManpowerAt(player))}/${Math.round(playerManpowerCap(player))})`
      });
    } else {
      pushEconomyBreakdownBucket(goldSources, "Towns", townIncome * goldMultiplier, { count: townCount });
    }
    let bankCount = 0;
    for (const tk of economicStructureTileKeysByPlayer.get(player.id) ?? []) {
      const structure = economicStructuresByTile.get(tk);
      if (structure?.type === "BANK" && structure.status === "active") bankCount += 1;
    }
    pushEconomyBreakdownBucket(goldSources, "Banks", bankCount * goldMultiplier, { count: bankCount });
    for (const tk of player.territoryTiles) {
      if (ownershipStateByTile.get(tk) !== "SETTLED") continue;
      const [x, y] = parseKey(tk);
      const tile = playerTile(x, y);
      if (tile.ownerId !== player.id || tile.terrain !== "LAND") continue;
      const sr = toStrategicResource(tile.resource);
      if (sr && tile.resource) {
        const amountPerMinute = ((deps.strategicDailyFromResource[tile.resource] ?? 0) / 1440) * activeResourceIncomeMult(player.id, tile.resource) * siphonMultiplierAt(tk) * economicStructureOutputMultAt(tk, player.id);
        const label = strategicResourceSourceLabel(tile.resource);
        if (sr === "FOOD") pushEconomyBreakdownBucket(foodSources, label, amountPerMinute);
        if (sr === "IRON") pushEconomyBreakdownBucket(ironSources, label, amountPerMinute);
        if (sr === "CRYSTAL") pushEconomyBreakdownBucket(crystalSources, label, amountPerMinute);
        if (sr === "SUPPLY") pushEconomyBreakdownBucket(supplySources, label, amountPerMinute);
        if (sr === "OIL") pushEconomyBreakdownBucket(oilSources, label, amountPerMinute);
      }
      const structure = economicStructuresByTile.get(tk);
      if (!structure || structure.ownerId !== player.id || structure.status !== "active") continue;
      const output = converterStructureOutputFor(structure.type, player.id) ?? {};
      for (const [resource, daily] of Object.entries(output) as Array<[StrategicResource, number]>) {
        const amountPerMinute = daily / 1440;
        const label = prettyEconomicStructureLabel(structure.type);
        if (resource === "FOOD") pushEconomyBreakdownBucket(foodSources, label, amountPerMinute);
        if (resource === "IRON") pushEconomyBreakdownBucket(ironSources, label, amountPerMinute);
        if (resource === "CRYSTAL") pushEconomyBreakdownBucket(crystalSources, label, amountPerMinute);
        if (resource === "SUPPLY") pushEconomyBreakdownBucket(supplySources, label, amountPerMinute);
        if (resource === "SHARD") pushEconomyBreakdownBucket(shardSources, label, amountPerMinute);
        if (resource === "OIL") pushEconomyBreakdownBucket(oilSources, label, amountPerMinute);
      }
    }
    breakdown.GOLD.sources = sortedEconomyBreakdownBuckets(goldSources);
    breakdown.FOOD.sources = sortedEconomyBreakdownBuckets(foodSources);
    breakdown.IRON.sources = sortedEconomyBreakdownBuckets(ironSources);
    breakdown.CRYSTAL.sources = sortedEconomyBreakdownBuckets(crystalSources);
    breakdown.SUPPLY.sources = sortedEconomyBreakdownBuckets(supplySources);
    breakdown.SHARD.sources = sortedEconomyBreakdownBuckets(shardSources);
    breakdown.OIL.sources = sortedEconomyBreakdownBuckets(oilSources);
    breakdown.GOLD.sinks = upkeepContributors.gold.map((entry) => ({ ...entry, count: entry.count ?? 1 }));
    breakdown.FOOD.sinks = upkeepContributors.food.map((entry) => ({ ...entry, count: entry.count ?? 1 }));
    breakdown.IRON.sinks = upkeepContributors.iron.map((entry) => ({ ...entry, count: entry.count ?? 1 }));
    breakdown.CRYSTAL.sinks = upkeepContributors.crystal.map((entry) => ({ ...entry, count: entry.count ?? 1 }));
    breakdown.SUPPLY.sinks = upkeepContributors.supply.map((entry) => ({ ...entry, count: entry.count ?? 1 }));
    breakdown.OIL.sinks = upkeepContributors.oil.map((entry) => ({ ...entry, count: entry.count ?? 1 }));
    const mirrorGoldUpkeep = (resource: Exclude<EconomyResourceKey, "GOLD">, entry: EconomyBreakdownBucket): void => {
      const mirrored: EconomyBreakdownBucket = { label: entry.label, amountPerMinute: entry.amountPerMinute, count: entry.count, resourceKey: "GOLD" };
      if (entry.note !== undefined) mirrored.note = entry.note;
      breakdown[resource].sinks.push(mirrored);
    };
    for (const entry of breakdown.GOLD.sinks) {
      if (entry.label.includes("Fur Synthesizer")) mirrorGoldUpkeep("SUPPLY", entry);
      else if (entry.label.includes("Ironworks")) mirrorGoldUpkeep("IRON", entry);
      else if (entry.label.includes("Crystal Synthesizer")) mirrorGoldUpkeep("CRYSTAL", entry);
      else if (entry.label.includes("Fuel Plant")) mirrorGoldUpkeep("OIL", entry);
    }
    breakdown.IRON.sinks.sort((a: EconomyBreakdownBucket, b: EconomyBreakdownBucket) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
    breakdown.CRYSTAL.sinks.sort((a: EconomyBreakdownBucket, b: EconomyBreakdownBucket) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
    breakdown.SUPPLY.sinks.sort((a: EconomyBreakdownBucket, b: EconomyBreakdownBucket) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
    breakdown.OIL.sinks.sort((a: EconomyBreakdownBucket, b: EconomyBreakdownBucket) => b.amountPerMinute - a.amountPerMinute || a.label.localeCompare(b.label));
    return breakdown;
  };

  const playerEconomySnapshot = (player: Player): PlayerEconomySnapshot => {
    const contributors = upkeepContributorsForPlayer(player);
    const lastTick = lastUpkeepByPlayer.get(player.id) ?? emptyUpkeepDiagnostics();
    const upkeepLastTick: UpkeepDiagnostics = { ...lastTick, food: { ...lastTick.food, contributors: contributors.food }, iron: { ...lastTick.iron, contributors: contributors.iron }, supply: { ...lastTick.supply, contributors: contributors.supply }, crystal: { ...lastTick.crystal, contributors: contributors.crystal }, oil: { ...lastTick.oil, contributors: contributors.oil }, gold: { ...lastTick.gold, contributors: contributors.gold } };
    return { incomePerMinute: currentIncomePerMinute(player), strategicProductionPerMinute: strategicProductionPerMinute(player), upkeepPerMinute: upkeepPerMinuteForPlayer(player), upkeepLastTick, economyBreakdown: economyBreakdownForPlayer(player, contributors) };
  };

  return {
    upkeepPerMinuteForPlayer,
    settledTileGoldUpkeepPerMinuteAt,
    roundedUpkeepPerMinute,
    tileUpkeepEntriesForTile,
    economicStructureGoldUpkeepPerInterval,
    economicStructureFoodUpkeepPerInterval,
    economicStructureCrystalUpkeepPerInterval,
    pushUpkeepContributor,
    sortedUpkeepContributors,
    upkeepContributorsForPlayer,
    economyBreakdownForPlayer,
    playerEconomySnapshot
  };
};
